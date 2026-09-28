import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { inspectSlicer,runSlicer } from '../../server/slicer.js';
import { createNativeProjectService } from '../../server/native-projects.js';
import { importNative3MF } from '../../shared/native-project.js';
import { arrangeSceneObjects,duplicateSceneSelection,updateSceneTransform } from '../../shared/scene-object-operations.js';
import { meshBounds } from '../../shared/geometry.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';
import { fixtureCatalog } from '../fixtures/native-project-catalog.js';

test('native slicing keeps negative volumes aligned after grouped scale, rotation, duplication and arrangement',{timeout:120000},async t=>{
  const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer'),engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);
  const directory=await mkdtemp(path.join(tmpdir(),'orca-native-groups-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),service=createNativeProjectService({catalog:fixtureCatalog(base)}),project=makeNativeAcceptanceProject(base);project.objects=project.objects.slice(0,3);project.plates=project.plates.slice(0,1);
  project.objects=updateSceneTransform(project.objects,'base',{rotation:[0,0,90],scale:[1.5,.5,1]});project.objects=duplicateSceneSelection(project.objects,'base',{offset:[60,0,0]}).objects;project.objects=arrangeSceneObjects(project.objects,{width:250,depth:210,height:220},{gap:15,margin:30});
  const prepared=await service.prepare({project,useEmbeddedSettings:true}),input=path.join(directory,'model.3mf');await writeFile(input,prepared.bytes);await mkdir(path.join(directory,'config'));await mkdir(path.join(directory,'output'));
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--outputdir',path.join(directory,'output'),input],{cwd:directory,timeoutMs:60000,signal:t.signal});
  const code=await readFile(path.join(directory,'output','plate_1.gcode'),'utf8');
  const holes=new Map(project.objects.filter(object=>object.native.partType==='negative_part').map(object=>[object.native.objectName,meshBounds(object)])),counts=new Map();
  assert.equal(holes.size,2);let current='',previous=[0,0];
  for(const line of code.split(/\r?\n/)){
    if(line.startsWith('; printing object '))current=line.slice(18).split(' id:')[0];if(line.startsWith('; stop printing object '))current='';if(!/^G[01]\s/.test(line))continue;
    const x=line.match(/\bX([-+.\d]+)/),y=line.match(/\bY([-+.\d]+)/),e=line.match(/\bE([-+.\d]+)/),point=[x?Number(x[1]):previous[0],y?Number(y[1]):previous[1]],hole=holes.get(current);
    if(hole&&e&&Number(e[1])>0&&(x||y)){counts.set(current,(counts.get(current)||0)+1);for(const f of [.25,.5,.75]){const sample=point.map((value,axis)=>previous[axis]+(value-previous[axis])*f);assert.ok(!sample.every((value,axis)=>value>hole.min[axis]+.7&&value<hole.max[axis]-.7),'Grouped native transforms must preserve aligned negative-volume holes');}}previous=point;
  }
  assert.equal(counts.size,2);assert.ok([...counts.values()].every(count=>count>1000));assert.ok(prepared.project.objects.every(object=>object.native.groupTransform));
  t.diagnostic(`Both independently duplicated native groups preserve transformed cutouts across ${[...counts.values()].reduce((sum,value)=>sum+value,0)} deposited motion segments.`);
});
