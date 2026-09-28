import {prepareNativeImportInspection,validateNativeImportInspection} from '../shared/native-import-inspection.js';
import {prepareNativePrimeTower,validateNativePrimeTowerResult} from '../shared/native-prime-tower.js';
import {prepareNativeFillBed,validateNativeFillBedResult} from '../shared/native-fill-bed.js';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {createNativeArrangeWorker} from './native-arrange-worker.js';
import {ARRANGE_LIMITS,prepareNativeArrangement,validateArrangementResult} from '../shared/native-arrangement.js';
const defaultBinary=fileURLToPath(new URL('../native/build/arrange/orca-arrange-worker',import.meta.url));
export function createNativeArrangementService({projects,binary=process.env.ORCA_ARRANGE_WORKER_BIN||defaultBinary,worker:injectedWorker}={}){
 const worker=injectedWorker||createNativeArrangeWorker({binary}),router=express.Router();let preparing=0,closed=false;const controllers=new Set();
 router.get('/capabilities',async(_req,res)=>{try{const engine=await worker.identity();res.json({available:!closed,engine:engine.metadata,limits:ARRANGE_LIMITS});}catch(error){res.json({available:false,error:error.message,limits:ARRANGE_LIMITS});}});
 router.post('/inspect-import',express.json({limit:'100mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  if(preparing>=5)return res.status(429).json({error:'Native import inspection preparation queue is full'});
  preparing++;const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);req.once('aborted',abort);res.once('close',abort);
  try{const prepared=prepareNativeImportInspection(req.body?.project),bytes=Buffer.from(JSON.stringify(prepared.request));controller.signal.throwIfAborted();const value=validateNativeImportInspection(await worker.process(bytes,{signal:controller.signal}),prepared.request);if(!res.destroyed)res.json(value);}
  catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{preparing--;controllers.delete(controller);req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/clipboard',express.json({limit:'64mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);req.once('aborted',abort);res.once('close',abort);
  try{if(req.body?.operation!=='nearest-empty-cell'||!Array.isArray(req.body.clipboardObjects))throw new Error('Expected a native clipboard request');const bytes=Buffer.from(JSON.stringify(req.body));if(bytes.length>ARRANGE_LIMITS.inputBytes)throw Object.assign(new Error('Native clipboard input exceeds 64 MiB'),{status:413});const result=await worker.process(bytes,{signal:controller.signal});if(!res.destroyed)res.json(result);}
  catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{controllers.delete(controller);req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/instance-cut',express.json({limit:'64mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);req.once('aborted',abort);res.once('close',abort);
  try{if(req.body?.operation!=='instance-cut-frames'||!Array.isArray(req.body.instances)||!Array.isArray(req.body.results))throw new Error('Expected a native linked-instance Cut request');const bytes=Buffer.from(JSON.stringify(req.body));if(bytes.length>ARRANGE_LIMITS.inputBytes)throw Object.assign(new Error('Native Cut input exceeds 64 MiB'),{status:413});const result=await worker.process(bytes,{signal:controller.signal});if(!res.destroyed)res.json(result);}
  catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{controllers.delete(controller);req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/cut-to-parts',express.json({limit:'64mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);req.once('aborted',abort);res.once('close',abort);
  try{if(req.body?.operation!=='cut-to-parts'||!Array.isArray(req.body.instances)||!Array.isArray(req.body.sourceParts))throw new Error('Expected a native Cut to parts request');const bytes=Buffer.from(JSON.stringify(req.body));if(bytes.length>ARRANGE_LIMITS.inputBytes)throw Object.assign(new Error('Native Cut input exceeds 64 MiB'),{status:413});const result=await worker.process(bytes,{signal:controller.signal});if(!res.destroyed)res.json(result);}
  catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{controllers.delete(controller);req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/prime-tower',express.json({limit:'100mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  if(preparing>=5)return res.status(429).json({error:'Native prime tower preparation queue is full'});
  preparing++;const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);const deadline=setTimeout(()=>controller.abort(),60000);deadline.unref();req.once('aborted',abort);res.once('close',abort);
  try{
   const {projectRequest}=req.body||{};
   const prepared=await projects.prepareGeometry({...projectRequest,allPlates:true},{signal:controller.signal,allowEmptyGeometry:true});controller.signal.throwIfAborted();
   const request=prepareNativePrimeTower(prepared.project,prepared.effectiveSettings||prepared.settings,{includeDragContext:true}),bytes=Buffer.from(JSON.stringify(request));
   const result=validateNativePrimeTowerResult(await worker.process(bytes,{signal:controller.signal}),request);
   if(!res.destroyed)res.json({result,warnings:prepared.warnings});
  }catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{clearTimeout(deadline);controllers.delete(controller);preparing--;req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/fill-bed',express.json({limit:'100mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native geometry is shutting down'});
  if(preparing>=5)return res.status(429).json({error:'Native Fill preparation queue is full'});
  preparing++;const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);const deadline=setTimeout(()=>controller.abort(),60000);deadline.unref();req.once('aborted',abort);res.once('close',abort);
  try{const {projectRequest,options}=req.body||{};const prepared=await projects.prepareGeometry({...projectRequest,allPlates:true},{signal:controller.signal});controller.signal.throwIfAborted();const request=prepareNativeFillBed(prepared.project,prepared.effectiveSettings||prepared.settings,options,prepared.context),bytes=Buffer.from(JSON.stringify(request));if(bytes.length>ARRANGE_LIMITS.inputBytes)throw Object.assign(new Error('Native Fill input exceeds 64 MiB'),{status:413});const result=validateNativeFillBedResult(await worker.process(bytes,{signal:controller.signal}),request);if(!res.destroyed)res.json({request:{...request,towerPreview:undefined,objects:request.objects.map(object=>({...object,...(object.id!==request.selectedObjectId&&{parts:undefined})}))},result,warnings:prepared.warnings});}
  catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{clearTimeout(deadline);controllers.delete(controller);preparing--;req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 router.post('/arrange',express.json({limit:'100mb'}),async(req,res)=>{
  if(closed)return res.status(503).json({error:'Native arrangement is shutting down'});
  if(preparing>=5)return res.status(429).json({error:'Native arrangement preparation queue is full'});
  preparing++;const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};controllers.add(controller);const deadline=setTimeout(()=>controller.abort(),60000);deadline.unref();req.once('aborted',abort);res.once('close',abort);
  try{
   const {projectRequest,options}=req.body||{};const prepared=await projects.prepareGeometry({...projectRequest,allPlates:true},{signal:controller.signal});controller.signal.throwIfAborted();
   const effective=prepared.effectiveSettings??prepared.settings,request=prepareNativeArrangement(prepared.project,effective,options);
   if([true,1,'1'].includes(effective.enable_prime_tower)){request.towerPreview=prepareNativePrimeTower(prepared.project,effective);request.towerPlateIndex=prepared.project.plates.findIndex(p=>p.id===prepared.project.activePlateId);}
   const bytes=Buffer.from(JSON.stringify(request));if(bytes.length>ARRANGE_LIMITS.inputBytes)throw Object.assign(new Error('Native arrangement input exceeds64MiB'),{status:413});
   const result=validateArrangementResult(await worker.process(bytes,{signal:controller.signal}),request);if(!res.destroyed)res.json({request:{objects:request.objects.map(({id,matrix,selected})=>({id,matrix,selected}))},result,warnings:prepared.warnings});
  }catch(error){if(!res.destroyed)res.status(error.status||(error.name==='AbortError'?499:400)).json({error:error.message});}
  finally{clearTimeout(deadline);controllers.delete(controller);preparing--;req.removeListener('aborted',abort);res.removeListener('close',abort);}
 });
 return{router,worker,async close(){closed=true;for(const controller of controllers)controller.abort();await worker.shutdown();}};
}
