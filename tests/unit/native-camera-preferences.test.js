import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PerspectiveCamera,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {bindNativeCameraControls} from '../../src/native-camera-controls.js';
import {NATIVE_CAMERA_DEFAULTS,CAMERA_PREFERENCES_KEY,readNativeCameraPreferences,saveNativeCameraPreferences,normalizeNativeCameraPreferences,nativeOrbitMultiplier} from '../../shared/native-camera-preferences.js';
const reference=JSON.parse(readFileSync(new URL('../fixtures/native-camera-preferences-reference.json',import.meta.url)));
class Element extends EventTarget{constructor(root){super();this.style={};this.clientHeight=1000;this.clientWidth=1000;this.ownerDocument=root||this;}getRootNode(){return this.ownerDocument;}setPointerCapture(){}releasePointerCapture(){}}
function send(target,type,values){target.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerType:'mouse',pointerId:1,button:0,clientX:500,clientY:500,pageX:values?.clientX??500,pageY:values?.clientY??500,...values}));}
function rig(value={...NATIVE_CAMERA_DEFAULTS},options){const doc=new Element(),element=new Element(doc),camera=new PerspectiveCamera(40,1,.1,10000);camera.position.set(100,80,100);const controls=new OrbitControls(camera),binding=bindNativeCameraControls(controls,element,()=>value,options);return{doc,element,camera,controls,binding,drag(button,modifiers={}){send(element,'pointerdown',{button,...modifiers});send(doc,'pointermove',{button,clientX:520,clientY:510,...modifiers});send(doc,'pointerup',{button,clientX:520,clientY:510,...modifiers});},dispose(){binding.dispose();controls.dispose();}};}

test('real OrbitControls gestures follow all81 original native button mappings, including modifier keys',async()=>{
 for(const sample of reference.cases)for(const modifiers of [{},{ctrlKey:true},{shiftKey:true},{metaKey:true}]){
  const value={...NATIVE_CAMERA_DEFAULTS,...Object.fromEntries(['left','middle','right'].map((key,i)=>[`${key}_mouse_drag_action`,String(sample.mapping[i])]))},r=rig(value),position=r.camera.position.clone(),target=r.controls.target.clone(),direction=r.camera.getWorldDirection(new Vector3());
  r.drag(sample.button,modifiers);const result=r.controls.target.distanceTo(target)>1e-7?'pan':r.camera.getWorldDirection(new Vector3()).angleTo(direction)>1e-7?'rotate':'none';assert.equal(result,sample.action,JSON.stringify({sample,modifiers}));
  if(sample.action==='none')assert.deepEqual(r.camera.position.toArray(),position.toArray());await Promise.resolve();r.dispose();
 }
});
test('native default middle drag pans without dollying and selected orbit speed scales the angle',()=>{
 const r=rig(),distance=r.camera.position.distanceTo(r.controls.target);r.drag(1);assert.ok(r.controls.target.length()>0);assert.ok(Math.abs(r.camera.position.distanceTo(r.controls.target)-distance)<1e-8);r.dispose();
 const angles=[];for(const speed of ['0.50','1.00','2.00']){const p=rig({...NATIVE_CAMERA_DEFAULTS,camera_orbit_mult:speed}),start=p.controls.getAzimuthalAngle();p.drag(0);angles.push(Math.abs(p.controls.getAzimuthalAngle()-start));p.dispose();}assert.ok(Math.abs(angles[1]-2*angles[0])<1e-12);assert.ok(Math.abs(angles[2]-2*angles[1])<1e-12);
});
test('reverse wheel changes zoom direction without changing later touch pinch direction',async()=>{
 const r=rig({...NATIVE_CAMERA_DEFAULTS,reverse_mouse_wheel_zoom:'true'}),distance=()=>r.camera.position.distanceTo(r.controls.target),start=distance();
 send(r.element,'wheel',{deltaY:100,deltaMode:0});assert.ok(distance()<start);await Promise.resolve();assert.equal(r.controls.zoomSpeed,1);
 const before=distance();send(r.element,'pointerdown',{pointerType:'touch',pointerId:2,clientX:400});send(r.element,'pointerdown',{pointerType:'touch',pointerId:3,clientX:600});send(r.doc,'pointermove',{pointerType:'touch',pointerId:3,clientX:700});assert.ok(distance()<before);send(r.doc,'pointerup',{pointerType:'touch',pointerId:2});send(r.doc,'pointerup',{pointerType:'touch',pointerId:3});r.dispose();
});
test('reentrant wheel events and disposal restore the original zoom speed; paint can suppress left camera gestures',async()=>{
 const r=rig({...NATIVE_CAMERA_DEFAULTS,reverse_mouse_wheel_zoom:'true'});r.controls.zoomSpeed=1.5;const distance=()=>r.camera.position.distanceTo(r.controls.target),start=distance();send(r.element,'wheel',{deltaY:100,deltaMode:0});const middle=distance();send(r.element,'wheel',{deltaY:100,deltaMode:0});assert.ok(middle<start&&distance()<middle);r.binding.dispose();assert.equal(r.controls.zoomSpeed,1.5);await Promise.resolve();assert.equal(r.controls.zoomSpeed,1.5);r.controls.dispose();
 const paint=rig({...NATIVE_CAMERA_DEFAULTS,left_mouse_drag_action:'1'},{disabledButtons:()=>['LEFT']}),before=paint.camera.position.toArray();paint.drag(0,{ctrlKey:true});assert.deepEqual(paint.camera.position.toArray(),before);paint.dispose();
});
test('camera preferences use exact native defaults, preserve supported values and reject malformed storage',()=>{
 assert.deepEqual({...NATIVE_CAMERA_DEFAULTS},{version:1,...reference.defaults});let raw=null;const storage={getItem(k){assert.equal(k,CAMERA_PREFERENCES_KEY);return raw;},setItem(k,v){assert.equal(k,CAMERA_PREFERENCES_KEY);raw=v;}};
 assert.deepEqual(readNativeCameraPreferences(storage),NATIVE_CAMERA_DEFAULTS);const next={...NATIVE_CAMERA_DEFAULTS,left_mouse_drag_action:'0',reverse_mouse_wheel_zoom:'true',camera_orbit_mult:'0.25'};saveNativeCameraPreferences(storage,next);assert.deepEqual(readNativeCameraPreferences(storage),next);
 for(const invalid of ['bad','null','{"version":2}',JSON.stringify({...next,middle_mouse_drag_action:'3'}),JSON.stringify({...next,camera_orbit_mult:'Infinity'})]){raw=invalid;assert.deepEqual(readNativeCameraPreferences(storage),NATIVE_CAMERA_DEFAULTS);}
 assert.throws(()=>normalizeNativeCameraPreferences({...next,reverse_mouse_wheel_zoom:true}));assert.throws(()=>saveNativeCameraPreferences({setItem(){throw Error('full');}},next),/full/);
});
test('orbit input commits on native bounds and two-decimal formatting',()=>{
 for(const [input,expected] of [['1','1.00'],['0','0.05'],['-9','0.05'],['2.1','2.00'],['0.125','0.12'],['0.135','0.14']])assert.equal(nativeOrbitMultiplier(input),expected);
 for(const value of ['',' ','NaN','Infinity','1.2abc'])assert.equal(nativeOrbitMultiplier(value),null);
});
test('camera reference retains original method and generator provenance',()=>{
 assert.equal(reference.commit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');assert.equal(reference.cases.length,81);
 for(const [file,key] of [['../fixtures/native-camera-preferences-reference.cpp','referenceSha256'],['../../scripts/reference/build-camera-preferences-reference.py','generatorSha256']])assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),reference[key]);
});
