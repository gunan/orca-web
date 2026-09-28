import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import * as THREE from 'three';
import{primeTowerBounds,createPrimeTowerGeometry,disposePrimeTower}from'../../src/prime-tower-renderer.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url)));
test('current preview bounds contain every rendered native band and independent rotated shell corner',()=>{
 for(const c of ref.cases)for(const rotation of[0,Math.PI/5,-Math.PI/3,Math.PI]){
  const result={...c.expected,rotation},bounds=primeTowerBounds(result);if(!result.visible){assert.equal(bounds,null);continue;}
  const group=createPrimeTowerGeometry(result,['#0080ff','#ff4000']);group.updateMatrixWorld(true);
  const inside=point=>point.toArray().forEach((v,i)=>{assert.ok(v>=bounds.min[i]-1e-10,`${c.name} min${i}`);assert.ok(v<=bounds.max[i]+1e-10,`${c.name} max${i}`);});
  group.traverse(mesh=>{if(mesh.isMesh){const points=mesh.geometry.attributes.position;for(let i=0;i<points.count;i++)inside(new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(mesh.matrixWorld));}});
  for(const x of[0,result.size[0]])for(const y of[0,result.size[1]])for(const z of[0,result.size[2]])inside(new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,0,1),rotation).add(new THREE.Vector3(...result.position,0)));
  disposePrimeTower(group);
 }
});
test('missing or hidden tower has no camera extent',()=>{for(const result of [undefined,null,{visible:false}])assert.equal(primeTowerBounds(result),null);});
