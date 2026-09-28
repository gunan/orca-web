import {createPresetCatalog} from '../../server/presets.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../../server/app.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {createNativeArrangementService} from '../../server/native-arrangement.js';
import {importNative3MF} from '../../shared/native-project.js';
import {fixtureCatalog} from '../fixtures/native-project-catalog.js';
import {NATIVE_CONFIG_REVISION} from '../../server/native-config.js';
const version=`OrcaConfigWorker-2.4.2 revision${NATIVE_CONFIG_REVISION}`;
async function listen(t,app,shutdown){const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});t.after(async()=>{await shutdown();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});return`http://127.0.0.1:${server.address().port}`;}
async function setup(t,runNative){const dataDir=await mkdtemp(path.join(tmpdir(),'orca-config-http-')),workerPath=path.join(dataDir,'helper');await writeFile(workerPath,'fixture');t.after(()=>rm(dataDir,{recursive:true,force:true}));const app=await createApp({dataDir,binary:path.resolve('tests/fixtures/fake-slicer.sh'),profilesDir:path.resolve('tests/fixtures/presets'),nativeConfiguration:{workerPath,runNative}}),base=await listen(t,app,()=>app.locals.shutdown()),listing=(await createPresetCatalog({profilesDir:path.resolve('tests/fixtures/presets')})).list();return{app,base,route:`${base}/api/presets/selection?${new URLSearchParams(listing.defaults)}`};}
test('app shutdown cancels active and waiting configuration HTTP requests and rejects future admission',{timeout:20000},async t=>{
 let started,processes=0,cleaned=false;const ready=new Promise(resolve=>started=resolve);
 const runNative=async(_binary,args,{signal})=>{if(args[0]==='--version')return version;processes++;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{cleaned=true;reject(signal.reason);},{once:true}));};
 const api=await setup(t,runNative),first=fetch(api.route);await ready;const second=fetch(api.route);await new Promise(resolve=>setTimeout(resolve,40));
 await api.app.locals.shutdown();assert.equal(cleaned,true);assert.equal(processes,1);
 for(const response of await Promise.all([first,second])){assert.equal(response.status,503);assert.match((await response.json()).error,/shutting down/);}
 assert.equal((await fetch(api.route)).status,503);
});
test('configuration HTTP endpoint preserves operational status instead of rewriting it to400',{timeout:20000},async t=>{
 const api=await setup(t,async(_binary,args)=>{if(args[0]==='--version')return version;throw Object.assign(new Error('Worker quota fixture'),{name:'QuotaError',status:429});});
 const response=await fetch(api.route);assert.equal(response.status,429);assert.equal((await response.json()).error,'Worker quota fixture');
});
test('prepareGeometry forwards the caller signal through native preset resolution',{timeout:10000},async()=>{
 const project=importNative3MF(await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url))),catalog=fixtureCatalog(project),controller=new AbortController();let reached;
 const ready=new Promise(resolve=>reached=resolve),service=createNativeProjectService({catalog,nativeConfig:{resolveCatalogNativeSettings:async({signal})=>{assert.equal(signal,controller.signal);reached();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},close:async()=>{}}});
 const preparing=service.prepareGeometry({project,selection:catalog.list().defaults},{signal:controller.signal}),rejected=assert.rejects(preparing,error=>error.name==='AbortError');await ready;controller.abort();await rejected;
});
test('geometry route shutdown cancels configuration preparation before arrangement worker admission',{timeout:10000},async t=>{
 let entered,aborted=false,calls=0;const ready=new Promise(resolve=>entered=resolve);
 const projects={prepareGeometry:async(_request,{signal}={})=>{assert.ok(signal instanceof AbortSignal);entered();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));}};
 const service=createNativeArrangementService({projects,worker:{shutdown:async()=>{},process:async()=>calls++}}),app=express();app.use('/api/geometry',service.router);
 const base=await listen(t,app,()=>service.close()),pending=fetch(`${base}/api/geometry/arrange`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectRequest:{}})});
 await ready;await service.close();const response=await pending;assert.equal(response.status,499);assert.equal(aborted,true);assert.equal(calls,0);
});
test('arrangement passes selected native temperature/nozzle vectors rather than archived alternatives',{timeout:10000},async t=>{
 const project=importNative3MF(await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url))),archive={...project.nativeSettings,nozzle_temperature:['190','270'],nozzle_temperature_initial_layer:['195','275'],nozzle_diameter:['.4','.8']},effective={...archive,nozzle_temperature:['270'],nozzle_temperature_initial_layer:['275'],nozzle_diameter:['.8']};let received;
 const projects={prepareGeometry:async()=>({project,settings:archive,effectiveSettings:effective,warnings:[]})},worker={shutdown:async()=>{},process:async bytes=>{received=JSON.parse(bytes);return{format:'orca-native-arrangement',version:1,sourceRevision:NATIVE_CONFIG_REVISION,objects:received.objects.filter(object=>object.selected).map(object=>({id:object.id,bedIndex:0,matrix:object.matrix}))};}};
 const service=createNativeArrangementService({projects,worker}),app=express();app.use('/api/geometry',service.router);const base=await listen(t,app,()=>service.close());
 const response=await fetch(`${base}/api/geometry/arrange`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectRequest:{}})});assert.equal(response.status,200,await response.text());
 assert.deepEqual(received.settings.nozzle_temperature,['270']);assert.deepEqual(received.settings.nozzle_temperature_initial_layer,['275']);assert.deepEqual(received.settings.nozzle_diameter,['.8']);assert.deepEqual(archive.nozzle_temperature,['190','270'],'Archive alternatives remain unmodified');
});
