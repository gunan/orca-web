import {MOUSE} from 'three';
// Bind a fresh OrbitControls instance. Capture handlers prepare public
// properties; handlers registered after controls.connect restore them. Browser
// microtasks may run BETWEEN listeners, so restoration must not use a microtask.
export function bindNativeCameraControls(controls,element,readPreferences,{disabledButtons=()=>[]}={}){
 let disposed=false,pendingWheelSpeed,wheelTimer,buttonTimer;
 const actions={'0':null,'1':MOUSE.PAN,'2':MOUSE.ROTATE};
 function apply(){
  const value=readPreferences(),disabled=new Set(disabledButtons());
  for(const [button,key] of [['LEFT','left_mouse_drag_action'],['MIDDLE','middle_mouse_drag_action'],['RIGHT','right_mouse_drag_action']])controls.mouseButtons[button]=disabled.has(button)?null:actions[value[key]];
  controls.rotateSpeed=Number(value.camera_orbit_mult);
 }
 function restoreButtons(){clearTimeout(buttonTimer);buttonTimer=undefined;if(!disposed)apply();}
 function restoreWheel(){clearTimeout(wheelTimer);wheelTimer=undefined;if(pendingWheelSpeed!==undefined){controls.zoomSpeed=pendingWheelSpeed;pendingWheelSpeed=undefined;}}
 function pointerDown(event){
  restoreWheel();restoreButtons();
  // Native mappings do not swap Pan and Rotate with Ctrl/Shift/Meta.
  if(event.ctrlKey||event.shiftKey||event.metaKey){
   for(const key of ['LEFT','MIDDLE','RIGHT']){const action=controls.mouseButtons[key];if(action===MOUSE.PAN)controls.mouseButtons[key]=MOUSE.ROTATE;else if(action===MOUSE.ROTATE)controls.mouseButtons[key]=MOUSE.PAN;}
   buttonTimer=setTimeout(restoreButtons,0);
  }
 }
 function wheel(){
  if(readPreferences().reverse_mouse_wheel_zoom!=='true')return;
  if(pendingWheelSpeed===undefined)pendingWheelSpeed=controls.zoomSpeed;
  controls.zoomSpeed=-pendingWheelSpeed;
  // A tool can consume the event before its bubble handlers. The fallback
  // restores state after that dispatch; pointerDown also protects later pinch.
  clearTimeout(wheelTimer);wheelTimer=setTimeout(restoreWheel,0);
 }
 element.addEventListener('pointerdown',pointerDown,true);element.addEventListener('wheel',wheel,true);apply();controls.connect(element);
 element.addEventListener('pointerdown',restoreButtons);element.addEventListener('wheel',restoreWheel);
 return{apply,dispose(){disposed=true;restoreWheel();clearTimeout(buttonTimer);element.removeEventListener('pointerdown',pointerDown,true);element.removeEventListener('wheel',wheel,true);element.removeEventListener('pointerdown',restoreButtons);element.removeEventListener('wheel',restoreWheel);}};
}
