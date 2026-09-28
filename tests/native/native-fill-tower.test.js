import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Matrix4} from 'three';
import {fillTowerCases} from '../fixtures/native-fill-tower-input.js';
import {validateNativeFillBedResult} from '../../shared/native-fill-bed.js';
const binary=path.resolve('native/build/arrange/orca-arrange-worker'),exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const reference=JSON.parse(await readFile(new URL('../fixtures/native-fill-tower-reference.json',import.meta.url)));
async function run(request){const dir=await mkdtemp(path.join(tmpdir(),'native-fill-tower-'));try{await writeFile(path.join(dir,'in.json'),JSON.stringify(request));await exec(binary,[path.join(dir,'in.json'),path.join(dir,'out.json')],{timeout:60000,maxBuffer:65536});return JSON.parse(await readFile(path.join(dir,'out.json')));}finally{await rm(dir,{recursive:true,force:true});}}
test('Fill tower oracle uses pinned original viewport/Fill source and matching adapter provenance',async()=>{
 const manifest=JSON.parse(await readFile('native/build/arrange/build-manifest.json'));
 assert.equal(sha(await readFile(binary)),manifest.binarySha256);
 for(const [file,hash] of Object.entries(manifest.adapterSources))assert.equal(sha(await readFile(file)),hash,file);
 assert.deepEqual(reference.viewport,JSON.parse(await readFile('native/arrange-worker/fill-tower-source-hashes.json')));
 assert.deepEqual(reference.fill,JSON.parse(await readFile('native/arrange-worker/fill-source-hashes.json')));
 for(const [file,hash] of [['tests/fixtures/native-fill-tower-reference.cpp',reference.referenceSourceSha256],['native/arrange-worker/scripts/build-fill-reference.py',reference.generatorSha256],['native/arrange-worker/scripts/fill-tower-reference.cpp.in',reference.templateSha256],['scripts/reference/capture-fill-tower.mjs',reference.captureSha256]])assert.equal(sha(await readFile(file)),hash,file);
 assert.deepEqual(JSON.parse(JSON.stringify(fillTowerCases())),reference.cases.map(({name,request})=>({name,request})));
});
for(const fixture of reference.cases)test(`native Fill tower matches original GUI footprint, packing and every instance: ${fixture.name}`,async()=>{
 const result=validateNativeFillBedResult(await run(fixture.request),fixture.request),expected=fixture.expected;
 assert.equal(result.added,expected.added);assert.equal(result.requiresArrange,expected.requiresArrange);
 assert.deepEqual(result.diagnostics.tower,expected.tower);
 assert.deepEqual(result.diagnostics.placements,expected.placements);
 assert.deepEqual(result.instances.map(i=>i.matrix),expected.frames);
 if(fixture.name.includes('float grid'))assert.equal(result.diagnostics.path,'native-float-grid');
});
for(const fixture of reference.cases)test(`native Arrange retains the existing original viewport obstacle: ${fixture.name}`,async()=>{
 const input=fixture.request,origin=input.plate.origin,objects=input.objects.flatMap(object=>object.instances.filter(i=>i.plateId===input.towerPreview.plateId).map(instance=>({...object,id:instance.id,matrix:new Matrix4().makeTranslation(-origin[0],-origin[1],0).multiply(new Matrix4().fromArray(instance.matrix)).toArray(),selected:true})));
 const result=await run({format:'orca-arrangement-request',version:1,sourceRevision:input.sourceRevision,objects,settings:input.settings,options:input.options,towerPreview:input.towerPreview,towerPlateIndex:input.plate.index});
 if(fixture.expected.tower){assert.equal(result.primeTower.source,'native-viewport');assert.deepEqual(result.primeTower.footprint,fixture.expected.tower);}
 else assert.equal(result.primeTower,null);
 assert.equal(result.objects.length,objects.length);
});
test('native Fill rejects malformed, missing and oversized tower context before packing',async()=>{
 const base=reference.cases[0].request;
 for(const [edit,error] of [
  [r=>delete r.towerPreview,/viewport tower footprint context/],
  [r=>r.towerPreview.plate.origin[0]+=1,/plate origin differs/],
  [r=>r.towerPreview.objects[0].parts[0].triangles[0][0]=9999,/triangle index/],
  [r=>{r.towerPreview.settings.prime_tower_width='500';},/exceeds the plate/],
  [r=>r.settings.prime_tower_brim_width='1000',/exceeds the plate/]
 ]){const request=structuredClone(base);edit(request);await assert.rejects(run(request),error);}
});
