import express from 'express';
import{normalizeNativePreviewProject,nativePreviewProjectKey}from'./native-preview-project.js';
import{nativeAllPlateStatistics}from'../shared/native-all-plate-statistics.js';
const problem=(message,status)=>Object.assign(new Error(message),{status});
/** Requests can only aggregate an immutable project cohort owned by JobStore;
 * the caller cannot supply job IDs, weights, cost or the project hash. */
export function createNativeAllPlatePreview({jobStore,preview,timeoutMs=120000}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new Error('Invalid all-plate statistics timeout');
 const router=express.Router();let active=null,closed=false;
 async function run(id,{signal,mode='normal',imperial=false}={}){
  if(!['normal','stealth'].includes(mode)||typeof imperial!=='boolean')throw problem('Invalid all-plate native statistics options',400);
  const job=jobStore.get(id);if(!job||job.id!==id)throw problem('Job not found',404);if(job.status!=='ready')throw problem('G-code is not ready for all-plate statistics',409);
  if(!job.nativePreviewProject)return{available:false,reason:job.nativePreviewProjectUnavailable||'This older job has no immutable complete-project association. Slice its project plates again to enable native all-plate statistics.'};
  const relation=normalizeNativePreviewProject(job.nativePreviewProject),key=nativePreviewProjectKey(relation),members=new Map();
  // Latest completed slice for each plate, but the current viewed job always
  // anchors its own plate even when a newer matching slice exists in history.
  const jobs=jobStore.list().filter(candidate=>candidate.status==='ready'&&candidate.engineVersion===job.engineVersion).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||b.id.localeCompare(a.id));
  for(const candidate of jobs){if(!candidate.nativePreviewProject)continue;let candidateRelation;try{candidateRelation=normalizeNativePreviewProject(candidate.nativePreviewProject);if(nativePreviewProjectKey(candidateRelation)!==key)continue;}catch{continue;}if(!members.has(candidateRelation.plateId))members.set(candidateRelation.plateId,candidate);}
  members.set(relation.plateId,job);const missing=relation.plates.filter(plate=>!members.has(plate.id));if(missing.length)return{available:false,reason:'Every nonempty plate in this unchanged project needs a completed slice.',missingPlates:missing,readyPlates:relation.plates.length-missing.length,totalPlates:relation.plates.length};
  const bindings=relation.plates.map(plate=>({plate,job:members.get(plate.id)})),outputs=[];let identity;
  // Serial requests preserve the existing bounded worker queue and cache. No
  // extra whole-project cache retains many large vertex arrays.
  for(const item of bindings){if(signal?.aborted)throw problem('All-plate native preview cancelled',499);const data=await preview.get(item.job.id,{signal});if(!identity)identity=data.workerIdentity;else if(identity!==data.workerIdentity)throw problem('Native helper changed during all-plate processing; reload statistics',503);const compact=Object.fromEntries(['vertexCount','colorPaletteSource','editorStatisticsVersion','editorStatistics','materialStatisticsVersion','materialStatistics','filamentDiameters','filamentDensities','toolsColors','modes','sourceSha256'].map(key=>[key,data[key]]));outputs.push({data:compact,extruders:item.job.nativePreviewProject.extruders});}
  for(const item of bindings){const current=jobStore.get(item.job.id);if(!current||current.status!=='ready'||current.engineVersion!==item.job.engineVersion||JSON.stringify(current.nativePreviewProject)!==JSON.stringify(item.job.nativePreviewProject)||JSON.stringify(current.nativePreviewContext)!==JSON.stringify(item.job.nativePreviewContext))throw problem('A project slice changed or was deleted during statistics processing',409);}
  const statistics=nativeAllPlateStatistics(outputs,{mode,imperial});return{...statistics,projectHash:relation.projectHash,configHash:relation.configHash,workerIdentity:identity,plates:bindings.map((item,index)=>({...item.plate,jobId:item.job.id,sourceSha256:outputs[index].data.sourceSha256}))};
 }
 async function get(id,options={}){if(closed)throw problem('All-plate native preview is shutting down',503);if(active)throw problem('An all-plate statistics request is already running',429);if(options.signal?.aborted)throw problem('All-plate native preview cancelled',499);const controller=new AbortController();active=controller;let expired=false;const abort=()=>controller.abort(),timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);timer.unref?.();options.signal?.addEventListener('abort',abort,{once:true});try{return await run(id,{...options,signal:controller.signal});}catch(error){if(expired)throw problem('All-plate native statistics timed out',503);throw error;}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(active===controller)active=null;}}
 router.get('/:id/native-preview/all-plates',async(req,res)=>{const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);try{if(Object.keys(req.query).some(key=>!['mode','units'].includes(key))||!['metric','imperial'].includes(req.query.units||'metric'))throw problem('Invalid all-plate statistics options',400);const result=await get(req.params.id,{signal:controller.signal,mode:req.query.mode||'normal',imperial:req.query.units==='imperial'});if(!controller.signal.aborted)res.json(result);}catch(error){if(!controller.signal.aborted)res.status(error.status||503).json({error:error.message});}finally{res.removeListener('close',close);}});
 return{router,get,shutdown(){closed=true;active?.abort();}};
}
