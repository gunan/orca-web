import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createMesh,transformPositions}from'../../shared/geometry.js';import{importNative3MF}from'../../shared/native-project.js';import{paintMesh,gapFillPainting,paintByOverhangAngle,decodeFacet,paintedFacetGeometry}from'../../shared/facet-painting.js';import{facetAdjacency}from'../../shared/facet-graph.js';
async function cube(){return importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))).objects[0];}
const states=tree=>Object.hasOwn(tree,'state')?[tree.state]:tree.children.flatMap(states);
const square=()=>createMesh({positions:[0,0,0,2,0,0,0,2,0,2,0,0,2,2,0,0,2,0]});
test('native sphere reaches connected back-facing surfaces while circle is view-facing and neither crosses disconnected shells',async()=>{
 const source=await cube(),options={channel:'supports',state:1,triangleIndex:2,point:[19.8,19.8,20],radius:1,resolution:.1,frontDirection:[0,0,-1]},sphere=paintMesh(source,{...options,tool:'sphere'}).mesh,circle=paintMesh(source,{...options,tool:'circle'}).mesh;
 assert.ok(paintedFacetGeometry(sphere,'supports').some(f=>f.vertices.every(p=>p[0]===20)));assert.ok(paintedFacetGeometry(circle,'supports').every(f=>f.vertices.every(p=>p[2]===20)));
 const separate=createMesh({positions:[0,0,0,2,0,0,0,2,0,0,0,.1,2,0,.1,0,2,.1]});const result=paintMesh(separate,{channel:'seam',state:1,tool:'sphere',triangleIndex:0,point:[.5,.5,0],radius:2,resolution:.1}).mesh;assert.ok(result.painting.seam[0]);assert.equal(result.painting.seam[1],undefined);
});
test('circle brush uses projected radius; clipping and world overhang constraints restrict actual native subfacets',async()=>{
 const source=createMesh({positions:[0,0,0,4,0,12,0,4,0]}),options={channel:'color',state:1,triangleIndex:0,point:[.5,.5,1.5],radius:1,resolution:.1,frontDirection:[0,0,-1]},circle=paintMesh(source,{...options,tool:'circle'}).mesh,sphere=paintMesh(source,{...options,tool:'sphere'}).mesh;
 const maxZ=mesh=>Math.max(...paintedFacetGeometry(mesh,'color').flatMap(f=>f.vertices.map(p=>p[2])));assert.ok(maxZ(circle)>maxZ(sphere)+1);
 const clipped=paintMesh(square(),{channel:'supports',state:1,tool:'circle',triangleIndex:0,point:[.5,.5,0],radius:2,resolution:.05,frontDirection:[0,0,-1],clipPlane:{normal:[1,0,0],offset:1}}).mesh;assert.ok(paintedFacetGeometry(clipped,'supports').every(f=>f.vertices.every(p=>p[0]<=1.04)));
 const body=await cube(),result=paintByOverhangAngle(body,{angle:40}).mesh;assert.ok(paintedFacetGeometry(result,'supports').every(f=>f.vertices.every(p=>p[2]===0)));
 assert.equal(paintMesh(body,{channel:'supports',state:1,tool:'triangle',triangleIndex:2,overhangAngle:40}).report.changedFacets,0);
});
test('subfacet bucket and triangle editing cross unequal shared edges without repainting other states',()=>{
 const source=square();source.painting={version:1,color:{0:'00043'}};const result=paintMesh(source,{channel:'color',state:2,tool:'bucket',triangleIndex:1,point:[1.8,1.8,0],fillAngle:0}).mesh;
 assert.deepEqual(states(decodeFacet(result.painting.color[0]).tree),[0,2,2,1]);assert.equal(result.painting.color[1],'8');
 const one=paintMesh(source,{channel:'color',state:2,tool:'facet',triangleIndex:0,point:[.6,.6,0]}).mesh;assert.deepEqual(states(decodeFacet(one.painting.color[0]).tree),[0,0,0,2]);assert.equal(one.painting.color[1],undefined);
});
test('gap fill uses strict local patch area and lowest adjacent state, preserving immutable snapshot decisions',()=>{
 const source=square();source.scale=[4,4,4];source.painting={version:1,color:{0:'00043'}};
 assert.deepEqual(states(decodeFacet(gapFillPainting(source,{channel:'color',areaThreshold:.5}).mesh.painting.color[0]).tree),[0,0,0,1]);const filled=gapFillPainting(source,{channel:'color',areaThreshold:.51});assert.equal(filled.report.changedPatches,2);assert.deepEqual(states(decodeFacet(filled.mesh.painting.color[0]).tree),[1,0,0,0]);assert.equal(source.painting.color[0],'00043');
 const three=createMesh({positions:[0,0,0,2,0,0,0,2,0,2,0,0,2,2,0,0,2,0,2,0,0,4,0,0,2,2,0]});three.painting={version:1,color:{0:'4',1:'8'}};const result=gapFillPainting(three,{channel:'color',areaThreshold:2.1});assert.equal(result.mesh.painting.color[1],undefined,'smallest adjacent state is zero, not state one');
});
test('height paint and source native brush constraints reject invalid or excessive parameters',async()=>{
 const source=await cube(),height=paintMesh(source,{channel:'color',state:2,tool:'height',triangleIndex:0,heightStart:5,height:2,resolution:.1}).mesh;
 const facets=paintedFacetGeometry(height,'color');assert.ok(facets.length>20);assert.ok(facets.every(f=>f.vertices.every(p=>p[2]>=4.94&&p[2]<=7.06)));
 for(const radius of [.1,9])assert.throws(()=>paintMesh(source,{channel:'supports',state:1,tool:'sphere',triangleIndex:0,point:[0,0,0],radius}),/Native brush radius/);
 assert.throws(()=>paintMesh(source,{channel:'supports',state:1,tool:'fill',triangleIndex:0,fillAngle:91}),/Smart-fill angle/);assert.throws(()=>gapFillPainting(source,{channel:'supports',areaThreshold:6}),/gap area/);assert.throws(()=>paintMesh(source,{channel:'supports',state:1,tool:'circle',triangleIndex:0,point:[0,0,0],frontDirection:[0,0,0]}),/camera direction/);
});
