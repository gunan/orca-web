import express from 'express';
import multer from 'multer';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JobStore } from './store.js';
import { sliceModel } from './slicer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const allowedExtensions = new Set(['.stl', '.obj', '.3mf']);
export const profiles = [
  { id: 'balanced', name: 'Balanced', layerHeight: '0.20 mm', description: 'Reliable quality for everyday parts' },
  { id: 'detail', name: 'Fine detail', layerHeight: '0.12 mm', description: 'Sharper surfaces and small features' },
  { id: 'draft', name: 'Fast draft', layerHeight: '0.28 mm', description: 'Quick prototypes with fewer layers' }
];
export const presets = {
  printers: ['Bambu Lab X1 Carbon 0.4 nozzle', 'Generic Klipper 0.4 nozzle', 'Prusa MK4 0.4 nozzle'],
  filaments: ['Generic PLA', 'Generic PETG', 'Generic ABS']
};

export async function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.resolve('data');
  const binary = options.binary || process.env.ORCA_SLICER_BIN || 'orca-slicer';
  const store = new JobStore(path.join(dataDir, 'jobs'));
  await store.init();
  const upload = multer({
    dest: path.join(dataDir, 'uploads'),
    limits: { fileSize: 500 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(null, allowedExtensions.has(path.extname(file.originalname).toLowerCase()))
  });
  await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', slicer: binary }));
  app.get('/api/profiles', (_req, res) => res.json(profiles));
  app.get('/api/presets', (_req, res) => res.json(presets));
  app.get('/api/jobs', (_req, res) => res.json(store.list()));
  app.post('/api/jobs', upload.single('model'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A valid STL, OBJ, or 3MF model is required' });
    const profile = profiles.find(item => item.id === req.body.profile);
    if (!profile) {
      await unlink(req.file.path);
      return res.status(400).json({ error: 'Select a valid slicing profile' });
    }
    const id = crypto.randomUUID();
    let settings = {};
    try { settings = req.body.settings ? JSON.parse(req.body.settings) : {}; }
    catch { await unlink(req.file.path); return res.status(400).json({ error: 'Settings must be valid JSON' }); }
    if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
      await unlink(req.file.path); return res.status(400).json({ error: 'Settings must be an object' });
    }
    const safeSettings = Object.fromEntries(Object.entries(settings).filter(([key, value]) => /^[a-z][a-z0-9_]*$/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value)));
    const job = { id, filename: req.file.originalname, profile: profile.id, printer: req.body.printer || null, filament: req.body.filament || null, settings: safeSettings, status: 'queued', createdAt: new Date().toISOString() };
    await store.set(job);
    res.status(202).json(job);
    const output = path.join(dataDir, 'jobs', `${id}.gcode`);
    queueMicrotask(async () => {
      await store.set({ ...job, status: 'slicing' });
      let profilePath = path.join(here, 'profiles', `${profile.id}.json`);
      try {
        if (Object.keys(safeSettings).length) {
          profilePath = path.join(dataDir, 'uploads', `${id}.json`);
          const base = { layer_height: profile.layerHeight.replace(' mm', ''), initial_layer_print_height: '0.20' };
          await writeFile(profilePath, JSON.stringify({ ...base, ...safeSettings }));
        }
        await sliceModel({ binary, input: req.file.path, output, profilePath });
        await store.set({ ...job, status: 'ready', completedAt: new Date().toISOString() });
      } catch (error) {
        await store.set({ ...job, status: 'failed', error: error.message });
      } finally {
        await unlink(req.file.path).catch(() => {});
        if (profilePath?.startsWith(path.join(dataDir, 'uploads'))) await unlink(profilePath).catch(() => {});
      }
    });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = store.get(req.params.id);
    return job ? res.json(job) : res.status(404).json({ error: 'Job not found' });
  });
  app.get('/api/jobs/:id/download', (req, res) => {
    const job = store.get(req.params.id);
    if (!job || job.status !== 'ready') return res.status(404).json({ error: 'G-code is not available' });
    const name = `${path.parse(job.filename).name}.gcode`.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.download(path.join(dataDir, 'jobs', `${job.id}.gcode`), name);
  });
  app.delete('/api/jobs/:id', async (req, res) => {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (['queued', 'slicing'].includes(job.status)) return res.status(409).json({ error: 'An active job cannot be deleted' });
    await unlink(path.join(dataDir, 'jobs', `${job.id}.gcode`)).catch(() => {});
    await store.delete(job.id);
    return res.status(204).end();
  });
  app.use(express.static(path.resolve(here, '../dist')));
  app.get('*splat', (_req, res) => res.sendFile(path.resolve(here, '../dist/index.html')));
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Model exceeds the 500 MB limit' : error.message });
    console.error(error);
    res.status(500).json({ error: 'Unexpected server error' });
  });
  return app;
}
