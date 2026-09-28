import {fixture as instanceFixture} from '../fixtures/native-instance-project.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Matrix4} from 'three';
import {prepareNativePrimeTower,validateNativePrimeTowerResult} from '../../shared/native-prime-tower.js';
import {primeTowerBands,createPrimeTowerGeometry,disposePrimeTower} from '../../src/prime-tower-renderer.js';
import {towerProject,towerSettings,primeTowerCases} from '../fixtures/native-prime-tower-input.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url)));
const result=c=>({format:'orca-native-prime-tower',version:1,sourceRevision:ref.sourceCommit,plateId:c.request.plateId,...structuredClone(c.expected)});
test('tower request preserves geometry, invisible objects and per-plate native placement without mutation',()=>{
 const p=towerProject();p.objects[0].visible=false;p.plates.push({id:'second',name:'Second',locked:true});p.activePlateId='second';p.objects[1].plateId='second';p.plates[1].native={metadata:{print_sequence:'by object'}};const before=structuredClone(p),settings={...towerSettings,wipe_tower_x:['100','90'],wipe_tower_y:['140','130']};
 const r=prepareNativePrimeTower(p,settings);assert.deepEqual(p,before);assert.deepEqual(r.plate.origin,[240,-0,0]);assert.deepEqual(r.plate.shape[0],[240,0]);assert.deepEqual(r.placement,[90,130,0]);assert.equal(r.settings.print_sequence,'by object');assert.equal(r.objects.length,2);assert.deepEqual(r.objects.map(o=>o.instances[0].plateId),['plate-1','second']);assert.equal(r.objects[1].instances[0].matrix[12],310);assert.equal('contained'in r.objects[0],false);assert.equal('extruders'in r,false);
});
test('linked instance zero order is preserved even when objects are interleaved across plates',()=>{
 const p=instanceFixture({parts:1});p.plates.push({id:'second',name:'Second'});p.objects[0].plateId='second';const r=prepareNativePrimeTower(p,towerSettings);assert.equal(r.objects[0].id,'family');assert.deepEqual(r.objects[0].instances.map(i=>i.plateId),['second','plate-1']);
});
test('native assignments include height ranges, support and valid nested paint, never topology-unsafe facet strings',()=>{
 const p=towerProject();p.objects[0].native={objectSettings:{enable_support:'1',support_filament:'3',wall_loops:'5'},layerConfigRanges:[{minZ:0,maxZ:10,settings:{extruder:'2',layer_height:'.1'}}]};p.objects[0].painting={version:1,color:{'0':'480C91'}};
 const r=prepareNativePrimeTower(p,towerSettings);assert.deepEqual(r.objects[0].settings,{enable_support:'1',support_filament:'3',extruder:'1'});assert.deepEqual(r.objects[0].ranges,[{extruder:'2'}]);assert.deepEqual(r.objects[0].parts[0].color,{'0':'480C91'});
 p.objects[0].painting.color['0']='C';assert.throws(()=>prepareNativePrimeTower(p,towerSettings),/Truncated/);
});
test('malformed plate geometry, missing extruder heights and wrong printer technology fail explicitly',()=>{
 const p=towerProject();assert.throws(()=>prepareNativePrimeTower(p,{...towerSettings,printer_technology:'SLA'}),/FFF/);assert.throws(()=>prepareNativePrimeTower(p,{...towerSettings,printable_area:['0x0','10x10','20x20']}),/degenerate/);assert.throws(()=>prepareNativePrimeTower(p,{...towerSettings,extruder_printable_area:['0x0,20x0,20x20,0x20'],extruder_printable_height:[]}),/extruder printable/);
 const ccw=prepareNativePrimeTower(p,{...towerSettings,printable_area:[...towerSettings.printable_area].reverse()});assert.deepEqual(ccw.plate.shape,prepareNativePrimeTower(p,towerSettings).plate.shape);
});
test('all source reference requests stay reproducible and response identities/counts are checked',()=>{
 assert.deepEqual(primeTowerCases(),ref.cases.map(({name,request})=>({name,request})));
 for(const c of ref.cases)assert.equal(validateNativePrimeTowerResult(result(c),c.request).visible,c.expected.visible);
 const c=ref.cases[0];for(const edit of [r=>r.plateId='wrong',r=>r.size[0]=Infinity,r=>r.extruders=[2,1],r=>r.alpha=.5,r=>r.containedFirstInstances=[],r=>r.printableInstanceCount=3,r=>r.position=[NaN,0]]){const r=result(c);edit(r);assert.throws(()=>validateNativePrimeTowerResult(r,c.request),/Invalid native prime tower/);}
});
test('renderer matches all original native cube bands exactly, including float division and vertex order',()=>{
 for(const c of ref.cases)assert.deepEqual(primeTowerBands(c.expected),c.expected.bands||[],c.name);
 const r=result(ref.cases[22]),group=createPrimeTowerGeometry(r,['#0080ff','#ff4000']);assert.equal(group.children.length,2);assert.equal(group.rotation.z,r.rotation);assert.deepEqual(group.position.toArray(),[...r.position,0]);assert.equal(group.children[0].material.opacity,Math.fround(.66));assert.equal(group.children[0].material.color.getHexString(),'0080ff');assert.equal(group.children[1].geometry.attributes.position.count,36);
 let released=0;for(const child of group.children)child.geometry.addEventListener('dispose',()=>released++);disposePrimeTower(group);assert.equal(released,2);
});
