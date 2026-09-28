import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,readdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectSlicer,runSlicer } from '../../server/slicer.js';
import { importNative3MF,exportNative3MF } from '../../shared/native-project.js';
import { createMesh,transformPositions,meshBounds } from '../../shared/geometry.js';
import { arrangeCutResult,cutNativeGroup,mirrorMesh } from '../../shared/geometry-cut.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';

const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer');
async function setup(t){const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);const directory=await mkdtemp(path.join(tmpdir(),'orca-native-cut-'));t.after(()=>rm(directory,{recursive:true,force:true}));return{directory,project:importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),signal:t.signal};}
async function slice(context,label,project){const directory=path.join(context.directory,label);await mkdir(path.join(directory,'config'),{recursive:true});await mkdir(path.join(directory,'output'));const input=path.join(directory,'model.3mf');await writeFile(input,exportNative3MF(project));await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--outputdir',path.join(directory,'output'),input],{cwd:directory,timeoutMs:60000,signal:context.signal});assert.deepEqual((await readdir(path.join(directory,'output'))).filter(file=>file.endsWith('.gcode')),['plate_1.gcode']);return readFile(path.join(directory,'output','plate_1.gcode'),'utf8');}
function moves(code){let object='',previous=[0,0],z=0;const result=[];for(const line of code.split(/\r?\n/)){if(line.startsWith('; printing object '))object=line.slice(18).split(' id:')[0];if(line.startsWith('; stop printing object '))object='';const zm=line.match(/^;Z:([-+.\d]+)/);if(zm)z=Number(zm[1]);if(!/^G[01]\s/.test(line))continue;const xm=line.match(/\bX([-+.\d]+)/),ym=line.match(/\bY([-+.\d]+)/),em=line.match(/\bE([-+.\d]+)/);const point=[xm?Number(xm[1]):previous[0],ym?Number(ym[1]):previous[1]];if(object&&em&&Number(em[1])>0&&(xm||ym))result.push({object,z,from:previous,to:point});previous=point;}assert.ok(result.length>1000);return result;}
function assertNoHoleExtrusion(segments,hole,{maxZ=Infinity}={}){const inside=segments.filter(segment=>segment.z<maxZ);assert.ok(inside.length>500);for(const segment of inside)for(const fraction of [.25,.5,.75]){const point=segment.from.map((value,axis)=>value+(segment.to[axis]-value)*fraction);assert.ok(!point.every((value,axis)=>value>hole.min[axis]+.8&&value<hole.max[axis]-.8),'Native slicing must preserve the cut cavity opening');}}

test('actual native slicing preserves holes in capped upper/lower surfaces and mirrored cut output',{timeout:120000},async t=>{
  const context=await setup(t),base=context.project.objects[0];
  const inner=Array.from(transformPositions({...base,scale:[.5,.5,.5]}));for(let index=0;index<inner.length;index+=9)for(let axis=0;axis<3;axis++)[inner[index+3+axis],inner[index+6+axis]]=[inner[index+6+axis],inner[index+3+axis]];
  const mesh=createMesh({...base,id:'cavity',name:'Cavity',positions:[...base.positions,...inner],native:undefined});
  const cut=arrangeCutResult(cutNativeGroup([mesh],mesh.id,{offset:10}),{width:250,depth:210,height:220});
  const project={...context.project,objects:cut.created,selectedId:cut.created[0].id};
  const code=await slice(context,'capped-holes',project),segments=moves(code);assert.ok(Math.abs(Number(code.match(/^; max_z_height: (.+)$/m)?.[1])-10)<.17,'Native final layer must be within one layer of the 10 mm half height');
  const upper=cut.upper[0],bounds=meshBounds(upper),hole={min:[bounds.min[0]+5,bounds.min[1]+5],max:[bounds.min[0]+15,bounds.min[1]+15]};
  assertNoHoleExtrusion(segments.filter(segment=>segment.object==='Cavity upper'),hole,{maxZ:4.5});
  const mirrored=mirrorMesh(upper,'x'),mirrorCode=await slice(context,'mirrored-half',{...project,objects:[mirrored],selectedId:mirrored.id});assertNoHoleExtrusion(moves(mirrorCode),hole,{maxZ:4.5});
  t.diagnostic('Native 2.4.2 sliced both capped cavity halves and a mirrored half; the opening remains free of deposited extrusion.');
});

test('actual native cut-group slicing retains negative volumes and per-part modifiers on both sides',{timeout:120000},async t=>{
  const context=await setup(t),complex=makeNativeAcceptanceProject(context.project),parts=complex.objects.slice(0,3);
  const cut=arrangeCutResult(cutNativeGroup(parts,'base',{offset:10}),{width:250,depth:210,height:220});
  const project={...context.project,objects:cut.created,selectedId:cut.created[0].id},code=await slice(context,'native-groups',project),segments=moves(code);
  assert.equal(cut.created.length,6);assert.ok(Math.abs(Number(code.match(/^; max_z_height: (.+)$/m)?.[1])-10)<.17,'Native final layer must be within one layer of the 10 mm half height');
  for(const side of [cut.upper,cut.lower]){const body=side.find(object=>object.native.partType==='normal_part'),negative=side.find(object=>object.native.partType==='negative_part');assert.equal(body.native.objectSettings.wall_loops,'4');assert.equal(side.find(object=>object.native.partType==='modifier_part').native.partSettings.sparse_infill_density,'50%');assertNoHoleExtrusion(segments.filter(segment=>segment.object===body.native.objectName),meshBounds(negative));}
  const without=await slice(context,'without-modifiers',{...project,objects:project.objects.filter(object=>object.native.partType!=='modifier_part')});
  const used=value=>Number(value.match(/^; filament used \[mm\] = (.+)$/m)?.[1]);assert.notEqual(used(code),used(without),'Native per-part density modifiers must affect real filament use after cutting');
  t.diagnostic(`Native cut groups retain capped negative volumes and effective density modifiers (${used(code)} vs ${used(without)} mm filament).`);
});
