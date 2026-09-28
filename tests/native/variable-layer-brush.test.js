import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {importNative3MF} from '../../shared/native-project.js';
import {layerProfileContext,updateLayerHeightProfile} from '../../shared/variable-layers.js';
import {adjustLayerHeightProfile} from '../../shared/variable-layer-brush.js';
import {fixtureCatalog} from '../fixtures/native-project-catalog.js';

const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const reference=JSON.parse(await readFile(new URL('../fixtures/variable-layer-brush-reference.json',import.meta.url)));
const motions=code=>code.split(/\r?\n/).map(line=>line.split(';',1)[0].trim()).filter(line=>/^G[0123]\b/.test(line));

for(const fixture of reference.cases.filter(item=>item.fixture===1))test(`native manual layer brush ${fixture.action} matches independent source profile toolpaths`,{timeout:120000},async t=>{
  const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2\b/);
  const root=await mkdtemp(path.join(tmpdir(),'orca-layer-brush-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
  base.nativeSettings={...base.nativeSettings,layer_height:'.2',initial_layer_print_height:'.2',brim_type:'no_brim',skirt_loops:'0'};base.objects[0].position=[60,70,0];
  const context=layerProfileContext(base.objects,base.selectedId,base.nativeSettings),service=createNativeProjectService({catalog:fixtureCatalog(base)});
  const generated=adjustLayerHeightProfile(fixture.before,context,fixture);assert.notDeepEqual(generated,fixture.before);
  async function slice(label,profile){
    const project=structuredClone(base);project.objects=updateLayerHeightProfile(project.objects,project.selectedId,profile,project.nativeSettings);
    const prepared=await service.prepare({project,useEmbeddedSettings:true}),dir=path.join(root,label);await mkdir(dir);await mkdir(path.join(dir,'config'));await mkdir(path.join(dir,'output'));await writeFile(path.join(dir,'model.3mf'),prepared.bytes);
    await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(dir,'config'),'--outputdir',path.join(dir,'output'),path.join(dir,'model.3mf')],{cwd:dir,timeoutMs:60000,signal:t.signal});
    const files=(await readdir(path.join(dir,'output'))).filter(name=>name.endsWith('.gcode'));assert.equal(files.length,1);return readFile(path.join(dir,'output',files[0]),'utf8');
  }
  const actual=await slice('web-brush',generated),expected=await slice('compiled-native-brush',fixture.after);
  assert.deepEqual(motions(actual),motions(expected));
  const zs=[...actual.matchAll(/^;Z:([\d.]+)/gm)].map(match=>Number(match[1]));assert.equal(zs[0],.2);assert.ok(zs.some((z,index)=>index>1&&Math.abs(z-zs[index-1]-.2)>.005));
  t.diagnostic(`${fixture.action}: ${zs.length} native layers and ${motions(actual).length} motion commands exactly match the independent C++ brush profile.`);
});
