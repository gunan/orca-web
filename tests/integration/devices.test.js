// Every connection in this suite is a local fake HTTP printer. No hardware is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDeviceRouter, PrinterClient } from '../../server/devices.js';

const SECRET = 'fake-printer-secret';
const GCODE = '; fake test job\nG28\nG1 X20 Y30 E1.25\n';
async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function fakePrinter(t, type, prefix = '') {
  const fake = { type, requests: [], uploads: [], gate: null, failure: null, klippy: 'ready', state: 'standby', homed: 'xyz', objects: ['print_stats', 'virtual_sdcard', 'pause_resume', 'toolhead', 'extruder', 'heater_bed', 'fan'], operational: true };
  const app = express(), router = express.Router(); app.use(prefix || '/', router); router.use(express.json());
  router.use(async (req, res, next) => {
    fake.requests.push({ method: req.method, url: req.originalUrl, body: req.body, apiKey: req.get('x-api-key') });
    if (fake.failure) return res.status(fake.failure.status).json(fake.failure.body);
    if (req.get('x-api-key') !== SECRET) return res.status(401).json({ error: 'Bad fixture key' });
    if (req.method === 'POST' && fake.gate) await fake.gate();
    next();
  });
  router.get('/server/info', (_req, res) => res.json({ result: { klippy_state: fake.klippy } }));
  router.get('/printer/objects/list', (_req, res) => res.json({ result: { objects: fake.objects } }));
  router.get('/printer/objects/query', (_req, res) => {
    const values = { webhooks: { state: fake.klippy }, print_stats: { state: fake.state, filename: 'fixture.gcode', print_duration: 123 }, virtual_sdcard: { progress: .25, is_active: fake.state === 'printing' }, pause_resume: { is_paused: fake.state === 'paused' }, toolhead: { position: [20, 30, 5, 0], homed_axes: fake.homed }, extruder: { temperature: 201, target: 205 }, heater_bed: { temperature: 59, target: 60 }, fan: { speed: .5 } };
    res.json({ result: { status: Object.fromEntries(fake.objects.filter(name => name !== fake.omitObject).map(name => [name, values[name]])) } });
  });
  router.get('/api/printer', (_req, res) => {
    if (!fake.operational) return res.status(409).json({ error: 'Printer is not operational' });
    res.json({ state: { text: fake.state, flags: { operational: true, printing: fake.state === 'printing', paused: fake.state === 'paused', cancelling: fake.state === 'cancelling' } }, temperature: { tool0: { actual: 201, target: 205 }, bed: { actual: 59, target: 60 } } });
  });
  router.get('/api/job', (_req, res) => res.json({ state: fake.operational ? fake.state : 'Offline', job: { file: { name: 'fixture.gcode' } }, progress: { completion: 25, printTime: 123, printTimeLeft: 369 } }));
  const multipart = multer({ storage: multer.memoryStorage() }).single('file');
  for (const route of ['/server/files/upload', '/api/files/local']) router.post(route, multipart, (req, res) => {
    fake.uploads.push({ fields: req.body, file: req.file, contentLength: req.get('content-length') });
    if (req.body.print === 'true') fake.state = 'printing';
    res.status(201).json(type === 'moonraker' ? { result: { item: { path: req.file.originalname }, print_started: req.body.print === 'true' } } : { done: true, effectivePrint: req.body.print === 'true' });
  });
  router.post('/printer/print/:action', (req, res) => { fake.state = ({ start: 'printing', pause: 'paused', resume: 'printing', cancel: 'standby' })[req.params.action]; res.json({ result: 'ok' }); });
  router.post('/api/job', (req, res) => { fake.state = req.body.command === 'cancel' ? 'standby' : req.body.action === 'pause' ? 'paused' : 'printing'; res.status(204).end(); });
  router.use((req, res) => { if (req.method === 'POST') return type === 'moonraker' ? res.json({ result: 'ok' }) : res.status(204).end(); res.status(404).json({ error: 'Unknown fake-printer endpoint' }); });
  fake.url = `${await listen(t, app)}${prefix}/`;
  fake.mutations = () => fake.requests.filter(request => request.method !== 'GET');
  return fake;
}
async function setup(t, type = 'moonraker', options = {}) {
  const fake = await fakePrinter(t, type, options.prefix);
  const dataDir = await mkdtemp(path.join(tmpdir(), 'orca-devices-api-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await mkdir(path.join(dataDir, 'jobs'));
  await writeFile(path.join(dataDir, 'jobs', 'ready.gcode'), GCODE);
  const jobs = new Map([['ready', { id: 'ready', filename: 'My cube.stl', status: 'ready' }], ['failed', { id: 'failed', filename: 'failure.stl', status: 'failed' }], ['missing', { id: 'missing', filename: 'missing.stl', status: 'ready' }]]);
  const app = express(); app.use(express.json());
  app.use('/api/devices', await createDeviceRouter({ dataDir, jobStore: { get: id => jobs.get(id) }, timeoutMs: 1000 }));
  const base = await listen(t, app);
  const call = async (method, endpoint = '', body, headers = {}) => {
    const response = await fetch(`${base}/api/devices${endpoint}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const fields = { name: `Local fake ${type}`, type, url: fake.url, apiKey: SECRET };
  const saved = await call('POST', '', fields); assert.equal(saved.status, 201);
  return { fake, dataDir, jobs, base, call, fields, id: saved.body.id };
}

test('connection API validates and redacts CRUD, preserving keys on edits and enforcing same-origin mutations', async t => {
  const c = await setup(t), { call, id } = c;
  const listed = await call('GET'); assert.equal(listed.status, 200); assert.equal(listed.body[0].hasApiKey, true);
  assert.equal(JSON.stringify(listed.body).includes(SECRET), false);
  assert.equal((await call('PUT', `/${id}`, { name: 'Renamed fake', type: c.fields.type, url: c.fields.url })).status, 200);
  assert.equal((await call('GET', `/${id}/status`)).status, 200);
  assert.ok(c.fake.requests.every(request => request.apiKey === SECRET));
  assert.equal((await call('POST', '', { ...c.fields, cameraUrl: 'not a URL' })).status, 400);
  for (const origin of ['http://other.invalid', c.base.replace('http:', 'https:'), 'null']) assert.equal((await call('DELETE', `/${id}`, undefined, { Origin: origin })).status, 403);
  assert.equal((await call('DELETE', `/${id}`, undefined, { Origin: c.base })).status, 204);
  assert.equal((await call('GET', `/${id}/status`)).status, 404);
  assert.equal((await call('PUT', `/${id}`, c.fields)).status, 404);
  assert.deepEqual((await call('GET')).body, []);
});

test('Moonraker status uses reported objects, preserves URL prefixes, and distinguishes offline firmware', async t => {
  const c = await setup(t, 'moonraker', { prefix: '/klipper' });
  let response = await c.call('GET', `/${c.id}/status`);
  assert.equal(response.status, 200); assert.equal(response.body.progress, .25); assert.deepEqual(response.body.position, [20, 30, 5, 0]);
  assert.equal(response.body.temperature.hotend.actual, 201); assert.equal(response.body.homedAxes, 'xyz'); assert.ok(response.body.capabilities.includes('fan'));
  assert.ok(c.fake.requests.every(request => request.url.startsWith('/klipper/')));
  c.fake.omitObject = 'print_stats';
  assert.equal((await c.call('POST', `/${c.id}/command`, { action: 'home', confirmed: true })).status, 502);
  assert.equal(c.fake.mutations().length, 0); c.fake.omitObject = null;
  c.fake.objects = ['toolhead']; response = await c.call('GET', `/${c.id}/status`);
  assert.deepEqual(response.body.capabilities, ['upload', 'home', 'jog']);
  c.fake.klippy = 'shutdown'; response = await c.call('GET', `/${c.id}/status`);
  assert.equal(response.body.connected, true); assert.equal(response.body.ready, false); assert.deepEqual(response.body.capabilities, ['upload']);
});

test('OctoPrint status handles disconnected printer 409 and exposes only available capabilities', async t => {
  const c = await setup(t, 'octoprint');
  let response = await c.call('GET', `/${c.id}/status`);
  assert.equal(response.status, 200); assert.equal(response.body.progress, .25); assert.equal(response.body.remaining, 369);
  assert.ok(response.body.capabilities.includes('hotend')); assert.ok(!response.body.capabilities.includes('fan'));
  c.fake.operational = false; response = await c.call('GET', `/${c.id}/status`);
  assert.equal(response.status, 200); assert.equal(response.body.connected, true); assert.equal(response.body.ready, false); assert.equal(response.body.state, 'Offline');
  assert.deepEqual(response.body.capabilities, ['upload']);
});

for (const type of ['moonraker', 'octoprint']) {
  test(`${type} uploads only completed output without selecting/printing; starting requires explicit confirmation`, async t => {
    const c = await setup(t, type);
    for (const body of [{ jobId: 'failed' }, { jobId: 'unknown' }, { jobId: 'ready', print: 'true' }, { jobId: 'ready', print: true }, { jobId: 'ready', print: true, confirmed: 'true' }]) assert.equal((await c.call('POST', `/${c.id}/upload`, body)).status, 400);
    assert.equal((await c.call('POST', `/${c.id}/upload`, { jobId: 'missing' })).status, 409);
    assert.equal(c.fake.mutations().length, 0);
    const uploaded = await c.call('POST', `/${c.id}/upload`, { jobId: 'ready' });
    assert.equal(uploaded.status, 200); assert.equal(uploaded.body.printRequested, false); assert.equal(uploaded.body.filename, 'My_cube.gcode');
    const first = c.fake.uploads[0]; assert.equal(first.file.buffer.toString(), GCODE); assert.equal(first.file.originalname, 'My_cube.gcode');
    assert.ok(Number(first.contentLength) > GCODE.length); assert.equal(first.fields.print, 'false');
    if (type === 'octoprint') assert.equal(first.fields.select, 'false'); else assert.equal(first.fields.root, 'gcodes');
    assert.equal(c.fake.state, 'standby');
    const printed = await c.call('POST', `/${c.id}/upload`, { jobId: 'ready', print: true, confirmed: true });
    assert.equal(printed.status, 200); assert.equal(c.fake.uploads[1].fields.print, 'true'); assert.equal(c.fake.state, 'printing');
    if (type === 'octoprint') assert.equal(c.fake.uploads[1].fields.select, 'true');
    assert.equal((await c.call('POST', `/${c.id}/upload`, { jobId: 'ready', print: true, confirmed: true })).status, 409);
    assert.equal(c.fake.uploads.length, 2);
  });
  test(`${type} commands enforce confirmation, numeric validation, busy state, and map the native protocol`, async t => {
    const c = await setup(t, type);
    const command = body => c.call('POST', `/${c.id}/command`, body);
    assert.equal((await command({ action: 'home' })).status, 400);
    assert.equal((await command({ action: 'raw', confirmed: true, script: 'G28' })).status, 400);
    for (const target of [true, [], ' ', 351, -1, '20\nG28']) assert.equal((await command({ action: 'temperature', heater: 'hotend', target, confirmed: true })).status, 400);
    assert.equal((await command({ action: 'home', axes: ['x', 'x'], confirmed: true })).status, 400);
    assert.equal((await command({ action: 'jog', axis: 'e', distance: 1, confirmed: true })).status, 400);
    assert.equal((await command({ action: 'print', filename: '../bad.gcode', confirmed: true })).status, 400);
    assert.equal(c.fake.mutations().length, 0);
    c.fake.state = 'paused'; assert.equal((await command({ action: 'home', confirmed: true })).status, 409);
    assert.equal((await command({ action: 'print', filename: 'good.gcode', confirmed: true })).status, 409);
    c.fake.state = 'standby';
    assert.equal((await command({ action: 'home', axes: ['x', 'y'], confirmed: true })).status, 200);
    assert.equal((await command({ action: 'jog', axis: 'x', distance: -2.5, speed: 2.123, confirmed: true })).status, 200);
    assert.equal((await command({ action: 'temperature', heater: 'hotend', target: 205, confirmed: true })).status, 200);
    assert.equal((await command({ action: 'temperature', heater: 'bed', target: 0, confirmed: true })).status, 200);
    const calls = c.fake.mutations();
    if (type === 'moonraker') {
      assert.equal(calls[0].body.script, 'G28 X Y');
      assert.equal(calls[1].body.script, 'SAVE_GCODE_STATE NAME=ORCA_WEB_JOG\nG91\nG1 X-2.5 F127\nRESTORE_GCODE_STATE NAME=ORCA_WEB_JOG');
      assert.equal(calls[2].body.script, 'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=205');
      assert.equal(calls[3].body.script, 'SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=0');
      assert.equal((await command({ action: 'fan', speed: 100, confirmed: true })).status, 200);
      assert.equal(c.fake.mutations().at(-1).body.script, 'M106 S255');
      c.fake.homed = 'yz'; assert.equal((await command({ action: 'jog', axis: 'x', distance: 1, confirmed: true })).status, 409);
    } else {
      assert.deepEqual(calls[0].body, { command: 'home', axes: ['x', 'y'] });
      assert.deepEqual(calls[1].body, { command: 'jog', x: -2.5, absolute: false, speed: 127 });
      assert.deepEqual(calls[2].body, { command: 'target', targets: { tool0: 205 } });
      assert.equal(calls[2].url, '/api/printer/tool'); assert.deepEqual(calls[3].body, { command: 'target', target: 0 });
      assert.equal(calls[3].url, '/api/printer/bed'); assert.equal((await command({ action: 'fan', speed: 100, confirmed: true })).status, 409);
    }
    c.fake.state = 'printing';
    for (const [action, state] of [['pause', 'paused'], ['resume', 'printing'], ['cancel', 'standby']]) {
      assert.equal((await command({ action, confirmed: true })).status, 200); assert.equal(c.fake.state, state);
    }
    assert.equal((await command({ action: 'resume', confirmed: true })).status, 409);
  });
}

test('remote authentication errors and successful echo payloads never reveal API keys; failures release the lock', async t => {
  const c = await setup(t);
  c.fake.failure = { status: 403, body: { error: { message: `Rejected ${SECRET}` } } };
  const response = await c.call('GET', `/${c.id}/status`);
  assert.equal(response.status, 401); assert.match(response.body.error, /authentication failed/); assert.ok(!JSON.stringify(response).includes(SECRET));
  assert.equal((await c.call('POST', `/${c.id}/command`, { action: 'home', confirmed: true })).status, 401);
  c.fake.failure = null;
  assert.equal((await c.call('POST', `/${c.id}/command`, { action: 'home', confirmed: true })).status, 200);
  const app = express(); app.get('/echo', (_req, res) => res.json({ result: { token: SECRET, nested: [`message ${SECRET}`] } }));
  const url = `${await listen(t, app)}/`;
  const client = new PrinterClient({ type: 'moonraker', url, apiKey: SECRET });
  assert.deepEqual(await client.request('/echo'), { token: '[redacted]', nested: ['message [redacted]'] });
});

test('in-flight commands lock same-device edit, delete, upload, and second commands; other connections remain usable', async t => {
  const c = await setup(t);
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  c.fake.gate = async () => { entered(); await blocked; };
  const pending = c.call('POST', `/${c.id}/command`, { action: 'home', confirmed: true });
  await started;
  try {
    for (const [method, endpoint, body] of [['PUT', `/${c.id}`, c.fields], ['DELETE', `/${c.id}`], ['POST', `/${c.id}/upload`, { jobId: 'ready' }], ['POST', `/${c.id}/command`, { action: 'home', confirmed: true }]]) assert.equal((await c.call(method, endpoint, body)).status, 409);
    assert.equal((await c.call('POST', '', { ...c.fields, name: 'Independent fake' })).status, 201);
    assert.equal((await c.call('GET', `/${c.id}/status`)).status, 200);
  } finally { release(); }
  assert.equal((await pending).status, 200); assert.equal(c.fake.mutations().length, 1);
  assert.equal((await c.call('DELETE', `/${c.id}`)).status, 204);
});

test('HTTP adapter rejects redirects, invalid JSON, oversized bodies, and streamed timeouts without forwarding credentials', async t => {
  let redirectedRequests = 0;
  const destination = express(); destination.use((_req, res) => { redirectedRequests++; res.json({ ok: true }); });
  const redirectUrl = await listen(t, destination);
  const app = express();
  app.get('/redirect', (_req, res) => res.redirect(`${redirectUrl}/credential-trap`));
  app.get('/html', (_req, res) => res.type('html').send('<html>login</html>'));
  app.get('/null', (_req, res) => res.json(null));
  app.get('/huge', (_req, res) => res.json({ value: 'x'.repeat(4 * 1024 * 1024) }));
  app.get('/slow-body', (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"result":'); });
  const url = `${await listen(t, app)}/`;
  const client = new PrinterClient({ type: 'moonraker', url, apiKey: SECRET }, { timeoutMs: 5000 });
  for (const [endpoint, expected] of [['redirect', /redirected/], ['html', /invalid JSON/], ['null', /invalid JSON/], ['huge', /supported size/], ['slow-body', /timed out/]]) {
    const requester = endpoint === 'slow-body' ? new PrinterClient({ type: 'moonraker', url, apiKey: SECRET }, { timeoutMs: 100 }) : client;
    await assert.rejects(requester.request(endpoint), error => error.status === 502 && expected.test(error.message), endpoint);
  }
  assert.equal(redirectedRequests, 0);
});
