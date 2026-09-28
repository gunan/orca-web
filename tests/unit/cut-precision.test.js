import test from 'node:test';
import assert from 'node:assert/strict';
import {createMesh,analyzeMesh,meshBounds} from '../../shared/geometry.js';
import {cutMesh} from '../../shared/geometry-cut.js';

test('near-edge cuts remove Float32-collapsed faces and split collinear boundary edges without moving the plane',()=>{
  // A thin closed tetrahedron reproduces the exact precision failure from the
  // native retraction tower: clipping just below a vertex makes one face
  // collinear when its world coordinates are represented in Float32.
  const points=[[100,100,22.2],[100,100,21.40000343322754],[100.095,100.24,.4],[102,102,22.2]],faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],mesh=createMesh({positions:faces.flatMap(face=>face.flatMap(index=>points[index]))}),before=JSON.stringify(mesh),offset=21.3999;
  assert.equal(analyzeMesh(mesh).manifold,true);const result=cutMesh(mesh,{offset});assert.equal(result.report.offset,offset);assert.ok(result.report.precision.upper.removedTriangles>0);assert.ok(result.report.precision.upper.splitEdges>0);
  for(const half of result.objects){const report=analyzeMesh(half);assert.equal(report.manifold,true);assert.equal(report.degenerateTriangles,0);assert.equal(report.boundaryEdges,0);assert.equal(report.inconsistentWindingEdges,0);}
  assert.equal(meshBounds(result.lower).max[2],Math.fround(offset));assert.equal(meshBounds(result.upper).min[2],Math.fround(offset));assert.ok(Math.abs(result.report.volumeBefore-result.report.volumeAfter)<.0001);assert.equal(JSON.stringify(mesh),before);
});
