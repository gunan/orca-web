import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';

test('slices an uploaded model through the API', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'orca-web-'));
  const app = await createApp({ dataDir, binary: path.resolve('tests/fixtures/fake-slicer.sh') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const form = new FormData();
  form.set('profile', 'balanced');
  form.set('model', new Blob([await readFile('tests/fixtures/cube.stl')]), 'cube.stl');
  const created = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  assert.equal(created.status, 202);
  const job = await created.json();
  let current;
  for (let attempt = 0; attempt < 30; attempt++) {
    current = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
    if (current.status === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(current.status, 'ready', current.error);
  const download = await fetch(`${base}/api/jobs/${job.id}/download`);
  assert.equal(download.status, 200);
  assert.match(await download.text(), /G28/);
});

test('rejects unsupported uploads', async t => {
  const app = await createApp({ dataDir: await mkdtemp(path.join(tmpdir(), 'orca-web-')) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const form = new FormData();
  form.set('profile', 'balanced');
  form.set('model', new Blob(['bad']), 'bad.exe');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/jobs`, { method: 'POST', body: form });
  assert.equal(response.status, 400);
});
