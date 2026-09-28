import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../../server/store.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orca-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, index: path.join(root, 'jobs.json'), store: new JobStore(root) };
}

function job(id, extra = {}) {
  return { id, filename: `${id}.stl`, status: 'ready', createdAt: '2026-09-27T00:00:00.000Z', ...extra };
}

test('100 concurrent writes remain valid JSON and survive reopening', async t => {
  const { root, index, store } = await fixture(t);
  await store.init();
  const writes = Array.from({ length: 100 }, (_, i) => store.set(job(`job-${i}`)));
  for (let i = 0; i < 20; i++) assert.ok(Array.isArray(JSON.parse(await readFile(index, 'utf8'))));
  await Promise.all(writes);
  const reopened = new JobStore(root);
  await reopened.init();
  assert.equal(reopened.list().length, 100);
  for (let i = 0; i < 100; i++) assert.deepEqual(reopened.get(`job-${i}`), job(`job-${i}`));
  assert.deepEqual(await readdir(root), ['jobs.json']);
});

test('restart durably fails queued and slicing jobs and preserves completed jobs', async t => {
  const { root, index, store } = await fixture(t);
  const ready = job('ready', { completedAt: '2026-09-27T00:01:00.000Z' });
  const failed = job('failed', { status: 'failed', error: 'Invalid mesh' });
  await writeFile(index, JSON.stringify([job('queued', { status: 'queued' }), job('slicing', { status: 'slicing' }), ready, failed]));
  await store.init();
  const persisted = JSON.parse(await readFile(index, 'utf8'));
  for (const id of ['queued', 'slicing']) {
    assert.equal(store.get(id).status, 'failed');
    assert.match(store.get(id).error, /interrupted by server restart/);
    assert.deepEqual(persisted.find(item => item.id === id), store.get(id));
  }
  assert.deepEqual(store.get('ready'), ready);
  assert.deepEqual(store.get('failed'), failed);
  const reopened = new JobStore(root);
  await reopened.init();
  assert.deepEqual(reopened.list(), store.list());
});

test('concurrent deletes and updates commit in call order without losing unrelated jobs', async t => {
  const { root, store } = await fixture(t);
  await store.init();
  await store.set(job('remove'));
  const results = await Promise.all([
    store.delete('remove'),
    store.set(job('replace', { filename: 'first.stl' })),
    store.set(job('keep')),
    store.delete('replace'),
    store.set(job('replace', { filename: 'last.stl' })),
    store.delete('missing')
  ]);
  assert.equal(results[0], true);
  assert.equal(results[3], true);
  assert.equal(results[5], false);
  const reopened = new JobStore(root);
  await reopened.init();
  assert.equal(reopened.get('remove'), undefined);
  assert.equal(reopened.get('replace').filename, 'last.stl');
  assert.deepEqual(reopened.get('keep'), job('keep'));
  assert.equal(reopened.list().length, 2);
});

test('input, returned values, and read snapshots cannot mutate stored jobs', async t => {
  const { root, store } = await fixture(t);
  await store.init();
  const input = job('one', { settings: { layer_height: 0.2 } });
  const saving = store.set(input);
  input.settings.layer_height = 5;
  const saved = await saving;
  saved.settings.layer_height = 6;
  store.get('one').settings.layer_height = 7;
  store.list()[0].settings.layer_height = 8;
  await store.set(job('two', { createdAt: '2026-09-28T00:00:00.000Z' }));
  assert.deepEqual(store.list().map(item => item.id), ['two', 'one']);
  assert.equal(store.get('one').settings.layer_height, 0.2);
  const reopened = new JobStore(root);
  await reopened.init();
  assert.equal(reopened.get('one').settings.layer_height, 0.2);
});

test('corrupt or structurally invalid indexes reject initialization without overwriting data', async t => {
  for (const data of ['{broken', '{}', '[null]', '[{"id":"same"},{"id":"same"}]']) {
    const { index, store } = await fixture(t);
    await writeFile(index, data);
    await assert.rejects(store.init());
    assert.equal(await readFile(index, 'utf8'), data);
    assert.equal(store.list().length, 0);
  }
});

test('an unreadable index error is surfaced instead of being treated as an empty index', async t => {
  const { index, store } = await fixture(t);
  // A directory at the file path reliably produces a read error on macOS/Linux,
  // including when permission-based tests would run with elevated privileges.
  await mkdir(index);
  await assert.rejects(store.init(), { code: 'EISDIR' });
  assert.deepEqual(await readdir(index), []);
  assert.equal(store.list().length, 0);
});

test('failed atomic replacement preserves memory and disk, removes temp files, and allows retry', async t => {
  const { root, index, store } = await fixture(t);
  await store.init();
  await store.set(job('keep'));
  const before = await readFile(index, 'utf8');
  const blocked = path.join(root, 'blocked');
  await mkdir(blocked);
  store.index = blocked;
  await assert.rejects(store.set(job('lost')));
  await assert.rejects(store.delete('keep'));
  assert.deepEqual(store.get('keep'), job('keep'));
  assert.equal(store.get('lost'), undefined);
  assert.equal(await readFile(index, 'utf8'), before);
  assert.deepEqual((await readdir(root)).sort(), ['blocked', 'jobs.json']);
  store.index = index;
  await store.set(job('recovered'));
  const reopened = new JobStore(root);
  await reopened.init();
  assert.deepEqual(reopened.list(), store.list());
  assert.equal(reopened.get('lost'), undefined);
});

test('serialization failures leave the previous index intact and do not poison the write queue', async t => {
  const { index, store } = await fixture(t);
  await store.init();
  await store.set(job('keep'));
  const before = await readFile(index, 'utf8');
  await assert.rejects(store.set(job('invalid', { size: 1n })), TypeError);
  assert.equal(await readFile(index, 'utf8'), before);
  assert.equal(store.get('invalid'), undefined);
  await store.set(job('next'));
  assert.equal(store.list().length, 2);
});

test('conditional transitions serialize cancellation against completion and preserve terminal jobs', async t => {
  const { root, store } = await fixture(t);
  await store.init();
  await store.set(job('cancel-first', { status: 'slicing' }));
  const [cancelled, completion] = await Promise.all([
    store.transition('cancel-first', ['queued', 'slicing'], { status: 'cancelled', completedAt: '2026-09-27T00:01:00.000Z' }),
    store.transition('cancel-first', ['slicing'], { status: 'ready' })
  ]);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(completion, cancelled);
  await store.set(job('ready-first', { status: 'slicing' }));
  const [ready, lateCancel] = await Promise.all([
    store.transition('ready-first', ['slicing'], { status: 'ready' }),
    store.transition('ready-first', ['queued', 'slicing'], { status: 'cancelled' })
  ]);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(lateCancel, ready);
  assert.equal(await store.transition('missing', ['queued'], { status: 'cancelled' }), undefined);
  const reopened = new JobStore(root);
  await reopened.init();
  assert.equal(reopened.get('cancel-first').status, 'cancelled');
  assert.equal(reopened.get('ready-first').status, 'ready');
});
