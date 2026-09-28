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

import {paintMesh,gapFillPainting,paintByOverhangAngle,encodeFacet} from '../../shared/facet-painting.js';
test('a sparse native capsule stroke paints a continuous material strip between pointer endpoints',{timeout:120000},async t=>{
 const c=await setup(t),source=c.base.objects[0],side=facets(source,0,20),painted=paintMesh(source,{channel:'color',state:2,tool:'sphere',triangleIndex:side[1],previousTriangleIndex:side[0],point:[20,10,16],previousPoint:[20,10,4],radius:.6}).mesh;
 const actual=await c.slice('continuous-stroke',[painted]),second=actual.outer.filter(segment=>segment.tool===1);assert.ok(second.length>100);const layers=new Set(second.map(segment=>segment.end[2]));for(const z of [5,6,7,8,9,10,11,12,13,14,15])assert.ok([...layers].some(value=>Math.abs(value-z)<.11),`missing painted strip near Z${z}`);
 assert.ok(second.every(segment=>segment.end[2]>=3.3&&segment.end[2]<=16.7));assert.ok(second.every(segment=>segment.start[1]>=9.2&&segment.start[1]<=10.8&&segment.end[1]>=9.2&&segment.end[1]<=10.8));assert.ok(used(actual)[1]>5);t.diagnostic(`${second.length} second-material wall segments cover ${layers.size} consecutive layers between two sparse brush samples; ${used(actual)[1]} mm deposited in the swept strip.`);
});
