import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runNativeConfig,createNativeConfigurationService,NATIVE_CONFIG_REVISION} from '../../server/native-config.js';
const version=`OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`;
const result=value=>({sourceRevision:NATIVE_CONFIG_REVISION,effectiveSettings:{layer_height:value},reports:[]});
async function fixture(t){const directory=await mkdtemp(path.join(tmpdir(),'orca-config-lifecycle-')),workerPath=path.join(directory,'helper');await writeFile(workerPath,'first');t.after(()=>rm(directory,{recursive:true,force:true}));return{workerPath,directory};}
test('configuration cache identifies the current binary before reuse and rejects a removed helper',async t=>{
 const {workerPath}=await fixture(t);let calls=0;
 const runNative=async(binary,args)=>{calls++;if(args[0]==='--version')return version;await writeFile(args[1],JSON.stringify(result(await readFile(binary,'utf8'))));return'';};
 const options={workerPath,runNative},request={identityFixture:true};
 assert.equal((await runNativeConfig(request,options)).effectiveSettings.layer_height,'first');
 assert.equal((await runNativeConfig(request,options)).effectiveSettings.layer_height,'first');assert.equal(calls,2);
 const before=await stat(workerPath);await writeFile(workerPath,'other');await utimes(workerPath,before.atime,before.mtime);
 assert.equal((await runNativeConfig(request,options)).effectiveSettings.layer_height,'other');assert.equal(calls,4,'Replaced bytes with equal length and restored mtime cannot reuse the old result');
 await rm(workerPath);await assert.rejects(()=>runNativeConfig(request,options),error=>error.status===503&&/unavailable/.test(error.message));assert.equal(calls,4);
});
test('binary replacement during a request never publishes or caches the stale output',async t=>{
 const {workerPath}=await fixture(t);let count=0;
 const runNative=async(binary,args)=>{if(args[0]==='--version')return version;count++;await writeFile(args[1],JSON.stringify(result(String(count))));if(count===1)await writeFile(binary,'after');return'';};
 await assert.rejects(()=>runNativeConfig({replaceDuringRun:true},{workerPath,runNative}),error=>error.status===503&&/changed during execution/.test(error.message));
 assert.equal((await runNativeConfig({replaceDuringRun:true},{workerPath,runNative})).effectiveSettings.layer_height,'2');
});
test('configuration failures preserve native error identity, diagnostic properties and cancellation reason',async t=>{
 const {workerPath}=await fixture(t),nativeError=Object.assign(new Error('Native quota rejected'),{name:'NativeLimitError',status:413,nativeDiagnostic:'original diagnostic'});
 await assert.rejects(()=>runNativeConfig({}, {workerPath,useCache:false,runNative:async()=>{throw nativeError;}}),error=>error===nativeError&&error.status===413&&error.nativeDiagnostic==='original diagnostic');
 const controller=new AbortController(),reason=Object.assign(new Error('caller cancelled'),{name:'AbortError',status:499});controller.abort(reason);
 await assert.rejects(()=>runNativeConfig({}, {workerPath,signal:controller.signal}),error=>error===reason);
});
test('one application lifetime aborts active and queued calls, waits for cleanup and leaves other lifetimes usable',async t=>{
 const {workerPath}=await fixture(t);let entered,activeCleaned=false,calls=0;const started=new Promise(resolve=>entered=resolve);
 const runNative=async(_binary,args,{signal})=>{calls++;if(args[0]==='--version')return version;entered();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{setTimeout(()=>{activeCleaned=true;reject(signal.reason);},10);},{once:true}));};
 const service=createNativeConfigurationService({workerPath,runNative,useCache:false}),first=service.run({first:true}),firstCheck=assert.rejects(first,error=>error.name==='AbortError'&&error.status===503);
 await started;
 const second=service.run({second:true}),secondCheck=assert.rejects(second,error=>error.name==='AbortError'&&error.status===503);
 await service.close();await Promise.all([firstCheck,secondCheck]);assert.equal(activeCleaned,true);assert.equal(calls,2,'Queued operation never starts its own native process');
 await assert.rejects(()=>service.run({}),error=>error.name==='AbortError'&&error.status===503);
 const other=createNativeConfigurationService({workerPath,useCache:false,runNative:async(_binary,args)=>{if(args[0]==='--version')return version;await writeFile(args[1],JSON.stringify(result('.2')));return'';}});
 assert.equal((await other.run({independent:true})).effectiveSettings.layer_height,'.2');await other.close();
});
