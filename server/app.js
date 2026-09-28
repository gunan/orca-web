import{captureNativePreviewProject}from'./native-preview-project.js';
import{createNativeAllPlatePreview}from'./native-all-plate-preview.js';
import{captureNativePreviewContext}from'./native-preview-context.js';
import {pasteNativeProcessSettings} from './native-settings-clipboard.js';
import {createNativeConfigurationService,nativeConfigurationScope,inspectNativeConfig} from './native-config.js';
import {normalizeProjectSettings} from './native-projects.js';
import {createNativeArrangementService} from './native-arrangement.js';
import {prepareShrinkageWarmup} from './shrinkage-warmup.js';
import express from 'express';
import {createNativePreviewService} from './native-preview.js';
import {createNativeHotendService} from './hotend-assets.js';
import {createNativeImageService} from './native-images.js';
import {createFontService} from './fonts.js';
import {createNativeTextService} from './native-text.js';
import multer from 'multer';
import { mkdir, unlink, writeFile, rename, rm, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JobStore } from './store.js';
import { createDeviceRouter } from './devices.js';
import { createCustomPresetCatalog, createCustomPresetRouter } from './custom-presets.js';
import { displayedProfileSettings, normalizeProfileOverrides } from '../shared/profile-settings.js';
import { createCalibrationSessions } from './calibration-sessions.js';
import { applyCalibrationOverrides, applyCalibrationGcode } from '../shared/calibration.js';
import { sliceModel, inspectSlicer } from './slicer.js';
import { createPresetCatalog } from './presets.js';
import { createNativeProjectService } from './native-projects.js';
import { validateNativeArchiveSafety } from '../shared/native-project.js';
import { normalizeOverrides, displayedSettings } from '../shared/settings.js';
import { assertNativeConfiguration, assertNativeProjectConfiguration } from './native-preflight.js';
import { applyNativeCorrectionDecisions } from '../shared/native-setting-corrections.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const allowedExtensions = new Set(['.stl', '.obj', '.3mf']);
export const defaultBinary = process.platform === 'darwin' ? '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer' : 'orca-slicer';

function printerDescription(printer) {
  const points = (printer.printable_area || []).map(point => String(point).split('x').map(Number));
  const valid = points.length > 2 && points.every(point => point.length === 2 && point.every(Number.isFinite));
  const bedSize = valid ? `${Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))} × ${Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]))} mm` : 'Native preset';
  const height = Number(Array.isArray(printer.printable_height) ? printer.printable_height[0] : printer.printable_height);
  return { name: printer.name, bedSize, bedPolygon: valid ? points : null, bedHeight: Number.isFinite(height) && height > 0 ? height : null, nozzle: (Array.isArray(printer.nozzle_diameter) ? printer.nozzle_diameter[0] : printer.nozzle_diameter) || null };
}

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const ownedUpload = new RegExp(`^(?:${uuid}\\.(?:stl|obj|3mf)|[a-f0-9]{32})$`, 'i');
const ownedWork = new RegExp(`^${uuid}$`, 'i');
const ownedIndexTemp = new RegExp(`^\\.jobs-${uuid}\\.tmp$`, 'i');

async function removeIfPresent(filename) {
  try { await unlink(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// These private data directories contain only generated upload/work names. Match
// those names explicitly so startup never removes unrelated files or ready G-code.
async function cleanupAbandoned(dataDir, store) {
  for (const directory of ['uploads', 'work', 'jobs']) {
    const root = path.join(dataDir, directory);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const generated = directory === 'uploads' ? ownedUpload.test(entry.name)
        : directory === 'work' ? ownedWork.test(entry.name)
          : /^\.slice-[a-zA-Z0-9]{6}$/.test(entry.name) || ownedIndexTemp.test(entry.name);
      const outputId = directory === 'jobs' && entry.name.endsWith('.gcode') ? entry.name.slice(0, -6) : '';
      const job = outputId && ownedWork.test(outputId) ? store.get(outputId) : null;
      if (generated || (job && ['failed', 'cancelled'].includes(job.status))) await rm(path.join(root, entry.name), { recursive: true, force: true });
    }
  }
}

export async function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || 'data');
  const binary = options.binary || process.env.ORCA_SLICER_BIN || defaultBinary;
  const store = new JobStore(path.join(dataDir, 'jobs'));
  await store.init();
  await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  await mkdir(path.join(dataDir, 'work'), { recursive: true });
  await cleanupAbandoned(dataDir, store);
  let catalog, catalogError;
  const nativeConfig = createNativeConfigurationService(options.nativeConfiguration);
  try { const baseCatalog = options.catalog || await createPresetCatalog({ binary, profilesDir: options.profilesDir, resourcesDir: options.resourcesDir }); catalog = await createCustomPresetCatalog({ baseCatalog, dataDir, nativeConfig }); }
  catch (error) { catalogError = error.message; }
  const engine = await inspectSlicer(binary);
  const nativeConfiguration = await inspectNativeConfig(options.nativeConfiguration);
  const {resolveCatalogNativeSettings,resolveEmbeddedNativeSettings} = nativeConfig;
  const calibrations = catalog ? createCalibrationSessions({ binary, nativeConfig, resourcesDir: options.resourcesDir || process.env.ORCA_RESOURCES_DIR || path.dirname(catalog.directory || path.resolve('resources/profiles')), catalog }) : null;
  const controls = new Map();
  const tasks = new Set();
  let shuttingDown = false;
  let queue = Promise.resolve();
  const app = express();
  app.disable('x-powered-by');
  const nativePreview=createNativePreviewService({...options.nativePreview,dataDir,jobStore:store,resourcesDir:options.resourcesDir||process.env.ORCA_RESOURCES_DIR||path.dirname(catalog?.directory||path.resolve('resources/profiles'))});
  app.use('/api/jobs',nativePreview.router);
  const nativeAllPlatePreview=createNativeAllPlatePreview({...options.nativeAllPlatePreview,jobStore:store,preview:nativePreview});
  app.use('/api/jobs',nativeAllPlatePreview.router);
  const nativeHotends=createNativeHotendService({catalog,jobStore:store,profilesDir:catalog?.directory,nativeVendorDir:options.nativeVendorDir});
  app.use('/api/jobs',nativeHotends.router);
  const nativeImages=createNativeImageService(options.nativeImages);
  app.use('/api/project-images',nativeImages.router);
  const fontService=createFontService({binary,resourcesDir:options.resourcesDir});
  app.use('/api/fonts',fontService.router);
  const nativeText=createNativeTextService({fontService,binary:options.embossWorkerBinary,systemDirectories:options.nativeFontDirectories});
  app.use('/api/native-text',nativeText.router);
  const nativeProjects = catalog ? createNativeProjectService({ catalog, nativeConfig }) : null;
  if (nativeProjects) app.use('/api/projects', nativeProjects.router);
  const nativeArrangement=nativeProjects?createNativeArrangementService({projects:nativeProjects,...options.nativeArrangement}):null;
  if(nativeArrangement)app.use('/api/geometry',nativeArrangement.router);
  app.use('/api/jobs/project', express.json({ limit: '150mb' }));
  app.use('/api/jobs/calibration', express.json({ limit: '150mb' }));
  app.use('/api/presets/configuration', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.locals.waitForIdle = () => Promise.allSettled([...tasks]);
  app.locals.shutdown = async () => {
    shuttingDown = true;
    const configurationClosed = nativeConfig.close();
    await nativeArrangement?.close();
    nativeAllPlatePreview.shutdown();
    await nativePreview.shutdown();
    await nativeText.close();
    await nativeImages.close();
    await calibrations?.shutdown();
    await Promise.all([...controls.keys()].map(id => cancelJob(id)));
    await app.locals.waitForIdle();
    await configurationClosed;
  };

  async function cleanupCancelled(control) {
    await removeIfPresent(control.output);
    await rm(control.work, { recursive: true, force: true });
  }

  async function cancelJob(id) {
    const cancelledAt = new Date().toISOString();
    const job = await store.transition(id, ['queued', 'slicing'], { status: 'cancelled', cancelledAt, completedAt: cancelledAt });
    if (!job || job.status !== 'cancelled') return job;
    const control = controls.get(id);
    if (control) {
      control.controller.abort();
      if (control.running) await control.finished;
      else await cleanupCancelled(control);
    } else await removeIfPresent(path.join(dataDir, 'jobs', `${id}.gcode`));
    return store.get(id) || job;
  }

  async function enqueueJob({ job, work, input, profilePath, printerPath, filamentPath, preservePosition, calibrationPlan, shrinkageWarmup, legacySelection }) {
    const id = job.id;
    await store.set(job);
    const jobWork = work;
    let finish;
    const control = { controller: new AbortController(), work: jobWork, output: path.join(dataDir, 'jobs', `${id}.gcode`), running: false, finished: new Promise(resolve => { finish = resolve; }) };
    controls.set(id, control);
    const task = queue.then(async () => {
      try {
        control.running = true;
        if (shuttingDown) {
          const stoppedAt = new Date().toISOString();
          await store.transition(id, ['queued', 'slicing'], { status: 'cancelled', cancelledAt: stoppedAt, completedAt: stoppedAt });
          control.controller.abort();
        }
        const started = await store.transition(id, ['queued'], { status: 'slicing' });
        if (!started || started.status !== 'slicing' || control.controller.signal.aborted) return;
        const sliced = await sliceModel({ binary, input, output: control.output, profilePath, printerPath, filamentPath, preservePosition, timeoutMs: options.sliceTimeoutMs, signal: control.controller.signal, shrinkageWarmup, legacySelection, engineVersion:engine.version });
        let calibrationSummary;
        if (calibrationPlan) {
          if (control.controller.signal.aborted) return;
          if ((await stat(control.output)).size > 200 * 1024 * 1024) throw new Error('Calibration G-code exceeds the supported size.');
          const result = applyCalibrationGcode(await readFile(control.output, 'utf8'), calibrationPlan);
          if (control.controller.signal.aborted) return;
          await writeFile(control.output, result.gcode); calibrationSummary = result.summary;
        }
        await store.transition(id, ['slicing'], { status: 'ready', completedAt: new Date().toISOString(), ...(sliced.shrinkageInitialization && {shrinkageInitialization:sliced.shrinkageInitialization}), ...(sliced.nativeImport && {nativeImport:sliced.nativeImport}), ...(calibrationSummary && { calibrationSummary }) });
      } catch (error) {
        await store.transition(id, ['queued', 'slicing'], { status: 'failed', error: error.message.slice(-6000), completedAt: new Date().toISOString() });
      } finally {
        try {
          if (store.get(id)?.status !== 'ready') await removeIfPresent(control.output);
          await rm(jobWork, { recursive: true, force: true });
        } finally { controls.delete(id); finish(); }
      }
    });
    tasks.add(task);
    queue = task.catch(error => console.error('Could not persist slicing job:', error.message));
    queue.finally(() => tasks.delete(task));
    return job;
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(dataDir, 'uploads'),
      filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
    }),
    limits: { fileSize: options.uploadLimit || 500 * 1024 * 1024, files: 1, fields: 9, fieldSize: 1024 * 1024 },
    fileFilter: (_req, file, done) => done(null, allowedExtensions.has(path.extname(file.originalname).toLowerCase()))
  });

  app.get('/api/health', (_req, res) => {
    const ready = engine.available && Boolean(catalog) && nativeConfiguration.available;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', slicer: binary, engine, nativeConfiguration, capabilities: {nativePresetResolution:nativeConfiguration.available,nativeShrinkageInitialization: ready && engine.version === 'OrcaSlicer-2.4.2'}, presets: { available: Boolean(catalog), ...(catalogError && { error: catalogError }) } });
  });
  if (catalog) app.use('/api/presets/custom', createCustomPresetRouter({ catalog }));
  async function compatibilityList(req,res,profilesOnly=false) {
    if(!catalog)return res.status(503).json({error:catalogError||'Native presets are unavailable'});
    const controller=new AbortController(),abort=()=>{if(!res.writableFinished)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try { const result=await catalog.listResolved({printerId:req.query.printerId,processId:req.query.processId,signal:controller.signal});if(!res.destroyed)res.json(profilesOnly?result.processes:result); }
    catch(error){if(!res.destroyed)res.status(error.status||400).json({error:error.message});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  }
  app.get('/api/presets',(req,res)=>compatibilityList(req,res));
  app.get('/api/profiles',(req,res)=>compatibilityList(req,res,true));
  function selectionPayload(selected,ids={}) {
    const filament=selected.filaments?.[0]||selected.filament;
    return {context:selected.context,nativeProcessSettings:selected.process,settings:displayedSettings(selected.process,{includeDefaults:true}),printerSettings:displayedProfileSettings('machine',selected.printer),filamentSettings:displayedProfileSettings('filament',filament),printer:printerDescription(selected.printer),process:{id:ids.processId,name:selected.process.name},filament:{id:ids.filamentId||ids.filamentIds?.[0],name:filament.name},nativeReports:selected.reports||[],warnings:selected.warnings||[]};
  }
  app.get('/api/presets/selection', async (req,res) => {
    if(!catalog||!nativeConfiguration.available)return res.status(503).json({error:catalogError||nativeConfiguration.error||'Native presets are unavailable'});
    const controller=new AbortController(),abort=()=>{if(!res.writableFinished)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try {const selected=await resolveCatalogNativeSettings({catalog,selection:req.query,signal:controller.signal});res.json(selectionPayload(selected,req.query));}
    catch(error){if(!res.destroyed)res.status(error.status||400).json({error:error.message});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  });
  app.post('/api/presets/clipboard',express.json({limit:'2mb'}),async(req,res)=>{
    const controller=new AbortController(),abort=()=>{if(!res.writableFinished)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try{res.json(await pasteNativeProcessSettings(req.body,nativeConfig,{signal:controller.signal}));}
    catch(error){if(!res.destroyed)res.status(error.status||400).json({error:error.message});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  });
  app.post('/api/presets/configuration',async(req,res)=>{
    if(!catalog||!nativeConfiguration.available)return res.status(503).json({error:catalogError||nativeConfiguration.error||'Native presets are unavailable'});
    const controller=new AbortController(),abort=()=>{if(!res.writableFinished)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try {
      const body=req.body||{};if(Object.keys(body).some(key=>!['selection','overrides','nativeSettings'].includes(key)))throw new Error('Unsupported native configuration field');
      if(body.nativeSettings){
        if(body.selection||body.overrides)throw new Error('Choose embedded settings or catalog presets');
        const archiveSettings=normalizeProjectSettings(body.nativeSettings).settings,effectiveSettings=normalizeProjectSettings(await resolveEmbeddedNativeSettings(archiveSettings,{signal:controller.signal})).settings;
        const selected={printer:nativeConfigurationScope('machine',effectiveSettings,effectiveSettings.printer_settings_id),process:nativeConfigurationScope('process',effectiveSettings,effectiveSettings.print_settings_id),filaments:[nativeConfigurationScope('filament',effectiveSettings,effectiveSettings.filament_settings_id[0],0)],context:catalog.getSettingsContext?.(effectiveSettings)};
        res.json({...selectionPayload(selected),archiveSettings,effectiveSettings});
      }else{
        const selected=await resolveCatalogNativeSettings({catalog,selection:body.selection,overrides:body.overrides,signal:controller.signal});res.json({...selectionPayload(selected,body.selection),archiveSettings:normalizeProjectSettings(selected.archiveSettings).settings,effectiveSettings:normalizeProjectSettings(selected.effectiveSettings).settings});
      }
    }catch(error){if(!res.destroyed)res.status(error.status||400).json({error:error.message});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  });
  app.get('/api/jobs', (_req, res) => res.json(store.list()));
  app.post('/api/jobs/calibration', async (req, res, next) => {
    let work;
    try {
      if (shuttingDown) return res.status(503).json({ error: 'The slicing server is shutting down' });
      if (!engine.available || !calibrations) return res.status(503).json({ error: engine.error || catalogError || 'Native calibration is unavailable' });
      let prepared, shrinkageWarmup;
      try { prepared = await calibrations.validateProject(req.body || {}); assertNativeProjectConfiguration(prepared); shrinkageWarmup = prepareShrinkageWarmup({...prepared,engineVersion:engine.version}); }
      catch(error) { return res.status(error.status || 400).json({ error:error.message }); }
      const id = crypto.randomUUID(); work = path.join(dataDir, 'work', id); await mkdir(work);
      const input = path.join(work, 'model.3mf'); await writeFile(input, prepared.bytes);
      const { ids, summary, settings, plan:calibrationPlan, calibration } = prepared;
      const job = {
        id, filename: `${calibrationPlan.label}.3mf`, status:'queued', createdAt:new Date().toISOString(),
        ...ids, ...captureNativePreviewContext(prepared.effectiveSettings||settings,{events:prepared.project?.plates?.find(plate=>plate.id===prepared.project.activePlateId)?.layerEvents?.items||[]}), nativeHotend:nativeHotends.snapshot({printerId:ids.printerId,printer:settings}), filamentIds:[ids.filamentId], printer:summary.printer, profile:summary.process, filament:summary.filaments.join(', '),
        settings:displayedSettings(settings,{includeDefaults:true}), overrides:{}, nativeProject:summary,
        warnings:prepared.warnings, engineVersion:engine.version, preservePosition:true, calibration, calibrationPlan
      };
      await enqueueJob({job,work,input,preservePosition:true,calibrationPlan,shrinkageWarmup}); res.status(202).json(job);
    } catch(error) { if(work)await rm(work,{recursive:true,force:true}).catch(()=>{}); next(error); }
  });
  app.post('/api/jobs/project', async (req, res, next) => {
    let work;
    try {
      if (shuttingDown) return res.status(503).json({ error: 'The slicing server is shutting down' });
      if (!engine.available || !nativeProjects) return res.status(503).json({ error: engine.error || catalogError || 'Native slicing is unavailable' });
      let prepared, shrinkageWarmup;
      try {
        if (req.body?.project?.calibration) throw new Error('Calibration models must use their generated calibration session.');
        prepared = await nativeProjects.prepare({ ...req.body, allPlates: false });
        assertNativeProjectConfiguration(prepared);
        shrinkageWarmup = prepareShrinkageWarmup({...prepared,engineVersion:engine.version});
      } catch (error) { return res.status(error.status||400).json({ error: error.message }); }
      const id = crypto.randomUUID(); work = path.join(dataDir, 'work', id); await mkdir(work);
      const input = path.join(work, 'model.3mf'); await writeFile(input, prepared.bytes);
      const { selection, summary, settings } = prepared;
      const job = {
        id, filename: `${prepared.project.name || 'Project'}-${summary.plateName}.3mf`, status: 'queued', createdAt: new Date().toISOString(),
        printerId: selection.printerId || '', processId: selection.processId || '', filamentId: selection.filamentIds?.[0] || '', filamentIds: selection.filamentIds || [],
        printer: summary.printer, profile: summary.process, filament: summary.filaments.join(', '),
        settings: displayedSettings(settings, { includeDefaults: true }), overrides: req.body.overrides?.process || {},
        nativeProject: summary, ...captureNativePreviewProject(req.body,prepared), ...captureNativePreviewContext(prepared.effectiveSettings||settings,{events:prepared.project?.plates?.find(plate=>plate.id===prepared.project.activePlateId)?.layerEvents?.items||[]}), nativeHotend:nativeHotends.snapshot({printerId:selection.printerId,printer:settings,embedded:req.body.useEmbeddedSettings===true}), warnings: prepared.warnings, engineVersion: engine.version, preservePosition: true
      };
      await enqueueJob({ job, work, input, preservePosition: true, shrinkageWarmup });
      res.status(202).json(job);
    } catch (error) { if (work) await rm(work, { recursive: true, force: true }).catch(() => {}); next(error); }
  });
  app.post('/api/jobs', upload.single('model'), async (req, res, next) => {
    let work;
    try {
      if (!req.file) return res.status(400).json({ error: 'A valid STL, OBJ, or 3MF model is required' });
      async function reject(status, message) {
        await unlink(req.file.path).catch(() => {});
        return res.status(status).json({ error: message });
      }
      if (!req.file.size) return reject(400, 'Model file is empty');
      if (shuttingDown) return reject(503, 'The slicing server is shutting down');
      if (!engine.available || !catalog) return reject(503, engine.error || catalogError || 'Native slicing is unavailable');
      if (!req.body.printerId || !req.body.processId || !req.body.filamentId) return reject(400, 'Select native printer, process, and filament presets');
      if (req.body.preservePosition !== undefined && !['true', 'false'].includes(req.body.preservePosition)) return reject(400, 'preservePosition must be true or false');
      const preservePosition = req.body.preservePosition === 'true';
      if (preservePosition && path.extname(req.file.originalname).toLowerCase() === '.3mf') return reject(400, 'Position preservation requires a baked STL or OBJ model');
      let overrides, printerOverrides, filamentOverrides, selected, previewSettings, processCorrectionDecisions = [], calibrationPlan = null, calibration = null;
      try {
        if (path.extname(req.file.originalname).toLowerCase() === '.3mf') {
          if (req.file.size > 128 * 1024 * 1024) return reject(400, '3MF exceeds the 128 MB archive limit.');
          validateNativeArchiveSafety(await readFile(req.file.path));
        }
        const parsed = req.body.settings ? JSON.parse(req.body.settings) : {};
        overrides = normalizeOverrides(parsed);
        printerOverrides = normalizeProfileOverrides('machine', req.body.printerSettings ? JSON.parse(req.body.printerSettings) : {});
        filamentOverrides = normalizeProfileOverrides('filament', req.body.filamentSettings ? JSON.parse(req.body.filamentSettings) : {});
        const ids = { printerId: req.body.printerId, processId: req.body.processId, filamentId: req.body.filamentId };
        const native = await resolveCatalogNativeSettings({catalog,selection:ids,overrides:{process:overrides,machine:printerOverrides,filaments:[filamentOverrides]}});
        previewSettings=native.effectiveSettings;
        selected = {printer:native.printer,process:native.process,filament:native.filaments[0],context:native.context};
        processCorrectionDecisions = req.body.processCorrectionDecisions === undefined ? [] : JSON.parse(req.body.processCorrectionDecisions);
        if(req.body.calibration && (!Array.isArray(processCorrectionDecisions) || processCorrectionDecisions.length)) return reject(400,'Calibration does not accept process correction decisions. Regenerate its native settings.');
        selected = applyNativeCorrectionDecisions({...selected,context:{...selected.context,isGlobal:true,isPlate:false,filamentCount:1}},{scope:'process',decisions:processCorrectionDecisions}).selection;
        if (req.body.calibration) {
          if (Object.keys(printerOverrides).length || Object.keys(filamentOverrides).length) return reject(400, 'Calibration does not accept printer or filament overrides. Regenerate from saved presets.');
          if (!calibrations || !preservePosition) return reject(400, 'Calibration requires its generated model with position preservation.');
          const validated = await calibrations.validateUpload({ calibration: JSON.parse(req.body.calibration), ids, inputPath: req.file.path, overrides });
          calibrationPlan = validated.plan; calibration = validated.calibration;
          selected = applyCalibrationOverrides(validated.selection, calibrationPlan);
        }
        assertNativeConfiguration(selected);
      } catch (error) { return reject(400, error instanceof SyntaxError ? 'Settings must be valid JSON' : error.message); }
      const id = crypto.randomUUID();
      work = path.join(dataDir, 'work', id);
      await mkdir(work);
      const input = path.join(work, `model${path.extname(req.file.originalname).toLowerCase()}`);
      await rename(req.file.path, input);
      const printerPath = path.join(work, 'printer.json'), profilePath = path.join(work, 'process.json'), filamentPath = path.join(work, 'filament.json');
      await Promise.all([
        writeFile(printerPath, JSON.stringify(selected.printer)),
        writeFile(profilePath, JSON.stringify(selected.process)),
        writeFile(filamentPath, JSON.stringify(selected.filament))
      ]);
      const job = {
        id, filename: req.file.originalname, status: 'queued', createdAt: new Date().toISOString(),
        printerId: req.body.printerId, processId: req.body.processId, filamentId: req.body.filamentId,
        printer: selected.printer.name, profile: selected.process.name, filament: selected.filament.name, ...(path.extname(req.file.originalname).toLowerCase()!=='.3mf'&&captureNativePreviewContext(previewSettings)), nativeHotend:nativeHotends.snapshot({printerId:req.body.printerId,printer:selected.printer}),
        settings: displayedSettings(selected.process, { includeDefaults: true }), overrides, printerOverrides, filamentOverrides, processCorrectionDecisions, engineVersion: engine.version, preservePosition, ...(calibration && { calibration, calibrationPlan })
      };
      await enqueueJob({ job, work, input, profilePath, printerPath, filamentPath, preservePosition, calibrationPlan, legacySelection:selected });
      res.status(202).json(job);
    } catch (error) {
      if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
      if (req.file) await unlink(req.file.path).catch(() => {});
      next(error);
    }
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = store.get(req.params.id);
    return job ? res.json(job) : res.status(404).json({ error: 'Job not found' });
  });
  app.post('/api/jobs/:id/cancel', async (req, res) => {
    const job = await cancelJob(req.params.id);
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
    nativePreview.invalidate(job.id);
    await unlink(path.join(dataDir, 'jobs', `${job.id}.gcode`)).catch(() => {});
    await store.delete(job.id);
    return res.status(204).end();
  });
  if (calibrations) app.use('/api/calibrations', calibrations.router);
  app.use('/api/devices', await createDeviceRouter({ dataDir, jobStore: store }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));
  app.use(express.static(path.resolve(here, '../dist')));
  app.get('*splat', (_req, res) => res.sendFile(path.resolve(here, '../dist/index.html')));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Model exceeds the upload size limit' : error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request must be valid JSON' });
    if (error.status && ((error.status >= 400 && error.status < 500) || [503,504].includes(error.status))) return res.status(error.status).json({ error: String(error.message).slice(0, 6000) });
    console.error(error);
    res.status(500).json({ error: 'Unexpected server error' });
  });
  return app;
}
