import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{Matrix4}from'three';
import{cutPartsCases,cutPartsFixture}from'../fixtures/cut-to-parts-project.js';
import{prepareNativeCutToParts,validateNativeCutToPartsResult,applyNativeCutToParts,CUT_PARTS_LIMITS}from'../../shared/native-cut-to-parts.js';
import{nativeBed,exportNative3MF,importNative3MF}from'../../shared/native-project.js';import{meshBounds,analyzeMesh}from'../../shared/geometry.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/cut-to-parts-reference.json',import.meta.url)));
function response(prepared,index){const e=reference.cases[index].expected,r=prepared.request;let sourceIndex=-1,previous='';return{format:'orca-native-cut-to-parts',version:1,sourceRevision:reference.sourceCommit,selectedInstanceId:r.selectedInstanceId,minimumZBeforeGrounding:e.minimumZBeforeGrounding,minimumZAfterGrounding:e.minimumZAfterGrounding,instances:r.instances.map((v,i)=>({...v,matrix:e.instances[i]})),parts:e.parts.map(p=>{const name=p.type==='normal_part'?p.name.slice(0,-2):p.name;if(name!==previous){sourceIndex++;previous=name;}return{sourceId:r.sourceParts[sourceIndex].id,name:p.name,type:p.type,fromUpper:p.fromUpper,vertices:p.rawVertices,triangles:p.triangles,matrix:p.matrix};})};}
for(const[index,c]of cutPartsCases.entries())test(`original Cut to parts result applies atomically: ${c.name}`,()=>{
 const{project,prepared}=cutPartsFixture(c),before=structuredClone(project),value=response(prepared,index),out=applyNativeCutToParts(prepared,value),e=reference.cases[index].expected;
 assert.equal(out.created.length,e.parts.length*e.instances.length);assert.equal(new Set(out.created.map(p=>p.native.instanceFamily)).size,1);assert.deepEqual(out.created.slice(0,e.parts.length).map(p=>p.name),e.parts.map(p=>p.name));assert.deepEqual(out.report.origins.map(p=>p.side),e.parts.map(p=>p.type!=='normal_part'?'modifier':p.fromUpper?'upper':'lower'));
 assert.deepEqual(out.created.slice(0,e.parts.length).map(p=>p.native.partType),e.parts.map(p=>p.type));assert.ok(out.created.every(p=>analyzeMesh(p).manifold));assert.ok(out.created.every(p=>p.native.objectSettings.wall_loops==='3'));assert.deepEqual(project,before);
 const restored=importNative3MF(exportNative3MF({...project,objects:out.objects}));assert.equal(restored.objects.length,out.created.length);assert.equal(new Set(restored.objects.map(p=>p.native.instanceFamily)).size,1);assert.deepEqual(restored.objects.map(meshBounds),out.created.map(meshBounds));
 if(index===0)assert.deepEqual(out.created.map(p=>[meshBounds(p).min[2],meshBounds(p).max[2]]),[[5,10],[0,5]]);
});
test('Cut to parts rejects incompatible controls and invalid planes before native work',()=>{
 const{project,normal,offset}=cutPartsFixture(cutPartsCases[1]),input={objects:project.objects,plates:project.plates,selectedId:project.selectedId,bed:nativeBed(project.nativeSettings)},before=structuredClone(project);
 for(const option of [{keep:'upper'},{connectors:[{}]},{mode:'dovetail'},{upper:{flip:true}},{lower:{placeOnCut:true}},{normal:[0,0,0]},{normal:[NaN,0,1]},{offset:Infinity}])assert.throws(()=>prepareNativeCutToParts(input,{normal,offset,...option}));assert.deepEqual(project,before);
});
test('native output validation rejects identity, reordering, lost modifiers and unbounded geometry',()=>{
 const{prepared}=cutPartsFixture(cutPartsCases[3]),good=response(prepared,3);
 for(const mutate of [v=>v.sourceRevision='wrong',v=>v.selectedInstanceId='unknown',v=>v.parts.reverse(),v=>v.parts.shift(),v=>v.parts[0].matrix[0]=NaN,v=>v.parts[0].vertices[0][0]=1e7,v=>v.parts[0].triangles[0][0]=-1,v=>v.parts[0].sourceId='unknown',v=>v.parts[1].name='wrong',v=>v.instances[0].autoDrop='yes',v=>v.parts[0].matrix=new Matrix4().makeScale(0,1,1).toArray()]){const value=structuredClone(good);mutate(value);assert.throws(()=>validateNativeCutToPartsResult(value,prepared.request));}
 assert.equal(validateNativeCutToPartsResult(good,prepared.request),good);assert.equal(CUT_PARTS_LIMITS.resultTriangles,1000000);
});
test('native geometry keeps full source frames and strips topology-dependent painting only on the returned transaction',()=>{
 const{project}=cutPartsFixture(cutPartsCases[1]);for(const part of project.objects){part.painting={version:1,support:{0:'1'},seam:{},color:{}};part.brimEars=[{position:meshBounds(part).center,radius:2}];part.native.layerHeightProfile=[0,.2,10,.2];part.native.partSettings={wall_loops:'5'};}
 const prepared=prepareNativeCutToParts({objects:project.objects,plates:project.plates,selectedId:project.selectedId,bed:nativeBed(project.nativeSettings)},{normal:[0,0,1],offset:10}),before=structuredClone(project),out=applyNativeCutToParts(prepared,response(prepared,1));
 assert.ok(out.created.every(p=>p.painting===undefined&&p.brimEars===undefined));assert.ok(out.created.every(p=>p.native.partSettings.wall_loops==='5'));assert.ok(out.created.every(p=>p.native.layerHeightProfile.length===4));assert.deepEqual(project,before);assert.equal(out.report.resetLayerProfiles,0);
});

import {createHash} from 'node:crypto';
test('captured Cut oracle retains pinned source, independently rebuilt generator and exact fixture inputs',async()=>{
 assert.equal(reference.sourceCommit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');
 const generator=await readFile(new URL('../../scripts/reference/build-cut-parts-reference.py',import.meta.url));assert.equal(createHash('sha256').update(generator).digest('hex'),reference.referenceGeneratorSha256);
 const source=JSON.parse(await readFile(new URL('../../native/arrange-worker/cut-parts-source-hashes.json',import.meta.url)));assert.deepEqual(reference.sources,source.sources);
 assert.match(reference.productionBinarySha256,/^[a-f0-9]{64}$/);assert.match(reference.referenceBinarySha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(reference.cases.map(c=>c.input),cutPartsCases.map(c=>cutPartsFixture(c).input));
});
