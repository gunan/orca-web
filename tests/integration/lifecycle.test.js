import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/app.js';
import { JobStore } from '../../server/store.js';

const profilesDir = path.resolve('tests/fixtures/presets');
const cube = await readFile('tests/fixtures/cube.stl');

async function setup(t, prepare) {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-lifecycle-'));
  const dataDir = path.join(root, 'data');
  const events = path.join(root, 'started.txt');
  const binary = path.join(root, 'adapter.mjs');
  await writeFile(binary, `#!/usr/bin/env node
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('OrcaSlicer-lifecycle-test-fixture'); process.exit(0); }
const source = await readFile(args.at(-1), 'utf8');
const marker = source.split('\\n')[0];
await appendFile(${JSON.stringify(events)}, marker + '\\n');
if (source.includes('FAIL_TEST')) throw new Error('Intentional lifecycle fixture failure');
const output = path.join(args[args.indexOf('--outputdir') + 1], 'plate_1.gcode');
await writeFile(output, '; partial native result');
if (source.includes('WAIT_TEST')) await new Promise(resolve => setTimeout(resolve, 10000));
await writeFile(output, '; source = ' + marker + '\\n; args = ' + JSON.stringify(args) + '\\nG28\\nG1 X20 Y20 E1\\n');
`, { mode: 0o755 });
  let app, server;
  t.after(async () => {
    if (app) await app.locals.shutdown();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  if (prepare) await prepare({ root, dataDir });
  app = await createApp({ dataDir, binary, profilesDir });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const catalog = await (await fetch(`${base}/api/presets`)).json();
  return { root, base, app, dataDir, events, defaults: catalog.defaults };
}

async function create(context, marker, fields = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ ...context.defaults, settings: '{}', ...fields })) body.set(key, value);
  body.set('model', new Blob([`${marker}\n`, cube]), fields.filename || 'cube.stl');
  const response = await fetch(`${context.base}/api/jobs`, { method: 'POST', body });
  return { status: response.status, job: await response.json() };
}

async function get(context, id) { return (await fetch(`${context.base}/api/jobs/${id}`)).json(); }
async function cancel(context, id) {
  const response = await fetch(`${context.base}/api/jobs/${id}/cancel`, { method: 'POST' });
  return { status: response.status, job: await response.json() };
}
async function until(read, predicate, message) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await read();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error(message || 'Timed out waiting for lifecycle state');
}
async function hasStarted(context, marker) {
  await until(async () => readFile(context.events, 'utf8').catch(() => ''), text => text.includes(marker), 'Fixture process did not start');
}

test('running cancellation stops the native child, persists cancellation, and removes partial outputs', async t => {
  const context = await setup(t);
  const { status, job } = await create(context, 'running WAIT_TEST');
  assert.equal(status, 202);
  await hasStarted(context, 'running WAIT_TEST');
  const results = await Promise.all([cancel(context, job.id), cancel(context, job.id)]);
  for (const result of results) { assert.equal(result.status, 200); assert.equal(result.job.status, 'cancelled'); }
  assert.equal(results[0].job.cancelledAt, results[1].job.cancelledAt);
  assert.equal((await get(context, job.id)).status, 'cancelled');
  assert.equal((await fetch(`${context.base}/api/jobs/${job.id}/download`)).status, 404);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'uploads')), []);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'work')), []);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'jobs')), ['jobs.json']);
  const reopened = new JobStore(path.join(context.dataDir, 'jobs'));
  await reopened.init();
  assert.equal(reopened.get(job.id).status, 'cancelled');
  assert.equal((await cancel(context, job.id)).job.cancelledAt, results[0].job.cancelledAt);
  assert.equal((await fetch(`${context.base}/api/jobs/${job.id}`, { method: 'DELETE' })).status, 204);
});

test('queued cancellation returns while earlier work runs, is never started, and does not block subsequent jobs', async t => {
  const context = await setup(t);
  const first = (await create(context, 'first WAIT_TEST')).job;
  await hasStarted(context, 'first WAIT_TEST');
  const second = (await create(context, 'second must not start')).job;
  assert.equal((await get(context, second.id)).status, 'queued');
  const cancelled = await cancel(context, second.id);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.job.status, 'cancelled');
  assert.equal((await get(context, first.id)).status, 'slicing');
  assert.equal((await readdir(path.join(context.dataDir, 'work'))).includes(second.id), false);
  const third = (await create(context, 'third after cancellation')).job;
  await cancel(context, first.id);
  const completed = await until(() => get(context, third.id), job => job.status === 'ready', 'Later job did not finish');
  assert.equal(completed.status, 'ready');
  await context.app.locals.waitForIdle();
  assert.doesNotMatch(await readFile(context.events, 'utf8'), /second must not start/);
  assert.equal((await get(context, second.id)).status, 'cancelled');
  assert.deepEqual(await readdir(path.join(context.dataDir, 'work')), []);
});

test('terminal cancellations are idempotent, retain ready downloads, and unknown jobs return 404', async t => {
  const context = await setup(t);
  const ready = (await create(context, 'ready')).job;
  const completed = await until(() => get(context, ready.id), job => job.status === 'ready');
  assert.deepEqual((await cancel(context, ready.id)).job, completed);
  assert.equal((await fetch(`${context.base}/api/jobs/${ready.id}/download`)).status, 200);
  const failed = (await create(context, 'FAIL_TEST')).job;
  const failure = await until(() => get(context, failed.id), job => job.status === 'failed');
  assert.deepEqual((await cancel(context, failed.id)).job, failure);
  assert.equal((await cancel(context, randomUUID())).status, 404);
});

test('shutdown cancels both running and queued jobs with no surviving work or downloads', async t => {
  const context = await setup(t);
  const first = (await create(context, 'shutdown-running WAIT_TEST')).job;
  await hasStarted(context, 'shutdown-running WAIT_TEST');
  const second = (await create(context, 'shutdown-queued')).job;
  await context.app.locals.shutdown();
  assert.equal((await get(context, first.id)).status, 'cancelled');
  assert.equal((await get(context, second.id)).status, 'cancelled');
  assert.doesNotMatch(await readFile(context.events, 'utf8'), /shutdown-queued/);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'work')), []);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'jobs')), ['jobs.json']);
  assert.equal((await create(context, 'too late')).status, 503);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'uploads')), []);
});

test('startup cleans abandoned owned artifacts, preserves ready G-code, and leaves unrelated files untouched', async t => {
  const readyId = randomUUID(), queuedId = randomUUID(), slicingId = randomUUID(), cancelledId = randomUUID();
  const context = await setup(t, async ({ root, dataDir }) => {
    for (const name of ['uploads', 'work', 'jobs']) await mkdir(path.join(dataDir, name), { recursive: true });
    const jobs = ['ready', 'queued', 'slicing', 'cancelled'].map((status, index) => ({ id: [readyId, queuedId, slicingId, cancelledId][index], filename: 'cube.stl', status, createdAt: '2026-09-27T00:00:00.000Z' }));
    await writeFile(path.join(dataDir, 'jobs/jobs.json'), JSON.stringify(jobs));
    for (const id of [readyId, queuedId, slicingId, cancelledId]) await writeFile(path.join(dataDir, 'jobs', `${id}.gcode`), id === readyId ? 'completed output' : 'abandoned output');
    await writeFile(path.join(dataDir, 'uploads', `${randomUUID()}.stl`), 'partial upload');
    await writeFile(path.join(dataDir, 'uploads', 'a'.repeat(32)), 'legacy partial upload');
    await writeFile(path.join(dataDir, 'uploads', 'notes.txt'), 'preserve me');
    const orphan = path.join(dataDir, 'work', randomUUID());
    await mkdir(orphan); await writeFile(path.join(orphan, 'model.stl'), 'abandoned model');
    const external = path.join(root, 'external');
    await mkdir(external); await writeFile(path.join(external, 'important.txt'), 'preserve external');
    await symlink(external, path.join(dataDir, 'work', randomUUID()));
    await mkdir(path.join(dataDir, 'work', 'unrelated'));
    await mkdir(path.join(dataDir, 'jobs', '.slice-aB123Z'));
    await writeFile(path.join(dataDir, 'jobs', '.slice-aB123Z', 'partial.gcode'), 'partial');
    await writeFile(path.join(dataDir, 'jobs', `.jobs-${randomUUID()}.tmp`), 'interrupted index write');
    await writeFile(path.join(dataDir, 'jobs', 'readme.txt'), 'preserve metadata');
  });
  assert.deepEqual(await readdir(path.join(context.dataDir, 'uploads')), ['notes.txt']);
  assert.deepEqual(await readdir(path.join(context.dataDir, 'work')), ['unrelated']);
  assert.deepEqual((await readdir(path.join(context.dataDir, 'jobs'))).sort(), [`${readyId}.gcode`, 'jobs.json', 'readme.txt'].sort());
  assert.equal(await readFile(path.join(context.root, 'external/important.txt'), 'utf8'), 'preserve external');
  const ready = await fetch(`${context.base}/api/jobs/${readyId}/download`);
  assert.equal(ready.status, 200); assert.equal(await ready.text(), 'completed output');
  for (const id of [queuedId, slicingId]) {
    const job = await get(context, id); assert.equal(job.status, 'failed'); assert.match(job.error, /interrupted by server restart/);
  }
  assert.equal((await get(context, cancelledId)).status, 'cancelled');
});

test('invalid job indexes stop startup before abandoned-file cleanup', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-corrupt-startup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'jobs'));
  await mkdir(path.join(root, 'uploads'));
  const upload = path.join(root, 'uploads', `${randomUUID()}.stl`);
  await writeFile(upload, 'recoverable geometry');
  await writeFile(path.join(root, 'jobs/jobs.json'), 'broken');
  await assert.rejects(createApp({ dataDir: root, binary: '/missing', profilesDir }), SyntaxError);
  assert.equal(await readFile(upload, 'utf8'), 'recoverable geometry');
});

test('selection exposes native numeric bed geometry and placement is explicitly opt-in', async t => {
  const context = await setup(t);
  const selected = await (await fetch(`${context.base}/api/presets/selection?${new URLSearchParams(context.defaults)}`)).json();
  assert.deepEqual(selected.printer.bedPolygon, [[0, 0], [250, 0], [250, 210], [0, 210]]);
  assert.equal(selected.printer.bedHeight, 220);
  for (const preservePosition of [undefined, 'false', 'true']) {
    const fields = preservePosition === undefined ? {} : { preservePosition };
    const { status, job } = await create(context, 'position test', fields);
    assert.equal(status, 202, job.error);
    assert.equal(job.preservePosition, preservePosition === 'true');
    await until(() => get(context, job.id), result => result.status === 'ready');
    const gcode = await (await fetch(`${context.base}/api/jobs/${job.id}/download`)).text();
    if (preservePosition === 'true') assert.match(gcode, /"--arrange","0","--orient","0"/);
    else assert.doesNotMatch(gcode, /--arrange/);
  }
  assert.equal((await create(context, 'invalid position', { preservePosition: 'maybe' })).status, 400);
  assert.equal((await create(context, 'native 3mf', { preservePosition: 'true', filename: 'project.3mf' })).status, 400);
});
