import test from'node:test';import assert from'node:assert/strict';import{fitSceneCamera}from'../../shared/camera-fit.js';
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
test('fit keeps every corner of wide, tall and asymmetric objects within portrait and landscape camera frames',()=>{
 for(const bounds of[{min:[0,0,0],max:[250,210,0]},{min:[-20,30,-15],max:[80,45,380]},{min:[100,120,0],max:[105,126,7]}])for(const aspect of[.4,1,2.5])for(const view of['Top','Bottom','Front','Back','Left','Right','Isometric']){
  const fit=fitSceneCamera({bounds,aspect,view,padding:1.12});let edge=0;
  for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]]){
   const relative=[x,y,z].map((value,index)=>value-fit.target[index]),depth=fit.distance-dot(relative,fit.back);assert.ok(depth>0);const nx=Math.abs(dot(relative,fit.right))/(depth*Math.tan(21*Math.PI/180)*aspect),ny=Math.abs(dot(relative,fit.up))/(depth*Math.tan(21*Math.PI/180));assert.ok(nx<=1/1.12+1e-10);assert.ok(ny<=1/1.12+1e-10);edge=Math.max(edge,nx,ny);
   assert.ok(Math.abs(dot(relative,fit.right))<=fit.orthoSpan*aspect/2/1.12+1e-10);assert.ok(Math.abs(dot(relative,fit.up))<=fit.orthoSpan/2/1.12+1e-10);
  }
  assert.ok(edge>.8,`Useful frame occupancy for ${view} at ${aspect}: ${edge}`);
 }
});
test('camera fitting is translation invariant and validates malformed geometry and viewport dimensions',()=>{
 const a=fitSceneCamera({bounds:{min:[0,0,0],max:[20,30,40]}}),b=fitSceneCamera({bounds:{min:[100,-70,12],max:[120,-40,52]}});assert.equal(a.distance,b.distance);assert.deepEqual(b.position.map((n,i)=>Math.round((n-a.position[i])*1e8)/1e8),[100,-70,12]);
 assert.throws(()=>fitSceneCamera({bounds:{min:[0,0,0],max:[-1,1,1]}}),/bounds/);assert.throws(()=>fitSceneCamera({bounds:{min:[0,0,0],max:[1,1,1]},aspect:0}),/options/);
});

test('fitting arbitrary viewing axes preserves orientation and contains every corner in both projections',()=>{
 const bounds={min:[-40,15,-30],max:[180,35,270]};
 for(const aspect of [.35,1,3])for(const orientation of [{back:[1,2,3],up:[0,0,1]},{back:[0,0,1],up:[0,1,0]},{back:[0,0,-1],up:[0,-1,0]},{back:[0,1,0],up:[1,0,1]},{back:[.00000001,0,1],up:[0,1,0]}]){
  const fit=fitSceneCamera({bounds,aspect,orientation,padding:1.1});const length=Math.hypot(...orientation.back);fit.back.forEach((v,i)=>assert.ok(Math.abs(v-orientation.back[i]/length)<1e-14));assert.ok(Math.abs(dot(fit.back,fit.up))<1e-14);
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){const p=[x,y,z].map((n,i)=>n-fit.target[i]),depth=fit.distance-dot(p,fit.back);assert.ok(depth>0);assert.ok(Math.abs(dot(p,fit.right))/(depth*Math.tan(21*Math.PI/180)*aspect)<=1/1.1+1e-12);assert.ok(Math.abs(dot(p,fit.up))/(depth*Math.tan(21*Math.PI/180))<=1/1.1+1e-12);assert.ok(Math.abs(dot(p,fit.right))<=fit.orthoSpan*aspect/2/1.1+1e-12);assert.ok(Math.abs(dot(p,fit.up))<=fit.orthoSpan/2/1.1+1e-12);}
 }
});
test('fit rejects degenerate or malformed viewing axes before producing invalid camera coordinates',()=>{
 const bounds={min:[0,0,0],max:[20,30,40]};for(const orientation of [{},{back:[0,0,0],up:[0,0,1]},{back:[0,0,1],up:[0,0,2]},{back:[0,0,1],up:[0,Infinity,0]},{back:[0,1],up:[0,0,1]}])assert.throws(()=>fitSceneCamera({bounds,orientation}),/viewing axes/);
});
