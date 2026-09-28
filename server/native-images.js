import express from 'express';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auxiliaryPath,attachmentImageSource,decodeAttachment,encodeAttachment} from '../shared/native-auxiliary.js';
import {inspectThumbnail} from '../shared/native-assets.js';

import {IMAGE_WORKER_ID,NATIVE_COVER_SIZES as expected} from '../shared/native-cover.js';
export {IMAGE_WORKER_ID};
export function validateNativeCoverSurface(width,height){
  for(const[,w,h]of Object.values(expected)){
    const factor=Math.min(Math.fround(height/h),Math.fround(width/w)),targetWidth=Math.trunc(Math.fround(width/factor)),targetHeight=Math.trunc(Math.fround(height/factor));
    if(targetWidth>16384||targetHeight>16384||targetWidth*targetHeight>16*1024*1024)throw failure('The image aspect ratio requires an oversized native cover surface. Crop the source image first.');
  }
}
function failure(message,status=400){return Object.assign(new Error(message),{status});}
function child(binary,args,{signal,timeoutMs=15000,cwd}={}){
  return new Promise((resolve,reject)=>{
    const process=spawn(binary,args,{cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='',bytes=0,done=false,reason;
    const timer=setTimeout(()=>stop(failure('Native image generation timed out',504)),timeoutMs);
    function stop(error){reason||=error;process.kill('SIGKILL');}
    const abort=()=>stop(signal.reason||failure('Native image generation cancelled',499));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    function finish(error,result){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);}
    function consume(chunk,err){bytes+=chunk.length;if(bytes>128*1024){stop(failure('Native image worker exceeded its output limit',502));return;}if(err)stderr+=chunk.toString();else stdout+=chunk.toString();}
    process.stdout.on('data',chunk=>consume(chunk,false));process.stderr.on('data',chunk=>consume(chunk,true));process.on('error',error=>finish(error));
    process.on('close',code=>finish(reason||(code!==0?failure(`Native image worker failed: ${stderr.trim().slice(0,1000)||`exit ${code}`}`,502):null),stdout));
  });
}

export function createNativeImageWorker({binary=process.env.ORCA_IMAGE_WORKER_BIN||fileURLToPath(new URL(`../native/build/image/orca-image-worker${process.platform==='win32'?'.exe':''}`,import.meta.url)),timeoutMs=15000,maxQueued=4,temporaryRoot=tmpdir()}={}){
  // Child generation runs in a private directory; resolve configured relative paths once.
  if(binary.includes('/')||binary.includes('\\'))binary=path.resolve(binary);
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>120000||!Number.isInteger(maxQueued)||maxQueued<0||maxQueued>16)throw new Error('Invalid native image worker limits');
  let versionPromise,active=false,closed=false;const queue=[],tasks=new Set(),shutdown=new AbortController();
  async function capabilities(){
    if(closed)return{available:false,reason:'Native image worker is shutting down'};
    versionPromise||=child(binary,['--version'],{signal:shutdown.signal,timeoutMs:Math.min(timeoutMs,5000)}).then(text=>{const value=JSON.parse(text);if(Object.entries(IMAGE_WORKER_ID).some(([key,expected])=>value[key]!==expected))throw new Error('Native image worker baseline does not match OrcaSlicer 2.4.2');return{available:true,...IMAGE_WORKER_ID};}).catch(error=>({available:false,reason:error.code==='ENOENT'?'Build the native image worker to generate project covers.':error.message}));
    return versionPromise;
  }
  async function execute(file,signal,deadline){
    const capability=await capabilities();if(!capability.available)throw failure(capability.reason,503);signal.throwIfAborted();
    const data=decodeAttachment(file.data),image=attachmentImageSource(file);if(!image)throw failure('A valid static PNG, JPEG or BMP image up to 4096 × 4096 pixels is required.');
    const directory=await mkdtemp(path.join(temporaryRoot,'orca-image-'));
    try{
      signal.throwIfAborted();const input=path.join(directory,'source.'+file.path.split('.').at(-1).toLowerCase());await writeFile(input,data);
      const remaining=deadline-Date.now();if(remaining<=0)throw failure('Native image generation timed out in the queue',504);
      const result=JSON.parse(await child(binary,[input,directory],{cwd:directory,signal,timeoutMs:remaining}));signal.throwIfAborted();
      if(result.protocol!==1||result.sourceWidth!==image.width||result.sourceHeight!==image.height)throw failure('Native image worker returned an invalid image description',502);
      const names=await readdir(directory),allowed=new Set([path.basename(input),...Object.values(expected).map(([name])=>name)]);if(names.length!==allowed.size||names.some(name=>!allowed.has(name)))throw failure('Native image worker returned unexpected files',502);
      const images={};for(const[kind,[name,width,height]]of Object.entries(expected)){
        const file=path.join(directory,name),info=await lstat(file);if(!info.isFile()||info.size>8*1024*1024)throw failure('Native image output exceeds its file bounds',502);
        const bytes=await readFile(file),size=inspectThumbnail(bytes);if(size.width!==width||size.height!==height)throw failure('Native cover dimensions do not match the required size',502);
        images[kind]={name,data:encodeAttachment(bytes),width,height};
      }
      return{images,sourceWidth:image.width,sourceHeight:image.height,provenance:IMAGE_WORKER_ID};
    }finally{await rm(directory,{recursive:true,force:true});}
  }
  function pump(){
    if(active||closed)return;const job=queue.shift();if(!job)return;active=true;
    const task=execute(job.file,job.signal,job.deadline).then(job.resolve,job.reject).finally(()=>{job.cleanup();tasks.delete(task);active=false;pump();});tasks.add(task);
  }
  function generate(input,{signal}={}){
    const{name,data}=input||{};
    if(closed)return Promise.reject(failure('Native image worker is shutting down',503));
    if(typeof name!=='string'||name.includes('/'))return Promise.reject(failure('Invalid cover image name'));
    let file;try{file={path:auxiliaryPath(`Auxiliaries/Model Pictures/${name}`),data};const image=attachmentImageSource(file);if(!image)throw failure('A valid static PNG, JPEG or BMP image up to 4096 × 4096 pixels is required.');validateNativeCoverSurface(image.width,image.height);}catch(error){return Promise.reject(error);}
    if(active&&queue.length>=maxQueued)return Promise.reject(failure('Native image generation is busy. Try again when another cover finishes.',429));
    return new Promise((resolve,reject)=>{
      const controller=new AbortController(),combined=AbortSignal.any([controller.signal,shutdown.signal,...(signal?[signal]:[])]),deadline=Date.now()+timeoutMs;
      const job={file,signal:combined,deadline,resolve,reject,cleanup};
      function abort(){const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);cleanup();reject(combined.reason);}}
      const timer=setTimeout(()=>controller.abort(failure('Native image generation timed out',504)),timeoutMs);
      function cleanup(){clearTimeout(timer);combined.removeEventListener('abort',abort);}
      if(combined.aborted){cleanup();reject(combined.reason);return;}combined.addEventListener('abort',abort,{once:true});queue.push(job);pump();
    });
  }
  async function close(){closed=true;shutdown.abort(failure('Native image generation cancelled by shutdown',503));await Promise.allSettled([...tasks,...(versionPromise?[versionPromise]:[])]);}
  return{capabilities,generate,close};
}

export function createNativeImageService(options={}){
  const worker=createNativeImageWorker(options),router=express.Router();router.use(express.json({limit:'44mb'}));
  router.get('/capabilities',async(_req,res)=>res.json(await worker.capabilities()));
  router.post('/cover',async(req,res)=>{
    const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort(failure('Cover request cancelled',499));};req.on('aborted',abort);res.on('close',abort);
    try{const result=await worker.generate(req.body||{},{signal:controller.signal});if(!controller.signal.aborted)res.json(result);}
    catch(error){if(!controller.signal.aborted)res.status(error.status||400).json({error:error.message});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  });
  return{router,close:worker.close};
}
