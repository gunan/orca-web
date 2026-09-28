import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3} from 'three';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {fixture} from '../fixtures/native-instance-project.js';
import {createPresetCatalog} from '../../server/presets.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {reconcileNativeInstanceEdits} from '../../shared/native-instance-edits.js';
import {updateSceneTransform} from '../../shared/scene-object-operations.js';
import {updateNativePart} from '../../shared/native-object-settings.js';
const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const motion=code=>code.split(/\r?\n/).map(l=>l.split(';',1)[0].trim().replace(/\s+/g,' ')).filter(l=>/^G(?:0?[0123])(?:\s|$)/.test(l));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inputs({translationOnly=false,mirror=false}={}){
 const catalog=await createPresetCatalog({binary}),service=createNativeProjectService({catalog}),ids=catalog.list().defaults,project=fixture({mirror});
 project.objects=project.objects.map(o=>{
  const {painting,...copy}=structuredClone(o);
  if(translationOnly&&copy.id.startsWith('i1')){
   const source=copy.native.meshSource;source.build=new Matrix4().makeTranslation(100,40,10).toArray();
   const combined=new Matrix4().fromArray(source.build).multiply(new Matrix4().fromArray(source.component));
   copy.positions=source.triangles.flatMap(index=>new Vector3(...source.vertices.slice(index*3,index*3+3)).applyMatrix4(combined).toArray());
  }
  copy.position[2]=-5;return copy;
 });
 const selection={printerId:ids.printerId,processId:ids.processId,filamentIds:[ids.filamentId]},overrides={process:{layer_height:.2,brim_type:'no_brim',enable_prime_tower:false,wall_generator:'classic',sparse_infill_pattern:'rectilinear'},filaments:[{slow_down_for_layer_cooling:[false]}]};
 const base=await service.prepare({project,selection,overrides});
 let objects=updateSceneTransform(project.objects,'i0p0',{position:[3,4,-5]},{scope:'part'});
 objects=updateNativePart(objects,'i0p0',{partSettings:{wall_loops:'7'}});
 const changed=reconcileNativeInstanceEdits(project,{...project,objects},{instanceScope:'part'}),actual=await service.prepare({project:changed,selection,overrides});
 // Independent reference changes the native volume matrix and configuration XML only.
 const entries=unzipSync(base.bytes),model=strFromU8(entries['3D/3dmodel.model']);
 assert.match(model,/<component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"\/>/);
 entries['3D/3dmodel.model']=strToU8(model.replace('<component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>','<component objectid="1" transform="1 0 0 0 1 0 0 0 1 3 4 0"/>'));
 const meta=strFromU8(entries['Metadata/model_settings.config']);assert.match(meta,/<part id="1" subtype="normal_part">/);
 entries['Metadata/model_settings.config']=strToU8(meta.replace('<part id="1" subtype="normal_part">','<part id="1" subtype="normal_part"><metadata key="wall_loops" value="7"/>'));
 const actualEntries=unzipSync(actual.bytes),keys=Object.keys(entries).filter(k=>k!=='Metadata/orca-web.json');
 assert.deepEqual(Object.keys(actualEntries).filter(k=>k!=='Metadata/orca-web.json').sort(),keys.slice().sort());
 for(const key of keys)assert.deepEqual(actualEntries[key],entries[key],`Native archive entry ${key}`);
 assert.equal((strFromU8(actualEntries['3D/3dmodel.model']).match(/<components>/g)||[]).length,1);
 assert.equal(new Set(changed.objects.map(o=>o.native.instanceFamily)).size,1);
 return {reference:zipSync(entries),web:actual.bytes};
}
test('rotated and mirrored linked edits preserve every native-read entry against independent component/config XML edits',async()=>{
 assert.equal((await inspectSlicer(binary)).version,'OrcaSlicer-2.4.2');
 for(const mirror of [false,true])await inputs({mirror});
});
test('translation-only linked edits match four fixed native runs, including same-input repeatability controls',{timeout:180000},async t=>{
 assert.equal((await inspectSlicer(binary)).version,'OrcaSlicer-2.4.2');
 const dir=await mkdtemp(path.join(tmpdir(),'orca-instance-native-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const data=await inputs({translationOnly:true}),artifacts='test-results/instance-native-translation';await mkdir(artifacts,{recursive:true});
 const rows=[];
 // Fixed run count/order; a mismatch always fails. There is no retry or matching-run selection.
 for(const [index,name] of ['reference','reference','web','web'].entries()){
  const cwd=path.join(dir,`${index}-${name}`),bytes=data[name];await mkdir(path.join(cwd,'output'),{recursive:true});await mkdir(path.join(cwd,'config'));
  await writeFile(path.join(cwd,'model.3mf'),bytes);
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(cwd,'config'),'--outputdir',path.join(cwd,'output'),path.join(cwd,'model.3mf')],{cwd,timeoutMs:60000,signal:t.signal});
  const files=(await readdir(path.join(cwd,'output'))).filter(f=>f.endsWith('.gcode'));assert.equal(files.length,1);
  const code=await readFile(path.join(cwd,'output',files[0]),'utf8'),commands=motion(code);
  await writeFile(path.join(artifacts,`${index}-${name}.3mf`),bytes);await writeFile(path.join(artifacts,`${index}-${name}.gcode`),code);
  rows.push({name,inputSHA256:sha(bytes),motionSHA256:sha(JSON.stringify(commands)),commandCount:commands.length,commands});
 }
 await writeFile(path.join(artifacts,'runs.json'),JSON.stringify(rows.map(({commands,...row})=>row),null,2));
 assert.equal(rows[0].inputSHA256,rows[1].inputSHA256);assert.equal(rows[2].inputSHA256,rows[3].inputSHA256);
 assert.ok(rows[0].commands.length>1000);
 for(let index=1;index<rows.length;index++){
  const expected=rows[0].commands,actual=rows[index].commands,different=[];
  for(let i=0;i<Math.max(expected.length,actual.length);i++)if(actual[i]!==expected[i])different.push({i,actual:actual[i],expected:expected[i]});
  assert.equal(different.length,0,`Fixed native run ${index} ${rows[index].name}: ${JSON.stringify(different.slice(0,4))}`);
 }
 t.diagnostic(`All four fixed translation-only runs agree exactly: ${rows[0].commands.length} motion commands; rotated CLI path determinism remains unverified.`);
});
