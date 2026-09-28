import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {importNative3MF} from '../../shared/native-project.js';
import {transformPositions,meshBounds} from '../../shared/geometry.js';
import {worldBrimEars} from '../../shared/brim-ears.js';
import {selectSceneIds,selectedSceneIds,sceneSelectionCount,multipleSelectionObject,transformMultipleSelection,duplicateMultipleSelection,removeMultipleSelection} from '../../shared/multi-selection.js';
const imported=importNative3MF(readFileSync(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
function fixture(){const project=structuredClone(imported),a=project.objects[0];a.id='a';a.position=[0,0,0];a.native.groupId='alpha';a.native.objectName='Alpha';a.painting={version:1,supports:{0:'4'}};a.brimEars=[{position:[0,0,0],radius:2}];const helper={...structuredClone(a),id:'hole',positions:a.positions.map(value=>value/3),native:{...a.native,partType:'negative_part'},painting:undefined,brimEars:undefined};const b={...structuredClone(a),id:'b',position:[30,0,0],native:{...a.native,groupId:'beta',objectName:'Beta'}},other={...structuredClone(b),id:'other',plateId:'other-plate'};delete helper.native.meshSource;project.plates.push({id:'other-plate',name:'Other'});project.objects=[a,helper,b,other];project.selectedId='a';return project;}
test('selection expands native objects, toggles whole groups, honors part scope and excludes other plates',()=>{
 const project=fixture();let selected=selectSceneIds(project,['a']);assert.deepEqual(selectedSceneIds(selected),['a','hole']);assert.equal(sceneSelectionCount(selected),1);
 selected=selectSceneIds(selected,['b'],{mode:'toggle'});assert.deepEqual(selectedSceneIds(selected),['a','hole','b']);assert.equal(sceneSelectionCount(selected),2);
 selected=selectSceneIds(selected,['hole'],{mode:'toggle'});assert.deepEqual(selectedSceneIds(selected),['b']);
 assert.deepEqual(selectedSceneIds(selectSceneIds(project,['hole'],{scope:'part'}),{scope:'part'}),['hole']);
 assert.throws(()=>selectSceneIds(project,['other']),/active plate/);assert.deepEqual(selectedSceneIds({...selected,selectedId:null}),[]);
 assert.deepEqual(selectedSceneIds({...selected,selectedId:'a'}),['a','hole'],'A separate single-selection command supersedes stale IDs');
});
test('joint affine edits preserve every group, painted facet and brim position with a stable numeric transform frame',()=>{
 const base=selectSceneIds(fixture(),['a','b']);const proxy=multipleSelectionObject(base),pivot=meshBounds(proxy).center;
 let result=transformMultipleSelection(base,{rotation:[0,0,90],scale:[2,1,1]});result=transformMultipleSelection(result,{position:[15,-3,2]});
 assert.deepEqual(result.objects.map(object=>object.native.groupId),base.objects.map(object=>object.native.groupId));assert.equal(result.objects[3],base.objects[3]);
 for(let index=0;index<3;index++){
  const before=transformPositions(base.objects[index]),after=transformPositions(result.objects[index]);
  for(let p=0;p<before.length;p+=3){const expected=[pivot[0]-(before[p+1]-pivot[1])+15,pivot[1]+2*(before[p]-pivot[0])-3,before[p+2]+2];for(let axis=0;axis<3;axis++)assert.ok(Math.abs(after[p+axis]-expected[axis])<1e-5);}
  assert.deepEqual(result.objects[index].painting,base.objects[index].painting);
 }
 const ear=worldBrimEars(base.objects[0])[0],moved=worldBrimEars(result.objects[0])[0];assert.deepEqual(moved.position.map(value=>Math.round(value*1e6)/1e6),[pivot[0]-(ear.position[1]-pivot[1])+15,pivot[1]+2*(ear.position[0]-pivot[0])-3,ear.position[2]+2]);
 const updatedProxy=multipleSelectionObject(result);assert.deepEqual(updatedProxy.position,[15,-3,2]);assert.deepEqual(updatedProxy.rotation,[0,0,90]);assert.deepEqual(updatedProxy.scale,[2,1,1]);
 assert.deepEqual(base.objects[0].position,[0,0,0]);assert.throws(()=>transformMultipleSelection(base,{scale:[1,0,1]}),/scale/);
});
test('duplicate and delete operate on distinct complete native groups in one result without cross-plate edits',()=>{
 const original=selectSceneIds(fixture(),['a','b']),cloned=duplicateMultipleSelection(original);assert.equal(cloned.objects.length,7);assert.equal(sceneSelectionCount(cloned),2);
 const copies=cloned.objects.filter(object=>cloned.selectedIds.includes(object.id));assert.equal(copies.length,3);assert.equal(new Set(copies.map(object=>object.native.groupId)).size,2);
 assert.deepEqual(copies.map(object=>object.native.partType),['normal_part','negative_part','normal_part']);
 const removed=removeMultipleSelection(cloned);assert.deepEqual(removed.objects,original.objects);assert.deepEqual(removed.selectedIds,[]);assert.equal(removed.selectedId,null);
 assert.throws(()=>removeMultipleSelection(selectSceneIds(fixture(),['a'],{scope:'part'}),{scope:'part'}),/helper without a normal part/);
 const wholeParts=selectSceneIds(fixture(),['a','hole'],{scope:'part'}),remaining=removeMultipleSelection(wholeParts,{scope:'part'});assert.deepEqual(remaining.objects.map(object=>object.id),['b','other']);
});

import {normalizeSelectionState,rectangleSceneSelection,centerMultipleSelection,dropMultipleSelection} from '../../shared/multi-selection.js';
import {parseProject,serializeProject} from '../../shared/project.js';
import {projectHasChanges} from '../../shared/project-state.js';
test('native rectangle membership retains an existing superset, replaces new hits, adds with control, and selects only modifier volumes',()=>{
 const selected=transformMultipleSelection(selectSceneIds(fixture(),['a','b']),{position:[1,2,3]});
 assert.equal(rectangleSceneSelection(selected,['a']),selected);
 assert.equal(rectangleSceneSelection(selected,[],{additive:true}),selected);
 assert.deepEqual(selectedSceneIds(rectangleSceneSelection(selected,[])),[]);
 const only=rectangleSceneSelection(selectSceneIds(fixture(),['b']),['hole']);assert.equal(only.selectionScope,'part');assert.deepEqual(only.selectedIds,['hole']);
 const replaced=rectangleSceneSelection(only,['b']);assert.deepEqual(replaced.selectedIds,['b']);assert.equal(replaced.selectionScope,'object');
 const added=rectangleSceneSelection(selectSceneIds(fixture(),['a']),['b'],{additive:true});assert.equal(sceneSelectionCount(added),2);
});
test('saved multiple selection and affine frame roundtrip; stale frame clears and invalid vectors or forged state reject',()=>{
 const original=transformMultipleSelection(selectSceneIds(fixture(),['a','b']),{rotation:[0,0,90],position:[2,3,0]}),parsed=parseProject(serializeProject(original));
 assert.deepEqual(parsed.selectedIds,original.selectedIds);assert.deepEqual(parsed.selectionFrame,original.selectionFrame);assert.deepEqual(multipleSelectionObject(parsed).position,[2,3,0]);
 const stale={...original,selectedIds:['b'],selectedId:'b'};assert.equal(normalizeSelectionState(stale).selectionFrame,null);
 assert.deepEqual(normalizeSelectionState({...original,selectedId:null}).selectedIds,[]);
 assert.deepEqual(normalizeSelectionState({...original,selectedId:'a',selectedIds:['a','other','missing']}).selectedIds,['a','hole']);
 for(const mutate of [p=>p.selectedIds='a',p=>p.selectedIds=['a','a'],p=>p.selectionScope='global',p=>p.selectionFrame.scale=[1,0,1],p=>p.selectionFrame.pivot=[Infinity,0,0],p=>p.selectionFrame.ids='all']){const project=structuredClone(original);mutate(project);assert.throws(()=>parseProject(JSON.stringify(project)),/selection|pivot|scale|frame/);}
 const clean=fixture();assert.equal(projectHasChanges(selectSceneIds(clean,['a','b']),clean),false);assert.equal(projectHasChanges(original,clean),true);
});
test('batch center and drop translate jointly using normal surfaces, preserve spacing and do not change another plate',()=>{
 let selected=selectSceneIds(fixture(),['a','b']);selected=transformMultipleSelection(selected,{position:[0,0,7]});const bed={width:200,depth:160,height:200};
 const result=dropMultipleSelection(centerMultipleSelection(selected,bed),bed),a=meshBounds(result.objects[0]),b=meshBounds(result.objects[2]);
 assert.equal(a.min[2],0);assert.equal(b.min[2],0);assert.equal(b.center[0]-a.center[0],30);assert.equal((a.center[0]+b.center[0])/2,100);assert.equal(a.center[1],80);assert.equal(result.objects[3],selected.objects[3]);
});

import {testFont} from '../fixtures/text-font.js';
import {addTextToScene} from '../../shared/text-geometry.js';
test('batch edits retain editable text source placement and native object-owned brim anchors under part scope',()=>{
 const base=fixture(),font=testFont(),added=addTextToScene({objects:base.objects,selectedId:'a',font,options:{text:'O',mode:'emboss',size:6,depth:1,anchor:[10,10,20],normal:[0,0,1]}});
 let selected=selectSceneIds({...base,objects:added.objects},['a','b']),moved=transformMultipleSelection(selected,{rotation:[0,0,90],scale:[1.2,.8,1],position:[12,3,0]});
 const text=moved.objects.find(object=>object.id===added.selectedId),regenerated=addTextToScene({objects:moved.objects,selectedId:text.id,font,options:{...text.text}}).text;
 const before=transformPositions(text),after=transformPositions(regenerated);assert.equal(after.length,before.length);before.forEach((value,index)=>assert.ok(Math.abs(value-after[index])<1e-5));assert.equal(text.text.text,'O');assert.deepEqual(moved.objects[0].painting,base.objects[0].painting);
 const part=selectSceneIds(base,['a','b'],{scope:'part'}),partMoved=transformMultipleSelection(part,{position:[3,2,1]},{scope:'part'});
 assert.deepEqual(worldBrimEars(partMoved.objects[0]),worldBrimEars(base.objects[0]),'Part transforms leave native object-owned brim anchors in place');
});
