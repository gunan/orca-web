import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import {createHash}from'node:crypto';import path from'node:path';
import {createNativeArrangeWorker} from '../../server/native-arrange-worker.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-tower-drag-reference.json',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const binary=process.env.ORCA_ARRANGE_WORKER_BIN||path.resolve('native/build/arrange/orca-arrange-worker');
test('tower drag reference preserves original-source provenance and matching helper adapter',async()=>{
 assert.equal(ref.referenceSourceSha256,hash(await readFile('tests/fixtures/native-tower-drag-reference.cpp')));assert.equal(ref.referenceGeneratorSha256,hash(await readFile('scripts/reference/build-tower-drag-reference.py')));
 const m=JSON.parse(await readFile(path.join(path.dirname(binary),'build-manifest.json')));assert.equal(m.binarySha256,hash(await readFile(binary)));assert.equal(m.sourceManifest.commit,ref.sourceCommit);const name='native/arrange-worker/worker/native-prime-tower.cpp';assert.equal(m.adapterSources[name],hash(await readFile(name)));assert.equal(m.primeTowerSourceManifest.sources['src/libslic3r/GCode/WipeTower.cpp'],ref.wipeTowerSourceSha256);
});
for(const c of ref.cases)test(`native tower drag context: ${c.name}`,async t=>{
 const worker=createNativeArrangeWorker({binary});t.after(()=>worker.shutdown());const {displacements,...request}=c.request,result=await worker.process(Buffer.from(JSON.stringify(request)),{signal:t.signal});const{format,version,sourceRevision,plateId,...actual}=result,{bands,translations,...expected}=c.expected;assert.deepEqual(actual,expected);
});
