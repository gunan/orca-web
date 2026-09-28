import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createNativeArrangeWorker} from '../../server/native-arrange-worker.js';
import {prepareNativeImportInspection,IMPORT_INSPECTION_REVISION} from '../../shared/native-import-inspection.js';
import {emptyVolumeFixture} from '../fixtures/import-inspection-project.js';
async function worker(t){const tempRoot=await mkdtemp(path.join(tmpdir(),'orca-inspection-worker-test-')),w=createNativeArrangeWorker({binary:path.resolve('tests/fixtures/fake-arrange-worker.mjs'),tempRoot});t.after(async()=>{await w.shutdown();assert.deepEqual(await readdir(tempRoot),[]);await rm(tempRoot,{recursive:true,force:true});});return w;}
const request=()=>{const r=prepareNativeImportInspection(emptyVolumeFixture()).request;return{...r,fixtureResult:{format:'orca-native-import-inspection',version:1,sourceRevision:IMPORT_INSPECTION_REVISION,objects:[{id:'model-0',volume:8000},{id:'model-1',volume:0}],retainedIds:['model-0'],removedCount:1,unitSuggestion:'none'}};};
test('native inspection transport validates replayed model removals and removes request files',async t=>{const w=await worker(t),r=request(),result=await w.process(Buffer.from(JSON.stringify(r)));assert.equal(result.removedCount,1);assert.deepEqual(result.retainedIds,['model-0']);await assert.rejects(w.process(Buffer.from(JSON.stringify({...r,fixtureMode:'INVALID'}))),/Invalid native import/);});
test('inspection transport cancellation reaches active and queued requests and accepts a later valid request',async t=>{const w=await worker(t),a=new AbortController(),b=new AbortController(),bytes=Buffer.from(JSON.stringify({...request(),fixtureMode:'WAIT'}));const first=assert.rejects(w.process(bytes,{signal:a.signal}),/cancelled/),second=assert.rejects(w.process(bytes,{signal:b.signal}),/cancelled/);b.abort();a.abort();await Promise.all([first,second]);assert.equal((await w.process(Buffer.from(JSON.stringify(request())))).removedCount,1);});
