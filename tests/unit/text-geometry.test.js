import test from 'node:test';
import assert from 'node:assert/strict';
import {testFont} from '../fixtures/text-font.js';
import {addTextToScene,createTextMesh,normalizeTextConfiguration,parseTextFont,textSurfaceAnchor} from '../../shared/text-geometry.js';
import {analyzeMesh,createMesh,meshBounds,transformPositions} from '../../shared/geometry.js';
import {placeSceneOnFace,updateSceneTransform} from '../../shared/scene-object-operations.js';
import {parseProject,serializeProject,emptyProject} from '../../shared/project.js';


function body(){const p=[0,0,0,20,0,0,20,20,0,0,0,0,20,20,0,0,20,0,0,0,20,20,20,20,20,0,20,0,0,20,0,20,20,20,20,20];return createMesh({id:'body',name:'Body',positions:p,plateId:'plate-1',filamentSlot:2});}

test('text outline counters remain closed and exact em scaling controls volume and dimensions',()=>{
  const font=parseTextFont(testFont().toArrayBuffer()),mesh=createTextMesh(font,{text:'O',size:10,depth:2,anchor:[20,20,0]});
  const report=analyzeMesh(mesh);assert.equal(report.manifold,true);assert.equal(report.volume,48);assert.deepEqual(meshBounds(mesh).size,[6,8,2]);assert.equal(report.connectedComponents,1);
  const doubled=createTextMesh(font,{text:'O',size:20,depth:2});assert.equal(analyzeMesh(doubled).volume,192);
  assert.throws(()=>createTextMesh(font,{text:'X'}),/no glyph/);
});
test('multiline text alignment, spacing and world-normal rotation are effective geometric operations',()=>{
  const font=testFont(),left=createTextMesh(font,{text:'OO',size:10,align:'left'}),spaced=createTextMesh(font,{text:'OO',size:10,charSpacing:2,align:'left'}),lines=createTextMesh(font,{text:'O\nO',size:10,lineSpacing:2});
  assert.equal(meshBounds(left).min[0],0);assert.equal(meshBounds(spaced).size[0]-meshBounds(left).size[0],2);assert.equal(meshBounds(lines).size[1],28);
  const side=createTextMesh(font,{text:'O',size:10,depth:2,normal:[1,0,0],anchor:[20,20,20]});assert.deepEqual(meshBounds(side).size,[2,8,6]);assert.equal(meshBounds(side).min[0],20);assert.equal(analyzeMesh(side).manifold,true);
});
test('emboss and engrave create coherent native groups, preserve existing part geometry, and edit in place through transforms',()=>{
  const font=testFont(),source=body(),placement=textSurfaceAnchor([source],source.id);assert.deepEqual(placement,{anchor:[10,10,20],normal:[0,0,1]});
  const added=addTextToScene({objects:[source],selectedId:source.id,font,options:{text:'O',mode:'emboss',size:10,depth:2,embed:.3,...placement}});assert.equal(added.objects.length,2);assert.equal(added.text.native.groupId,source.id);assert.equal(added.text.filamentSlot,2);assert.equal(added.text.native.partType,'normal_part');assert.ok(Math.abs(meshBounds(added.text).min[2]-19.7)<1e-5);assert.equal(meshBounds(added.text).max[2],22);
  const transformed=updateSceneTransform(added.objects,source.id,{position:[40,30,0],rotation:[0,0,30],scale:[1.5,.8,1]});const before=transformed.find(object=>object.id===source.id),text=transformed.find(object=>object.id===added.selectedId);
  const edited=addTextToScene({objects:transformed,selectedId:text.id,font,options:{...text.text,text:'OO',mode:'engrave'}});assert.equal(edited.text.id,text.id);assert.equal(edited.objects.length,2);assert.equal(edited.text.native.partType,'negative_part');assert.ok(edited.text.position.every(Number.isFinite));assert.deepEqual(edited.text.rotation,text.rotation);assert.deepEqual(transformPositions(edited.objects.find(object=>object.id===source.id)),transformPositions(before));assert.ok(edited.objects.every(object=>!object.native.groupTransform));
  const project={...emptyProject(),objects:edited.objects};assert.deepEqual(parseProject(serializeProject(project)).objects[1].text,edited.text.text);
});
test('text validation bounds workload and rejects invalid geometry parameters without silently substituting',()=>{
  for(const patch of [{text:''},{text:'O'.repeat(257)},{text:'O\n'.repeat(17)},{text:'O\u0000'},{depth:0},{size:Infinity},{anchor:[NaN,0,0]},{normal:[0,0,0]},{fontId:'../secret'},{charSpacing:-1},{version:2}])assert.throws(()=>normalizeTextConfiguration(patch));
  assert.throws(()=>addTextToScene({font:testFont(),options:{text:'O',mode:'engrave'}}),/normal non-text part/);
  assert.throws(()=>addTextToScene({font:testFont(),options:{text:'O',anchor:[0,0,0]},bed:{width:10,depth:10,height:10}}),/outside/);
  assert.throws(()=>parseTextFont(new Uint8Array(4)),/valid bundled font/);
});

test('text regeneration preserves placement after repeated object/part rebasing and face placement',()=>{
  const font=testFont(),source=body(),added=addTextToScene({objects:[source],selectedId:source.id,font,options:{text:'O',mode:'emboss',size:10,...textSurfaceAnchor([source],source.id)}});
  let objects=updateSceneTransform(added.objects,source.id,{position:[40,30,0],rotation:[0,0,30],scale:[1.5,.8,1]});
  const text=objects.find(object=>object.id===added.selectedId);objects=updateSceneTransform(objects,text.id,{position:text.position.map((value,index)=>value+(index===0?3:0))},{scope:'part'});objects=updateSceneTransform(objects,source.id,{rotation:[0,0,40]});
  for(const placed of [objects,placeSceneOnFace(objects,text.id,[0,0,1],{width:250,depth:210,height:220},{scope:'part'})]){const before=placed.find(object=>object.id===text.id),edited=addTextToScene({objects:placed,selectedId:before.id,font,options:before.text}).text,a=transformPositions(before),b=transformPositions(edited);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<2e-5,`Regenerated coordinate ${i} changed by ${a[i]-b[i]}`);}
});
