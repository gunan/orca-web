import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import path from 'node:path';
import {createNativeArrangeWorker} from '../../server/native-arrange-worker.js';
import {runSlicer} from '../../server/slicer.js';
const binary=process.env.ORCA_ARRANGE_WORKER_BIN||path.resolve('native/build/arrange/orca-arrange-worker');
const ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
test('prime tower reference and production helper match pinned original source and paired build provenance',async()=>{
 const manifest=JSON.parse(await readFile(path.join(path.dirname(binary),'build-manifest.json')));assert.equal(manifest.binarySha256,hash(await readFile(binary)));assert.equal(manifest.sourceManifest.commit,ref.sourceCommit);
 for(const[name,digest]of Object.entries(ref.sources))assert.equal(manifest.primeTowerSourceManifest.sources[name],digest,name);
 assert.equal(ref.referenceSourceSha256,hash(await readFile(new URL('../fixtures/native-prime-tower-reference.cpp',import.meta.url))));assert.equal(ref.referenceGeneratorSha256,hash(await readFile('scripts/reference/build-prime-tower-reference.py')));
 for(const name of ['native-prime-tower.cpp','native-tower-input.hpp','native-tower-plate.cpp','native-tower-plate.hpp']){const file=`native/arrange-worker/worker/${name}`;assert.equal(manifest.adapterSources[file],hash(await readFile(file)),file);}
});
for(const c of ref.cases)test(`original native tower containment, assignments and sizing: ${c.name}`,async t=>{
 const worker=createNativeArrangeWorker({binary});t.after(()=>worker.shutdown());const result=await worker.process(Buffer.from(JSON.stringify(c.request)),{signal:t.signal});
 const {format,version,sourceRevision,plateId,...actual}=result,{bands,...expected}=c.expected;assert.deepEqual(actual,expected);
});
test('native tower rejects malformed painting and plate/assignment bounds before invoking unsafe native readers',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'orca-tower-bounds-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const mutations=[r=>r.objects[0].parts[0].color={'0':'C'},r=>r.objects[0].parts[0].color={'99':'8'},r=>r.objects[0].parts[0].color={'0':'FC'},r=>r.plate.extruderAreas=[r.plate.shape,r.plate.shape],r=>r.plate.shape=[[0,0],[1,1],[2,2]],r=>r.objects[0].settings.enable_support='2',r=>r.objects[0].instances[0].matrix[15]=0,r=>r.placement=[NaN,0,0],r=>r.settings.layer_height='0'];
 for(const mutate of mutations){const r=structuredClone(ref.cases[0].request);mutate(r);const input=path.join(dir,'input.json'),output=path.join(dir,'output.json');await writeFile(input,JSON.stringify(r));await assert.rejects(()=>runSlicer(binary,[input,output],{signal:t.signal,timeoutMs:10000}));}
});
