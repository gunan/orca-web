import {useNativeGraphics,ViewportFpsOverlay,createViewportFrameStats} from './NativeGraphicsPreferencesContext.jsx';
import {fitSceneCamera} from '../shared/camera-fit.js';
import {nativeCameraHint} from '../shared/native-camera-preferences.js';
import {useNativeCameraPreferences} from './NativeCameraPreferencesContext.jsx';
import {bindNativeCameraControls} from './native-camera-controls.js';
import {createPreviewCameraDamping} from './preview-camera-damping.js';
import{nativeRoleUsageLabels}from'../shared/native-display-units.js';
import{createNativePreviewPreferences,nativePreviewPreferencesForData}from'../shared/native-preview-preferences.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseGcode } from '../shared/gcode.js';
import {nativeFeatureColor,nativeMotionColors,previewFeatureLegend,selectPreviewSegments,previewVisibleCount,previewCursorForCount,previewCommandWindow} from '../shared/gcode-preview.js';
import GcodeInspector from './GcodeInspector.jsx';
import {buildPreviewVolumeData} from '../shared/preview-volume.js';
import {createPreviewVolumeRenderer} from './preview-volume-renderer.js';
import {derivePreviewAttributes} from '../shared/gcode-attributes.js';
import {previewScalarModes,previewScalarRange,nativeScalarColor,nativeScalarLegendRows} from '../shared/gcode-scalar-colors.js';
import {loadNativePreview} from '../shared/native-preview-client.js';
import {adaptNativePreview,nativeTimingModes,nativeScalarModes,nativePreviewRange,nativePreviewLegendRows,nativeVertexColor} from '../shared/native-preview-adapter.js';
import {nativeFeaturePalette} from '../shared/gcode-preview.js';
import {previewShortcut,previewWheel,previewSliderState,applyPreviewSliderAction,previewCommandStops,previewStopIndex} from '../shared/preview-shortcuts.js';
import {nativePreviewRangeState,nativePreviewSelection,nativePreviewCommandWindow,nativePreviewVertexDimmed,nativePreviewOptions,nativeDefaultOptions,nativePreviewStep,nativePreviewVisibilityTransition} from '../shared/native-preview-range.js';
import {nativeVertexAttributes} from '../shared/native-preview-adapter.js';
import {createPreviewOptionsRenderer} from './preview-options-renderer.js';
import NativeToolPosition from './NativeToolPosition.jsx';
import {nativeToolPosition,nativeToolMarkerVisible,nativeActualSpeedProfile,nativeEstimatedTimes} from '../shared/native-tool-position.js';
import {createPreviewToolMarker} from './preview-tool-marker.js';
import {loadNativeHotend} from '../shared/native-hotend-client.js';
import {createPreviewRenderScheduler} from './preview-render-scheduler.js';
import NativeFilamentLegend from './NativeFilamentLegend.jsx';
import NativeCustomEvents from './NativeCustomEvents.jsx';
import NativeAllPlateStatistics from './NativeAllPlateStatistics.jsx';
import {nativeFilamentUsage} from '../shared/native-filament-preview.js';
import './toolpath.css';

const COLORS = ['#27cf98', '#f4b64b', '#67adff', '#ed77bc', '#b99bff', '#ef7758', '#74d1d1', '#c8cf64'];
const world = point => new THREE.Vector3(point[0], point[2], -point[1]);
const format = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'Unavailable';
const layerName = layer => layer?.preamble ? 'Setup' : layer ? `Layer ${layer.number ?? layer.index + 1}${Number.isFinite(layer.z) ? ` · Z ${format(layer.z)} mm` : ''}` : 'No layers';

async function boundedText(response, limit = 25000000) {
  if (!response.body?.getReader) {
    const text = await response.text();
    return { text: text.slice(0, limit), truncated: text.length > limit };
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0, truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = limit - bytes;
      if (value.length > remaining) { text += decoder.decode(value.subarray(0, remaining), { stream: true }); truncated = true; await reader.cancel(); break; }
      text += decoder.decode(value, { stream: true }); bytes += value.length;
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return { text, truncated };
}

export default function ToolpathPreview({ job,onSwitchToPrepare,viewPreferences,imperial=false }) {
  const cameraPreferences=useNativeCameraPreferences(),cameraPreferencesRef=useRef(cameraPreferences);cameraPreferencesRef.current=cameraPreferences;
  useEffect(()=>{viewer.current?.cameraBinding.apply();},[cameraPreferences]);
  const [loadedPreview, setLoadedPreview] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  // Passive cleanup runs after render: never expose a previous job's data while
  // the next job (or a cleared calibration result) is already current.
  const parsed=job?.status==='ready'&&loadedPreview?.jobId===job.id?loadedPreview.data:null;
  const [renderError, setRenderError] = useState(''), [low, setLow] = useState(0), [high, setHigh] = useState(0);
  const localPreferences=useRef(createNativePreviewPreferences()),preferences=viewPreferences||localPreferences;
  const [mode, setMode] = useState('feature'), [showTravel, setShowTravel] = useState(false), [cursor, setCursor] = useState(null), [playing, setPlaying] = useState(false);
  const [hiddenFeatures,setHiddenFeatures]=useState([]),[showCode,setShowCode]=useState(false);
  const mount = useRef(), viewer = useRef(), previewRoot=useRef(),pendingLayerCursor=useRef(null);
  const graphics=useNativeGraphics(viewer);
  const [singleLayer,setSingleLayer]=useState(false),[nativeCursor,setNativeCursor]=useState(null),[nativeStart,setNativeStart]=useState(null),[topLayerOnly,setTopLayerOnly]=useState(true),[nativeOptions,setNativeOptions]=useState({...nativeDefaultOptions}),[jumpOpen,setJumpOpen]=useState(false);
  const [hotendAsset,setHotendAsset]=useState(null),[hotendInfo,setHotendInfo]=useState(null),[hotendError,setHotendError]=useState(''),[markerStarted,setMarkerStarted]=useState(false),[lastSpeedProfile,setLastSpeedProfile]=useState(null);
  const interaction=useRef({active:'high',remembered:0});
  interaction.current={...interaction.current,low,high,cursor,singleLayer,nativeCursor,nativeStart};
  useEffect(() => {
    const controller = new AbortController();
    setLoadedPreview(null);setHotendAsset(null);setHotendInfo(null);setHotendError('');setLastSpeedProfile(null);setMarkerStarted(false);setError(''); setRenderError(''); setPlaying(false); setHiddenFeatures([]); setCursor(null); setMode('feature');setSingleLayer(false);setNativeCursor(null);setNativeStart(null);setTopLayerOnly(true);setNativeOptions({...nativeDefaultOptions});setJumpOpen(false);interaction.current.active='high';interaction.current.remembered=0;
    if (job?.status !== 'ready' || !job.id) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    (async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/download`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Cannot load G-code (${response.status}).`);
        const { text, truncated } = await boundedText(response);
        if (controller.signal.aborted) return;
        const base = parseGcode(text, { inputTruncated: truncated, includeSource: true });
        const result=await loadNativePreview(base,text,{jobId:job.id,signal:controller.signal});
        if(controller.signal.aborted)return;
        setLow(0); setHigh(Math.max(0, result.layers.length - 1));interaction.current.remembered=Math.trunc(Math.max(0,result.layers.length-1)/2); if(result.native){const remembered=nativePreviewPreferencesForData(preferences.current,result.native.data);preferences.current=remembered;setMode(remembered.mode);setHiddenFeatures(remembered.hiddenFeatures);setNativeOptions(remembered.options);setTopLayerOnly(remembered.topLayerOnly);setShowCode(remembered.showCode);}else setMode('feature');setLoadedPreview({jobId:job.id,data:result});
      } catch (problem) { if (!controller.signal.aborted) setError(problem.message || 'Could not load G-code.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [job?.id, job?.status]);

  useEffect(()=>{if(parsed?.native)preferences.current={...preferences.current,mode,hiddenFeatures:[...hiddenFeatures],options:{...nativeOptions},topLayerOnly,showCode};},[parsed,mode,hiddenFeatures,nativeOptions,topLayerOnly,showCode,preferences]);

  const nativeFull=useMemo(()=>parsed?.native?nativePreviewRangeState(parsed.native.data,{firstLayer:low,lastLayer:high,hiddenFeatures,options:nativeOptions,topLayerOnly,visibleRange:nativeStart===null?null:[nativeStart,Number.MAX_SAFE_INTEGER]}):null,[parsed,low,high,hiddenFeatures,nativeOptions,topLayerOnly,nativeStart]);
  const nativeState=useMemo(()=>parsed?.native?nativePreviewRangeState(parsed.native.data,{firstLayer:low,lastLayer:high,hiddenFeatures,options:nativeOptions,topLayerOnly,visibleRange:nativeCursor===null&&nativeStart===null?null:[nativeStart??0,nativeCursor??Number.MAX_SAFE_INTEGER]}):null,[nativeFull,nativeCursor]);
  useEffect(()=>{
    if(!parsed?.native||job?.status!=='ready'||!job.id||hotendAsset)return;
    const controller=new AbortController();setHotendError('');
    loadNativeHotend({jobId:job.id,signal:controller.signal}).then(({asset,info})=>{if(!controller.signal.aborted){setHotendInfo(info);setHotendAsset(asset);}}).catch(error=>{if(!controller.signal.aborted){setHotendInfo(error.metadata||null);setHotendError(error.message);}});
    return()=>controller.abort();
  },[Boolean(parsed?.native),job?.id,job?.status,hotendAsset]);
  const markerVisible=nativeToolMarkerVisible(markerStarted,nativeState);
  useEffect(()=>{if(markerVisible)setMarkerStarted(true);},[markerVisible]);
  const estimatedTimes=useMemo(()=>parsed?.native?nativeEstimatedTimes(parsed.native.data,parsed.native.timeMode):null,[parsed]);
  const toolPosition=useMemo(()=>nativeState?nativeToolPosition(parsed.native.data,nativeState.visible[1],{mode,timeMode:parsed.native.timeMode,estimatedTimes}):null,[parsed,nativeState,mode,estimatedTimes]);
  const speedProfile=useMemo(()=>nativeState?nativeActualSpeedProfile(parsed.native.data,nativeState.visible[1],{enabledEnd:nativeState.enabled[1]}):null,[parsed,nativeState]);
  const selection = useMemo(() => nativeFull?nativePreviewSelection(parsed,nativeFull):parsed?.layers.length ? selectPreviewSegments(parsed,{firstLayer:low,lastLayer:high,hiddenFeatures,showTravel}) : {segments:[],indices:[]}, [parsed,low,high,hiddenFeatures,showTravel,nativeFull]);
  const eligible=selection.segments;
  const visibleCount=useMemo(()=>nativeState?nativePreviewSelection(parsed,nativeState).indices.length:previewVisibleCount(selection,cursor),[parsed,nativeState,selection,cursor]);
  const nativeCurrentAttributes=useMemo(()=>nativeState&&parsed.native.data.vertices[nativeState.visible[1]]?nativeVertexAttributes(parsed.native.data,nativeState.visible[1],parsed.native.timeMode):null,[parsed,nativeState]);
  const attributes=useMemo(()=>parsed?.native?{segments:parsed.native.attributes,warnings:[]}:parsed?derivePreviewAttributes(parsed):null,[parsed]);
  const volumeData=useMemo(()=>parsed?.native?parsed.native.volumeData:parsed&&attributes?buildPreviewVolumeData(parsed,attributes):null,[parsed,attributes]);
  const scalarModes=useMemo(()=>parsed?.native?{...nativeScalarModes,...previewScalarModes,...nativeTimingModes}:previewScalarModes,[parsed]);
  const scalarRanges=useMemo(()=>parsed&&attributes?Object.fromEntries(Object.keys(scalarModes).map(key=>[key,parsed.native?nativePreviewRange(parsed,key,{hiddenFeatures,options:nativeOptions}):previewScalarRange(parsed,attributes,key,{hiddenFeatures})])):{},[parsed,attributes,hiddenFeatures,scalarModes,nativeOptions]);
  const scalarMode=scalarModes[mode],scalarRange=scalarRanges[mode];
  useEffect(()=>{if(speedProfile)setLastSpeedProfile({profile:speedProfile,range:scalarRanges.actualSpeed});},[speedProfile]);
  const shownSpeedProfile=toolPosition&&[8,9,10].includes(parsed.native.data.vertices[toolPosition.propertyVertexId][11])?(speedProfile?{profile:speedProfile,range:scalarRanges.actualSpeed}:lastSpeedProfile):null;
  const legend=useMemo(()=>previewFeatureLegend(parsed),[parsed]);
  const filamentUsage=useMemo(()=>parsed?.native?nativeFilamentUsage(parsed.native.data,{imperial}):null,[parsed,imperial]);
  const commandWindow=useMemo(()=>nativeState?nativePreviewCommandWindow(parsed,nativeState):parsed?previewCommandWindow(parsed,selection,cursor):null,[parsed,selection,cursor,nativeState]);
  const maxSpeed = useMemo(() => parsed ? parsed.segments.reduce((maximum, segment) => Math.max(maximum, segment.speed || 0), 0) : 0, [parsed]);
  const colorFor = (segment,originalIndex,nativeVertexIndex=segment?.nativeEndVertex) => nativeState&&Number.isInteger(nativeVertexIndex)&&nativePreviewVertexDimmed(parsed.native.data,nativeState,nativeVertexIndex,high)?new THREE.Color('#404040'):parsed.native&&Number.isInteger(nativeVertexIndex)?new THREE.Color(nativeVertexColor(parsed,nativeVertexIndex,mode,scalarRange)):segment.kind !== 'extrusion' ? new THREE.Color(nativeMotionColors[segment.kind]||nativeMotionColors.travel)
    : scalarMode ? new THREE.Color(nativeScalarColor(attributes.segments[originalIndex]?.[mode],scalarRange))
    : mode === 'speed' ? segment.speed === null ? new THREE.Color('#b8bdc0') : new THREE.Color().setHSL((1 - segment.speed / (maxSpeed || 1)) * 0.67, 0.85, 0.58)
      : new THREE.Color(mode === 'tool' ? COLORS[Math.abs(segment.tool) % COLORS.length] : nativeFeatureColor(segment.feature));
  useEffect(() => { setCursor(pendingLayerCursor.current);pendingLayerCursor.current=null;setPlaying(false); }, [parsed,low,high]);
  useEffect(() => {setPlaying(false);},[selection]);
  const changeVisibility=(changes,kind)=>{
    if(parsed?.native){const next=nativePreviewVisibilityTransition(parsed.native.data,nativeState,{firstLayer:low,lastLayer:high,hiddenFeatures,options:nativeOptions,topLayerOnly,...changes},{kind});setNativeStart(next.visible[0]===next.enabled[0]?null:next.visible[0]);setNativeCursor(next.visible[1]===next.enabled[1]?null:next.visible[1]);}
    if(changes.hiddenFeatures)setHiddenFeatures(changes.hiddenFeatures);if(changes.options)setNativeOptions(changes.options);setPlaying(false);
  };
  const movePreview=action=>{
    if(!parsed?.layers.length)return;
    if(parsed.native){
      const next=nativePreviewStep(parsed.native.data,interaction.current,action,{hiddenFeatures,options:nativeOptions,topLayerOnly});
      interaction.current={...next};setSingleLayer(next.singleLayer);setPlaying(false);setNativeCursor(next.nativeCursor);setNativeStart(next.nativeStart);if(next.changed){setLow(next.low);setHigh(next.high);}return;
    }
    const current=interaction.current,selected=selectPreviewSegments(parsed,{firstLayer:current.low,lastLayer:current.high,hiddenFeatures,showTravel}),stops=previewCommandStops(selected),count=previewVisibleCount(selected,current.cursor);
    const state=previewSliderState({...current,maxLayer:parsed.layers.length-1,move:previewStopIndex(stops,count),maxMove:stops.length-1});
    const next=applyPreviewSliderAction(state,action),changed=next.low!==current.low||next.high!==current.high;
    const nextSelection=changed?selectPreviewSegments(parsed,{firstLayer:next.low,lastLayer:next.high,hiddenFeatures,showTravel}):selected,nextStops=changed?previewCommandStops(nextSelection):stops;
    const nextCount=action.action==='singleLayer'||action.action==='setLow'||action.action==='setHigh'||action.action==='wheelLayer'?nextSelection.segments.length:next.move===state.maxMove&&next.move!==0?nextSelection.segments.length:nextStops[Math.min(next.move,nextStops.length-1)];
    const nextCursor=previewCursorForCount(nextSelection,nextCount);
    interaction.current={...next,cursor:nextCursor};setSingleLayer(next.singleLayer);setPlaying(false);
    if(changed){pendingLayerCursor.current=nextCursor;setLow(next.low);setHigh(next.high);}else setCursor(nextCursor);
  };
  useEffect(()=>{
    if(!parsed)return;
    const keydown=event=>{
      const target=event.target,slider=target.closest?.('[data-preview-slider]'),editing=Boolean(!slider&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable));
      const allowTab=Boolean(onSwitchToPrepare&&(target===document.body||target===previewRoot.current||mount.current?.contains(target)));
      const action=previewShortcut(event,{editing,modal:Boolean(document.querySelector('dialog[open]')),allowTab});if(!action)return;
      if(action.action==='prepare'){event.preventDefault();onSwitchToPrepare();return;}
      if(action.action==='code'){event.preventDefault();setShowCode(value=>!value);return;}
      if(!parsed.layers.length)return;event.preventDefault();movePreview(action);
    };
    const wheel=event=>{const slider=event.target.closest?.('[data-preview-slider]');if(!slider||document.querySelector('dialog[open]'))return;const amount=previewWheel(event,{mac:/Mac|iPhone|iPad/.test(navigator.platform)});if(!amount)return;event.preventDefault();const kind=slider.dataset.previewSlider;if(kind!=='moves')interaction.current.active=kind;movePreview({action:kind==='moves'?'wheelMoves':'wheelLayer',amount});};
    const jump=event=>{const target=event.target,slider=target.closest?.('[data-preview-slider]'),editing=!slider&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable);if(event.defaultPrevented||event.isComposing||event.altKey||editing||document.querySelector('dialog[open]')||String(event.key).toLowerCase()!=='g'||!(event.ctrlKey||event.metaKey||event.shiftKey)||!parsed.layers.length)return;event.preventDefault();event.stopPropagation();setJumpOpen(true);};
    document.addEventListener('keydown',jump,true);document.addEventListener('keydown',keydown);const root=previewRoot.current;root?.addEventListener('wheel',wheel,{passive:false});return()=>{document.removeEventListener('keydown',jump,true);document.removeEventListener('keydown',keydown);root?.removeEventListener('wheel',wheel);};
  },[parsed,hiddenFeatures,showTravel,onSwitchToPrepare,nativeOptions,topLayerOnly]);

  useEffect(() => {
    if(!playing)return;
    if(nativeFull){const timer=setInterval(()=>setNativeCursor(current=>{const state=nativePreviewRangeState(parsed.native.data,{firstLayer:low,lastLayer:high,hiddenFeatures,options:nativeOptions,topLayerOnly,visibleRange:current===null&&nativeStart===null?null:[nativeStart??0,current??Number.MAX_SAFE_INTEGER]}),next=Math.min(state.ticks.length-1,state.tickIndex+Math.max(1,Math.ceil(state.ticks.length/400)));if(next===state.ticks.length-1){setPlaying(false);return null;}return state.ticks[next]?.vertexIndex??null;}),50);return()=>clearInterval(timer);}
    if (!eligible.length) return;
    const timer = setInterval(() => setCursor(current => {
      const next = Math.min(eligible.length, previewVisibleCount(selection,current) + Math.max(1, Math.ceil(eligible.length / 400)));
      if (next === eligible.length) setPlaying(false);
      return previewCursorForCount(selection,next);
    }), 50);
    return () => clearInterval(timer);
  }, [playing,selection,nativeFull]);

  useEffect(() => {
    if (!parsed?.bounds || !mount.current) return;
    const host = mount.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setRenderError('WebGL is unavailable. Parsed layers and metrics remain available; 3D rendering requires WebGL.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute('aria-label', '3D G-code toolpaths');
    renderer.domElement.setAttribute('role', 'img');renderer.domElement.tabIndex=0;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#181e22');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    const controls = new OrbitControls(camera);const cameraBinding=bindNativeCameraControls(controls,renderer.domElement,()=>cameraPreferencesRef.current);controls.enableDamping = true;
    const recordCamera=()=>{camera.updateMatrixWorld();renderer.domElement.dataset.cameraFrame=JSON.stringify({projection:'Perspective',position:camera.position.toArray(),target:controls.target.toArray(),matrixWorldInverse:camera.matrixWorldInverse.toArray(),projectionMatrix:camera.projectionMatrix.toArray()});};controls.addEventListener('change',recordCamera);
    const damping=createPreviewCameraDamping(controls);controls.addEventListener('start',damping.reset);
    const fps=createViewportFrameStats(graphics.overlay);
    const scheduler=createPreviewRenderScheduler({readFpsCap:()=>Number(graphics.preferences.current.opengl_fps_cap),update:damping.update,render:()=>{fps.beforeFrame();renderer.render(scene,camera);fps.didFrame();renderer.domElement.dataset.renderFrames=String(Number(renderer.domElement.dataset.renderFrames||0)+1);}});
    controls.addEventListener('change',scheduler.invalidate);
    const a = world(parsed.bounds.min), b = world(parsed.bounds.max);
    const box = new THREE.Box3().setFromPoints([a, b]);
    const center = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3());
    const size = Math.max(extent.x, extent.y, extent.z, 10);
    const grid = new THREE.GridHelper(Math.max(20, Math.ceil(size / 10) * 10), 20, '#4a5f65', '#2c3b41');
    grid.position.set(center.x, Math.min(0, box.min.y), center.z); scene.add(grid);
    let hasFit=false;
    const fit = () => {
      damping.settle();
      const activeBounds = viewer.current?.fitBounds;
      if (activeBounds) {
        box.setFromPoints([world(activeBounds.min), world(activeBounds.max)]);
        box.getCenter(center); box.getSize(extent);
      }
      const orientation=hasFit?{back:new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).toArray(),up:new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).toArray()}:{back:[1,.85,1],up:[0,1,0]};
      const fitted=fitSceneCamera({bounds:{min:box.min.toArray(),max:box.max.toArray()},aspect:camera.aspect||1,fov:camera.fov,orientation,minExtent:10});
      camera.position.fromArray(fitted.position);
      camera.near = Math.max(0.01, size / 10000); camera.far = Math.max(10000, fitted.distance * 20); camera.updateProjectionMatrix();
      controls.target.fromArray(fitted.target);controls.update();hasFit=true;recordCamera();scheduler.invalidate();
    };
    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();scheduler.invalidate();
    };
    resize(); fit();
    const observer = new ResizeObserver(resize); observer.observe(host);
    viewer.current = { cameraBinding, renderer, scene, camera, controls, fit, lines: null, fitBounds: null, needsInitialFit: true, requestRender:scheduler.invalidate,refreshGraphics:scheduler.refresh };
    return () => {
      observer.disconnect();controls.removeEventListener('change',recordCamera);controls.removeEventListener('start',damping.reset);controls.removeEventListener('change',scheduler.invalidate);scheduler.dispose();cameraBinding.dispose();controls.dispose();
      const lines = viewer.current?.lines;
      lines?.geometry.dispose(); lines?.material.dispose(); viewer.current?.volume?.dispose(); viewer.current?.markers?.dispose();viewer.current?.toolMarker?.dispose();grid.geometry.dispose();
      if (Array.isArray(grid.material)) grid.material.forEach(material => material.dispose()); else grid.material.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); viewer.current = null;
    };
  }, [parsed]);

  useEffect(()=>{
    const current=viewer.current;if(!current)return;
    if(current.toolMarker){current.scene.remove(current.toolMarker.mesh);current.toolMarker.dispose();current.toolMarker=null;}
    if(parsed?.native&&hotendAsset){current.toolMarker=createPreviewToolMarker(hotendAsset);current.scene.add(current.toolMarker.mesh);}
    return()=>{if(current.toolMarker){current.scene.remove(current.toolMarker.mesh);current.toolMarker.dispose();current.toolMarker=null;}};
  },[parsed,hotendAsset]);
  useEffect(()=>{
    const current=viewer.current;if(!current)return;
    const visible=current.toolMarker?.update(toolPosition?.markerPosition,markerVisible)||false;
    current.renderer.domElement.dataset.toolMarkerVisible=String(visible);
    current.renderer.domElement.dataset.toolMarkerTriangles=String(hotendAsset?.triangles||0);
    current.renderer.domElement.dataset.toolMarkerResource=hotendInfo?.resource||'';
    current.renderer.domElement.dataset.toolMarkerVertex=String(toolPosition?.selectedVertexId??'');
    current.renderer.domElement.dataset.toolMarkerPosition=JSON.stringify(toolPosition?.markerPosition??null);
    current.renderer.domElement.dataset.toolMarkerMatrix=JSON.stringify(visible?current.toolMarker.mesh.matrix.elements:null);
    current.requestRender();
  },[parsed,toolPosition,markerVisible,hotendAsset,hotendInfo]);
  useEffect(() => {
    const current = viewer.current;
    if (!current) return;
    if (current.lines) { current.scene.remove(current.lines); current.lines.geometry.dispose(); current.lines.material.dispose(); }
    if(current.volume){current.scene.remove(current.volume.mesh);current.volume.dispose();current.volume=null;}
    if(current.markers){current.scene.remove(current.markers.mesh);current.markers.dispose();current.markers=null;}
    if(parsed.native){current.markers=createPreviewOptionsRenderer(parsed.native.data,nativeFull.eventIds,id=>new THREE.Color(nativePreviewVertexDimmed(parsed.native.data,nativeState,id,high)?'#404040':nativePreviewOptions.find(option=>option.type===parsed.native.data.vertices[id][11]).color));if(current.markers)current.scene.add(current.markers.mesh);}
    current.volume=createPreviewVolumeRenderer(volumeData,selection.indices,(index,nativeVertexIndex)=>colorFor(parsed.segments[index],index,nativeVertexIndex));
    if(current.volume)current.scene.add(current.volume.mesh);
    const positions = new Float32Array(eligible.length * 6), colors = new Float32Array(eligible.length * 6);
    eligible.forEach((segment, index) => {
      const color = colorFor(segment,selection.indices[index]);
      for (const [offset, point] of [[0, segment.start], [3, segment.end]]) {
        positions.set(volumeData.segments[selection.indices[index]]?[0,0,0]:[point[0], point[2], -point[1]], index * 6 + offset);
        colors.set([color.r, color.g, color.b], index * 6 + offset);
      }
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    lines.frustumCulled = false; current.scene.add(lines); current.lines = lines;
    current.fitBounds = eligible.length ? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } : null;
    for (const segment of eligible) for (const point of [segment.start, segment.end]) point.forEach((value, axis) => {
      current.fitBounds.min[axis] = Math.min(current.fitBounds.min[axis], value); current.fitBounds.max[axis] = Math.max(current.fitBounds.max[axis], value);
    });
    if (current.needsInitialFit) { current.fit(); current.needsInitialFit = false; }
    current.requestRender();
  }, [parsed, eligible, mode, maxSpeed,scalarRanges,attributes,volumeData,nativeState?.dimLowerLayers]);
  useEffect(() => {
    const current=viewer.current;if(!current)return;
    current.lines?.geometry.setDrawRange(0, visibleCount * 2);
    current.renderer.domElement.dataset.visibleSegments=String(visibleCount);
    const markerCount=current.markers?.setVisibleVertex(nativeState?.visible[1]??-1)||0;
    current.renderer.domElement.dataset.visibleMarkers=String(markerCount);
    current.renderer.domElement.dataset.markerVertexIds=JSON.stringify(nativeState?.eventIds||[]);
    current.renderer.domElement.dataset.nativeRange=JSON.stringify(nativeState?{full:nativeState.full,enabled:nativeState.enabled,visible:nativeState.visible}:null);
    current.renderer.domElement.dataset.dimLowerLayers=String(nativeState?.dimLowerLayers||false);
    const volumeCount=current.volume?.setVisibleCount(visibleCount)||0;
    current.renderer.domElement.dataset.visibleVolumes=String(volumeCount);
    current.renderer.domElement.dataset.visibleFallbackLines=String(visibleCount-volumeCount);
    current.renderer.domElement.dataset.volumeTriangles=String(volumeCount*8);
    const solidKinds={extrusion:0,travel:0,wipe:0};for(let i=0;i<visibleCount;i++)if(volumeData.segments[selection.indices[i]]&&Object.hasOwn(solidKinds,eligible[i].kind))solidKinds[eligible[i].kind]++;
    current.renderer.domElement.dataset.visibleSolidKinds=JSON.stringify(solidKinds);
    current.renderer.domElement.dataset.colorMode=mode;
    current.renderer.domElement.dataset.scalarRange=JSON.stringify(scalarRange||null);
    current.renderer.domElement.dataset.currentScalarValue=String(nativeCurrentAttributes?.[mode]??(commandWindow?.segmentIndex!=null?attributes?.segments[commandWindow.segmentIndex]?.[mode]??'':''));
    current.renderer.domElement.dataset.processor=parsed.native?'native':'source';
    current.renderer.domElement.dataset.currentNativeVertex=String(commandWindow?.nativeVertexIndex??(commandWindow?.segmentIndex!=null?parsed.segments[commandWindow.segmentIndex]?.nativeEndVertex??'':''));
    current.renderer.domElement.dataset.currentSourceLine=String(commandWindow?.currentLine||'');
    current.renderer.domElement.dataset.visibleFeatures=JSON.stringify([...new Set(eligible.slice(0,visibleCount).filter(segment=>segment.kind==='extrusion').map(segment=>segment.feature))]);
    current.requestRender();
  }, [visibleCount,eligible,mode,commandWindow,scalarRange,attributes,nativeState,nativeCurrentAttributes]);

  if (job?.status !== 'ready') return <section className="toolpath-state" aria-label="Slicing preview"><h2>{job?.status === 'failed' ? 'Slicing failed' : ['cancelled', 'canceled'].includes(job?.status) ? 'Slicing cancelled' : job ? 'Slicing in progress' : 'No slicing result'}</h2>{job && <p>Job status: <strong>{job.status}</strong></p>}<p>{job?.error || (job ? job.filename : 'Choose a model and slice it from Prepare.')}</p></section>;
  if (loading) return <section className="toolpath-state" aria-live="polite"><h2>Loading toolpath preview</h2><p>Reading actual generated G-code…</p></section>;
  if (error) return <section className="toolpath-state"><h2>Preview unavailable</h2><p role="alert">{error}</p></section>;
  if (!parsed) return null;
  const layerCount = parsed.layers.filter(layer => !layer.preamble && layer.endSegment > layer.startSegment).length;
  return <section className="toolpath-preview" aria-label="G-code toolpath preview" ref={previewRoot} tabIndex="-1">
    <div className="toolpath-heading"><div><h2>G-code toolpath preview</h2><p>{job.filename} · Job status: <strong>{job.status}</strong></p></div><button onClick={() => viewer.current?.fit()} disabled={!parsed.bounds || Boolean(renderError)}>Fit toolpaths</button></div>
    <div className="toolpath-controls"><label>Color by <select aria-label="Toolpath color mode" value={mode} onChange={event => {setMode(event.target.value);if(parsed.native&&event.target.value==='feature')changeVisibility({hiddenFeatures:[]},'role');}}>{parsed.native&&<><option value="summary" disabled={!filamentUsage.available}>Summary{filamentUsage.available?'':' (native statistics unavailable)'}</option><option value="color">Filament</option></>}<option value="feature">Feature</option>{!parsed.native&&<option value="speed">Speed</option>}<option value="tool">Tool</option>{Object.entries(scalarModes).map(([key,item])=><option key={key} value={key} disabled={!scalarRanges[key]?.available}>{item.label}{!scalarRanges[key]?.available?' (unavailable)':''}</option>)}{!parsed.native&&Object.entries(nativeTimingModes).map(([key,item])=><option key={key} value={key} disabled>{item.label} (native timing unavailable)</option>)}</select></label>{!parsed.native&&<label><input type="checkbox" checked={showTravel} onChange={event => setShowTravel(event.target.checked)}/> Show travel and retractions</label>}<label><input type="checkbox" checked={showCode} onChange={event=>setShowCode(event.target.checked)}/> Show G-code</label><NativeAllPlateStatistics job={job} imperial={imperial} mode={parsed.native?.timeMode||'normal'} enabled={Boolean(parsed.native?.data.editorStatisticsVersion===1)} onOpen={()=>setPlaying(false)}/><span>Commanded coordinates · Z up · mm</span></div>
    {parsed.native?<p className="toolpath-processing" data-testid="native-preview-origin">OrcaSlicer {parsed.native.data.engine.version} native G-code processor · {parsed.native.data.vertexCount.toLocaleString()} render vertices{parsed.native.data.modes.length>1&&<label> Timing mode <select aria-label="Native timing mode" value={parsed.native.timeMode} onChange={event=>setLoadedPreview(current=>current?.jobId===job.id?{...current,data:adaptNativePreview(current.data,current.data.native.data,{timeMode:event.target.value})}:current)}>{parsed.native.data.modes.map(mode=><option key={mode.name} value={mode.name}>{mode.name==='normal'?'Normal':'Stealth'}</option>)}</select></label>}</p>:<p className="toolpath-processing" data-testid="native-preview-origin">Source-only preview: {parsed.nativeUnavailable}</p>}
    {hotendError&&parsed.native&&<p role="status">{hotendError}. Native tool position data remains available.</p>}
    {parsed.truncated && <p className="toolpath-warning" role="status">Partial preview: a safety limit was reached. Downloaded G-code remains complete.</p>}
    <div className="toolpath-body"><div className="toolpath-canvas" ref={mount}><ViewportFpsOverlay graphics={graphics}/>{renderError && <p role="alert">{renderError}</p>}{!parsed.bounds && <p>No renderable motion with known coordinates.</p>}{parsed.native&&markerVisible&&<NativeToolPosition position={toolPosition} modelInfo={hotendInfo} profile={shownSpeedProfile?.profile} range={shownSpeedProfile?.range}/>}<div className="toolpath-camera-hint">{nativeCameraHint(cameraPreferences)}</div></div>
      <aside className="toolpath-sidebar"><div className="toolpath-layers"><h3>Layers</h3><button onClick={()=>setJumpOpen(true)} disabled={!parsed.layers.length}>Jump to layer</button>{parsed.native&&<label><input type="checkbox" checked={topLayerOnly} onChange={event=>{setTopLayerOnly(event.target.checked);setNativeCursor(null);setNativeStart(null);setPlaying(false);}}/> Top layer only playback</label>}<label><input type="checkbox" aria-label="Single layer mode" checked={singleLayer} disabled={!parsed.layers.length} onChange={()=>movePreview({action:'singleLayer'})}/> Single layer (L)</label><label>From: {layerName(parsed.layers[low])}<input aria-label="First preview layer" data-preview-slider="low" onFocus={()=>{interaction.current.active='low';}} onPointerDown={()=>{interaction.current.active='low';}} type="range" min="0" max={Math.max(0, parsed.layers.length - 1)} value={low} disabled={!parsed.layers.length||singleLayer} onChange={event=>movePreview({action:'setLow',amount:Number(event.target.value)})}/></label><label>Through: {layerName(parsed.layers[high])}<input aria-label="Last preview layer" data-preview-slider="high" onFocus={()=>{interaction.current.active='high';}} onPointerDown={()=>{interaction.current.active='high';}} type="range" min="0" max={Math.max(0, parsed.layers.length - 1)} value={high} disabled={!parsed.layers.length} onChange={event=>movePreview({action:'setHigh',amount:Number(event.target.value)})}/></label></div>
      <div className="toolpath-legend" aria-label="Toolpath legend"><h3>{scalarMode?`${scalarMode.label}${scalarMode.unit?` (${scalarMode.unit})`:""}`:mode === 'speed' ? 'Speed (mm/s)' : mode==='summary'?'Summary':mode==='color'?'Filament':mode === 'tool' ? 'Tools' : 'Features'}</h3>{parsed.native&&['summary','color'].includes(mode)?<NativeFilamentLegend imperial={imperial} parsed={parsed} usage={filamentUsage} summary={mode==='summary'}/>:scalarMode?<><ul aria-label="Native scalar color legend">{(parsed.native?nativePreviewLegendRows(scalarRange):nativeScalarLegendRows(scalarRange)).toReversed().map(({value,color},index)=><li key={index}><i style={{backgroundColor:color}}/><span>{value.toLocaleString(undefined,{maximumFractionDigits:scalarMode.precision??6,minimumFractionDigits:scalarMode.precision??0})} {scalarMode.unit}</span></li>)}</ul><p data-testid="scalar-availability">{scalarRange.available.toLocaleString()} / {scalarRange.total.toLocaleString()} {scalarRange.scope==='motion'?'motion':'extrusion'} segments have {scalarMode.label.toLowerCase()} data. Missing values are gray.</p>{mode==='pressureAdvance'&&<p>Pressure advance is unknown before the first explicit native command. Unknown values are gray and excluded from the range.</p>}{mode==='flow'&&<p>{parsed.native?'Commanded volumetric flow. Actual flow includes native acceleration and deceleration.':'Commanded volumetric flow. Actual flow needs native motion timing.'}</p>}</>:mode === 'speed' ? <><div className="toolpath-speed-gradient"/><p>0 — {format(maxSpeed)} mm/s</p><p>Unknown feed rate: gray</p></> : mode === 'tool' ? <ul>{parsed.tools.map(value=><li key={value}><i style={{backgroundColor:parsed.native?.data.toolsColors[value]?'#'+parsed.native.data.toolsColors[value].map(v=>v.toString(16).padStart(2,'0')).join(''):COLORS[Math.abs(value)%COLORS.length]}}/>{parsed.native?'Extruder':'Tool'} {parsed.native?value+1:value}</li>)}</ul> : <><div className="toolpath-feature-actions"><button disabled={!hiddenFeatures.length} onClick={()=>changeVisibility({hiddenFeatures:[]},'role')}>Show all features</button><button disabled={legend.every(item=>hiddenFeatures.includes(item.name))} onClick={()=>changeVisibility({hiddenFeatures:legend.map(item=>item.name)},'role')}>Hide all features</button></div><ul>{legend.map(item=><li key={item.name}><label><input type="checkbox" aria-label={`Show ${item.name} toolpaths`} checked={!hiddenFeatures.includes(item.name)} onChange={event=>changeVisibility({hiddenFeatures:event.target.checked?hiddenFeatures.filter(name=>name!==item.name):[...hiddenFeatures,item.name]},'role')}/><i data-feature={item.name} style={{backgroundColor:item.color}}/>{item.name}</label><small title={parsed.native?'Native role time, percentage and filament usage':'Extruding preview segments in the loaded file'}>{parsed.native?<NativeRoleUsage imperial={imperial} parsed={parsed} role={item.name}/>:item.count.toLocaleString()}</small></li>)}</ul>{parsed.native?<p>Native whole-file role time, share of total motion time and filament usage.</p>:<p>Counts are parsed extrusion segments. Native per-feature time and material statistics are not present in this preview data.</p>}</>}{parsed.native&&<NativeCustomEvents parsed={parsed}/>}{showTravel && <p>{parsed.native?['speed','actualSpeed','acceleration','jerk'].includes(mode)?'Travel and wipe use the native scalar color range.':mode==='tool'?'Travel uses tool colors · Yellow: wipe':'Blue: travel · Yellow: wipe':'Blue: travel and moving retractions'}</p>}</div>

      {parsed.native&&<fieldset className="toolpath-native-options"><legend>Motion and events</legend>{nativePreviewOptions.map(option=><label key={option.key}><input type="checkbox" aria-label={`Show ${option.label} markers or paths`} checked={nativeOptions[option.key]} onChange={event=>changeVisibility({options:{...nativeOptions,[option.key]:event.target.checked}},'option')}/><i style={{backgroundColor:option.color}}/>{option.label}</label>)}</fieldset>}
      <div className="toolpath-native-estimates"><h3>Native estimates</h3>{parsed.native&&<NativeTiming parsed={parsed} selectedLayer={high}/>}{parsed.native&&Object.keys(parsed.nativeEstimates).length>0&&<h4>File header estimates</h4>}{Object.keys(parsed.nativeEstimates).length ? <dl>{Object.entries(parsed.nativeEstimates).map(([key, value]) => <React.Fragment key={key}><dt>{{ printTime: 'Print time', filamentMm: 'Filament (mm)', filamentGrams: 'Filament (g)', filamentCm3: 'Filament (cm³)', filamentCost: 'Filament cost' }[key]}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <p>{parsed.native?'No additional file header estimates.':'Not present in this G-code. Time, mass and cost are not inferred.'}</p>}</div></aside>{showCode&&commandWindow&&<GcodeInspector window={commandWindow} attributes={nativeCurrentAttributes??(commandWindow.segmentIndex!=null?attributes?.segments[commandWindow.segmentIndex]:null)}/>}</div>
    {nativeState?<div className="toolpath-playback"><button disabled={nativeState.ticks.length<2} onClick={()=>{if(!playing&&nativeState.tickIndex===nativeState.ticks.length-1)setNativeCursor(nativeState.ticks[0].vertexIndex);setPlaying(value=>!value);}}>{playing?'Pause toolpath playback':'Play toolpath playback'}</button><input aria-label="Visible native commands" data-preview-slider="moves" type="range" min="0" max={Math.max(0,nativeState.ticks.length-1)} value={nativeState.tickIndex} disabled={nativeState.ticks.length<2} onChange={event=>{setPlaying(false);const index=Number(event.target.value);setNativeCursor(index===nativeState.ticks.length-1?null:nativeState.ticks[index].vertexIndex);}}/><output data-testid="toolpath-visible-count">{visibleCount.toLocaleString()} / {eligible.length.toLocaleString()} segments · native command {nativeState.tickIndex+1} / {nativeState.ticks.length}</output></div>:<div className="toolpath-playback"><button onClick={() => { if (!playing && visibleCount >= eligible.length) setCursor(-1); setPlaying(value => !value); }} disabled={!eligible.length}>{playing ? 'Pause toolpath playback' : 'Play toolpath playback'}</button><input aria-label="Visible toolpath segments" data-preview-slider="moves" type="range" min="0" max={eligible.length} value={visibleCount} disabled={!eligible.length} onChange={event => { setPlaying(false); setCursor(previewCursorForCount(selection,Number(event.target.value))); }}/><output data-testid="toolpath-visible-count">{visibleCount.toLocaleString()} / {eligible.length.toLocaleString()} segments</output></div>}
    <p className="toolpath-shortcut-hint">Arrows: active layer / source command · Shift or Cmd/Ctrl: 5 steps · Home/End: command range · L: single layer · C: G-code · Cmd/Ctrl or Shift+G: jump to layer · Tab from canvas: Prepare</p>
    {!eligible.length&&parsed.segments.length>0&&<p role="status">No toolpaths match the selected layers and visibility settings.</p>}
    <p className="toolpath-summary" data-testid="toolpath-summary">{layerCount} printed {layerCount === 1 ? 'layer' : 'layers'} · {parsed.segments.length.toLocaleString()} {parsed.native?'native motion':'parsed'} segments{!parsed.native&&<> · {format(parsed.metrics.extrusionPathMm)} mm extrusion path · {format(parsed.metrics.extrusionMm)} mm observed extruding E</>}</p>
    <p className="toolpath-volume-summary" data-testid="volume-availability">{parsed.native?<>{volumeData.solidCount.toLocaleString()} / {volumeData.totalMotions.toLocaleString()} motion paths have native solid geometry: {volumeData.knownCount.toLocaleString()} extrusion, {volumeData.travelCount.toLocaleString()} travel and {volumeData.wipeCount.toLocaleString()} wipe paths. Visibility follows the motion and feature controls.</>:<>{volumeData.knownCount.toLocaleString()} / {volumeData.totalExtrusions.toLocaleString()} extrusion paths have known dimensions and linear flow for solid rendering. Other paths are shown as lines.</>}</p>
    <details className="toolpath-notes"><summary>Preview interpretation and limits{parsed.warnings.length ? ` · ${parsed.warnings.length} notices` : ''}</summary><ul>{[...parsed.warnings,...attributes.warnings,...parsed.assumptions,...(parsed.native?[]:['Layer time, actual flow and per-feature time/material statistics require native processed data; they are not inferred from commanded moves.'])].map(note => <li key={note}>{note}</li>)}</ul></details>
    {jumpOpen&&<JumpToLayer max={parsed.layers.length} current={(interaction.current.active==='low'?low:high)+1} onClose={()=>setJumpOpen(false)} onJump={value=>{movePreview({action:interaction.current.active==='low'?'setLow':'setHigh',amount:value-1});setJumpOpen(false);}}/>}
  </section>;
}

function NativeRoleUsage({parsed,role,imperial=false}){
 const id=nativeFeaturePalette.find(item=>item.name===role)?.order,stats=parsed.native.data.roles.find(item=>item.role===id),mode=parsed.native.data.modes[parsed.native.modeIndex];
 if(!stats)return 'Unavailable';const labels=nativeRoleUsageLabels({...stats,seconds:stats.seconds[parsed.native.modeIndex]},mode,{imperial});
 return <span data-native-role={role}><span data-native-role-time>{labels.time}</span> · <span data-native-role-percent>{labels.percent}</span>% · <span data-native-role-length>{labels.length}</span> · <span data-native-role-weight>{labels.weight}</span></span>;
}
function NativeTiming({parsed,selectedLayer}){
 const {data,modeIndex}=parsed.native,mode=data.modes[modeIndex],rows=[['Processor total',mode.processorSeconds],['Viewer motion total',mode.totalSeconds],['Prepare',mode.prepareSeconds],['First layer',mode.firstLayerSeconds],[`Layer ${selectedLayer+1}`,data.layers[selectedLayer]?.seconds[modeIndex]]];
 return <dl aria-label="Native processed timing">{rows.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd data-native-timing={label}>{format(value)} s</dd></React.Fragment>)}</dl>;
}

function JumpToLayer({max,current,onClose,onJump}){
 const dialog=useRef(),[value,setValue]=useState(String(current));const valid=/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=max;
 useEffect(()=>{dialog.current?.showModal();},[]);
 return<dialog ref={dialog} aria-label="Jump to Layer" onCancel={event=>{event.preventDefault();onClose();}}><form onSubmit={event=>{event.preventDefault();if(valid)onJump(Number(value));}}><h2>Jump to Layer</h2><label>Please enter the layer number (1–{max}):<input aria-label="Layer number" autoFocus inputMode="numeric" value={value} onChange={event=>setValue(event.target.value)}/></label><div><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid}>OK</button></div></form></dialog>;
}
