import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{primeTowerAxisProjection}from'../../shared/prime-tower-gizmo.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-tower-gizmo-reference.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
test('tower gizmo reference is bound to original source and native movement restrictions',async()=>{
 assert.equal(ref.sourceCommit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');assert.equal(ref.referenceSourceSha256,sha(await readFile('tests/fixtures/native-tower-gizmo-reference.cpp')));assert.equal(ref.generatorSha256,sha(await readFile('scripts/reference/build-tower-gizmo-reference.py')));assert.deepEqual(ref.towerTools,{axes:[true,true,false],move:true,rotate:false,scale:false});
});
for(const c of ref.cases)test(`native move projection: ${c.name}`,()=>{const result=primeTowerAxisProjection(c.request);assert.ok(Math.abs(result-c.expected)<1e-10,`${result} versus ${c.expected}`);if(c.request.shift)assert.equal(result,c.expected);});
test('invalid or degenerate camera rays are rejected',()=>{for(const request of[{},{center:[0,0,0],handle:[1,0,0],ray:[[0,0,0],[0,0,0]]},{...ref.cases[0].request,snapStep:0}])assert.throws(()=>primeTowerAxisProjection(request));});
