import test from 'node:test';
import assert from 'node:assert/strict';
import { createMesh,meshBounds,transformPositions,analyzeMesh } from '../../shared/geometry.js';
import { arrangeSceneObjects,centerSceneSelection,dropSceneSelection,duplicateSceneSelection,normalizeSceneGroupFrame,placeSceneOnFace,removeSceneSelection,sceneSelectionObject,updateSceneTransform } from '../../shared/scene-object-operations.js';
import { mirrorNativeGroup,cutNativeGroup } from '../../shared/geometry-cut.js';
import { sceneMaterialState } from '../../src/scene-material.js';

function cube(id,position=[0,0,0],native){const v=[[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,20],[20,0,20],[20,20,20],[0,20,20]],f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];return createMesh({id,name:id,positions:f.flatMap(face=>face.flatMap(i=>v[i])),position,plateId:'plate',native});}
function fixture(){const native={groupId:'object',objectName:'Assembly',partType:'normal_part',objectSettings:{wall_loops:'4'},partSettings:{}};return[cube('body',[0,0,0],native),{...cube('hole',[0,0,0],{...native,partType:'negative_part'}),scale:[.4,.4,1.1]},cube('other',[70,0,0],{...native,groupId:'other',objectName:'Other'})];}
const world=object=>Array.from(transformPositions(object)),close=(a,b)=>assert.ok(Math.abs(a-b)<2e-4,`${a} ≈ ${b}`),same=(a,b)=>{assert.equal(a.length,b.length);a.forEach((value,index)=>close(value,b[index]));};
const bed={width:250,depth:210,height:220};

test('object transform proxy uses a common pivot and keeps every native part aligned',()=>{
  const original=fixture(),before=JSON.stringify(original),proxy=sceneSelectionObject(original,'hole');assert.equal(proxy.name,'Assembly');assert.deepEqual(proxy.position,[0,0,0]);assert.deepEqual(proxy.sceneGroupIds,['body','hole']);
  const changed=updateSceneTransform(original,'hole',{position:[30,40,5],rotation:[0,0,90],scale:[2,1,1]});
  for(let i=0;i<2;i++){const points=world(original[i]),expected=[];for(let j=0;j<points.length;j+=3)expected.push(10-(points[j+1]-10)+30,10+(points[j]-10)*2+40,points[j+2]+5);same(world(changed[i]),expected);close(analyzeMesh(changed[i]).volume,analyzeMesh(original[i]).volume*2);}
  assert.equal(changed[2],original[2]);assert.deepEqual(sceneSelectionObject(changed,'body').rotation,[0,0,90]);assert.deepEqual(sceneSelectionObject(changed,'body').position,[30,40,5]);assert.equal(JSON.stringify(original),before);
  const serialized=JSON.parse(JSON.stringify(changed));same(world(sceneSelectionObject(serialized,'hole')),world(sceneSelectionObject(changed,'hole')));
});

test('explicit part edits preserve other world surfaces and clear the obsolete shared frame',()=>{
  const group=updateSceneTransform(fixture(),'body',{position:[30,40,5],rotation:[0,0,45]});
  const hole=group[1],changed=updateSceneTransform(group,'hole',{position:hole.position.map((value,index)=>value+(index===0?3:0))},{scope:'part'});
  same(world(changed[0]),world(group[0]));same(world(changed[1]),world(group[1]).map((value,index)=>value+(index%3===0?3:0)));
  assert.equal(changed[1].position[0],hole.position[0]+3);assert.deepEqual(changed[1].rotation,hole.rotation);assert.equal(changed[0].native.groupTransform,undefined);assert.equal(changed[1].native.groupTransform,undefined);assert.equal(changed[1].native.partType,'negative_part');
  assert.throws(()=>updateSceneTransform(group,'body',{scale:[0,1,1]}),/scale/);assert.throws(()=>normalizeSceneGroupFrame({version:1,pivot:[0,0,0],position:[NaN,0,0],rotation:[0,0,0],scale:[1,1,1]}),/position/);
});

test('object duplication gives an independent group and part duplication intentionally stays grouped',()=>{
  const source=updateSceneTransform(fixture(),'body',{rotation:[0,0,35],position:[20,20,0]});
  const duplicate=duplicateSceneSelection(source,'hole',{offset:[30,5,0]}),copies=duplicate.objects.slice(source.length);assert.equal(copies.length,2);assert.notEqual(copies[0].native.groupId,source[0].native.groupId);assert.equal(copies[0].native.groupId,copies[1].native.groupId);assert.equal(duplicate.selectedId,copies[1].id);
  for(let i=0;i<2;i++)same(world(copies[i]),world(source[i]).map((value,index)=>value+[30,5,0][index%3]));
  const part=duplicateSceneSelection(source,'hole',{scope:'part',offset:[2,0,0]});assert.equal(part.objects.length,source.length+1);assert.equal(part.objects.at(-1).native.groupId,source[1].native.groupId);assert.equal(part.objects.at(-1).native.partType,'negative_part');same(world(part.objects[0]),world(source[0]));
  assert.equal(removeSceneSelection(source,'hole').length,1);assert.throws(()=>removeSceneSelection(source,'body',{scope:'part'}),/without a normal part/);assert.equal(removeSceneSelection(source,'hole',{scope:'part'}).length,2);
});

test('arrange, center, drop and place-on-face move whole groups without shifting negative volumes independently',()=>{
  const source=fixture(),arranged=arrangeSceneObjects(source,bed,{gap:12,margin:10});
  const bodyDelta=meshBounds(arranged[0]).center.map((value,index)=>value-meshBounds(source[0]).center[index]),holeDelta=meshBounds(arranged[1]).center.map((value,index)=>value-meshBounds(source[1]).center[index]);same(bodyDelta,holeDelta);
  assert.ok(meshBounds(arranged[2]).min[0]-meshBounds(arranged[0]).max[0]>=12-1e-5);assert.equal(meshBounds(arranged[0]).min[2],0);close(meshBounds(arranged[1]).min[2],-1);
  let shifted=updateSceneTransform(source,'body',{position:[25,30,7]});shifted=centerSceneSelection(shifted,'hole',bed);shifted=dropSceneSelection(shifted,'hole',bed);same(meshBounds(shifted[0]).center,[125,105,10]);close(meshBounds(shifted[1]).min[2],-1);
  const turned=placeSceneOnFace(source,'body',[1,0,0],bed);assert.ok(turned.slice(0,2).every(object=>analyzeMesh(object).manifold));close(meshBounds(turned[0]).min[2],0);assert.deepEqual(meshBounds(turned[1]).size.map(value=>Math.round(value)),[22,8,8]);
});

test('mirror and cut invalidate baked group frames while preserving native roles and settings',()=>{
  const source=updateSceneTransform(fixture(),'body',{position:[20,30,0],rotation:[0,0,90]});const mirrored=mirrorNativeGroup(source,'body','x');assert.equal(mirrored[0].native.groupTransform,undefined);assert.equal(mirrored[1].native.groupTransform,undefined);assert.equal(mirrored[1].native.partType,'negative_part');
  const cut=cutNativeGroup(source,'body',{offset:10});assert.ok(cut.created.every(object=>object.native.groupTransform===undefined));assert.ok(cut.created.every(object=>object.native.objectSettings.wall_loops==='4'));
});

test('native volume roles use translucent materials while normal parts retain filament colors',()=>{
  assert.deepEqual(sceneMaterialState({filamentSlot:2},{filamentColor:'#112233'}),{role:'normal_part',color:'#112233',opacity:1,transparent:false,depthWrite:true,depthTest:true,renderOrder:0});
  const colors=new Set();for(const partType of ['negative_part','modifier_part','support_enforcer','support_blocker']){const material=sceneMaterialState({native:{partType}},{filamentColor:'#112233'});assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);assert.equal(material.depthTest,false);assert.ok(material.opacity>0&&material.opacity<1);colors.add(material.color);}assert.equal(colors.size,4);
});
