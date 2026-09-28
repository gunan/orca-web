import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';
import {importNative3MF}from'../../shared/native-project.js';import {paintedFacetGeometry}from'../../shared/facet-painting.js';import {remapFacetPainting}from'../../shared/facet-correspondence.js';import {splitDisconnected,assembleMeshes,disassembleMesh,repairMesh}from'../../shared/geometry-operations.js';
async function cube(){return importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))).objects[0];}
const regions=objects=>objects.flatMap(object=>paintedFacetGeometry(object,'supports')).map(({vertices,state})=>JSON.stringify({vertices,state})).sort();
test('split and assembly remap sparse native painting to exact source triangles',async()=>{
 const first=await cube(),second=await cube();first.id='one';first.position=[50,50,0];first.painting={version:1,supports:{6:'0482'}};second.id='two';second.position=[90,50,0];second.painting={version:1,supports:{4:'00443'}};
 const assembly=assembleMeshes([first,second]);assert.deepEqual(regions([assembly]),regions([first,second]));const split=splitDisconnected(assembly),disassembled=disassembleMesh(assembly);assert.equal(split.length,2);assert.deepEqual(regions(split),regions([first,second]));assert.deepEqual(regions(disassembled),regions([first,second]));
});
test('ordinary repair preserves painting through triangle reindexing and rejects painted deletion',async()=>{
 const source=await cube();source.painting={version:1,supports:{6:'0482'}};const extra={...source,positions:[...source.positions,...source.positions.slice(0,9)]};const repaired=repairMesh(extra);assert.equal(repaired.report.removedDuplicateTriangles,1);assert.ok(repaired.report.paintingPreserved);assert.deepEqual(regions([repaired.mesh]),regions([source]));
 const conflict={...extra,painting:{...extra.painting,supports:{...extra.painting.supports,12:'8'}}};assert.throws(()=>repairMesh(conflict),error=>error.code==='PAINTING_CORRESPONDENCE_LOSS'&&/painted.*duplicate/.test(error.message));assert.equal(conflict.positions.length,117);
});
test('compatible orientation repair preserves exact painted subregions and incompatible bases fail before loss',async()=>{
 const source=await cube();source.painting={version:1,supports:{6:'0482'}};const corrupted={...source,positions:[...source.positions]};for(let a=0;a<3;a++)[corrupted.positions[6*9+3+a],corrupted.positions[6*9+6+a]]=[corrupted.positions[6*9+6+a],corrupted.positions[6*9+3+a]];
 const before=regions([corrupted]),repaired=repairMesh(corrupted);assert.equal(repaired.mesh.painting.winding,-1);assert.deepEqual(regions([repaired.mesh]),before);
 const conflict={...corrupted,painting:{version:1,supports:{6:'0482',7:'00443'}}};assert.throws(()=>repairMesh(conflict),error=>error.code==='PAINTING_CORRESPONDENCE_LOSS'&&/incompatible vertex/.test(error.message));
});
test('assembly rejects incompatible reflected nonuniform paint while uniform states remain preservable',async()=>{
 const first=await cube(),second=await cube();first.painting={version:1,winding:1,supports:{6:'0482'}};second.painting={version:1,winding:-1,supports:{6:'0482'}};assert.throws(()=>assembleMeshes([first,second]),error=>error.code==='PAINTING_CORRESPONDENCE_LOSS');second.painting.supports[6]='44443';assert.doesNotThrow(()=>assembleMeshes([first,second]));
});
