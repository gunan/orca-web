import {PROJECT_LOAD_DEFAULTS,PROJECT_LOAD_OPTIONS} from '../shared/native-project-load.js';
import {RECENT_DEFAULTS,recentLimit} from '../shared/recent-files.js';
import {NATIVE_STARTUP_DEFAULTS,NATIVE_STARTUP_PAGES} from '../shared/native-startup-preferences.js';
import NativePreferenceSpin from './NativePreferenceSpin.jsx';
import React,{useEffect,useState}from'react';
import Modal from'./Modal.jsx';
import './native-preferences.css';
import{NATIVE_UNIT_OPTIONS}from'../shared/native-display-units.js';
import{NATIVE_MOUSE_ACTIONS,nativeOrbitMultiplier}from'../shared/native-camera-preferences.js';
export default function NativePreferencesDialog({projectLoad=PROJECT_LOAD_DEFAULTS,onProjectLoadChange=()=>'',recent=RECENT_DEFAULTS,recentLoading=false,onRecentChange=async()=>'',startup=NATIVE_STARTUP_DEFAULTS,onStartupChange=()=>'',value,onChange,camera,onCameraChange,graphics,onGraphicsChange,onClose}){
 const[recentModels,setRecentModels]=useState(recent.recent_models);
 useEffect(()=>setRecentModels(recent.recent_models),[recent.recent_models]);
 const[recentDraft,setRecentDraft]=useState(String(recent.max_recent_count)),[recentBusy,setRecentBusy]=useState(false);
 useEffect(()=>{setRecentDraft(String(recent.max_recent_count));},[recent.max_recent_count]);
 async function changeRecent(patch){if('recent_models'in patch)setRecentModels(patch.recent_models);setRecentBusy(true);try{const message=await onRecentChange({...recent,...patch})||'';setError(message);if(message)setRecentModels(recent.recent_models);}finally{setRecentBusy(false);}}
 function commitRecent(){const next=recentLimit(recentDraft);if(next===null){setError('Enter a whole number for Maximum recent files.');return;}setRecentDraft(String(next));if(next!==recent.max_recent_count)changeRecent({max_recent_count:next});}
 const[error,setError]=useState(''),[orbitDraft,setOrbitDraft]=useState(camera.camera_orbit_mult),[fpsDraft,setFpsDraft]=useState(graphics.opengl_fps_cap);
 function changeCamera(patch){setError(onCameraChange({...camera,...patch})||'');}
 function commitOrbit(){const next=nativeOrbitMultiplier(orbitDraft);if(next===null){setError('Enter a number for orbit speed.');return;}setOrbitDraft(next);changeCamera({camera_orbit_mult:next});}
 function commitFps(text=fpsDraft){if(!/^[+-]?\d+$/.test(text.trim())||!Number.isSafeInteger(Number(text))){setError('Enter a whole number for FPS cap.');return;}const next=String(Math.max(0,Math.min(240,Number(text))));setFpsDraft(next);setError(onGraphicsChange({...graphics,opengl_fps_cap:next})||'');}
 return<Modal className="native-preferences-dialog" aria-label="Preferences" onClose={onClose}>
  <header><h2>Preferences</h2><button aria-label="Close Preferences" onClick={onClose}>×</button></header>
  <h3>General</h3><fieldset><legend>Settings</legend><label>Units<select autoFocus aria-label="Units" value={value.use_inches} onChange={event=>setError(onChange({...value,use_inches:event.target.value})||'')}>{NATIVE_UNIT_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label title="Set the page opened on startup.">Default page<select aria-label="Default page" value={startup.default_page} onChange={event=>setError(onStartupChange({...startup,default_page:event.target.value})||'')}>{NATIVE_STARTUP_PAGES.map(page=><option key={page.value} value={page.value}>{page.label}</option>)}</select></label></fieldset>
  <fieldset><legend>Project</legend><label title="Should printer/filament/process settings be loaded when opening a 3MF file?">Load behaviour<select aria-label="Load behaviour" value={projectLoad.project_load_behaviour} onChange={event=>setError(onProjectLoadChange({...projectLoad,project_load_behaviour:event.target.value})||'')}>{PROJECT_LOAD_OPTIONS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label></fieldset><fieldset disabled={recentLoading||recentBusy}><legend>Project</legend><label title="Maximum count of recent files">Maximum recent files<input aria-label="Maximum recent files" inputMode="numeric" type="text" value={recentDraft} onChange={event=>setRecentDraft(event.target.value)} onBlur={commitRecent} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitRecent();}}}/></label><label className="camera-checkbox"><input type="checkbox" checked={recentModels} onChange={event=>changeRecent({recent_models:event.target.checked})}/>Add STL/STEP files to recent files list</label></fieldset>
  <h3>Control</h3><fieldset><legend>Camera</legend>
   <label title="Multiplies the orbit speed for finer or coarser camera movement.">Orbit speed multiplier<input aria-label="Orbit speed multiplier" type="text" inputMode="decimal" value={orbitDraft} onChange={event=>setOrbitDraft(event.target.value)} onBlur={commitOrbit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitOrbit();}}}/></label>
   <label className="camera-checkbox" title="If enabled, reverses the direction of zoom with mouse wheel."><input type="checkbox" checked={camera.reverse_mouse_wheel_zoom==='true'} onChange={event=>changeCamera({reverse_mouse_wheel_zoom:String(event.target.checked)})}/>Reverse mouse zoom</label>
   {['Left','Middle','Right'].map(button=><label key={button}>{button} Mouse Drag<select aria-label={`${button} Mouse Drag`} value={camera[`${button.toLowerCase()}_mouse_drag_action`]} onChange={event=>changeCamera({[`${button.toLowerCase()}_mouse_drag_action`]:event.target.value})}>{NATIVE_MOUSE_ACTIONS.map(action=><option key={action.value} value={action.value}>{action.label}</option>)}</select></label>)}
  </fieldset><h3>Graphics</h3><fieldset><legend>FPS</legend>
   <label title="Limits viewport frame rate to reduce GPU load and power usage. Set to 0 for unlimited frame rate.">FPS cap<NativePreferenceSpin label="FPS cap" value={graphics.opengl_fps_cap} draft={fpsDraft} setDraft={setFpsDraft} onCommit={commitFps} min={0} max={240} unit="FPS"/></label>
   <small>0 = unlimited</small><label className="camera-checkbox" title="Displays current viewport FPS in the top-right corner."><input type="checkbox" checked={graphics.opengl_show_fps_overlay==='true'} onChange={event=>setError(onGraphicsChange({...graphics,opengl_show_fps_overlay:String(event.target.checked)})||'')}/>Show FPS overlay</label>
  </fieldset><p>Changes apply immediately; the default page takes effect at startup.</p>{error&&<p role="alert">{error}</p>}<footer><button onClick={onClose}>Close</button></footer>
 </Modal>;
}
