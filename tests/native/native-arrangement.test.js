import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ARRANGE_REVISION,prepareNativeArrangement,applyNativeArrangement} from '../../shared/native-arrangement.js';
import {importNative3MF} from '../../shared/native-project.js';
import {mirrorMesh} from '../../shared/geometry-cut.js';
import {meshBounds,transformPositions} from '../../shared/geometry.js';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {fixtureCatalog} from '../fixtures/native-project-catalog.js';
const binary=process.env.ORCA_ARRANGE_WORKER_BIN||path.resolve('native/build/arrange/orca-arrange-worker');
const slicer=process.env.ORCA_SLICER_BIN||'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const reference=JSON.parse(await readFile(new URL('../fixtures/native-arrangement-reference.json',import.meta.url)));
const towerReference=JSON.parse(await readFile(new URL('../fixtures/native-arrangement-reference-tower.json',import.meta.url)));
const base=importNative3MF(await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function directory(t){const dir=await mkdtemp(path.join(tmpdir(),'orca-arrange-proof-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function arrange(request,dir,signal){const input=path.join(dir,'input.json'),output=path.join(dir,'worker.json');await writeFile(input,JSON.stringify(request));await runSlicer(binary,[input,output],{timeoutMs:60000,signal});return JSON.parse(await readFile(output,'utf8'));}
function part(id,changes={}){const result={...structuredClone(base.objects[0]),id,name:id,position:[50,50,0],native:{...base.objects[0].native,groupId:id,objectName:id},...changes};delete result.native.instanceFamily;return result;}
const three=()=>[part('A'),part('B',{position:[75,55,0]}),part('C',{position:[110,80,0]})];
const helper=(id,type,changes={})=>part(id,{native:{...base.objects[0].native,groupId:'A',objectName:'A',partType:type},...changes});
function projectFor(spec){return {...structuredClone(base),objects:spec.objects(),nativeSettings:{...base.nativeSettings,...spec.settings},selectedId:'A',selectedIds:['A']};}
const cliCases=[
 {name:'fresh GUI cube',objects:()=>[part('A')]},
 {name:'three cube placements',objects:three},
 {name:'rotated rectangles with rotation disabled',objects:()=>three().map((o,i)=>({...o,scale:[1+i*.45,1,1],rotation:[0,0,[35,-20,80][i]]}))},
 {name:'native automatic rotation',objects:()=>three().map((o,i)=>({...o,scale:[1+i*.45,1,1],rotation:[0,0,[35,-20,80][i]]})),options:{rotation:true}},
 {name:'baked reflected rectangles',objects:()=>three().map((o,i)=>mirrorMesh({...o,scale:[1,1+i*.4,1],rotation:[0,0,25*i]},'x'))},
 {name:'grouped negative and modifier volumes outside the normal footprint',objects:()=>[...three(),helper('A-negative','negative_part',{position:[55,55,0],scale:[.5,.5,2]}),helper('A-modifier','modifier_part',{position:[80,50,0]})]},
 {name:'combined skirt with explicit 0.48mm width',objects:three,settings:{skirt_loops:'3',skirt_distance:'6',skirt_type:'combined',skirt_height:'1',initial_layer_line_width:'.48'}},
 {name:'normal support safety margin',objects:three,settings:{enable_support:'1',support_type:'normal(auto)'}},
 {name:'central excluded region',objects:three,settings:{bed_exclude_area:['95x75','150x75','150x135','95x135']}},
 {name:'central wrapping region',objects:three,settings:{enable_wrapping_detection:'1',wrapping_exclude_area:['95x75','150x75','150x135','95x135']}},
 {name:'sequential 65.001mm clearance',objects:three,settings:{print_sequence:'by object',skirt_loops:'0'}},
];
function closeVector(actual,expected,tolerance,label){assert.equal(actual.length,expected.length,label);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<=tolerance,`${label}[${i}]: ${v} != ${expected[i]}`));}
function compareWorld(actual,expected){const found=new Map(expected.map(o=>[o.name,o]));assert.equal(found.size,actual.length);for(const o of actual){const other=found.get(o.name);assert.ok(other,o.name);assert.equal(other.native.partType,o.native.partType);for(const key of ['min','max'])closeVector(meshBounds(o)[key],meshBounds(other)[key],3e-5,`${o.name} ${key}`);const points=object=>{const a=Array.from(transformPositions(object)),p=[];for(let i=0;i<a.length;i+=3)p.push(a.slice(i,i+3));return p.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);};const a=points(o),e=points(other);assert.equal(a.length,e.length);/* Export may reverse or reorder triangle corners; prove every world vertex has the same multiplicity. */const remaining=[...e];for(const p of a){const at=remaining.findIndex(q=>q.every((v,i)=>Math.abs(v-p[i])<=3e-5));assert.notEqual(at,-1,`${o.name} has an unmatched native world vertex ${p}`);remaining.splice(at,1);}}}

test('native arrangement build identity and independent source fixture provenance match the pinned release',async()=>{
 assert.equal((await inspectSlicer(slicer)).version,'OrcaSlicer-2.4.2');assert.equal((await runSlicer(binary,['--version'])).trim(),`OrcaArrangeWorker-2.4.2 revision${ARRANGE_REVISION}`);
 const manifest=JSON.parse(await readFile(path.join(path.dirname(binary),'build-manifest.json')));assert.equal(manifest.binarySha256,sha(await readFile(binary)));assert.equal(manifest.sourceManifest.commit,ARRANGE_REVISION);assert.equal(reference.sourceRevision,ARRANGE_REVISION);assert.equal(reference.referenceSha256,sha(await readFile(new URL('../fixtures/native-arrangement-reference.cpp',import.meta.url))));
 assert.equal(towerReference.sourceRevision,ARRANGE_REVISION);assert.equal(towerReference.referenceSha256,sha(await readFile(new URL('../fixtures/native-arrangement-reference-tower.cpp',import.meta.url))));
 for(const[name,hash]of Object.entries({...reference.sourceSha256,...towerReference.sourceSha256}))assert.equal(manifest.sourceManifest.sources[name],hash,name);
});
for(const c of [...reference.cases,...towerReference.cases])test(`original compiled Arrange/ModelArrange exact comparison: ${c.name}`,async t=>{
 const dir=await directory(t),request={format:'orca-arrangement-request',version:1,sourceRevision:ARRANGE_REVISION,settings:c.settings,options:c.options,objects:c.objects};
 const result=await arrange(request,dir,t.signal);assert.deepEqual(result.parameters,c.parameters);assert.deepEqual(result.primeTower,c.primeTower??null);assert.deepEqual(result.objects.map(({order,...value})=>value),c.expected);
});
for(const spec of cliCases)test(`installed OrcaSlicer arrangement and 3MF roundtrip: ${spec.name}`,{timeout:90000},async t=>{
 const dir=await directory(t),project=projectFor(spec),before=structuredClone(project),request=prepareNativeArrangement(project,project.nativeSettings,{alignY:false,...spec.options}),result=await arrange(request,dir,t.signal),actual=applyNativeArrangement(project,request,result);assert.deepEqual(project,before,'arrangement must not mutate project/history');
 const service=createNativeProjectService({catalog:fixtureCatalog(project)}),prepared=await service.prepare({project,useEmbeddedSettings:true}),input=path.join(dir,'input.3mf'),out=path.join(dir,'out');await writeFile(input,prepared.bytes);await mkdir(out);
 // Native CLI derives align_to_y_axis from printer_structure. This fixture is
 // "undefine", so explicit GUI alignY is false. The source oracle tests true.
 const logFile=path.join(dir,'cli.log');await runSlicer(slicer,['--debug','3','--logfile',logFile,'--arrange','1',`--allow-rotations=${spec.options?.rotation?'1':'0'}`,'--orient','0','--export-3mf','arranged.3mf','--datadir',path.join(dir,'config'),'--outputdir',out,input],{timeoutMs:60000,signal:t.signal});
 const expected=importNative3MF(await readFile(path.join(out,'arranged.3mf')));compareWorld(actual.objects,expected.objects);
 const saved=await service.prepare({project:actual,useEmbeddedSettings:true}),reloaded=importNative3MF(saved.bytes);compareWorld(reloaded.objects,actual.objects);
 for(const o of actual.objects){const original=before.objects.find(p=>p.id===o.id);assert.deepEqual(o.positions,original.positions,'source triangle topology is not rewritten');assert.equal(o.filamentSlot,original.filamentSlot);}
 if(spec.name.startsWith('grouped')){const group=reloaded.objects.filter(o=>o.name.startsWith('A'));assert.equal(new Set(group.map(o=>o.native.groupId)).size,1);assert.deepEqual(group.map(o=>o.native.partType).sort(),['modifier_part','negative_part','normal_part']);}
 if(spec.name.startsWith('sequential'))assert.equal(result.parameters.minimumDistance,65.00099999999999);
 if(spec.name.startsWith('combined skirt'))assert.deepEqual(result.parameters.bedShrink,[8.440000534057617,8.440000534057617]);
 t.diagnostic(`${actual.objects.length} named parts: all transformed triangle corners match native export within 0.00003 mm and survive web-native reload.`);
});

test('native selected-object arrangement keeps fixed parts and other plates byte-identical',async t=>{
 const dir=await directory(t),objects=three(),other=part('Other',{plateId:'plate-2'}),project={...projectFor({objects:()=>[...objects,other]}),plates:[...base.plates,{id:'plate-2',name:'Plate2',locked:false}],selectedIds:['A'],selectedId:'A'};
 const before=structuredClone(project),request=prepareNativeArrangement(project,project.nativeSettings,{scope:'selection',spacing:10}),result=await arrange(request,dir,t.signal),actual=applyNativeArrangement(project,request,result);assert.deepEqual(result.objects.map(o=>o.id),['A']);assert.deepEqual(actual.objects.slice(1),before.objects.slice(1));assert.deepEqual(project,before);assert.notDeepEqual(actual.objects[0].position,before.objects[0].position);
});

test('native bounded-input validation rejects invalid geometry, identities, transforms and outside-workspace objects',async t=>{
 const dir=await directory(t),project=projectFor({objects:()=>[part('A')]}),valid=prepareNativeArrangement(project,project.nativeSettings),cases=[
  ['nonaffine matrix',r=>r.objects[0].matrix[3]=1,/affine transform/],
  ['singular matrix',r=>r.objects[0].matrix[0]=0,/affine transform/],
  ['huge coordinate',r=>r.objects[0].parts[0].vertices[0][0]=1e7,/numeric bounds/],
  ['invalid triangle',r=>r.objects[0].parts[0].triangles[0][0]=9999,/triangle index/],
  ['unsupported part role',r=>r.objects[0].parts[0].type='arbitrary_command',/part type/],
  ['no normal part',r=>r.objects[0].parts[0].type='negative_part',/normal part/],
  ['duplicate identity',r=>r.objects.push(structuredClone(r.objects[0])),/duplicate object identity/],
  ['nothing selected',r=>r.objects[0].selected=false,/Select at least one/],
  ['nonprintable',r=>r.objects[0].printable=false,/non-printable.*outside-plate/],
  ['above printable height',r=>r.settings.printable_height='10',/above printable height.*outside-plate/],
  ['excess object count',r=>r.objects=Array.from({length:257},(_,i)=>({...r.objects[0],id:String(i)})),/1–256 objects/],
 ];
 for(const[label,change,pattern]of cases){const request=structuredClone(valid);change(request);const caseDir=path.join(dir,label.replaceAll(' ','-'));await mkdir(caseDir);await assert.rejects(arrange(request,caseDir,t.signal),pattern,label);await assert.rejects(readFile(path.join(caseDir,'worker.json')),error=>error.code==='ENOENT',`${label} must not produce a result`);}
 const again=await arrange(valid,dir,t.signal);assert.equal(again.objects.length,1,'a rejected input does not poison the standalone helper');
});
