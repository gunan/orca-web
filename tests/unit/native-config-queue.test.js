import test from 'node:test';import assert from 'node:assert/strict';import{writeFile,readFile,mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{runNativeConfig,NATIVE_CONFIG_REVISION}from'../../server/native-config.js';
const version=`OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`;
const directory=await mkdtemp(path.join(tmpdir(),'orca-config-queue-')),workerPath=path.join(directory,'helper');await writeFile(workerPath,'fixture');test.after(()=>rm(directory,{recursive:true,force:true}));
const output={sourceRevision:NATIVE_CONFIG_REVISION,effectiveSettings:{layer_height:'0.2'},reports:[]};
test('native config queue bounds processes, aborts queued work, and shares one deadline',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let active=0,maximum=0,calls=0;
 const runNative=async(_binary,args,{signal,timeoutMs})=>{calls++;active++;maximum=Math.max(maximum,active);try{if(args[0]==='--version'){if(calls===1)await gate;return version;}assert.ok(timeoutMs<2000);await writeFile(args[1],JSON.stringify(output));return'';}finally{active--;}};
 const first=runNativeConfig({}, {workerPath,runNative,useCache:false,timeoutMs:2000});await new Promise(resolve=>setTimeout(resolve,5));
 const controller=new AbortController();const queued=runNativeConfig({}, {workerPath,runNative,useCache:false,timeoutMs:2000,signal:controller.signal});const cancelled=assert.rejects(queued,error=>error.name==='AbortError');
 const waiting=Array.from({length:3},()=>runNativeConfig({}, {workerPath,runNative,useCache:false,timeoutMs:2000}));
 await assert.rejects(()=>runNativeConfig({}, {workerPath,runNative,useCache:false,timeoutMs:2000}),/queue is full/);controller.abort();await cancelled;
 const expired=runNativeConfig({}, {workerPath,runNative,useCache:false,timeoutMs:20});const expiration=assert.rejects(expired,/timed out/);await new Promise(resolve=>setTimeout(resolve,30));await expiration;
 release();await Promise.all([first,...waiting]);assert.equal(maximum,1);assert.equal(calls,8);
});
test('native config request/output bounds and source version are enforced before use',async()=>{
 await assert.rejects(()=>runNativeConfig({x:'a'.repeat(8*1024*1024)},{useCache:false}),/8 MiB/);
 await assert.rejects(()=>runNativeConfig({}, {workerPath,runNative:async()=> 'different build',useCache:false}),/pinned OrcaSlicer/);
 await assert.rejects(()=>runNativeConfig({}, {workerPath,runNative:async(_binary,args)=>{if(args[0]==='--version')return version;await writeFile(args[1],JSON.stringify({...output,sourceRevision:'other'}));return'';},useCache:false}),/Invalid native configuration helper output/);
});
test('cached configurations are defensive and keyed by request and helper path',async()=>{
 let count=0;const runNative=async(_binary,args)=>{count++;if(args[0]==='--version')return version;assert.deepEqual(JSON.parse(await readFile(args[0])),{cacheTest:'one'});await writeFile(args[1],JSON.stringify(output));return'';};
 const options={runNative,workerPath};const first=await runNativeConfig({cacheTest:'one'},options);first.effectiveSettings.layer_height='99';assert.equal((await runNativeConfig({cacheTest:'one'},options)).effectiveSettings.layer_height,'0.2');assert.equal(count,2);
});
