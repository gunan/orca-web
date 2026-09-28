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
test('native support and seam facet annotations change support paths and preferred wall starts',{timeout:120000},async t=>{
 // This independently constructed two-mesh fixture has no retained single-mesh source.
 const c=await setup(t),source=c.base.objects[0],pillar=transformPositions({...source,scale:[.25,.25,.5],position:[0,0,-5]}),top=transformPositions({...source,scale:[1,1,.1],position:[0,0,1]}),overhang=createMesh({...source,native:{...source.native,meshSource:undefined},positions:[...pillar,...top],position:[50,50,0]}),settings={enable_support:'1',support_type:'normal(manual)'};
 const baseline=await c.slice('support-default',[overhang],settings),enforced=await c.slice('support-enforced',[paint(overhang,'supports',facets(overhang,2,10))],settings);assert.equal(support(baseline).length,0);assert.ok(support(enforced).length>1000);assert.ok(used(enforced)[0]>used(baseline)[0]);
 const autoSettings={enable_support:'1',support_type:'normal(auto)'},automatic=await c.slice('support-automatic',[overhang],autoSettings),blocked=await c.slice('support-blocked',[paint(overhang,'supports',facets(overhang,2,10),'8')],autoSettings);assert.ok(support(automatic).length>1000);assert.equal(support(blocked).length,0);
 const left=await c.slice('seam-left',[paint(source,'seam',facets(source,0,0))]),right=await c.slice('seam-right',[paint(source,'seam',facets(source,0,20))]);const lx=firstOuterX(left),rx=firstOuterX(right);assert.ok(lx.length>90);assert.equal(lx.length,rx.length);assert.ok(lx.every(x=>x<1));assert.ok(rx.every(x=>x>19));
 t.diagnostic(`${support(enforced).length} support extrusion segments replace zero; ${lx.length} layers move the preferred seam from X<1 to X>19.`);
});
test('native fuzzy painted-only mode changes only the selected side and color paint uses actual filament slots',{timeout:120000},async t=>{
 const c=await setup(t),source=c.base.objects[0],side=facets(source,0,20),settings={fuzzy_skin:'none',fuzzy_skin_thickness:'.5',fuzzy_skin_point_distance:'.5'};
 const baseline=await c.slice('fuzzy-default',[source],settings),fuzzy=await c.slice('fuzzy-painted',[paint(source,'fuzzy',side)],settings);assert.ok(fuzzy.outer.length>baseline.outer.length*5);assert.ok(Math.max(...fuzzy.outer.map(s=>s.end[0]))>20);assert.ok(Math.min(...fuzzy.outer.map(s=>s.end[0]))>=.19);
 const colored=await c.slice('filament-painted',[paint(source,'color',side,'8')]);assert.ok(used(colored).every(value=>value>100));const second=colored.outer.filter(segment=>segment.tool===1);assert.ok(second.length>100);assert.ok(second.some(segment=>segment.end[0]>19));assert.ok(colored.outer.some(segment=>segment.tool===0&&segment.end[0]<1));
 t.diagnostic(`Painted fuzzy side expands ${baseline.outer.length} to ${fuzzy.outer.length} outer-wall segments; color painting uses ${used(colored).join('/')} mm of two filaments.`);
});
test('mirrored asymmetric native subfacets match an independently transformed native archive',{timeout:120000},async t=>{
 const c=await setup(t),source=c.base.objects[0],indices=facets(source,0,20),painted={...source,painting:{version:1,color:{[indices[0]]:'0482',[indices[1]]:'4'}}};
 // Reference reflection changes only the standard native build transform. It
 // leaves vertex order and the native asymmetric two-edge paint tree untouched.
 const entries=extractBoundedZip(exportNative3MF({...c.base,objects:[painted]}));entries['3D/3dmodel.model']=strToU8(strFromU8(entries['3D/3dmodel.model']).replace(/<item objectid="(\d+)" transform="[^"]*"/, '<item objectid="$1" transform="-1 0 0 0 1 0 0 0 1 120 50 0"'));
 const mirrored=mirrorMesh(painted,'x',{center:[60,0,0]});mirrored.position[1]=50;
 const reference=await c.slice('native-reference',[],{},zipSync(entries)),actual=await c.slice('web-mirror',[mirrored]);
 const paths=result=>result.outer.filter(segment=>segment.tool===1).map(segment=>[segment.start,segment.end].map(point=>point.map(n=>Number(n.toFixed(4))))).map(segment=>JSON.stringify(segment)).sort();
 assert.ok(paths(actual).length>40);assert.deepEqual(paths(actual),paths(reference));assert.deepEqual(used(actual),used(reference));assert.equal(actual.project.objects[0].painting.winding,-1);
 t.diagnostic(`${paths(actual).length} second-filament wall segments and both filament consumptions exactly match a native build-matrix reflection of the original two-edge painted facet.`);
});
