import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,readFile,writeFile,readdir,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{inspectSlicer,runSlicer}from'../../server/slicer.js';import{createNativeProjectService}from'../../server/native-projects.js';import{importNative3MF}from'../../shared/native-project.js';import{parseGcode}from'../../shared/gcode.js';import{updateBrimEars}from'../../shared/brim-ears.js';import{meshBounds}from'../../shared/geometry.js';import{fixtureCatalog}from'../fixtures/native-project-catalog.js';
const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
test('native painted brim ears add localized first-layer adhesion and move with the chosen corner',{timeout:120000},async t=>{
 const engine=await inspectSlicer(binary);assert.match(engine.version,/^OrcaSlicer-2\.4\.2\b/);const directory=await mkdtemp(path.join(tmpdir(),'orca-brim-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const base=importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf'));base.objects[0].position=[60,70,0];const service=createNativeProjectService({catalog:fixtureCatalog(base)}),object=base.objects[0],box=meshBounds(object),outputs=[];
 for(const variant of ['none','left','right','above']){
  let project=structuredClone(base);project.nativeSettings={...project.nativeSettings,brim_type:'no_brim',skirt_loops:'0',brim_object_gap:'0',brim_width:'5'};
  if(variant!=='none')project.objects=updateBrimEars(project.objects,object.id,[{position:[variant==='right'?box.max[0]:box.min[0],box.min[1],variant==='above'?1:0],radius:5}]);
  const prepared=await service.prepare({project,useEmbeddedSettings:true}),root=path.join(directory,variant);await mkdir(root);await mkdir(path.join(root,'config'));await mkdir(path.join(root,'output'));await writeFile(path.join(root,'model.3mf'),prepared.bytes);
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(root,'config'),'--outputdir',path.join(root,'output'),path.join(root,'model.3mf')],{cwd:root,timeoutMs:60000,signal:t.signal});const filename=(await readdir(path.join(root,'output'))).find(name=>name.endsWith('.gcode'));assert.ok(filename);const parsed=parseGcode(await readFile(path.join(root,'output',filename),'utf8')),brim=parsed.segments.filter(segment=>segment.kind==='extrusion'&&/brim/i.test(segment.feature));outputs.push({variant,brim,features:parsed.features});
 }
 assert.equal(outputs[0].brim.length,0,JSON.stringify(outputs[0].features));assert.equal(outputs[3].brim.length,0);
 for(const output of outputs.slice(1,3)){assert.ok(output.brim.length>20,JSON.stringify(output));for(const segment of output.brim){assert.ok(segment.end[2]<.3);const x=output.variant==='left'?box.min[0]:box.max[0];assert.ok(Math.abs(segment.end[0]-x)<5.1);assert.ok(Math.abs(segment.end[1]-box.min[1])<5.1);}}
 t.diagnostic(`${outputs[1].brim.length} left-ear and ${outputs[2].brim.length} right-ear native adhesion segments; none without ears or with ears above the bed.`);
});
