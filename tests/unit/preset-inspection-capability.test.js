import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{runNativeConfig,NATIVE_CONFIG_REVISION}from'../../server/native-config.js';
test('editor inspection requires a paired helper with an explicit inspection response',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-inspection-capability-')),workerPath=path.join(directory,'helper');await writeFile(workerPath,'old pinned helper');t.after(()=>rm(directory,{recursive:true,force:true}));let calls=0;
 const runNative=async(_binary,args)=>{if(args[0]==='--version')return`OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`;calls++;await writeFile(args[1],JSON.stringify({sourceRevision:NATIVE_CONFIG_REVISION,effectiveSettings:{},reports:[]}));return'';};
 for(let i=0;i<2;i++)await assert.rejects(runNativeConfig({compatibilityPolicy:'inspect'},{workerPath,runNative}),failure=>failure.status===503&&/Rebuild/.test(failure.message));assert.equal(calls,2,'unsupported inspection results are never cached');
});
