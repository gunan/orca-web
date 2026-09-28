import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import path from 'node:path';
import {createNativeArrangeWorker} from '../../server/native-arrange-worker.js';
import {prepareNativePrimeTower,validateNativePrimeTowerResult} from '../../shared/native-prime-tower.js';
import {towerIdentityCases} from '../fixtures/native-tower-identity-input.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url))),{bands,...expected}=ref.cases[0].expected;
for(const c of towerIdentityCases())test(`legal identities retain the exact original two-material tower: ${c.name}`,async t=>{
 const request=prepareNativePrimeTower(c.project,c.settings),worker=createNativeArrangeWorker({binary:process.env.ORCA_ARRANGE_WORKER_BIN||path.resolve('native/build/arrange/orca-arrange-worker')});t.after(()=>worker.shutdown());
 const result=await worker.process(Buffer.from(JSON.stringify(request)),{signal:t.signal});validateNativePrimeTowerResult(result,request);const{format,version,sourceRevision,plateId,...actual}=result;assert.deepEqual(actual,expected);assert.equal(plateId,c.project.activePlateId);
});
