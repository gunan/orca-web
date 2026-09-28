export const GRAPHICS_PREFERENCES_KEY='orca-web:native-graphics-preferences-v1';
export const NATIVE_GRAPHICS_DEFAULTS=Object.freeze({version:1,opengl_fps_cap:'0',opengl_show_fps_overlay:'false'});
// AppConfig and GLCanvas3D use std::stoi, including its numeric-prefix behavior
// and signed 32-bit overflow, then clamp to the native 0–240 range.
export function nativeFpsCap(value){const match=typeof value==='string'?value.match(/^[ \t\n\r\f\v]*([+-]?\d+)/):null;if(!match)return 0;const n=Number(match[1]);return Number.isInteger(n)&&n>=-2147483648&&n<=2147483647?Math.max(0,Math.min(240,n)):0;}
export function normalizeNativeGraphicsPreferences(value){if(!value||value.version!==1||typeof value.opengl_fps_cap!=='string'||!['true','false'].includes(value.opengl_show_fps_overlay))throw new TypeError('Invalid graphics preferences');return{version:1,opengl_fps_cap:String(nativeFpsCap(value.opengl_fps_cap)),opengl_show_fps_overlay:value.opengl_show_fps_overlay};}
export function readNativeGraphicsPreferences(storage){try{return normalizeNativeGraphicsPreferences(JSON.parse(storage?.getItem(GRAPHICS_PREFERENCES_KEY)||'null'));}catch{return{...NATIVE_GRAPHICS_DEFAULTS};}}
export function saveNativeGraphicsPreferences(storage,value){const next=normalizeNativeGraphicsPreferences(value);storage.setItem(GRAPHICS_PREFERENCES_KEY,JSON.stringify(next));return next;}
/** Native RenderStats samples completed frames when elapsed whole milliseconds
 * exceed1000; the currently starting frame belongs to the next sample. */
export function createNativeRenderStats({now=()=>performance.now()}={}){let start,fps=0,count=0;return{beforeFrame(){const current=now();if(start===undefined)start=current;const elapsed=Math.trunc(current-start);if(elapsed>1000){fps=Math.trunc(1000*count/elapsed);count=0;start=current;}return fps;},didFrame(){count++;}};}

export function nativeFrameWait(lastStart,current,cap){const minimum=cap>0?1000/cap:0,elapsed=current-lastStart;return minimum&&elapsed<minimum?Math.max(1,Math.ceil(minimum-elapsed)):0;}
