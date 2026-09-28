import test from'node:test';import assert from'node:assert/strict';import{Triangle,Vector3}from'three';
import{distanceSegments,distancePointSegment,distanceSegmentTriangle}from'../../shared/facet-brush-math.js';import{createMesh}from'../../shared/geometry.js';import{paintMesh,paintedFacetGeometry}from'../../shared/facet-painting.js';
test('finite capsule distances handle intersections, skew edges, parallel segments and degenerate projections',()=>{
 assert.equal(distanceSegments([0,0,0],[4,0,0],[2,-1,0],[2,1,0]),0);assert.equal(distanceSegments([0,0,0],[4,0,0],[2,-1,3],[2,1,3]),3);assert.equal(distanceSegments([0,0,0],[4,0,0],[1,2,0],[3,2,0]),2);assert.equal(distancePointSegment([2,2,0],[1,0,0],[1,0,0]),Math.sqrt(5));
 const triangle=[[0,0,0],[4,0,0],[0,4,0]];assert.equal(distanceSegmentTriangle(triangle,[1,1,-2],[1,1,2]),0);assert.equal(distanceSegmentTriangle(triangle,[1,1,3],[2,1,3]),3);assert.equal(distanceSegmentTriangle([[0,0,0],[2,0,0],[4,0,0]],[1,1,0],[3,1,0]),1);
});
test('continuous sphere and circle strokes cover the swept capsule between sparse pointer samples',()=>{
 const source=createMesh({positions:[0,0,0,12,0,0,0,12,0]}),options={channel:'supports',state:1,triangleIndex:0,point:[8,2,0],previousPoint:[2,2,0],previousTriangleIndex:0,radius:.4,resolution:.05,frontDirection:[0,0,-1]};
 for(const tool of ['sphere','circle']){const painted=paintMesh(source,{...options,tool}).mesh,regions=paintedFacetGeometry(painted,'supports');assert.ok(regions.length>100);for(let x=2;x<=8;x+=.25){const point=new Vector3(x,2,0);assert.ok(regions.some(facet=>new Triangle(...facet.vertices.map(vertex=>new Vector3(...vertex))).containsPoint(point)),`${tool} gap at ${x}`);}assert.ok(regions.every(facet=>facet.vertices.every(point=>point[1]>=1.55&&point[1]<=2.45)));}
});

import {projectPaintStroke} from '../../shared/facet-stroke.js';
test('screen interpolation preserves facet transitions, curve bends and missed surfaces with bounded work',()=>{
 const calls=[],hits=projectPaintStroke([0,0],[8,0],point=>{calls.push(point);if(point[0]>=3&&point[0]<=5)return null;return{id:'part',triangleIndex:point[0]<2?0:1,point:[point[0],0,point[0]>6?point[0]-6:0]};});
 assert.equal(calls.length,10);assert.ok(calls.every((point,index)=>index===0||point[0]-calls[index-1][0]<=1));assert.equal(hits.filter(point=>point===null).length,1);assert.deepEqual(hits.filter(Boolean).map(hit=>hit.triangleIndex),[0,0,1,1,1]);assert.equal(hits[0].point[0],0);assert.equal(hits.at(-1).point[0],8);
 const triangleRuns=projectPaintStroke([0,0],[100,0],point=>({id:'mesh',triangleIndex:0,point:[...point,0]}));assert.equal(triangleRuns.length,2);assert.deepEqual(triangleRuns.map(hit=>hit.point),[[0,0,0],[100,0,0]]);
 assert.throws(()=>projectPaintStroke([0,0],[100,0],()=>null,{maxSamples:50}),/sample limit/);assert.throws(()=>projectPaintStroke(null,[NaN,0],()=>null),/finite/);
 assert.equal(distanceSegmentTriangle([[1,1,1],[1,1,1],[1,1,1]],[1,1,0],[1,1,2]),0);
});
