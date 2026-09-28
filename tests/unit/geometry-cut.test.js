import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtrudeGeometry,Shape } from 'three';
import { createMesh, transformPositions, analyzeMesh, meshBounds } from '../../shared/geometry.js';
import { cutMesh, mirrorMesh, cutNativeGroup, mirrorNativeGroup } from '../../shared/geometry-cut.js';

function box(size=20,origin=[0,0,0],reverse=false){
  const v=[[0,0,0],[size,0,0],[size,size,0],[0,size,0],[0,0,size],[size,0,size],[size,size,size],[0,size,size]],f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return createMesh({name:'Box',plateId:'plate-1',positions:f.flatMap(face=>(reverse?[face[0],face[2],face[1]]:face).flatMap(i=>v[i].map((value,axis)=>value+origin[axis])))});
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-3,`${a} ≈ ${b}`);

test('planar cut produces closed caps with conserved volume and preserves transformed placement',()=>{
  const mesh=box(),before=JSON.stringify(mesh),result=cutMesh(mesh,{offset:7});
  close(result.report.upper.volume,20*20*13);close(result.report.lower.volume,20*20*7);close(result.report.volumeBefore,result.report.volumeAfter);
  for(const half of result.objects){assert.equal(analyzeMesh(half).manifold,true);assert.deepEqual(half.scale,[1,1,1]);assert.equal(half.plateId,'plate-1');}
  assert.deepEqual(meshBounds(result.upper).min,[0,0,7]);assert.deepEqual(meshBounds(result.lower).max,[20,20,7]);assert.equal(JSON.stringify(mesh),before);
  const transformed={...box(),position:[30,40,5],rotation:[0,0,30],scale:[2,.5,1]};
  const changed=cutMesh(transformed,{normal:[1,1,1],offset:90/Math.sqrt(3)});close(changed.report.volumeBefore,changed.report.volumeAfter);
  assert.ok(changed.objects.every(half=>analyzeMesh(half).manifold));
});

test('cut caps preserve nested cavities, islands and disconnected shells',()=>{
  const outer=box(),inner=box(10,[5,5,5],true),island=box(4,[8,8,8]),separate=box(8,[30,0,0]);
  const nested=createMesh({...outer,positions:[...outer.positions,...inner.positions,...island.positions,...separate.positions]});
  const result=cutMesh(nested,{offset:10});
  assert.equal(result.report.caps.upper.loops,3);assert.equal(result.report.upper.manifold,true);assert.equal(result.report.lower.manifold,true);
  close(result.report.volumeBefore,8000-1000+64+512);close(result.report.volumeAfter,result.report.volumeBefore);
  // Closed cavity cross-section must not be filled by a cap triangle.
  for(const half of result.objects)for(let index=0;index<half.positions.length;index+=9){const tri=[0,3,6].map(offset=>half.positions.slice(index+offset,index+offset+3));if(tri.every(point=>Math.abs(point[2]-10)<1e-5)){const center=[0,1].map(axis=>tri.reduce((sum,p)=>sum+p[axis],0)/3);assert.ok(!(center[0]>5&&center[0]<15&&center[1]>5&&center[1]<15)||center.every(value=>value>=8&&value<=12),'A cap must retain the cavity opening around its island');}}
});

test('cut through existing vertices/edges remains manifold and invalid surfaces fail without mutation',()=>{
  const mesh=box();const diagonal=cutMesh(mesh,{normal:[1,1,0],offset:20/Math.sqrt(2)});assert.ok(diagonal.objects.every(half=>analyzeMesh(half).manifold));close(diagonal.report.volumeAfter,8000);
  assert.throws(()=>cutMesh(mesh,{offset:0}),/interior/);assert.throws(()=>cutMesh(mesh,{offset:30}),/interior/);assert.throws(()=>cutMesh(mesh,{normal:[0,0,0],offset:10}),/normal/);
  assert.throws(()=>cutMesh({...mesh,positions:mesh.positions.slice(9)},{offset:10}),/closed/);
  assert.equal(cutMesh(mesh,{offset:10,keep:'lower'}).objects.length,1);
});

test('concave cut contours cap the real outline rather than its convex hull',()=>{
  const shape=new Shape();shape.moveTo(0,0);for(const[x,y]of [[20,0],[20,10],[10,10],[10,20],[0,20]])shape.lineTo(x,y);shape.closePath();
  const geometry=new ExtrudeGeometry(shape,{depth:10,bevelEnabled:false,steps:1}),mesh=createMesh({positions:geometry.getAttribute('position').array});geometry.dispose();
  const result=cutMesh(mesh,{offset:5});close(result.report.upper.volume,1500);close(result.report.lower.volume,1500);assert.ok(result.objects.every(object=>analyzeMesh(object).manifold));
  for(const half of result.objects)for(let index=0;index<half.positions.length;index+=9){const tri=[0,3,6].map(offset=>half.positions.slice(index+offset,index+offset+3));if(tri.every(point=>Math.abs(point[2]-5)<1e-5)){const center=[0,1].map(axis=>tri.reduce((sum,p)=>sum+p[axis],0)/3);assert.ok(!(center[0]>10&&center[1]>10));}}
});

test('mirroring transforms asymmetric geometry, preserves outward winding and is reversible',()=>{
  const points=[0,0,0,0,10,0,10,0,0, 0,0,0,10,0,0,0,0,20, 0,0,0,0,0,20,0,10,0, 10,0,0,0,10,0,0,0,20];
  const mesh=createMesh({positions:points,position:[30,40,5],rotation:[0,0,30],scale:[2,1,1],native:{partSettings:{wall_loops:'4'}}}),original=Array.from(transformPositions(mesh));
  const mirrored=mirrorMesh(mesh,'x'),twice=mirrorMesh(mirrored,'x');
  assert.equal(analyzeMesh(mirrored).manifold,true);close(analyzeMesh(mirrored).signedVolume,analyzeMesh(mesh).signedVolume);
  assert.deepEqual(meshBounds(mirrored),meshBounds(mesh));assert.deepEqual(mirrored.scale,[1,1,1]);assert.deepEqual(mirrored.native,mesh.native);
  twice.positions.forEach((value,index)=>close(value,original[index]));assert.throws(()=>mirrorMesh(mesh,'w'),/axis/);
});

test('native group cut preserves part roles, assignments and shared overrides without orphaned modifiers',()=>{
  const body={...box(),id:'body',filamentSlot:1,native:{groupId:'group',objectName:'Grouped box',objectSettings:{wall_loops:'4'},partSettings:{},partType:'normal_part'}};
  const hole={...box(6,[7,7,-2]),id:'hole',filamentSlot:2,native:{...body.native,partType:'negative_part',partSettings:{outer_wall_speed:'30'}}};
  const modifier={...box(5,[5,5,15]),id:'modifier',filamentSlot:2,native:{...body.native,partType:'modifier_part',partSettings:{sparse_infill_density:'60%'}}};
  const unrelated={...box(5,[40,0,0]),id:'unrelated'};
  const result=cutNativeGroup([body,hole,modifier,unrelated],'hole',{offset:10});
  assert.equal(result.upper.length,2);assert.equal(result.lower.length,2);assert.equal(result.objects.find(object=>object.id==='unrelated'),unrelated);
  assert.notEqual(result.upper[0].native.groupId,result.lower[0].native.groupId);assert.equal(new Set(result.upper.map(object=>object.native.groupId)).size,1);
  assert.equal(result.lower.find(object=>object.native.partType==='negative_part').filamentSlot,2);assert.equal(result.upper.find(object=>object.native.partType==='modifier_part').native.partSettings.sparse_infill_density,'60%');
  assert.ok(result.created.every(object=>object.native.objectSettings.wall_loops==='4'));
  const floating={...modifier,positions:box(5,[5,5,30]).positions};
  const discarded=cutNativeGroup([body,floating],'body',{offset:25});assert.equal(discarded.upper.length,0);assert.equal(discarded.lower.length,1);assert.equal(discarded.report.discarded.length,1);
  const mirrored=mirrorNativeGroup([body,hole,unrelated],'body','x');assert.equal(mirrored[2],unrelated);assert.equal(mirrored[1].native.partType,'negative_part');assert.ok(mirrored.slice(0,2).every(object=>analyzeMesh(object).manifold));
});
