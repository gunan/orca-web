import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrusaImportQueue} from '../../server/native-prusa-queue.js';
import {importPrusaArchive} from '../../server/native-prusa.js';
import {prusaFixture} from '../fixtures/prusa-project.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
test('one active Prusa import and at most four pending are shared fairly',async()=>{
 const queue=createPrusaImportQueue(),gate=deferred(),started=[];
 const active=queue.run(async()=>{started.push(0);await gate.promise;},{deadline:Date.now()+2000});
 const waiting=Array.from({length:4},(_,i)=>queue.run(async()=>{started.push(i+1);},{deadline:Date.now()+2000}));
 await assert.rejects(queue.run(()=>assert.fail('Overflow started'),{deadline:Date.now()+2000}),/queue is full/);
 assert.deepEqual(queue.state,{active:1,pending:4});gate.resolve();await Promise.all([active,...waiting]);await delay(0);assert.deepEqual(started,[0,1,2,3,4]);assert.deepEqual(queue.state,{active:0,pending:0});
});
test('queued cancellation removes its entry immediately without starting its task',async()=>{
 const queue=createPrusaImportQueue(),gate=deferred(),controller=new AbortController();const active=queue.run(()=>gate.promise,{deadline:Date.now()+2000});
 const pending=queue.run(()=>assert.fail('Cancelled task started'),{signal:controller.signal,deadline:Date.now()+2000});controller.abort();await assert.rejects(pending,/cancelled while queued/);assert.deepEqual(queue.state,{active:1,pending:0});gate.resolve();await active;
});
test('queue time consumes the same deadline; expired entries never execute',async()=>{
 const queue=createPrusaImportQueue(),gate=deferred();const active=queue.run(()=>gate.promise,{deadline:Date.now()+2000});
 const expired=queue.run(()=>assert.fail('Expired task started'),{deadline:Date.now()+20});await assert.rejects(Promise.race([expired,delay(1000).then(()=>{throw new Error('Queue deadline did not fire');})]),/timed out while queued/);assert.equal(queue.state.pending,0);
 const deadline=Date.now()+500;let remaining;const waiting=queue.run(()=>{remaining=deadline-Date.now();},{deadline});await delay(40);gate.resolve();await Promise.all([active,waiting]);assert.ok(remaining<=470&&remaining>0,`Remaining timeout:${remaining}`);
});
test('actual import helper shares the global queue across callers and reduces child timeout after waiting',async()=>{
 const selection={printer:{},process:{},filament:{}},gate=deferred(),started=deferred();let calls=0,remaining;
 const active=importPrusaArchive(prusaFixture(),{selection,timeoutMs:2000,runNative:async()=>{started.resolve();await gate.promise;throw new Error('Finish active fixture');}});const activeFailure=assert.rejects(active,/Finish active fixture/);await started.promise;
 const controller=new AbortController(),aborted=importPrusaArchive(prusaFixture(),{selection,signal:controller.signal,runNative:async()=>{calls++;}});controller.abort();await assert.rejects(aborted,/cancelled while queued/);assert.equal(calls,0);
 const pending=importPrusaArchive(prusaFixture(),{selection,timeoutMs:500,runNative:async(_binary,_args,options)=>{remaining=options.timeoutMs;throw new Error('Finish pending fixture');}});const pendingFailure=assert.rejects(pending,/Finish pending fixture/);await delay(45);gate.resolve();await Promise.all([activeFailure,pendingFailure]);assert.ok(remaining>0&&remaining<470,`Child retained only${remaining}ms`);
});
