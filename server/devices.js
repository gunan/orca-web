import express from 'express';
import { openAsBlob } from 'node:fs';
import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const TYPES = ['moonraker', 'octoprint'];
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const cleanDevice = ({ apiKey, ...device }) => ({ ...device, hasApiKey: Boolean(apiKey) });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function number(value, label, min, max) {
  const valid = typeof value === 'number' || (typeof value === 'string' && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()));
  const result = valid ? Number(value) : NaN;
  if (!Number.isFinite(result) || result < min || result > max) throw failure(`${label} must be between ${min} and ${max}.`);
  return result;
}
function baseUrl(value) {
  let url; try { url = new URL(value); } catch { throw failure('Enter a complete printer URL, including http:// or https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw failure('Printer URL must use HTTP(S), without embedded credentials, query, or fragment.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
function cameraUrl(value = '') {
  if (typeof value !== 'string') throw failure('Camera must be an HTTP(S) URL without embedded credentials.');
  if (!value) return '';
  let url; try { url = new URL(value); } catch { throw failure('Camera must be an HTTP(S) URL without embedded credentials.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw failure('Camera must be an HTTP(S) URL without embedded credentials.');
  return url.href;
}
function filename(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || value.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f\x7f]/.test(value) || !/\.(gcode|gco|g)$/i.test(value)) throw failure('Choose a valid G-code filename.');
  return value;
}
function deviceFields(input, existing) {
  if (!record(input) || !TYPES.includes(input.type)) throw failure('Choose Moonraker or OctoPrint.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || /[\x00-\x1f\x7f]/.test(input.name)) throw failure('Printer name must contain 1–100 printable characters.');
  const apiKey = input.apiKey === undefined ? existing?.apiKey || '' : input.apiKey;
  if (typeof apiKey !== 'string' || apiKey.length > 4096 || /[\x00-\x1f\x7f]/.test(apiKey)) throw failure('API key contains invalid characters.');
  return { name: input.name.trim(), type: input.type, url: baseUrl(input.url), apiKey, cameraUrl: cameraUrl(input.cameraUrl ?? '') };
}

export class DeviceStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'devices.json'); this.items = []; this.queue = Promise.resolve(); }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    let text;
    try { text = await readFile(this.file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    let data;
    try {
      data = JSON.parse(text);
      if (!Array.isArray(data) || new Set(data.map(item => item?.id)).size !== data.length) throw new Error();
      for (const item of data) {
        if (!record(item) || typeof item.id !== 'string' || !item.id || typeof item.updatedAt !== 'string') throw new Error();
        deviceFields(item);
      }
    } catch { throw new Error('Invalid printer connection store. Repair devices.json before starting the server.'); }
    await chmod(this.file, 0o600);
    this.items = data.map(item => ({ id: item.id, ...deviceFields(item), updatedAt: item.updatedAt }));
  }
  list() { return this.items.map(cleanDevice); }
  get(id) { return structuredClone(this.items.find(item => item.id === id)); }
  mutate(action) {
    const task = this.queue.then(async () => {
      const { items, result } = action(structuredClone(this.items));
      const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(items), { mode: 0o600, flag: 'wx' });
        await rename(temporary, this.file);
        this.items = items;
        return result;
      } finally { await unlink(temporary).catch(() => {}); }
    });
    this.queue = task.catch(() => {}); return task;
  }
  save(input, id) {
    // Resolve the current credentials inside the transaction so concurrent edits cannot restore a stale key.
    const values = structuredClone(input);
    return this.mutate(items => {
      const index = id === undefined ? -1 : items.findIndex(item => item.id === id);
      if (id !== undefined && index < 0) throw failure('Printer connection not found.', 404);
      const existing = items[index];
      const item = { id: existing?.id || crypto.randomUUID(), ...deviceFields(values, existing), updatedAt: new Date().toISOString() };
      if (index < 0) items.push(item); else items[index] = item;
      return { items, result: cleanDevice(item) };
    });
  }
  delete(id) {
    return this.mutate(items => {
      if (!items.some(item => item.id === id)) throw failure('Printer connection not found.', 404);
      return { items: items.filter(item => item.id !== id) };
    });
  }
}

export class PrinterClient {
  constructor(device, { fetchImpl = fetch, timeoutMs = 10000 } = {}) { this.device = structuredClone(device); this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  redact(value) {
    const secret = this.device.apiKey;
    if (!secret) return value;
    if (typeof value === 'string') return value.replaceAll(secret, '[redacted]');
    if (Array.isArray(value)) return value.map(item => this.redact(item));
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [this.redact(key), this.redact(item)]));
    return value;
  }
  async request(endpoint, { method = 'GET', json, form } = {}) {
    const headers = {};
    if (this.device.apiKey) headers['X-Api-Key'] = this.device.apiKey;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const url = new URL(endpoint.replace(/^\//, ''), this.device.url);
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response, text = '';
    try {
      response = await this.fetch(url, { method, headers, body: form || (json === undefined ? undefined : JSON.stringify(json)), redirect: 'manual', signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw failure('Printer redirected the request. Configure its final URL directly.', 502);
      }
      if (response.body) {
        const reader = response.body.getReader(), decoder = new TextDecoder(); let count = 0;
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            count += value.length;
            if (count > 4 * 1024 * 1024) { await reader.cancel(); throw failure('Printer response exceeds the supported size.', 502); }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      }
    } catch (error) {
      if (error.status) throw error;
      throw failure(signal.aborted ? 'Printer request timed out.' : 'Could not reach the printer. Check its URL and network connection.', 502);
    }
    let data, validJson = true;
    try { data = text.trim() ? JSON.parse(text) : {}; } catch { validJson = false; data = {}; }
    if (!response.ok) {
      let detail = record(data) ? data.error?.message || data.error || data.message : undefined;
      if (typeof detail !== 'string') detail = `HTTP ${response.status}`;
      const error = failure(`${response.status === 401 || response.status === 403 ? 'Printer authentication failed' : 'Printer rejected the request'}: ${this.redact(detail).slice(0, 500)}`, response.status === 401 || response.status === 403 ? 401 : 502);
      error.remoteStatus = response.status;
      throw error;
    }
    if (!validJson || data === null) throw failure('Printer returned an invalid JSON response. Check the connector type and URL.', 502);
    const result = this.device.type === 'moonraker' && record(data) && Object.hasOwn(data, 'result') ? data.result : data;
    return this.redact(result);
  }
  async status() {
    if (this.device.type === 'moonraker') {
      const info = await this.request('/server/info');
      if (!record(info) || typeof info.klippy_state !== 'string') throw failure('Printer returned an invalid Moonraker status.', 502);
      if (info.klippy_state !== 'ready') return { connected: true, ready: false, busy: false, printing: false, paused: false, state: info.klippy_state, capabilities: ['upload'], temperature: {}, progress: null, filename: null };
      const objects = await this.request('/printer/objects/list');
      if (!record(objects) || !Array.isArray(objects.objects)) throw failure('Printer returned an invalid object list.', 502);
      const available = new Set(objects.objects);
      const names = ['webhooks', 'print_stats', 'virtual_sdcard', 'pause_resume', 'extruder', 'heater_bed', 'toolhead', 'fan'].filter(name => available.has(name));
      const result = names.length ? await this.request(`/printer/objects/query?${names.map(encodeURIComponent).join('&')}`) : { status: {} };
      if (!record(result?.status) || names.some(name => !record(result.status[name]))) throw failure('Printer returned an incomplete object status.', 502);
      const state = result.status;
      if (state.webhooks && state.webhooks.state !== 'ready') return { connected: true, ready: false, busy: false, printing: false, paused: false, state: state.webhooks.state || 'unknown', capabilities: ['upload'], temperature: {}, progress: null, filename: null };
      const capabilities = ['upload'];
      if (available.has('virtual_sdcard')) capabilities.push('print');
      if (available.has('pause_resume')) capabilities.push('pause', 'resume', 'cancel');
      if (available.has('toolhead')) capabilities.push('home', 'jog');
      if (available.has('extruder')) capabilities.push('hotend');
      if (available.has('heater_bed')) capabilities.push('bed');
      if (available.has('fan')) capabilities.push('fan');
      const label = state.print_stats?.state || 'standby';
      const paused = state.pause_resume?.is_paused === true || label === 'paused';
      const printing = !paused && (label === 'printing' || state.virtual_sdcard?.is_active === true);
      return { connected: true, ready: true, busy: printing || paused, printing, paused, state: paused ? 'paused' : label, filename: state.print_stats?.filename || null, progress: typeof state.virtual_sdcard?.progress === 'number' ? state.virtual_sdcard.progress : null, elapsed: state.print_stats?.print_duration ?? null, position: state.toolhead?.position || null, homedAxes: typeof state.toolhead?.homed_axes === 'string' ? state.toolhead.homed_axes : '', temperature: { ...(state.extruder && { hotend: { actual: state.extruder.temperature, target: state.extruder.target } }), ...(state.heater_bed && { bed: { actual: state.heater_bed.temperature, target: state.heater_bed.target } }) }, fan: state.fan?.speed ?? null, capabilities };
    }
    const [printerResult, jobResult] = await Promise.allSettled([this.request('/api/printer'), this.request('/api/job')]);
    if (jobResult.status === 'rejected') throw jobResult.reason;
    const job = jobResult.value;
    if (!record(job) || typeof job.state !== 'string') throw failure('Printer returned an invalid OctoPrint job status.', 502);
    if (printerResult.status === 'rejected') {
      if (printerResult.reason.remoteStatus !== 409) throw printerResult.reason;
      return { connected: true, ready: false, busy: false, printing: false, paused: false, state: job.state, filename: job.job?.file?.name || null, progress: null, temperature: {}, capabilities: ['upload'] };
    }
    const printer = printerResult.value;
    if (!record(printer?.state?.flags)) throw failure('Printer returned an invalid OctoPrint printer status.', 502);
    const flags = printer.state.flags;
    const temperature = {};
    if (printer.temperature?.tool0) temperature.hotend = printer.temperature.tool0;
    if (printer.temperature?.bed) temperature.bed = printer.temperature.bed;
    const ready = flags.operational === true;
    const paused = flags.paused === true || /paused/i.test(job.state);
    const printing = flags.printing === true || /^printing$/i.test(job.state);
    const busy = printing || paused || flags.pausing === true || flags.cancelling === true || flags.resuming === true || /pausing|cancelling|resuming/i.test(job.state);
    const capabilities = ready ? ['upload', 'print', 'pause', 'resume', 'cancel', 'home', 'jog'] : ['upload'];
    if (ready && temperature.hotend) capabilities.push('hotend');
    if (ready && temperature.bed) capabilities.push('bed');
    return { connected: true, ready, busy, printing, paused, state: job.state || printer.state?.text || 'unknown', filename: job.job?.file?.name || null, progress: typeof job.progress?.completion === 'number' ? job.progress.completion / 100 : null, elapsed: job.progress?.printTime ?? null, remaining: job.progress?.printTimeLeft ?? null, temperature, capabilities };
  }
  async readyFor(action) {
    const state = await this.status();
    if (!state.ready) throw failure('The printer is not ready.', 409);
    if (action !== 'temperature' && !state.capabilities.includes(action)) throw failure('This printer does not advertise that capability.', 409);
    if (['home', 'jog', 'print'].includes(action) && state.busy) throw failure('This action is unavailable during a print.', 409);
    if (action === 'pause' && !state.printing) throw failure('The printer is not printing.', 409);
    if (action === 'resume' && !state.paused) throw failure('The printer is not paused.', 409);
    if (action === 'cancel' && !state.busy) throw failure('There is no active print to cancel.', 409);
    return state;
  }
  async upload(bytes, name, start = false) {
    filename(name);
    if (name.includes('/')) throw failure('Upload requires a G-code filename without folders.');
    if (typeof start !== 'boolean') throw failure('Print must be a boolean.');
    if (start) await this.readyFor('print');
    const form = new FormData(); form.set('file', bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'text/plain' }), name);
    if (this.device.type === 'moonraker') { form.set('root', 'gcodes'); form.set('print', String(start)); return this.request('/server/files/upload', { method: 'POST', form }); }
    form.set('select', String(start)); form.set('print', String(start)); return this.request('/api/files/local', { method: 'POST', form });
  }
  async command(input) {
    const { action } = input || {};
    if (!['pause', 'resume', 'cancel', 'print', 'home', 'jog', 'temperature', 'fan'].includes(action)) throw failure('Unsupported printer command.');
    if (input.confirmed !== true) throw failure('Confirm the printer action before sending it.');
    const state = await this.readyFor(action);
    let axes, axis, distance, speed, target;
    if (action === 'home') { axes = input.axes ?? ['x', 'y', 'z']; if (!Array.isArray(axes) || !axes.length || axes.length > 3 || axes.some(axis => !['x', 'y', 'z'].includes(axis)) || new Set(axes).size !== axes.length) throw failure('Home axes must be X, Y, or Z.'); }
    if (action === 'jog') { axis = typeof input.axis === 'string' ? input.axis.toLowerCase() : ''; if (!['x', 'y', 'z'].includes(axis)) throw failure('Choose a valid motion axis.'); distance = number(input.distance, 'Jog distance', -100, 100); speed = Math.round(number(input.speed ?? 10, 'Jog speed', .1, 100) * 60); }
    if (action === 'temperature') { if (!['hotend', 'bed'].includes(input.heater) || !state.capabilities.includes(input.heater)) throw failure('This heater is unavailable.'); target = number(input.target, 'Temperature', 0, input.heater === 'bed' ? 150 : 350); }
    if (this.device.type === 'moonraker') {
      if (['pause', 'resume', 'cancel'].includes(action)) return this.request(`/printer/print/${action}`, { method: 'POST' });
      if (action === 'print') return this.request('/printer/print/start', { method: 'POST', json: { filename: filename(input.filename) } });
      let script;
      if (action === 'home') script = `G28 ${axes.join(' ').toUpperCase()}`;
      if (action === 'jog') { if (!state.homedAxes.includes(axis)) throw failure('Home this axis before moving it.', 409); script = `SAVE_GCODE_STATE NAME=ORCA_WEB_JOG\nG91\nG1 ${axis.toUpperCase()}${distance} F${speed}\nRESTORE_GCODE_STATE NAME=ORCA_WEB_JOG`; }
      if (action === 'temperature') script = `SET_HEATER_TEMPERATURE HEATER=${input.heater === 'bed' ? 'heater_bed' : 'extruder'} TARGET=${target}`;
      if (action === 'fan') script = `M106 S${Math.round(number(input.speed, 'Fan percentage', 0, 100) * 2.55)}`;
      return this.request('/printer/gcode/script', { method: 'POST', json: { script } });
    }
    if (['pause', 'resume', 'cancel'].includes(action)) return this.request('/api/job', { method: 'POST', json: action === 'cancel' ? { command: 'cancel' } : { command: 'pause', action } });
    if (action === 'print') return this.request(`/api/files/local/${filename(input.filename).split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', json: { command: 'select', print: true } });
    if (action === 'home') return this.request('/api/printer/printhead', { method: 'POST', json: { command: 'home', axes } });
    if (action === 'jog') return this.request('/api/printer/printhead', { method: 'POST', json: { command: 'jog', [axis]: distance, absolute: false, speed } });
    if (action === 'temperature') return this.request(input.heater === 'bed' ? '/api/printer/bed' : '/api/printer/tool', { method: 'POST', json: input.heater === 'bed' ? { command: 'target', target } : { command: 'target', targets: { tool0: target } } });
    throw failure('Fan control is not advertised by this connector.');
  }
}

export async function createDeviceRouter({ dataDir, jobStore, fetchImpl, timeoutMs }) {
  const store = new DeviceStore(path.join(dataDir, 'devices')); await store.init();
  const router = express.Router(), inFlight = new Set();
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      let sameOrigin = false;
      try { sameOrigin = new URL(req.get('origin')).origin === new URL(`${req.protocol}://${req.get('host')}`).origin; } catch { /* Invalid origins cannot authorize a printer action. */ }
      if (!sameOrigin) return res.status(403).json({ error: 'Cross-origin printer actions are not allowed.' });
    }
    next();
  });
  const route = handler => async (req, res) => { try { await handler(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not complete the printer request.' }); } };
  function client(id) { const device = store.get(id); if (!device) throw failure('Printer connection not found.', 404); return new PrinterClient(device, { fetchImpl, timeoutMs }); }
  async function serial(id, action) { if (inFlight.has(id)) throw failure('Another printer action is still in progress.', 409); inFlight.add(id); try { return await action(); } finally { inFlight.delete(id); } }
  router.get('/', (_req, res) => res.json(store.list()));
  router.post('/', route(async (req, res) => res.status(201).json(await store.save(req.body))));
  router.put('/:id', route(async (req, res) => res.json(await serial(req.params.id, () => store.save(req.body, req.params.id)))));
  router.delete('/:id', route(async (req, res) => { await serial(req.params.id, () => store.delete(req.params.id)); res.status(204).end(); }));
  router.get('/:id/status', route(async (req, res) => res.json(await client(req.params.id).status())));
  router.post('/:id/command', route(async (req, res) => res.json(await serial(req.params.id, () => client(req.params.id).command(req.body)))));
  router.post('/:id/upload', route(async (req, res) => {
    if (req.body?.print !== undefined && typeof req.body.print !== 'boolean') throw failure('Print must be a boolean.');
    if (req.body?.print && req.body?.confirmed !== true) throw failure('Confirm starting this print before sending it.');
    const output = await serial(req.params.id, async () => {
      const printer = client(req.params.id);
      const job = jobStore.get(req.body?.jobId);
      if (!job || job.status !== 'ready') throw failure('Select a completed slicing job.');
      const name = `${path.parse(job.filename).name}.gcode`.replace(/[^a-zA-Z0-9._-]/g, '_');
      let blob;
      try { blob = await openAsBlob(path.join(dataDir, 'jobs', `${job.id}.gcode`), { type: 'text/plain' }); }
      catch (error) { if (error.code === 'ENOENT' || error.code === 'ERR_INVALID_ARG_VALUE') throw failure('The sliced G-code is no longer available. Slice the model again.', 409); throw error; }
      return { filename: name, printRequested: req.body.print === true, result: await printer.upload(blob, name, req.body.print === true) };
    });
    res.json(output);
  }));
  return router;
}
