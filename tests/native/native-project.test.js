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

async function setup(t){
  const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);
  const directory=await mkdtemp(path.join(tmpdir(),'orca-native-project-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const catalog=await createPresetCatalog({binary}),selected=catalog.resolveSelection({...catalog.list().defaults,overrides:{layer_height:.16,outer_wall_speed:70,brim_type:'no_brim'}});
  for(const [name,value]of Object.entries(selected))await writeFile(path.join(directory,name+'.json'),JSON.stringify(value));
  await mkdir(path.join(directory,'config'));await writeFile(path.join(directory,'model.stl'),await readFile(new URL('../fixtures/cube.stl',import.meta.url)));
  const bytes=await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url));
  return{directory,catalog,selected,bytes,project:importNative3MF(bytes),signal:t.signal};
}
async function slice(context,label,bytes){
  const directory=path.join(context.directory,label);await mkdir(directory);await mkdir(path.join(directory,'config'));await mkdir(path.join(directory,'output'));
  await writeFile(path.join(directory,'model.3mf'),bytes);
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--outputdir',path.join(directory,'output'),path.join(directory,'model.3mf')],{cwd:directory,timeoutMs:60000,signal:context.signal});
  const names=(await readdir(path.join(directory,'output'))).filter(name=>name.endsWith('.gcode')).sort();
  const gcodes=await Promise.all(names.map(name=>readFile(path.join(directory,'output',name),'utf8')));
  return{gcodes,names};
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

test('validated project preparation preserves native motions and applies explicit catalog process changes', {timeout:120000}, async t=>{
  const context=await setup(t),service=createNativeProjectService({catalog:context.catalog}),imported=await service.importArchive(context.bytes);
  const prepared=await service.prepare({project:imported.project,useEmbeddedSettings:true});
  const reference=await slice(context,'service-reference',context.bytes),actual=await slice(context,'service-embedded',prepared.bytes);
  assert.deepEqual(motions(actual.gcodes[0]),motions(reference.gcodes[0]));
  const changed=await service.prepare({project:imported.project,selection:imported.selection,overrides:{process:{layer_height:.24,outer_wall_speed:55}}});
  const sliced=await slice(context,'service-catalog',changed.bytes);assert.match(sliced.gcodes[0],/^; layer_height = 0\.24$/m);assert.match(sliced.gcodes[0],/^; outer_wall_speed = 55$/m);
  t.diagnostic('Server-validated embedded project keeps exact native motions; catalog mode produces 0.24 mm / 55 mm/s settings.');
});

test('validated multi-filament project preparation slices just the requested plate and retains part semantics', {timeout:120000}, async t=>{
  const context=await setup(t),service=createNativeProjectService({catalog:context.catalog}),project=makeNativeAcceptanceProject(context.project),defaults=context.catalog.list().defaults;
  const selection={printerId:defaults.printerId,processId:defaults.processId,filamentIds:[defaults.filamentId,defaults.filamentId]};
  const overrides={machine:{single_extruder_multi_material:true},process:{layer_height:.16,brim_type:'no_brim',enable_prime_tower:false},project:{filament_colour:['#FF0000','#0000FF']}};
  const first=await service.prepare({project,selection,overrides,plateId:'plate-1'}),second=await service.prepare({project,selection,overrides,plateId:'plate-2'});
  const firstResult=await slice(context,'service-first-plate',first.bytes),secondResult=await slice(context,'service-second-plate',second.bytes);
  assert.deepEqual(firstResult.names,['plate_1.gcode']);assert.deepEqual(secondResult.names,['plate_1.gcode']);assert.equal(first.project.objects.length,4);assert.equal(second.project.objects.length,1);
  assert.equal(first.project.objects.find(object=>object.name==='Through hole').native.partType,'negative_part');assert.equal(first.project.objects.find(object=>object.name==='Dense corner').native.partType,'modifier_part');
  assert.deepEqual(meshBounds(second.project.objects[0]).min,[70,80,0]);assert.equal(second.project.objects[0].filamentSlot,2);
  const firstUsed=filamentUsed(firstResult.gcodes[0]),secondUsed=filamentUsed(secondResult.gcodes[0]);assert.ok(firstUsed[0]>100&&firstUsed[1]>100);assert.equal(secondUsed[0],0);assert.ok(secondUsed[1]>100);
  const cutout=objectExtrusions(firstResult.gcodes[0]).filter(segment=>segment.object==='Native cutout');assert.ok(cutout.length>1000);
  for(const segment of cutout)for(const fraction of [.25,.5,.75]){const x=segment.from[0]+(segment.to[0]-segment.from[0])*fraction,y=segment.from[1]+(segment.to[1]-segment.from[1])*fraction;assert.ok(!(x>37&&x<43&&y>47&&y<53),'Sanitized negative part must remain a through-hole');}
  // Removing the density modifier must change actual deposited material, proving
  // the native modifier participates rather than merely surviving our metadata.
  const withoutModifier={...first.project,objects:first.project.objects.filter(object=>object.native.partType!=='modifier_part')};
  const noModifier=await slice(context,'service-without-modifier',exportNative3MF(withoutModifier));
  assert.notEqual(filamentUsed(noModifier.gcodes[0])[0],firstUsed[0]);
  t.diagnostic(`Server preparation yields one G-code output per selected plate, with a native through-hole, effective density modifier and filament usage [${firstUsed}] / [${secondUsed}] mm.`);
});
