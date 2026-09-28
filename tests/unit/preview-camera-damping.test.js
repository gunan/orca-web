import test from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createPreviewCameraDamping} from '../../src/preview-camera-damping.js';
class Element extends EventTarget{constructor(root){super();this.style={};this.clientHeight=1000;this.clientWidth=1000;this.ownerDocument=root||this;}getRootNode(){return this.ownerDocument;}setPointerCapture(){}releasePointerCapture(){}}
function send(target,type,values){target.dispatchEvent(Object.assign(new Event(type),{pointerType:'mouse',pointerId:1,button:0,clientX:500,clientY:500,...values}));}
function rig(){const doc=new Element(),element=new Element(doc),camera=new PerspectiveCamera(40,1,.1,10000);camera.position.set(100,80,100);const controls=new OrbitControls(camera,element);controls.enableDamping=true;return{camera,controls,drag(button=0){send(element,'pointerdown',{button});for(let i=1;i<=5;i++)send(doc,'pointermove',{button,clientX:500+20*i});send(doc,'pointerup',{button,clientX:600});}};}
test('real orbit and pan damping settle in wall-clock time at 4–144 FPS without changing the final view',t=>{
 for(const button of [0,2]){
  const targets=[];
  for(const fps of [4,10,30,60,144]){
   const r=rig();let time=0;const damping=createPreviewCameraDamping(r.controls,{now:()=>time});r.controls.addEventListener('start',damping.reset);r.drag(button);
   let moving=true,frames=0;while(moving&&frames<1000){time+=1000/fps;moving=damping.update();frames++;assert.equal(r.controls.dampingFactor,.05);}
   assert.ok(!moving);assert.ok(time<4500,`${button?'Pan':'Orbit'} at ${fps} FPS took ${time} ms`);assert.equal(damping.update(),false);t.diagnostic(JSON.stringify({gesture:button?'pan':'orbit',fps,frames,elapsedMs:time}));
   targets.push({position:r.camera.position.toArray(),target:r.controls.target.toArray()});r.controls.dispose();
  }
  // The sub-threshold remainder is drained, retaining the final physical view.
  for(const target of targets)for(const key of ['position','target'])for(let i=0;i<3;i++)assert.ok(Math.abs(target[key][i]-targets[3][key][i])<1e-8);
 }
});
test('default frame-based controls demonstrate the slow-render regression',()=>{
 const r=rig();r.drag();let frames=0;while(r.controls.update()&&frames<1000)frames++;assert.ok(frames/4>20);r.controls.dispose();
});
test('a new gesture resets a long idle gap; Fit drains momentum without disabling future damping',()=>{
 const r=rig();let time=0;const damping=createPreviewCameraDamping(r.controls,{now:()=>time});r.controls.addEventListener('start',damping.reset);damping.update();time=600000;r.drag();time+=1000/60;assert.equal(damping.update(),true);
 const moving=r.camera.position.clone();damping.settle();assert.ok(moving.distanceTo(r.camera.position)>.1);assert.equal(r.controls.enableDamping,true);assert.equal(r.controls.dampingFactor,.05);assert.equal(damping.update(),false);
 time+=1000/60;r.drag(2);assert.equal(damping.update(),true);r.controls.dispose();
});
