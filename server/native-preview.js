import{normalizeNativePreviewContext}from'../shared/native-preview-context.js';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNativeGcodeWorker} from './native-gcode-worker.js';
import {NATIVE_PREVIEW_LIMITS} from '../shared/native-preview-data.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const defaultBinary=path.resolve(process.env.ORCA_NATIVE_CACHE_DIR||path.join(here,'../.native-cache'),'gcode-build',process.platform==='win32'?'orca-gcode-worker.exe':'orca-gcode-worker');
const error=(message,status)=>Object.assign(new Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
/** Owned ready-job preview API. Cache is bounded in memory; source bytes and the
 * actual helper executable identify every entry. No G-code is modified. */
export function createNativePreviewService({dataDir,jobStore,binary=process.env.ORCA_GCODE_WORKER_BIN||defaultBinary,resourcesDir,timeoutMs=60000,maxCacheBytes=64*1024*1024,maxCacheEntries=8,worker:injectedWorker}={}){
 if(!dataDir||!jobStore)throw new TypeError('Native preview requires a data directory and job store');
 if(!Number.isSafeInteger(maxCacheEntries)||maxCacheEntries<1||maxCacheEntries>100||!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<1||maxCacheBytes>512*1024*1024)throw new RangeError('Native preview cache limits are invalid');
 const router=express.Router(),worker=injectedWorker||createNativeGcodeWorker({binary,resourcesDir,timeoutMs});
 const cache=new Map(),pending=new Map();let cacheBytes=0,closed=false,preparing=0;
 function remove(key){const item=cache.get(key);if(item){cacheBytes-=item.bytes;cache.delete(key);}}
 function invalidate(id){for(const[key,item]of cache)if(item.id===id)remove(key);for(const[key,item]of pending)if(item.id===id){item.controller.abort();pending.delete(key);}}
 function ownedReady(id){if(!validId(id))throw error('Job not found',404);const job=jobStore.get(id);if(!job||job.id!==id)throw error('Job not found',404);if(job.status!=='ready')throw error('G-code is not ready for native preview',409);return job;}
 function contextSnapshot(id){const value=ownedReady(id).nativePreviewContext;return value===undefined?null:normalizeNativePreviewContext(value);}
 const contextDigest=value=>digest(Buffer.from(JSON.stringify(value)));
 function snapshotDigest(id,context=contextSnapshot(id)){return contextDigest({context,unavailable:ownedReady(id).nativePreviewContextUnavailable||null});}
 async function snapshot(id){
  ownedReady(id);const filename=path.join(dataDir,'jobs',`${id}.gcode`);let handle;
  try{handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));}catch{throw error('G-code is not available',404);}
  try{const info=await handle.stat();if(!info.isFile())throw error('G-code is not available',404);if(info.size>NATIVE_PREVIEW_LIMITS.inputBytes)throw error('G-code exceeds native preview input limit',413);const chunks=[];let size=0;
   while(size<=NATIVE_PREVIEW_LIMITS.inputBytes){const chunk=Buffer.alloc(Math.min(65536,NATIVE_PREVIEW_LIMITS.inputBytes+1-size)),{bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;chunks.push(chunk.subarray(0,bytesRead));size+=bytesRead;}
   if(size>NATIVE_PREVIEW_LIMITS.inputBytes)throw error('G-code exceeds native preview input limit',413);ownedReady(id);return Buffer.concat(chunks,size);
  }finally{await handle.close();}
 }

 async function get(id,{signal}={}){
  if(closed)throw error('Native preview service is shutting down',503);if(signal?.aborted)throw error('Native preview cancelled',499);
  if(preparing>=5)throw error('Native preview snapshot queue is full',429);preparing++;let bytes,identity;
  try{bytes=await snapshot(id);identity=await worker.identity();}finally{preparing--;}
  const context=contextSnapshot(id),contextHash=snapshotDigest(id,context),supportsContext=identity.metadata.editorContextVersion===1;
  const hash=digest(bytes),key=`${id}:${hash}:${identity.id}:${contextHash}`;
  for(const[previous,item]of cache)if(item.id===id&&previous!==key)remove(previous);
  for(const[previous,item]of pending)if(item.id===id&&previous!==key){item.controller.abort();pending.delete(previous);}
  if(closed)throw error('Native preview service is shutting down',503);if(signal?.aborted)throw error('Native preview cancelled',499);ownedReady(id);
  const cached=cache.get(key);if(cached){cache.delete(key);cache.set(key,cached);return cached.value;}
  let task=pending.get(key);
  if(!task){
   const controller=new AbortController();task={id,controller,subscribers:new Set()};
   task.promise=worker.process(bytes,{signal:controller.signal,...(context&&supportsContext?{context}:{} )}).then(async value=>{
    if((await worker.identity()).id!==identity.id)throw error('Native worker changed during processing; reload the preview',503);
    ownedReady(id);if(snapshotDigest(id)!==contextHash)throw error('Native editor snapshot changed during processing; reload the preview',409);const result={...value,sourceSha256:hash,sourceBytes:bytes.length,workerIdentity:identity.id,...(ownedReady(id).nativePreviewContextUnavailable?{editorContextUnavailable:ownedReady(id).nativePreviewContextUnavailable}:{}),...(context?{editorContextSha256:contextHash,...(!supportsContext?{editorContextUnavailable:'This native helper cannot apply the saved editor palette or editor totals. Upgrade the helper to enable them.'}:{})}:{})};
    const size=Buffer.byteLength(JSON.stringify(result));
    if(size<=maxCacheBytes&&!closed&&!controller.signal.aborted){while(cache.size>=maxCacheEntries||cacheBytes+size>maxCacheBytes){const oldest=cache.keys().next().value;if(oldest===undefined)break;remove(oldest);}cache.set(key,{id,bytes:size,value:result});cacheBytes+=size;}
    return result;
   }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
   pending.set(key,task);
  }
  const subscriber={};task.subscribers.add(subscriber);
  return new Promise((resolve,reject)=>{
   let finished=false;
   const cleanup=()=>{signal?.removeEventListener('abort',abort);task.subscribers.delete(subscriber);if(!task.subscribers.size&&pending.get(key)===task)task.controller.abort();};
   const settle=(fn,value)=>{if(finished)return;finished=true;cleanup();fn(value);};
   const abort=()=>settle(reject,error('Native preview cancelled',499));signal?.addEventListener('abort',abort,{once:true});
   task.promise.then(value=>settle(resolve,value),problem=>settle(reject,problem));if(signal?.aborted)abort();
  });
 }
 router.get('/native-preview/capabilities',async(_req,res)=>{try{const identity=await worker.identity();res.json({available:!closed,engine:identity.metadata,limits:NATIVE_PREVIEW_LIMITS});}catch(problem){res.json({available:false,error:problem.message,limits:NATIVE_PREVIEW_LIMITS});}});
 router.get('/:id/native-preview',async(req,res)=>{const controller=new AbortController();const close=()=>{if(!res.writableEnded)controller.abort();};res.once('close',close);try{const result=await get(req.params.id,{signal:controller.signal});if(!controller.signal.aborted)res.json(result);}catch(problem){if(!controller.signal.aborted)res.status(problem.status||503).json({error:problem.message||'Native G-code preview failed'});}finally{res.removeListener('close',close);}});
 return {router,get,invalidate,async shutdown(){closed=true;for(const task of pending.values())task.controller.abort();await worker.shutdown();await Promise.allSettled([...pending.values()].map(item=>item.promise));pending.clear();cache.clear();cacheBytes=0;},get cacheInfo(){return{entries:cache.size,bytes:cacheBytes,pending:pending.size,preparing};}};
}
