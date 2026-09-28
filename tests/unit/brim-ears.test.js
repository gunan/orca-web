import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Matrix4} from 'three';
import {strFromU8,unzipSync} from 'fflate';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {BRIM_EARS_PATH,normalizeBrimEars,readBrimEars,writeBrimEars,groupBrimEars,updateBrimEars,worldBrimEars,transformBrimEars} from '../../shared/brim-ears.js';
import {duplicateSceneSelection,updateSceneTransform,placeSceneOnFace,removeSceneSelection} from '../../shared/scene-object-operations.js';
import {meshBounds} from '../../shared/geometry.js';
import {mirrorMesh,cutMesh} from '../../shared/geometry-cut.js';
const fixture=await readFile('tests/fixtures/orca-2.4.2-cube.3mf');
const close=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} versus ${b}`);
test('brim ear metadata rejects malformed, duplicate and unsupported native records',()=>{
 const ears=[{position:[1,2,0],radius:5}];assert.deepEqual(readBrimEars(writeBrimEars([[],ears])).get(2),ears);
 for(const value of ['brim_points_format_version=1\nobject_id=1|1 2 0 5','object_id=1|1 2 0','object_id=1|1 2 0 -1','object_id=1|1 2 0 5\nobject_id=1|2 3 0 4','object_id=0|1 2 0 5','object_id=1|Infinity 2 0 5'])assert.throws(()=>readBrimEars(value));
 assert.throws(()=>normalizeBrimEars(Array(1025).fill(ears[0])));
});
test('native ears round trip by model index with plate offsets and object transforms',()=>{
 let project=importNative3MF(fixture),object=project.objects[0],box=meshBounds(object);
 project.objects=updateBrimEars(project.objects,object.id,[{position:[box.min[0],box.min[1],0],radius:5}]);
 project.objects=duplicateSceneSelection(project.objects,object.id,{offset:[20,30,0]}).objects;
 project.plates.push({id:'second',name:'Second'});project.objects[1].plateId='second';
 const bytes=exportNative3MF(project),entries=unzipSync(bytes),data=readBrimEars(strFromU8(entries[BRIM_EARS_PATH]));assert.equal(data.size,2);
 const imported=importNative3MF(bytes);assert.equal(imported.objects.length,2);
 for(let i=0;i<2;i++)worldBrimEars(imported.objects[i])[0].position.forEach((value,a)=>close(value,worldBrimEars(project.objects[i])[0].position[a]));
 assert.equal(imported.objects[0].native.objectSettings.brim_type,'painted');
});
test('ears follow grouped rebasing, mirror and placement while their diameter stays fixed',()=>{
 let project=importNative3MF(fixture),object=project.objects[0],box=meshBounds(object),ears=[{position:[box.min[0],box.min[1],0],radius:5}];
 project.objects=updateBrimEars(project.objects,object.id,ears);
 project.objects=updateSceneTransform(project.objects,object.id,{position:[10,20,0],scale:[2,2,1]});
 const before=worldBrimEars(project.objects[0])[0];assert.equal(before.radius,5);
 const modifier=structuredClone(project.objects[0]);modifier.id='helper';modifier.native.partType='modifier_part';delete modifier.brimEars;project.objects.push(modifier);
 project.objects=updateSceneTransform(project.objects,object.id,{rotation:[0,0,90]});
 const groupCenter=meshBounds({...object,position:[10,20,0],scale:[2,2,1]}).center,after=groupBrimEars(project.objects,object.id)[0];
 close(after.position[0],groupCenter[0]-(before.position[1]-groupCenter[1]));close(after.position[1],groupCenter[1]+before.position[0]-groupCenter[0]);
 const mirrored=mirrorMesh(project.objects[0],'x'),bounds=meshBounds(project.objects[0]);close(worldBrimEars(mirrored)[0].position[0],2*bounds.center[0]-after.position[0]);
 const cut=cutMesh(project.objects[0],{normal:[0,0,1],offset:box.center[2]});assert.equal(cut.upper.brimEars,undefined);
 const placed=placeSceneOnFace([project.objects[0]],object.id,[0,0,-1],{width:250,depth:210,height:250});close(worldBrimEars(placed[0])[0].position[0],after.position[0]);
});

test('part edits and deletion preserve object-level ears while part copies do not duplicate them',()=>{
 const project=importNative3MF(fixture),original=project.objects[0];let objects=updateBrimEars(project.objects,original.id,[{position:[0,0,0],radius:5}]);
 const second=structuredClone(objects[0]);second.id='second';delete second.brimEars;second.position=[20,0,0];objects.push(second);
 objects=updateSceneTransform(objects,original.id,{rotation:[0,0,90]});const before=groupBrimEars(objects,original.id);
 objects=updateSceneTransform(objects,original.id,{position:[12,4,0]},{scope:'part'});assert.deepEqual(groupBrimEars(objects,original.id),before);
 const copied=duplicateSceneSelection(objects,original.id,{scope:'part'});assert.equal(copied.objects.at(-1).brimEars,undefined);
 objects=removeSceneSelection(objects,original.id,{scope:'part'});const after=groupBrimEars(objects,'second');after[0].position.forEach((value,a)=>close(value,before[0].position[a]));
});
