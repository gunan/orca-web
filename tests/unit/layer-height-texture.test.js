import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import fixture from'../fixtures/layer-height-texture-reference.json'with{type:'json'};import{layerHeightProfileFromRanges}from'../../shared/layer-height-profile.js';import{generateObjectLayers,generateLayerHeightTexture,sampleLayerHeightTexture,layerCursorBlend}from'../../shared/layer-height-texture.js';import{normalizeLayerHeightProfile}from'../../shared/variable-layers.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const expected of fixture)test(`native initial profile, layer schedule and complete RGBA/LOD textures match independent C++ case ${expected.id}`,()=>{
 assert.deepEqual(layerHeightProfileFromRanges(expected.context,{editable:false}),expected.initial);const layers=generateObjectLayers(expected.profile,expected.context);assert.equal(layers.length,expected.layers.length);layers.forEach((value,index)=>assert.ok(Math.abs(value-expected.layers[index])<1e-12));const texture=generateLayerHeightTexture(expected.profile,expected.context,{width:expected.width,height:expected.height});assert.equal(texture.cells,expected.cells);assert.equal(hash(texture.data),expected.dataHash);assert.equal(hash(texture.lod),expected.lodHash);assert.equal(texture.layerCount,layers.length/2);
});
test('editable uniform initialization inserts one collinear pair while preserving native range discontinuities',()=>{
 const {context,initial}=fixture[0],editable=layerHeightProfileFromRanges(context);assert.equal(initial.length,4);assert.equal(editable.length,6);normalizeLayerHeightProfile(editable,context);const expected=generateObjectLayers(initial,context);generateObjectLayers(editable,context).forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-12));assert.deepEqual(layerHeightProfileFromRanges(fixture[3].context),fixture[3].initial);assert.throws(()=>layerHeightProfileFromRanges({...context,objectHeight:.1}),/no editable/);
});
test('default preview layers retain native range heights instead of silently becoming uniform',()=>{
 const expected=fixture[3];assert.deepEqual(generateObjectLayers([],expected.context),expected.layers);const texture=generateLayerHeightTexture([],expected.context);assert.ok(texture.layerCount>80);assert.equal(texture.width,1024);assert.equal(texture.height,1024);assert.equal(texture.data.length,1024*1024*4);assert.equal(texture.lod.length,512*512*4);const sample=sampleLayerHeightTexture(texture,5);assert.ok(sample.every(Number.isFinite));assert.equal(Math.round(sample[3]),255);
});
test('native cursor band is yellow at half strength in the center and fades to zero outside its cosine band',()=>{
 assert.equal(layerCursorBlend(10,10,2),.5);assert.equal(layerCursorBlend(20,10,2),0);assert.equal(layerCursorBlend(10,null,2),0);assert.ok(layerCursorBlend(10.5,10,2)>0&&layerCursorBlend(10.5,10,2)<.5);
});
test('malformed profiles and native texture overflow are rejected before allocating unsafe buffers',()=>{
 const context=fixture[0].context;assert.throws(()=>generateObjectLayers([0,0,10,.2],context),/profile/);assert.throws(()=>generateLayerHeightTexture([],{...context,objectHeight:1e7}),/resource limit/);assert.throws(()=>generateLayerHeightTexture([],{...context,objectHeight:1000},{width:8,height:8}),/capacity/);assert.throws(()=>generateLayerHeightTexture([],context,{width:7}),/dimensions/);assert.throws(()=>layerHeightProfileFromRanges({...context,ranges:[{minZ:2,maxZ:1,settings:{layer_height:'.2'}}]}),/range/);
});

test('default C++ fused arithmetic differs only by documented one-channel rounding units',()=>{
 let differences=0;for(const expected of fixture){const texture=generateLayerHeightTexture(expected.profile,expected.context,{width:expected.width,height:expected.height}),bytes=Buffer.concat([texture.data,texture.lod]);for(const[index,value]of expected.contractedDifferences){assert.ok(Math.abs(bytes[index]-value)<=1);assert.notEqual(index%4,3);bytes[index]=value;differences++;}assert.equal(hash(bytes),expected.contractedHash);}assert.ok(differences>0);
});
