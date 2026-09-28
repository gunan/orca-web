import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,readdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectSlicer,runSlicer } from '../../server/slicer.js';
import { createPresetCatalog } from '../../server/presets.js';
import { importNative3MF,exportNative3MF,nativeSettingsFromSelection } from '../../shared/native-project.js';
import { meshBounds } from '../../shared/geometry.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';
import { createNativeProjectService } from '../../server/native-projects.js';
const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer');

async function setup(t,{freshExport=true}={}){
  const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);
  const directory=await mkdtemp(path.join(tmpdir(),'orca-native-project-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const catalog=await createPresetCatalog({binary}),selected=catalog.resolveSelection({...catalog.list().defaults,overrides:{layer_height:.16,outer_wall_speed:70,brim_type:'no_brim'}});
  for(const [name,value]of Object.entries(selected))await writeFile(path.join(directory,name+'.json'),JSON.stringify(value));
  await mkdir(path.join(directory,'config'));await writeFile(path.join(directory,'model.stl'),await readFile(new URL('../fixtures/cube.stl',import.meta.url)));
  if(freshExport)await runSlicer(binary,['--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--load-settings',`${directory}/printer.json;${directory}/process.json`,'--load-filaments',`${directory}/filament.json`,'--export-3mf',`${directory}/native.3mf`,`${directory}/model.stl`],{cwd:directory,timeoutMs:60000,signal:t.signal});
  const bytes=await readFile(freshExport?path.join(directory,'native.3mf'):new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url));
  return{directory,catalog,selected,bytes,project:importNative3MF(bytes),signal:t.signal};
}
async function slice(context,label,bytes,{reexport=true}={}){
  const directory=path.join(context.directory,label);await mkdir(directory);await mkdir(path.join(directory,'config'));await mkdir(path.join(directory,'output'));
  await writeFile(path.join(directory,'model.3mf'),bytes);
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--outputdir',path.join(directory,'output'),...(reexport?['--export-3mf','reexport.3mf']:[]),path.join(directory,'model.3mf')],{cwd:directory,timeoutMs:60000,signal:context.signal});
  const names=(await readdir(path.join(directory,'output'))).filter(name=>name.endsWith('.gcode')).sort();
  const gcodes=await Promise.all(names.map(name=>readFile(path.join(directory,'output',name),'utf8')));
  return{project:reexport?importNative3MF(await readFile(path.join(directory,'output','reexport.3mf'))):null,gcodes,names};
}
const motions=code=>code.split(/\r?\n/).map(line=>line.split(';',1)[0].trim().replace(/\s+/g,' ')).filter(line=>/^G(?:0?[0123])(?:\s|$)/.test(line));
function filamentUsed(code){const match=code.match(/^; filament used \[mm\] = (.+)$/m);assert.ok(match);return match[1].split(',').map(Number);}
function objectExtrusions(code){
  let object='',previous=[0,0],z=0;const segments=[];
  for(const line of code.split(/\r?\n/)){
    if(line.startsWith('; printing object '))object=line.slice('; printing object '.length).split(' id:')[0];
    if(line.startsWith('; stop printing object '))object='';
    const height=line.match(/^;Z:([-+.\d]+)/);if(height)z=Number(height[1]);
    if(!/^G[01]\s/.test(line))continue;
    const x=line.match(/\bX([-+.\d]+)/),y=line.match(/\bY([-+.\d]+)/),e=line.match(/\bE([-+.\d]+)/);const point=[x?Number(x[1]):previous[0],y?Number(y[1]):previous[1]];
    if(object&&e&&Number(e[1])>0&&(x||y))segments.push({object,z,from:previous,to:point});previous=point;
  }
  return segments;
}

test('actual native project import/export retains embedded settings and identical native motion commands', {timeout:120000}, async t=>{
  const context=await setup(t);
  assert.equal(context.project.nativeSettings.layer_height,'0.16');assert.equal(context.project.nativeSettings.outer_wall_speed,'70');
  const reference=await slice(context,'native',context.bytes),actual=await slice(context,'web-roundtrip',exportNative3MF(context.project));
  assert.deepEqual(actual.names,['plate_1.gcode']);assert.equal(actual.project.nativeSettings.layer_height,'0.16');assert.equal(actual.project.nativeSettings.outer_wall_speed,'70');
  const expected=motions(reference.gcodes[0]),observed=motions(actual.gcodes[0]);assert.ok(expected.length>5000);assert.deepEqual(observed,expected);
  t.diagnostic(`Native and web-roundtripped project match ${expected.length} motion commands using embedded settings alone.`);
});

test('native CLI honors two plates, negative and modifier volumes, per-part overrides and both filament assignments', {timeout:120000}, async t=>{
  const context=await setup(t),p=makeNativeAcceptanceProject(context.project);
  const red={...context.selected.filament,filament_colour:['#FF0000']},blue={...context.selected.filament,filament_colour:['#0000FF'],filament_settings_id:['Acceptance Blue PLA']};
  p.nativeSettings={...p.nativeSettings,...nativeSettingsFromSelection({...context.selected,filaments:[red,blue]}),enable_prime_tower:'0',single_extruder_multi_material:'1'};
  const actual=await slice(context,'two-plates',exportNative3MF(p));
  assert.deepEqual(actual.names,['plate_1.gcode','plate_2.gcode']);
  assert.deepEqual(actual.project.plates.map(plate=>plate.name),p.plates.map(plate=>plate.name));
  assert.deepEqual(actual.project.nativePresetNames.filaments,['Prusa Generic PLA @MK4','Acceptance Blue PLA']);
  for(const expected of p.objects){const observed=actual.project.objects.find(object=>object.name===expected.name);assert.ok(observed,expected.name);assert.equal(observed.plateId,expected.plateId);assert.equal(observed.filamentSlot,expected.filamentSlot);assert.equal(observed.native.partType,expected.native.partType);assert.deepEqual(meshBounds(observed),meshBounds(expected));}
  assert.equal(actual.project.objects.find(o=>o.name==='Red main').native.objectSettings.wall_loops,'4');
  assert.equal(actual.project.objects.find(o=>o.name==='Dense corner').native.partSettings.sparse_infill_density,'50%');
  assert.equal(actual.project.objects.find(o=>o.name==='Blue part').native.partSettings.outer_wall_speed,'45');
  const firstUsed=filamentUsed(actual.gcodes[0]),secondUsed=filamentUsed(actual.gcodes[1]);assert.ok(firstUsed[0]>100&&firstUsed[1]>100);assert.equal(secondUsed[0],0);assert.ok(secondUsed[1]>100);
  const cutout=objectExtrusions(actual.gcodes[0]).filter(segment=>segment.object==='Native cutout');assert.ok(cutout.length>1000);
  for(const segment of cutout)for(const fraction of [.25,.5,.75]){const x=segment.from[0]+(segment.to[0]-segment.from[0])*fraction,y=segment.from[1]+(segment.to[1]-segment.from[1])*fraction;assert.ok(!(x>37&&x<43&&y>47&&y<53),'Negative part must remain a through-hole with no deposited extrusion');}
  const second=objectExtrusions(actual.gcodes[1]).filter(segment=>segment.object==='Second plate object');assert.ok(second.length>1000);
  const xs=second.flatMap(segment=>[segment.from[0],segment.to[0]]),ys=second.flatMap(segment=>[segment.from[1],segment.to[1]]);
  assert.ok(Math.min(...xs)>=69&&Math.max(...xs)<=91);assert.ok(Math.min(...ys)>=79&&Math.max(...ys)<=101);
  t.diagnostic(`Native sliced two plates, retained all five part roles/positions, and consumed filament slots [${firstUsed}] / [${secondUsed}] mm.`);
});

test('native layer-event XML preserves pause, custom, template and color events and emits printer G-code', {timeout:120000}, async t=>{
  const context=await setup(t),p=context.project;
  p.nativeSettings.template_custom_gcode='M117 Template event retained';
  p.plates[0].layerEvents={mode:'SingleExtruder',items:[
    {printZ:1,type:'PausePrint',extruder:1,color:'',extra:'Insert nut & resume'},
    {printZ:2.12,type:'Custom',extruder:1,color:'',extra:'M117 Native layer event\n; Multiline custom event retained'},
    {printZ:3.08,type:'Template',extruder:1,color:'',extra:''},
    {printZ:4.04,type:'ColorChange',extruder:1,color:'#AA00FF',extra:''}
  ]};
  const actual=await slice(context,'layer-events',exportNative3MF(p));
  assert.deepEqual(actual.project.plates[0].layerEvents.items.map(({gcode,...event})=>event),p.plates[0].layerEvents.items);
  const code=actual.gcodes[0];assert.match(code,/^M601\s*$/m);assert.match(code,/^M117 Native layer event\s*$/m);assert.match(code,/^; Multiline custom event retained\s*$/m);assert.match(code,/^M117 Template event retained\s*$/m);
  const eventLayer=needle=>{const index=code.indexOf(needle);assert.ok(index>=0);const matches=[...code.slice(0,index).matchAll(/^;Z:([-+.\d]+)/gm)];return Number(matches.at(-1)[1]);};
  assert.equal(eventLayer('M117 Native layer event'),2.12);assert.equal(eventLayer('M117 Template event retained'),3.08);
  t.diagnostic('Native re-export preserves all four layer events; pause/custom/template commands are present in G-code at the requested heights.');
});

