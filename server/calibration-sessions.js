import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createCalibrationPlan, CALIBRATION_REQUEST_KEYS } from '../shared/calibration.js';
import { measuredCalibrationResult } from '../shared/calibration-results.js';
import { flowRatioForModifier } from '../shared/flow-ratio-calibration.js';
import { exportSTL } from '../shared/geometry.js';
import { prepareCalibrationModel } from './calibration.js';
import { createNativeConfigurationService } from './native-config.js';

class CalibrationSessionError extends Error {
  constructor(message, status = 409) { super(message); this.name = 'CalibrationSessionError'; this.status = status; }
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => createHash('sha256').update(value).digest('hex');
const presetHash = selection => digest(JSON.stringify(stable(selection)));
function objectsHash(objects, expected) {
  if (!Array.isArray(objects) || !objects.length || objects.length > 32 || (expected && objects.length !== expected.length)) throw new CalibrationSessionError('Calibration object list changed. Regenerate the calibration project.');
  return digest(JSON.stringify(objects.map((object,index) => {
    if (!object || !Array.isArray(object.positions) || object.positions.length > 900000 || (expected && object.positions.length !== expected[index].positions.length)) throw new CalibrationSessionError('Calibration geometry changed. Regenerate the calibration project.');
    let geometryHash;
    try { geometryHash=digest(Buffer.from(exportSTL([object]))); } catch { throw new CalibrationSessionError('Calibration geometry changed. Regenerate the calibration project.'); }
    return [object.id,object.name,object.plateId,object.visible!==false,object.printable!==false,object.filamentSlot,stable(object.native),geometryHash];
  })));
}
const requestKeys = CALIBRATION_REQUEST_KEYS;
const idKeys = ['printerId', 'processId', 'filamentId'];
function selectionIds(input) {
  if (!input || idKeys.some(key => typeof input[key] !== 'string' || !input[key] || input[key].length > 200)) throw new CalibrationSessionError('Select a printer, process and filament before generating calibration', 400);
  return Object.fromEntries(idKeys.map(key => [key, input[key]]));
}

/** Mount router at /api/calibrations. Tokens are ephemeral and bind a native
 * preset snapshot and exact baked STL bytes; no client-supplied plan is used. */
export function createCalibrationSessions({ binary, resourcesDir, catalog, nativeConfig = createNativeConfigurationService(), ttlMs = 24 * 60 * 60 * 1000, maxSessions = 32, now = Date.now, prepareModel = prepareCalibrationModel } = {}) {
  if (!catalog?.resolveSelection) throw new Error('A native preset catalog is required for calibration sessions');
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 256 || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid calibration cache limits');
  const sessions = new Map(), controllers = new Set(), pending = new Set(), router = express.Router();
  let closed = false;
  async function resolveSelection(ids, signal) {
    const resolved = await nativeConfig.resolveCatalogNativeSettings({ catalog, selection: ids, signal });
    return {
      selected: { ids: { ...ids }, printer: resolved.printer, process: resolved.process, filament: resolved.filaments[0], context: resolved.context },
      // Retain inactive alternatives in the bound snapshot as well as the
      // effective values used for the generated calibration.
      hash: presetHash({ archive: resolved.archiveSettings, effective: resolved.effectiveSettings }),
    };
  }
  const expire = () => { for (const [token, record] of sessions) if (record.expiresAt <= now()) sessions.delete(token); };
  router.post('/prepare', express.json({ limit: '16kb' }), async (req, res, next) => {
    if (closed) return res.status(503).json({ error: 'Calibration preparation is shutting down' });
    if (pending.size) return res.status(429).json({ error: 'Another native calibration model is being prepared. Try again shortly.' });
    const controller = new AbortController(); controllers.add(controller);
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', disconnected);
    const operation = (async () => {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => ![...requestKeys, ...idKeys].includes(key))) throw new CalibrationSessionError('Unknown calibration preparation parameter', 400);
      const ids = selectionIds(body), { selected, hash } = await resolveSelection(ids, controller.signal);
      const plan = createCalibrationPlan(Object.fromEntries(requestKeys.filter(key => body[key] !== undefined).map(key => [key, body[key]])), selected);
      const prepared = await prepareModel({ binary, resourcesDir, plan, selection: selected, signal: controller.signal });
      if (controller.signal.aborted || closed) return;
      const { nativeProject, ...publicPrepared } = prepared;
      const stl = nativeProject ? null : Buffer.from(exportSTL(prepared.objects));
      const token = randomBytes(32).toString('hex'), expiresAt = now() + ttlMs;
      expire();
      while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      sessions.set(token, { ids, request: structuredClone(plan.request), plan: structuredClone(prepared.plan || plan), presetHash: hash, ...(nativeProject ? { nativeProject, objectsHash:objectsHash(prepared.objects) } : { modelHash:digest(stl),modelBytes:stl.length }), results:new Map(), expiresAt });
      res.json({ ...publicPrepared, calibration: { ...plan.request, token }, expiresAt });
    })();
    pending.add(operation);
    try { await operation; }
    catch (error) { if (!controller.signal.aborted && !res.headersSent) { error.status ||= 400; next(error); } }
    finally {
      pending.delete(operation); controllers.delete(controller); res.removeListener('close', disconnected);
      if (controller.signal.aborted && !res.writableEnded && !res.destroyed) res.status(503).json({ error: 'Calibration preparation was cancelled' });
    }
  });

  async function validateSession(calibration, ids) {
    expire();
    if (closed || !calibration || typeof calibration !== 'object' || Array.isArray(calibration) || !/^[a-f0-9]{64}$/.test(calibration.token || '')) throw new CalibrationSessionError('Calibration session is unavailable. Regenerate the calibration model.');
    if (Object.keys(calibration).some(key => ![...requestKeys, 'token'].includes(key))) throw new CalibrationSessionError('Calibration metadata was changed. Regenerate the calibration model.');
    const record = sessions.get(calibration.token);
    if (!record) throw new CalibrationSessionError('Calibration session expired or the server restarted. Regenerate the calibration model.');
    const selectedIds = selectionIds(ids);
    if (idKeys.some(key => selectedIds[key] !== record.ids[key])) throw new CalibrationSessionError('Calibration preset selection changed. Regenerate the calibration model.');
    const { selected: selection, hash } = await resolveSelection(selectedIds);
    if (hash !== record.presetHash) throw new CalibrationSessionError('A native preset changed after calibration preparation. Regenerate the calibration model.');
    const plan = createCalibrationPlan(Object.fromEntries(requestKeys.filter(key => calibration[key] !== undefined).map(key => [key, calibration[key]])), selection);
    if (JSON.stringify(plan.request) !== JSON.stringify(record.request)) throw new CalibrationSessionError('Calibration parameters changed. Regenerate the calibration model.');
    return { record, selection };
  }
  async function validateUpload({ calibration, ids, inputPath, overrides = {} }) {
    const { record, selection } = await validateSession(calibration, ids);
    if (record.nativeProject) throw new CalibrationSessionError('This calibration requires its generated native 3MF project.');
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).length) throw new CalibrationSessionError('Calibration requires its generated settings without process overrides. Regenerate to change settings.');
    if (typeof inputPath !== 'string' || path.extname(inputPath).toLowerCase() !== '.stl') throw new CalibrationSessionError('Calibration requires the generated baked STL model. Regenerate the calibration model.');
    const information = await stat(inputPath);
    if (!information.isFile() || information.size !== record.modelBytes || digest(await readFile(inputPath)) !== record.modelHash) throw new CalibrationSessionError('Calibration geometry changed. Regenerate the calibration model before slicing.');
    return { plan: structuredClone(record.plan), selection, calibration: { ...record.request, token: calibration.token }, expiresAt: record.expiresAt };
  }
  async function validateProject({ calibration, ids, objects, plateId }, {allPlates=false}={}) {
    const { record, selection } = await validateSession(calibration, ids);
    if (!record.nativeProject || record.plan.inputFormat !== '3mf') throw new CalibrationSessionError('This calibration requires its generated STL upload.');
    if (objectsHash(objects, record.nativeProject.project.objects) !== record.objectsHash) throw new CalibrationSessionError('Calibration geometry or object settings changed. Regenerate the calibration project.');
    const plateIds=record.nativeProject.project.plates?.map(plate=>plate.id)||[];
    if(plateId!==undefined&&(typeof plateId!=='string'||!plateIds.includes(plateId)))throw new CalibrationSessionError('Selected generated calibration plate is missing. Regenerate the calibration project.');
    if(!allPlates&&plateIds.length>1&&plateId===undefined)throw new CalibrationSessionError('Select a generated calibration plate before slicing.');
    const selectedId=plateId??plateIds[0],prepared=allPlates?record.nativeProject:record.nativeProject.plateProjects?.[selectedId]||record.nativeProject;
    // Multi-plate jobs must use trusted selected-plate bytes, never the whole
    // archive or a client-submitted subset of its bound object list.
    if(!allPlates&&plateIds.length>1&&!record.nativeProject.plateProjects?.[selectedId])throw new CalibrationSessionError('Generated calibration plate data is unavailable. Regenerate the calibration project.');
    const { project, bytes, settings, summary, warnings } = prepared;
    return { project:structuredClone(project),bytes:new Uint8Array(bytes),settings:structuredClone(settings),summary:structuredClone(summary),warnings:[...warnings],ids:{...record.ids},selection,plan:structuredClone(prepared.plan||record.plan),calibration:{...record.request,token:calibration.token},expiresAt:record.expiresAt };
  }
  router.post('/project', express.json({limit:'150mb'}), async (req,res,next) => {
    try {
      const body=req.body;
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['calibration','ids','objects','plateId','allPlates'].includes(key)))throw new CalibrationSessionError('Export the unchanged generated calibration project; regenerate after edits.',400);
      if(body.allPlates!==undefined&&typeof body.allPlates!=='boolean')throw new CalibrationSessionError('allPlates must be a boolean',400);
      const valid=await validateProject(body,{allPlates:body.allPlates!==false});
      res.set({'Content-Type':'model/3mf','Content-Disposition':`attachment; filename="${valid.plan.request.mode}-calibration.3mf"`,'Cache-Control':'no-store'}).send(Buffer.from(valid.bytes));
    } catch(error){error.status ||= 400;next(error);}
  });
  router.post('/result', express.json({ limit:'16kb' }), async (req,res,next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['token','objectId','value','name'].includes(key))) throw new CalibrationSessionError('Choose or enter a measured result and a new filament preset name.',400);
      const record = sessions.get(body.token);
      if (!record) throw new CalibrationSessionError('Calibration session expired or the server restarted. Regenerate the calibration model.');
      await validateSession({...record.request,token:body.token},record.ids);
      let settings,result,key;
      if(record.plan.request.mode==='flow-ratio'){
        if(!record.nativeProject||body.value!==undefined)throw new CalibrationSessionError('Choose a specimen from this generated flow calibration.',400);
        const specimen=record.plan.specimens.find(item=>item.objectId===body.objectId);
        if(!specimen)throw new CalibrationSessionError('Select a specimen from this generated flow calibration.',400);
        const flowRatio=flowRatioForModifier(record.plan,specimen.modifier);
        settings={filament_flow_ratio:[String(flowRatio)]};result={mode:'flow-ratio',method:record.plan.request.method,pattern:record.plan.request.pattern,objectId:specimen.objectId,specimen:specimen.name,modifier:specimen.modifier,previousFlowRatio:record.plan.flow.baseFlow,flowRatio,source:record.plan.source,measuredBy:'user-selection'};
        key=specimen.objectId;
      }else{
        if(body.objectId!==undefined)throw new CalibrationSessionError('Enter a measured value for this generated calibration.',400);
        ({settings,result}=measuredCalibrationResult(record.plan,body.value));key=JSON.stringify([result.mode,result.value]);
      }
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) throw new CalibrationSessionError('Enter a new filament preset name of at most 100 characters.',400);
      if (typeof catalog.saveCustom !== 'function') throw new CalibrationSessionError('Custom filament preset storage is unavailable.',503);
      key=JSON.stringify([key,body.name.trim()]);
      if (!record.results.has(key)) {
        if (record.results.size >= 64) throw new CalibrationSessionError('This calibration session has reached its saved-result limit. Regenerate the calibration model.');
        const operation = catalog.saveCustom({type:'filament',name:body.name.trim(),baseId:record.ids.filamentId,settings,compatiblePrinterIds:[record.ids.printerId]}).then(preset => ({preset,result}));
        record.results.set(key,operation); operation.catch(() => record.results.delete(key));
      }
      res.status(201).json(await record.results.get(key));
    } catch (error) { error.status ||= 400; next(error); }
  });
  async function shutdown() {
    closed = true; sessions.clear();
    for (const controller of controllers) controller.abort();
    await nativeConfig.close();
    await Promise.allSettled([...pending]);
  }
  return { router, validateUpload, validateProject, shutdown };
}
