import test from 'node:test';
import assert from 'node:assert/strict';
import{createMesh,transformPositions}from'../../shared/geometry.js';
import{decodeFacet,encodeFacet,expandFacet,flipPaintingWinding,normalizePainting,paintedFacetGeometry,paintMesh}from'../../shared/facet-painting.js';
const vertices=[[0,0,0],[8,0,0],[0,8,0]],mesh=()=>createMesh({positions:vertices.flat()});

test('native nibble strings decode exact states and split-child order with lossless encoding',()=>{
  for(let state=0;state<=16;state++){const code=encodeFacet({state});assert.equal(code,state<3?String(state*4):(state-3).toString(16).toUpperCase()+'C');assert.equal(decodeFacet(code).tree.state,state);}
  for(const code of['00443','0482','485','0044304852','1C0C2C0C1C13'])assert.equal(encodeFacet(decodeFacet(code).tree),code);
  const parts=expandFacet(vertices,'00443');assert.deepEqual(parts.map(part=>part.state),[0,0,1,1]);assert.deepEqual(parts[2].vertices,[[4,4,0],[0,8,0],[0,4,0]]);assert.deepEqual(parts[3].vertices,[[4,0,0],[4,4,0],[0,4,0]]);
  const two=expandFacet(vertices,'0482');assert.deepEqual(two.map(part=>part.vertices),[[[0,0,0],[4,0,0],[0,4,0]],[[4,0,0],[8,0,0],[0,4,0]],[[8,0,0],[0,8,0],[0,4,0]]]);
});
test('bounded painting validation rejects malformed, truncated, excessive and incompatible native data',()=>{
  for(const code of['','C','EC','000','G','4a','3','0044F','00447','44D'])assert.throws(()=>decodeFacet(code));
  assert.throws(()=>decodeFacet('8',{channel:'fuzzy'}),/state/);assert.throws(()=>decodeFacet('0C',{channel:'color',filamentCount:2}),/filament slot/);
  const deep='0'+'00'.repeat(26)+'1'.repeat(26);assert.throws(()=>decodeFacet(deep),/deep|Trailing|Truncated/);
  for(const painting of[{version:2},{version:1,winding:0},{version:1,unknown:{}},{version:1,supports:{1:'4'}},{version:1,supports:{'01':'4'}},{version:1,supports:{0:'8C'}}])assert.throws(()=>normalizePainting(painting,1));
  assert.throws(()=>decodeFacet('4',{budget:{nodes:2000000}}),/total node/);
});
test('painting records actual facets, connected fill and sphere refinement without changing source surfaces',()=>{
  const source=mesh(),before=Array.from(transformPositions(source)),triangle=paintMesh(source,{channel:'supports',state:1,triangleIndex:0}).mesh;assert.equal(triangle.painting.supports[0],'4');assert.deepEqual(Array.from(transformPositions(triangle)),before);
  const brush=paintMesh(source,{channel:'color',state:2,triangleIndex:0,tool:'sphere',point:[1,1,0],radius:1,resolution:.25}).mesh,regions=paintedFacetGeometry(brush,'color');assert.ok(regions.length>3);assert.ok(regions.every(part=>part.vertices.every(point=>Math.hypot(point[0]-1,point[1]-1)<1.4)));assert.ok(decodeFacet(brush.painting.color[0]).nodes>5);assert.deepEqual(Array.from(transformPositions(brush)),before);
  const two=createMesh({positions:[...vertices.flat(),8,0,0,8,8,0,0,8,0]});assert.equal(Object.keys(paintMesh(two,{channel:'seam',state:2,triangleIndex:0,tool:'fill',fillAngle:1}).mesh.painting.seam).length,2);
  assert.deepEqual(paintMesh(triangle,{channel:'supports',state:0,triangleIndex:0}).mesh.painting,{version:1,winding:1});
});
test('winding changes preserve exact asymmetric native painted regions via explicit vertex order',()=>{
  const original={...mesh(),painting:{version:1,supports:{0:'0482'}}},before=paintedFacetGeometry(original,'supports');
  const reversed={...original,positions:[...vertices[0],...vertices[2],...vertices[1]],painting:flipPaintingWinding(original.painting,1)},after=paintedFacetGeometry(reversed,'supports');assert.deepEqual(after,before);assert.equal(reversed.painting.supports[0],'0482');assert.equal(reversed.painting.winding,-1);assert.equal(flipPaintingWinding(reversed.painting,1).winding,1);
});
