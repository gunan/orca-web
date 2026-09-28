import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { importNative3MF } from '../../shared/native-project.js';
const source = await readFile('tests/fixtures/orca-2.4.2-cube.3mf');
async function setup(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'orca-project-job-'));
  const app = await createApp({ dataDir, binary: path.resolve('tests/fixtures/fake-slicer.sh'), profilesDir: path.resolve('tests/fixtures/presets') });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await app.locals.shutdown(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  return { app, dataDir, base: `http://127.0.0.1:${server.address().port}` };
}
const post = (base, body) => fetch(base + '/api/jobs/project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('native project jobs select one plate, retain embedded settings, accept large projects, and clean temporary archives', async t => {
  const { app, base, dataDir } = await setup(t), project = importNative3MF(source);
  project.metadata.description = 'This project exceeds the ordinary API limit. '.repeat(30000);
  project.plates.push({ id: 'second', name: 'Second plate' });
  project.objects.push({ ...structuredClone(project.objects[0]), id: 'other', plateId: 'second', position: [10000,10000,0] });
  const response = await post(base, { project, useEmbeddedSettings: true, allPlates: true });
  assert.equal(response.status, 202); const job = await response.json();
  assert.equal(job.nativeProject.plateCount, 1); assert.equal(job.nativeProject.partCount, 1); assert.equal(job.nativeProject.source, 'embedded'); assert.equal(job.settings.layer_height, '0.16');
  await app.locals.waitForIdle(); const ready = await (await fetch(`${base}/api/jobs/${job.id}`)).json(); assert.equal(ready.status, 'ready', ready.error);
  const output = await (await fetch(`${base}/api/jobs/${job.id}/download`)).text(); assert.match(output, /; layer_height = 0.16/); assert.match(output, /Prusa MK4/);
  assert.deepEqual(await readdir(path.join(dataDir, 'work')), []); assert.deepEqual(await readdir(path.join(dataDir, 'uploads')), []);
});

test('invalid native project settings and calibration payloads never queue native jobs', async t => {
  const { base, dataDir } = await setup(t), project = importNative3MF(source);
  for (const changed of [
    { ...project, nativeSettings: { ...project.nativeSettings, post_process: ['never-execute'] } },
    { ...project, calibration: { token: 'not-a-native-project' } },
    { ...project, objects: project.objects.map(object => ({ ...object, filamentSlot: 2 })) }
  ]) { const response = await post(base, { project: changed, useEmbeddedSettings: true }); assert.equal(response.status, 400); assert.ok((await response.json()).error); }
  assert.deepEqual(await (await fetch(base + '/api/jobs')).json(), []); assert.deepEqual(await readdir(path.join(dataDir, 'work')), []);
});
