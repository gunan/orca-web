import {nativeFixed} from './native-format.js';
export const CAMERA_PREFERENCES_KEY='orca-web:native-camera-preferences-v1';
export const NATIVE_CAMERA_DEFAULTS=Object.freeze({version:1,reverse_mouse_wheel_zoom:'false',camera_orbit_mult:'1.0',left_mouse_drag_action:'2',middle_mouse_drag_action:'1',right_mouse_drag_action:'1'});
export const NATIVE_MOUSE_ACTIONS=Object.freeze([{value:'0',label:'None'},{value:'1',label:'Pan'},{value:'2',label:'Rotate'}].map(Object.freeze));
export function nativeOrbitMultiplier(text){
 if(typeof text!=='string'||!text.trim())return null;
 const value=Number(text);return Number.isFinite(value)?nativeFixed(Math.max(.05,Math.min(2,value)),2):null;
}
export function normalizeNativeCameraPreferences(value){
 if(!value||value.version!==1||!['true','false'].includes(value.reverse_mouse_wheel_zoom)||typeof value.camera_orbit_mult!=='string'||!value.camera_orbit_mult.trim())throw new Error('Invalid camera preferences');
 const multiplier=Number(value.camera_orbit_mult);if(!Number.isFinite(multiplier)||multiplier<.05||multiplier>2)throw new Error('Invalid camera orbit speed');
 const result={version:1,reverse_mouse_wheel_zoom:value.reverse_mouse_wheel_zoom,camera_orbit_mult:value.camera_orbit_mult};
 for(const key of ['left_mouse_drag_action','middle_mouse_drag_action','right_mouse_drag_action']){if(!['0','1','2'].includes(value[key]))throw new Error('Invalid camera mouse action');result[key]=value[key];}
 return result;
}
export function readNativeCameraPreferences(storage){try{return normalizeNativeCameraPreferences(JSON.parse(storage?.getItem(CAMERA_PREFERENCES_KEY)||'null'));}catch{return{...NATIVE_CAMERA_DEFAULTS};}}
export function saveNativeCameraPreferences(storage,value){const next=normalizeNativeCameraPreferences(value);storage.setItem(CAMERA_PREFERENCES_KEY,JSON.stringify(next));return next;}

export function nativeCameraHint(value){
 const groups=[['2','orbit'],['1','pan']].map(([action,label])=>{const buttons=['Left','Middle','Right'].filter(button=>value[`${button.toLowerCase()}_mouse_drag_action`]===action);return buttons.length?`${buttons.join('/')} drag to ${label}`:null;}).filter(Boolean);
 return [...groups,'Scroll to zoom'].join(' · ');
}
