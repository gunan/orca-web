import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adjustLayerHeightProfile} from '../../shared/variable-layer-brush.js';
const reference=JSON.parse(readFileSync(new URL('../fixtures/variable-layer-brush-reference.json',import.meta.url)));
const context={objectHeight:20,firstLayerHeight:.2,firstLayerFixed:true,layerHeight:.2,minLayerHeight:.08,maxLayerHeight:.3,ranges:[]};
const base=[0,.2,.2,.2,.2,.2,20,.2];
for(const fixture of reference.cases)test(`native brush ${fixture.action}, fixture ${fixture.fixture}, matches independently compiled C++ at every control point`,()=>{
 const before=[...fixture.before],actual=adjustLayerHeightProfile(before,context,fixture);
 assert.equal(actual.length,fixture.after.length);
 actual.forEach((value,index)=>assert.ok(Math.abs(value-fixture.after[index])<1e-12,`${index}: ${value} != ${fixture.after[index]}`));
 assert.deepEqual(before,fixture.before,'A draft edit never mutates its input');
});
test('layer brush protects native first layer, closed range margins and max/min saturation',()=>{
 for(const z of[-1,0,.19,21])assert.deepEqual(adjustLayerHeightProfile(base,context,{z}),base);
 for(const z of[3.8,4,5,6.2])assert.deepEqual(adjustLayerHeightProfile(base,{...context,ranges:[{minZ:4,maxZ:6,settings:{layer_height:'.12'}}]},{z}),base);
 const increased=adjustLayerHeightProfile(base,context,{z:10,strength:1,action:'increase'}),decreased=adjustLayerHeightProfile(base,context,{z:10,strength:1,action:'decrease'});
 assert.equal(Math.max(...increased.filter((_,i)=>i%2)),.3);assert.equal(Math.min(...decreased.filter((_,i)=>i%2)),.08);
 assert.deepEqual(increased.slice(0,4),base.slice(0,4));assert.equal(decreased.at(-2),20);
 assert.deepEqual(adjustLayerHeightProfile([0,.2,.2,.2,.2,.3,20,.3],context,{z:10,action:'increase'}),[0,.2,.2,.2,.2,.3,20,.3]);
});
test('empty profile initializes a real editable native curve while malformed brushes reject',()=>{
 const edited=adjustLayerHeightProfile([],context,{z:8});assert.ok(edited.length>8);assert.ok(edited.some((v,i)=>i%2&&v<.2));
 for(const options of[{z:NaN},{z:5,bandWidth:1.4},{z:5,bandWidth:11},{z:5,strength:0},{z:5,action:'unknown'}])assert.throws(()=>adjustLayerHeightProfile(base,context,options),/Layer brush/);
 assert.throws(()=>adjustLayerHeightProfile(null,context,{z:5}),/Variable layer profiles/);
 assert.throws(()=>adjustLayerHeightProfile(base,{...context,firstLayerFixed:false},{z:.2}),/above Z=0/);
});
test('band-local reset converges toward the configured height and smooth preserves distant points',()=>{
 const profile=[0,.2,.2,.2,.2,.2,4,.12,5,.28,6,.12,10,.25,20,.2];
 let reset=profile;for(let i=0;i<20;i++)reset=adjustLayerHeightProfile(reset,context,{z:5,action:'reduce'});
 const at=reset.findIndex((value,index)=>index%2===0&&Math.abs(value-5)<1e-8);assert.ok(at>=0);assert.ok(Math.abs(reset[at+1]-.2)<1e-8);
 const smooth=adjustLayerHeightProfile(profile,context,{z:5,action:'smooth'});assert.deepEqual(smooth.slice(0,6),profile.slice(0,6));assert.deepEqual(smooth.slice(-4),profile.slice(-4));assert.ok(Math.max(...smooth.filter((v,i)=>i%2&&smooth[i-1]>4&&smooth[i-1]<6))<.28);
});

test('the first brush preserves native height-range initialization, including guarded range bands',()=>{
 const config={...context,ranges:[{minZ:4,maxZ:8,settings:{layer_height:'.12'}}]},profile=adjustLayerHeightProfile([],config,{z:10});
 const pair=(z,h)=>profile.some((value,index)=>index%2===0&&value===z&&profile[index+1]===h);
 assert.ok(pair(4,.12));assert.ok(pair(8,.12));assert.ok(pair(4,.2));assert.ok(pair(8,.2));
 const unchanged=adjustLayerHeightProfile([],config,{z:6});assert.equal(unchanged.length,12);assert.ok(unchanged.some((height,index)=>index%2&&height===.12));
});
