import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createNativeProjectService} from '../../server/native-projects.js';
import {importPrusaArchive} from '../../server/native-prusa.js';
import {prusaImportQueue} from '../../server/native-prusa-queue.js';
import {prusaFixture} from '../fixtures/prusa-project.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
async function until(check){for(let i=0;i<200;i++){if(check())return;await delay(10);}assert.fail(`Queue did not reach expected state:${JSON.stringify(prusaImportQueue.state)}`);}
test('direct project-import HTTP requests share the bounded native queue with raw helper callers',{timeout:15000},async t=>{
 const gate=deferred(),started=deferred(),controllers=[];
 const active=importPrusaArchive(prusaFixture(),{selection:{printer:{},process:{},filament:{}},timeoutMs:10000,runNative:async()=>{started.resolve();await gate.promise;throw new Error('Release mocked active worker');}});
 const activeDone=assert.rejects(active,/Release mocked active worker/);await started.promise;
 const catalog={list:()=>({defaults:{printerId:'p',processId:'s',filamentId:'f'}}),resolveSelection:()=>({printer:{},process:{},filament:{}})};
 const app=express();app.use('/api/projects',createNativeProjectService({catalog}).router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{controllers.forEach(c=>c.abort());gate.resolve();await activeDone;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const url=`http://127.0.0.1:${server.address().port}/api/projects/import`;
 // This test isolates importer admission; use complete embedded native settings
 // instead of an empty synthetic preset that cannot pass the native resolver.
 const nativeSettings=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))).nativeSettings;
 function request(){const controller=new AbortController();controllers.push(controller);const form=new FormData();form.set('model',new Blob([prusaFixture()]),'Prusa.3mf');form.set('nativeSettings',JSON.stringify(nativeSettings));const result=fetch(url,{method:'POST',body:form,signal:controller.signal}).then(response=>({response}),error=>({error}));return{controller,result};}
 const waiting=Array.from({length:4},request);await until(()=>prusaImportQueue.state.pending===4);
 const overflow=await request().result;assert.equal(overflow.response.status,400);assert.match((await overflow.response.json()).error,/queue is full/);assert.deepEqual(prusaImportQueue.state,{active:1,pending:4});
 waiting[0].controller.abort();assert.equal((await waiting[0].result).error.name,'AbortError');await until(()=>prusaImportQueue.state.pending===3);
 for(const value of waiting)value.controller.abort();await Promise.all(waiting.map(value=>value.result));await until(()=>prusaImportQueue.state.pending===0);gate.resolve();await activeDone;
});
