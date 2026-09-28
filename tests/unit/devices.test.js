import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DeviceStore } from '../../server/devices.js';

const input = { name: 'Fake test printer', type: 'moonraker', url: 'http://127.0.0.1:1/prefix', apiKey: 'fixture-secret' };
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-device-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DeviceStore(directory); await store.init();
  return store;
}

test('printer credentials persist privately; public records and reads cannot mutate the store', async t => {
  const store = await setup(t), saved = await store.save(input);
  assert.equal(saved.hasApiKey, true); assert.equal(Object.hasOwn(saved, 'apiKey'), false);
  assert.equal(saved.url, 'http://127.0.0.1:1/prefix/');
  assert.equal((await stat(store.file)).mode & 0o777, 0o600);
  assert.equal((await stat(store.directory)).mode & 0o777, 0o700);
  store.get(saved.id).apiKey = 'changed'; store.list()[0].name = 'changed';
  assert.equal(store.get(saved.id).apiKey, input.apiKey); assert.equal(store.list()[0].name, input.name);
  const reopened = new DeviceStore(store.directory); await reopened.init();
  assert.deepEqual(reopened.list(), store.list());
  assert.equal(reopened.get(saved.id).apiKey, input.apiKey);
  await reopened.delete(saved.id);
  assert.deepEqual(JSON.parse(await readFile(store.file, 'utf8')), []);
});

test('concurrent creates and edits preserve every record and the latest credential', async t => {
  const store = await setup(t);
  const records = await Promise.all(Array.from({ length: 40 }, (_, i) => store.save({ ...input, name: `Fixture ${i}` })));
  assert.equal(new Set(records.map(item => item.id)).size, 40);
  const id = records[0].id;
  await Promise.all([
    store.save({ ...input, apiKey: 'rotated-secret' }, id),
    store.save({ name: 'Renamed fixture', type: input.type, url: input.url }, id),
  ]);
  assert.equal(store.get(id).apiKey, 'rotated-secret');
  const reopened = new DeviceStore(store.directory); await reopened.init();
  assert.equal(reopened.list().length, 40); assert.equal(reopened.get(id).name, 'Renamed fixture');
  assert.equal(reopened.get(id).apiKey, 'rotated-secret');
  const result = await Promise.allSettled([store.delete(id), store.save(input, id)]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].reason.status, 404);
  assert.equal(store.get(id), undefined);
});

test('failed atomic replacement leaves memory intact, cleans the temporary file, and allows later writes', async t => {
  const store = await setup(t), saved = await store.save(input);
  const original = await readFile(store.file, 'utf8');
  await rename(store.file, `${store.file}.backup`); await mkdir(store.file);
  await assert.rejects(store.save({ ...input, name: 'Must not commit' }, saved.id));
  assert.equal(store.get(saved.id).name, input.name);
  assert.deepEqual((await readdir(store.directory)).sort(), ['devices.json', 'devices.json.backup']);
  assert.equal(await readFile(`${store.file}.backup`, 'utf8'), original);
  await rm(store.file, { recursive: true }); await rename(`${store.file}.backup`, store.file);
  await store.save({ ...input, name: 'Recovery succeeds' }, saved.id);
  assert.equal(JSON.parse(await readFile(store.file, 'utf8'))[0].name, 'Recovery succeeds');
});

test('corrupt or invalid stored connections abort startup without replacing their contents', async t => {
  const store = await setup(t);
  for (const text of ['{', '{}', '[{"id":"x","type":"moonraker","url":"file:///tmp"}]']) {
    await writeFile(store.file, text);
    await assert.rejects(new DeviceStore(store.directory).init(), /Invalid printer connection store/);
    assert.equal(await readFile(store.file, 'utf8'), text);
  }
  await rm(store.file); await mkdir(store.file);
  await assert.rejects(new DeviceStore(store.directory).init());
  assert.ok((await stat(store.file)).isDirectory());
});

test('malformed URLs, credentials, names, and camera URLs are rejected without persisting a connection', async t => {
  const store = await setup(t);
  for (const patch of [{ type: 'unknown' }, { name: ' ' }, { name: 'a\nb' }, { url: 'file:///tmp' }, { url: 'http://user:password@localhost' }, { url: 'http://localhost/?token=x' }, { url: 'http://localhost/#x' }, { apiKey: 123 }, { apiKey: 'key\r\nInjected: yes' }, { cameraUrl: 'bad url' }, { cameraUrl: 'javascript:alert(1)' }, { cameraUrl: 'http://user:password@localhost/' }]) {
    await assert.rejects(store.save({ ...input, ...patch }), error => error.status === 400);
  }
  assert.deepEqual(store.list(), []);
});
