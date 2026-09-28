import test from 'node:test';import assert from 'node:assert/strict';
import {BoxGeometry,Triangle,Vector3} from 'three';import {createMesh} from '../../shared/geometry.js';import {clippingSection,viewClipPlane} from '../../shared/paint-clipping.js';
const box=(size=20,center=[0,0,0])=>{const geometry=new BoxGeometry(size,size,size).toNonIndexed();const values=Array.from(geometry.attributes.position.array).map((v,i)=>v+center[i%3]);geometry.dispose();return values;};
const reverse=positions=>positions.flatMap((_,i)=>i%9?[]:[...positions.slice(i,i+3),...positions.slice(i+6,i+9),...positions.slice(i+3,i+6)]);
const area=positions=>{let sum=0;for(let i=0;i<positions.length;i+=9)sum+=new Triangle(...[0,3,6].map(j=>new Vector3(...positions.slice(i+j,i+j+3)))).getArea();return sum;};
test('display clipping caps preserve nested holes, disconnected shells and exact plane orientation',()=>{
 const mesh=createMesh({positions:[...box(),...reverse(box(8)),...box(4,[30,0,0])]}),before=structuredClone(mesh);
 const section=clippingSection(mesh,{normal:[0,0,1],offset:1});assert.equal(section.contours.length,3);assert.equal(section.area,352);assert.ok(Math.abs(area(section.positions)-352)<1e-8);assert.ok(section.positions.every((value,index)=>index%3!==2||value===1));
 for(let i=0;i<section.positions.length;i+=9){const t=new Triangle(...[0,3,6].map(j=>new Vector3(...section.positions.slice(i+j,i+j+3))));assert.ok(t.getNormal(new Vector3()).z>0);assert.equal(t.containsPoint(new Vector3(0,0,1)),false);}
 assert.deepEqual(mesh,before);assert.equal(clippingSection(mesh,{normal:[0,0,1],offset:10}).positions.length,0);
 const reversed=clippingSection(mesh,{normal:[0,0,-1],offset:-1});assert.equal(reversed.area,section.area);assert.ok(new Triangle(...[0,3,6].map(j=>new Vector3(...reversed.positions.slice(j,j+3)))).getNormal(new Vector3()).z<0);
});
test('world transforms and on-plane edges retain accurate sections, while invalid open contours fail',()=>{
 const mesh=createMesh({positions:box(),rotation:[0,0,45],position:[100,80,0],scale:[2,1,1]});const section=clippingSection(mesh,{normal:[0,0,1],offset:0});assert.ok(Math.abs(section.area-800)<1e-3);assert.ok(section.contours[0].some(point=>point[0]>120));
 const vertexPlane=clippingSection(createMesh({positions:box()}),{normal:[1,1,0],offset:0});assert.ok(Math.abs(vertexPlane.area-400*Math.sqrt(2))<1e-5);
 const open=createMesh({positions:box().slice(18)});assert.throws(()=>clippingSection(open,{normal:[0,0,1],offset:0}),/open|branches/);assert.throws(()=>clippingSection(mesh,{normal:[0,0,1],offset:0},{maxTriangles:10}),/triangle limit/);assert.throws(()=>clippingSection(mesh,{normal:[0,0,1],offset:0},{maxSegments:2}),/contour limit/);
});
test('view-aligned clipping fixes camera-facing normal and moves through the selected world bounding sphere',()=>{
 const mesh=createMesh({positions:box(),position:[10,20,30]});assert.deepEqual(viewClipPlane(mesh,[0,0,-1],.5),{normal:[0,0,1],offset:30});const start=viewClipPlane(mesh,[0,0,-1],0),end=viewClipPlane(mesh,[0,0,-1],1);assert.ok(start.offset>40);assert.ok(end.offset<20);assert.deepEqual(viewClipPlane(mesh,[0,-1,0],.5),{normal:[0,1,0],offset:20});assert.throws(()=>viewClipPlane(mesh,[0,0,0]),/direction/);assert.throws(()=>viewClipPlane(mesh,[0,0,-1],2),/ratio/);
});
