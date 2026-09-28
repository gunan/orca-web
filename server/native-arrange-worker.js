import {validateNativeImportInspection} from '../shared/native-import-inspection.js';
import {validateNativePrimeTowerResult} from '../shared/native-prime-tower.js';
import {validateNativeCutToPartsResult,CUT_PARTS_LIMITS} from '../shared/native-cut-to-parts.js';
import {validateNativeInstanceCutResult} from '../shared/native-instance-cut.js';
import {validateNativeFillBedResult} from '../shared/native-fill-bed.js';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ARRANGE_LIMITS,ARRANGE_REVISION,validateArrangementResult} from '../shared/native-arrangement.js';
import {validateNativeClipboardResult} from '../shared/native-clipboard.js';
const abortError=()=>Object.assign(new Error('Native arrangement cancelled'),{name:'AbortError',status:499});
const unavailable=message=>Object.assign(new Error(message),{status:503});
function run(binary,args,{signal,timeoutMs=60000,maxOutput=65536}={}){
 if(signal?.aborted)return Promise.reject(abortError());
 return new Promise((resolve,reject)=>{
  let child,stdout='',stderr='',problem=null,killTimer;
  const stop=error=>{if(problem)return;problem=error;child?.kill('SIGTERM');killTimer=setTimeout(()=>child?.kill('SIGKILL'),200);killTimer.unref();};
  const abort=()=>stop(abortError()),timer=setTimeout(()=>stop(unavailable('Native arrangement processing timed out')),timeoutMs);timer.unref();
  try{child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});}catch(error){clearTimeout(timer);reject(error);return;}
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',data=>{if(problem)return;stdout=(stdout+data.toString()).slice(0,maxOutput+1);if(Buffer.byteLength(stdout)>maxOutput)stop(unavailable('Native worker console output exceeds limit'));});
  child.stderr.on('data',data=>{if(problem)return;stderr=(stderr+data.toString()).slice(0,maxOutput+1);if(Buffer.byteLength(stderr)>maxOutput)stop(unavailable('Native worker diagnostic output exceeds limit'));});
  child.on('error',error=>{problem=unavailable(error.code==='ENOENT'?'Native arrangement helper is not installed':error.message);});
  child.on('close',(code,exitSignal)=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);if(problem)reject(problem);else if(code!==0)reject(unavailable(stderr.trim().slice(0,3000)||`Native arrangement helper exited ${code??exitSignal}`));else resolve(stdout);});
 });
}
export function createNativeArrangeWorker({binary,resourcesDir,timeoutMs=60000,maxActive=1,maxQueued=4,tempRoot=tmpdir(),maxInputBytes=ARRANGE_LIMITS.inputBytes,maxOutputBytes=ARRANGE_LIMITS.outputBytes,maxGeometryOutputBytes=CUT_PARTS_LIMITS.outputBytes}={}){
 if(!Number.isInteger(maxActive)||maxActive<1||maxActive>4||!Number.isInteger(maxQueued)||maxQueued<0||maxQueued>16)throw new TypeError('Invalid native worker queue limits');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||!Number.isInteger(maxInputBytes)||maxInputBytes<1||maxInputBytes>ARRANGE_LIMITS.inputBytes||!Number.isInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>ARRANGE_LIMITS.outputBytes)throw new TypeError('Invalid native worker safety limits');
 if(!Number.isInteger(maxGeometryOutputBytes)||maxGeometryOutputBytes<1||maxGeometryOutputBytes>CUT_PARTS_LIMITS.outputBytes)throw new TypeError('Invalid native geometry output limit');
 if(typeof binary!=='string'||!binary)throw new TypeError('Native arrangement worker binary is required');
 let closed=false,active=0,identityCache=null,identityPending=null;const waiting=[],running=new Set(),tasks=new Set(),identityControllers=new Set();
 async function identity(){
  if(closed)throw unavailable('Native arrangement helper is shutting down');
  let info;try{info=await stat(binary);}catch{throw unavailable('Native arrangement helper is not installed. Build it with npm run build:native:arrange.');}
  const stamp=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  if(identityCache?.stamp===stamp)return identityCache.identity;
  if(identityPending?.stamp===stamp)return identityPending.promise;
  const controller=new AbortController();identityControllers.add(controller);
  const promise=(async()=>{const version=await run(binary,['--version'],{timeoutMs:5000,signal:controller.signal});if(version.trim()!==`OrcaArrangeWorker-2.4.2 revision${ARRANGE_REVISION}`)throw unavailable('Native arrangement worker does not match pinned2.4.2 source');const metadata={schemaVersion:1,sourceCommit:ARRANGE_REVISION,version:'2.4.2'};
  if(metadata.schemaVersion!==1||metadata.sourceCommit!==ARRANGE_REVISION||metadata.version!=='2.4.2')throw unavailable('Native arrangement helper version does not match the arrangement schema');
  const bytes=await readFile(binary),after=await stat(binary);if(controller.signal.aborted||closed)throw abortError();if(`${after.size}:${after.mtimeMs}:${after.ctimeMs}`!==stamp)throw unavailable('Native arrangement helper changed during identification; retry');const id=createHash('sha256').update(bytes).update(JSON.stringify(metadata)).digest('hex');identityCache={stamp,identity:{id,metadata}};return identityCache.identity;})();identityPending={stamp,promise};try{return await promise;}finally{identityControllers.delete(controller);if(identityPending?.promise===promise)identityPending=null;}
 }
 function drain(){while(!closed&&active<maxActive&&waiting.length){const task=waiting.shift();task.signal?.removeEventListener('abort',task.abort);if(task.signal?.aborted){task.reject(abortError());continue;}active++;const controller=new AbortController(),onAbort=()=>controller.abort();running.add(controller);task.signal?.addEventListener('abort',onAbort,{once:true});const promise=execute(task.bytes,controller.signal).then(task.resolve,task.reject).finally(()=>{active--;running.delete(controller);tasks.delete(promise);task.signal?.removeEventListener('abort',onAbort);drain();});tasks.add(promise);}}
 async function execute(bytes,signal){
  let directory;try{await identity();if(signal.aborted)throw abortError();directory=await mkdtemp(path.join(tempRoot,'orca-native-arrangement-'));const input=path.join(directory,'input.json'),output=path.join(directory,'arrangement.json');await writeFile(input,bytes,{mode:0o600});await run(binary,[input,output,...(resourcesDir?[resourcesDir]:[])],{signal,timeoutMs});if(signal.aborted)throw abortError();const request=JSON.parse(bytes),info=await stat(output);if(info.size>(request.operation==='cut-to-parts'?maxGeometryOutputBytes:maxOutputBytes))throw unavailable('Native arrangement result exceeds output size limit');const value=JSON.parse(await readFile(output,'utf8'));return request.operation==='inspect-import'?validateNativeImportInspection(value,request):request.operation==='prime-tower-preview'?validateNativePrimeTowerResult(value,request):request.operation==='cut-to-parts'?validateNativeCutToPartsResult(value,request):request.operation==='instance-cut-frames'?validateNativeInstanceCutResult(value,request):request.operation==='fill-bed'?validateNativeFillBedResult(value,request):request.operation==='nearest-empty-cell'?validateNativeClipboardResult(value,request):validateArrangementResult(value,request);}finally{if(directory)await rm(directory,{recursive:true,force:true});}
 }
 return {identity,process(bytes,{signal}={}){if(closed)return Promise.reject(unavailable('Native arrangement helper is shutting down'));if(!Buffer.isBuffer(bytes)||bytes.length>maxInputBytes)return Promise.reject(Object.assign(new Error('arrangement input exceeds native arrangement limit'),{status:413}));if(signal?.aborted)return Promise.reject(abortError());if(waiting.length>=maxQueued&&active>=maxActive)return Promise.reject(Object.assign(new Error('Native arrangement queue is full'),{status:429}));return new Promise((resolve,reject)=>{
  const operation=new AbortController();let settled=false,deadlineError=null;
  const externalAbort=()=>operation.abort(),cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',externalAbort);};
  const finish=(callback,value)=>{if(settled)return;settled=true;cleanup();callback(value);};
  const task={bytes:Buffer.from(bytes),signal:operation.signal,resolve:value=>finish(resolve,value),reject:error=>finish(reject,deadlineError||error)};
  task.abort=()=>{const index=waiting.indexOf(task);if(index>=0){waiting.splice(index,1);task.reject(abortError());}};
  const timer=setTimeout(()=>{deadlineError=unavailable('Native arrangement processing timed out (including queue wait)');operation.abort();task.reject(deadlineError);},timeoutMs);timer.unref();
  signal?.addEventListener('abort',externalAbort,{once:true});waiting.push(task);operation.signal.addEventListener('abort',task.abort,{once:true});if(signal?.aborted)operation.abort();drain();
 });},async shutdown(){closed=true;for(const controller of identityControllers)controller.abort();const identifying=identityPending?.promise;for(const task of waiting.splice(0)){task.signal?.removeEventListener('abort',task.abort);task.reject(unavailable('Native arrangement helper is shutting down'));}for(const controller of running)controller.abort();await Promise.allSettled([...tasks,...(identifying?[identifying]:[])]);}};
}
