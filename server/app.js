import express from 'express';
import multer from 'multer';
import { mkdir, unlink } from 'node:fs/promises';
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
  app.post('/api/jobs', upload.single('model'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A valid STL, OBJ, or 3MF model is required' });
    const profile = profiles.find(item => item.id === req.body.profile);
    if (!profile) {
      await unlink(req.file.path);
      return res.status(400).json({ error: 'Select a valid slicing profile' });
    }
    const id = crypto.randomUUID();
    const job = { id, filename: req.file.originalname, profile: profile.id, status: 'queued', createdAt: new Date().toISOString() };
    await store.set(job);
    res.status(202).json(job);
    const output = path.join(dataDir, 'jobs', `${id}.gcode`);
    queueMicrotask(async () => {
      await store.set({ ...job, status: 'slicing' });
      try {
        const profilePath = path.join(here, 'profiles', `${profile.id}.json`);
        await sliceModel({ binary, input: req.file.path, output, profilePath });
        await store.set({ ...job, status: 'ready', completedAt: new Date().toISOString() });
      } catch (error) {
        await store.set({ ...job, status: 'failed', error: error.message });
      } finally {
        await unlink(req.file.path).catch(() => {});
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
  app.use(express.static(path.resolve(here, '../dist')));
  app.get('*splat', (_req, res) => res.sendFile(path.resolve(here, '../dist/index.html')));
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Model exceeds the 500 MB limit' : error.message });
    console.error(error);
    res.status(500).json({ error: 'Unexpected server error' });
  });
  return app;
}
