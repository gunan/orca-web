import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync,strFromU8,strToU8} from 'fflate';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {fixtureCatalog} from '../fixtures/native-project-catalog.js';
import {importNative3MF,exportNative3MF,nativeSettingsFromSelection} from '../../shared/native-project.js';
import {extractBoundedZip} from '../../shared/import-limits.js';
import {transformPositions,createMesh} from '../../shared/geometry.js';
import {mirrorMesh} from '../../shared/geometry-cut.js';
import {parseGcode} from '../../shared/gcode.js';
const binary=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
async function setup(t){
 const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2\b/);
 const directory=await mkdtemp(path.join(tmpdir(),'orca-paint-acceptance-'));t.after(()=>process.env.ORCA_PAINT_DEBUG?t.diagnostic(directory):rm(directory,{recursive:true,force:true}));
 const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),catalog=fixtureCatalog(base),selected=catalog.resolveSelection(catalog.list().defaults);
 base.nativeSettings={...nativeSettingsFromSelection({...selected,filaments:[selected.filament,selected.filament]}),layer_height:'.2',brim_type:'no_brim',single_extruder_multi_material:'1',enable_prime_tower:'0',filament_colour:['#FF0000','#0000FF']};
 const service=createNativeProjectService({catalog});
 return{base,async slice(name,objects,settings={},bytes){const project={...base,objects,nativeSettings:{...base.nativeSettings,...settings}},prepared=bytes?{bytes}:await service.prepare({project,useEmbeddedSettings:true});
  const root=path.join(directory,name);await mkdir(path.join(root,'config'),{recursive:true});await mkdir(path.join(root,'output'));const filename=path.join(root,'model.3mf');await writeFile(filename,prepared.bytes);
  await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(root,'config'),'--outputdir',path.join(root,'output'),filename],{cwd:root,timeoutMs:60000,signal:t.signal});
  const code=await readFile(path.join(root,'output','plate_1.gcode'),'utf8'),parsed=parseGcode(code),extrusion=parsed.segments.filter(segment=>segment.kind==='extrusion'),outer=extrusion.filter(segment=>segment.feature==='Outer wall');return{code,parsed,extrusion,outer,project:prepared.project};
 }};
}
function facets(mesh,axis,value){const points=transformPositions(mesh),indices=[];for(let i=0;i<points.length;i+=9)if([0,3,6].every(start=>Math.abs(points[i+start+axis]-value)<.001))indices.push(i/9);assert.ok(indices.length);return indices;}
const paint=(mesh,channel,indices,code='4')=>({...mesh,painting:{version:1,[channel]:Object.fromEntries(indices.map(index=>[index,code]))}});
const support=result=>result.extrusion.filter(segment=>/support/i.test(segment.feature));
const used=result=>result.code.match(/^; filament used \[mm\] = (.+)$/m)[1].split(',').map(Number);
function firstOuterX(result){const layers=new Map();for(const segment of result.outer)if(!layers.has(segment.end[2]))layers.set(segment.end[2],segment.start[0]);return[...layers.values()];}


import {parseSupportPreview} from '../../shared/support-preview.js';
test('sliced support preview consists of real native support paths and responds to manual facet enforcement',{timeout:120000},async t=>{
 // This independently constructed two-mesh fixture has no retained single-mesh source.
 const c=await setup(t),source=c.base.objects[0],pillar=transformPositions({...source,scale:[.25,.25,.5],position:[0,0,-5]}),top=transformPositions({...source,scale:[1,1,.1],position:[0,0,1]}),overhang=createMesh({...source,native:{...source.native,meshSource:undefined},positions:[...pillar,...top],position:[50,50,0]}),settings={enable_support:'1',support_type:'normal(manual)'},painted=paint(overhang,'supports',facets(overhang,2,10)),without=await c.slice('without-enforcement',[overhang],settings),withPaint=await c.slice('with-enforcement',[painted],settings),empty=parseSupportPreview(without.code),preview=parseSupportPreview(withPaint.code);
 assert.equal(empty.segments.length,0);assert.ok(preview.segments.length>1000);assert.equal(preview.truncated,false);assert.deepEqual(preview.segments,support(withPaint));assert.ok(preview.metrics.pathLengthMm>100);assert.ok(preview.metrics.filamentMm>1);assert.ok(preview.layers.length>10);t.diagnostic(`${preview.metrics.segments} actual native support/interface deposition paths across ${preview.layers.length} layers, zero without manual paint.`);
});
