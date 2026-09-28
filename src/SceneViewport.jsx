import {useNativeGraphics,ViewportFpsOverlay,createViewportFrameStats} from './NativeGraphicsPreferencesContext.jsx';
import {nativeCameraHint} from '../shared/native-camera-preferences.js';
import {useNativeCameraPreferences} from './NativeCameraPreferencesContext.jsx';
import {bindNativeCameraControls} from './native-camera-controls.js';
import {createPreviewRenderScheduler} from './preview-render-scheduler.js';
import {createPreviewCameraDamping} from './preview-camera-damping.js';
import {createPrimeTowerInteraction} from './prime-tower-interaction.js';
import {createPrimeTowerGeometry,disposePrimeTower,primeTowerBounds} from './prime-tower-renderer.js';
import {previewObjectFill} from '../shared/paint-fill-preview.js';
import {createFillHoverOverlay} from './paint-fill-overlay.js';
import {createBrimEarInteraction} from './brim-ear-interaction.js';
import {paintButtonState,constrainedPaintPosition} from '../shared/paint-interactions.js';
import {pickSceneRectangle} from './scene-selection-picking.js';
import {useLayerHeightVisualization} from './layer-height-material.js';
import {paintObjectCursor} from '../shared/paint-object-group.js';
import {clippingSection} from '../shared/paint-clipping.js';
import {projectPaintStroke} from '../shared/facet-stroke.js';
import {fitSceneCamera} from '../shared/camera-fit.js';
import {normalizeClipPlane,clipped} from '../shared/facet-graph.js';
import {paintedFacetGeometry,overhangFacetGeometry} from '../shared/facet-painting.js';
import {worldBrimEars} from '../shared/brim-ears.js';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { meshBounds, sceneBounds } from '../shared/geometry.js';
import { sceneMaterialState } from './scene-material.js';

const axes = ['X', 'Y', 'Z'];
export default function SceneViewport({ rotationSnap=true, onRotationPreview, primeTowerPreview, primeTowerSelected, onPrimeTowerSelect, onPrimeTowerMove, onPrimeTowerError, onCameraFrame, cameraCommand, filamentColors = [], objects, selectedId, selectedIds, transformObject, onSelect, onRectangleSelect, onTransform, onPlaceFace, mode, bed, wireframe, onDrop, children, paintChannel, paintTargetId, paintTargetIds, paintFilamentCount=16, onPaint, onPaintWheel, clipPlane, overhangAngle=0, onCameraDirection, onClippingError, paintCursor, layerHeightVisualization, supportSegments, brimEditing }) {
  const host = useRef(), runtime = useRef(), latest = useRef();
  const graphics=useNativeGraphics(runtime);
  const cameraPreferences=useNativeCameraPreferences(),cameraPreferencesRef=useRef(cameraPreferences);cameraPreferencesRef.current=cameraPreferences;
  useEffect(()=>{runtime.current?.cameraBinding.apply();},[cameraPreferences]);
  useEffect(()=>{runtime.current?.transform.setRotationSnap(rotationSnap ? Math.PI / 2 : null);},[rotationSnap]);
  useEffect(()=>{onRotationPreview?.(null);},[selectedId,mode]);
  const [failure, setFailure] = useState('');
  const [projection, setProjection] = useState('Perspective');
  const [selectionRectangle,setSelectionRectangle]=useState(null);
  latest.current = { onRotationPreview, primeTowerPreview, primeTowerSelected, onPrimeTowerSelect, onPrimeTowerMove, onPrimeTowerError, onCameraFrame, objects, selectedId, selectedIds, transformObject, onSelect, onRectangleSelect, onTransform, onPlaceFace, mode, onPaint, onPaintWheel, paintTargetId, paintTargetIds, clipPlane, onCameraDirection, onClippingError, paintCursor, brimEditing, filamentColors, paintFilamentCount };
  const bedKey = JSON.stringify(bed), filamentKey = JSON.stringify(filamentColors),selectionKey=JSON.stringify(selectedIds||[selectedId]),paintTargetKey=JSON.stringify(paintTargetIds||[paintTargetId]);

  useEffect(() => {
    const container = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setFailure('3D rendering is unavailable. Enable WebGL in your browser; model data and numeric editing remain available.'); return; }
    setFailure('');
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0xe5e9eb);renderer.localClippingEnabled=true;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D model view');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = projection === 'Perspective' ? new THREE.PerspectiveCamera(42, 1, 0.1, 20000) : new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 20000);
    camera.up.set(0, 0, 1);
    const orbit = new OrbitControls(camera);
    const cameraBinding=bindNativeCameraControls(orbit,renderer.domElement,()=>cameraPreferencesRef.current,{disabledButtons:()=>latest.current.mode==='Paint'?['LEFT']:[]});
    function recordCamera(){camera.updateMatrixWorld();renderer.domElement.dataset.cameraFrame=JSON.stringify({projection:camera.isPerspectiveCamera?'Perspective':'Orthographic',position:camera.position.toArray(),target:orbit.target.toArray(),matrixWorldInverse:camera.matrixWorldInverse.toArray(),projectionMatrix:camera.projectionMatrix.toArray()});}
    orbit.addEventListener('change',()=>{recordCamera();latest.current.onCameraFrame?.(camera.matrixWorld.toArray());latest.current.onCameraDirection?.(camera.getWorldDirection(new THREE.Vector3()).toArray());runtime.current?.updatePaintCursor?.();});
    orbit.enableDamping = true;
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSpace('world');
    transform.setRotationSnap(rotationSnap ? Math.PI / 2 : null);
    scene.add(transform.getHelper());
    transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value; if(!event.value)latest.current.onRotationPreview?.(null); });
    transform.addEventListener('mouseUp', () => {
      const target = transform.object;
      if (!target) return;
      const center = target.userData.sourceCenter;
      state.proxyStartInverse = null;
      latest.current.onTransform(target.userData.id, {
        position: target.position.toArray().map((value, index) => value - center[index]),
        rotation: [target.rotation.x, target.rotation.y, target.rotation.z].map(THREE.MathUtils.radToDeg),
        scale: target.scale.toArray()
      });
    });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7180, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(200, -200, 400); scene.add(light);
    const polygon = bed?.polygon?.length >= 3 ? bed.polygon : [[0, 0], [250, 0], [250, 210], [0, 210]];
    const minX = Math.min(...polygon.map(p => p[0])), maxX = Math.max(...polygon.map(p => p[0]));
    const minY = Math.min(...polygon.map(p => p[1])), maxY = Math.max(...polygon.map(p => p[1]));
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
    const width = maxX - minX, depth = maxY - minY;
    const shape = new THREE.Shape(polygon.map(p => new THREE.Vector2(...p)));
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x46575d, side: THREE.FrontSide, roughness: 0.9 }));
    plate.position.z = -0.08; scene.add(plate);
    const linePoints = [];
    for (let x = Math.ceil(minX / 10) * 10; x <= maxX; x += 10) linePoints.push(x, minY, 0, x, maxY, 0);
    for (let y = Math.ceil(minY / 10) * 10; y <= maxY; y += 10) linePoints.push(minX, y, 0, maxX, y, 0);
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3)), new THREE.LineBasicMaterial({ color: 0x8ca3ac, transparent: true, opacity: .32 }));
    scene.add(grid);
    const axis = new THREE.AxesHelper(35); axis.position.set(minX, minY, 0.5); scene.add(axis);
    const meshes = new THREE.Group(); scene.add(meshes);
    const proxy = new THREE.Object3D(); scene.add(proxy);
    const brimMarkers = new THREE.Group(); scene.add(brimMarkers);
    const paintOverlay = new THREE.Group(); scene.add(paintOverlay);
    const overhangOverlay=new THREE.Group();scene.add(overhangOverlay);
    const clipCaps=new THREE.Group();scene.add(clipCaps);
    const cursorGroup=new THREE.Group();scene.add(cursorGroup);
    const fillHover=createFillHoverOverlay(scene,renderer);
    const supportOverlay=new THREE.Group();scene.add(supportOverlay);
    const state = { cameraBinding, supportOverlay, cursorGroup, clipCaps, clipCache:new Map(), renderer, scene, camera, orbit, transform, meshes, brimMarkers, paintOverlay, overhangOverlay, proxy, center, span: Math.max(width, depth), fitted: false };
    const damping=createPreviewCameraDamping(orbit);
    const fps=createViewportFrameStats(graphics.overlay);
    const scheduler=createPreviewRenderScheduler({readFpsCap:()=>Number(graphics.preferences.current.opengl_fps_cap),update:damping.update,render:()=>{fps.beforeFrame();state.towerTool?.frame();grid.visible=camera.position.z>=0;renderer.render(scene,camera);fps.didFrame();}});
    state.requestRender=scheduler.invalidate;state.refreshGraphics=scheduler.refresh;
    orbit.addEventListener('change',scheduler.invalidate);
    orbit.addEventListener('start',damping.reset);
    transform.addEventListener('change',scheduler.invalidate);
    transform.addEventListener('mouseDown', () => {
      if (transform.object !== proxy) return;
      proxy.updateMatrixWorld(true); state.proxyStartInverse = proxy.matrixWorld.clone().invert();
      const ids = new Set(latest.current.transformObject?.sceneGroupIds || []);
      state.memberStart = new Map(meshes.children.filter(mesh => ids.has(mesh.userData.id)).map(mesh => { mesh.updateMatrix(); return [mesh, mesh.matrix.clone()]; }));
    });
    transform.addEventListener('objectChange', () => {
      if(transform.mode==='rotate'&&transform.object)latest.current.onRotationPreview?.([transform.object.rotation.x,transform.object.rotation.y,transform.object.rotation.z].map(THREE.MathUtils.radToDeg));
      if (transform.object !== proxy || !state.proxyStartInverse) return;
      proxy.updateMatrixWorld(true);
      const delta = proxy.matrixWorld.clone().multiply(state.proxyStartInverse);
      for (const [mesh, original] of state.memberStart) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(delta).multiply(original); mesh.matrixWorldNeedsUpdate = true; }
    });
    // A fit requested while native geometry is loading applies again to the
    // completed scene. A later user camera gesture supersedes that request.
    state.cancelTowerFit=()=>{state.pendingFit=null;state.towerAutoFitSuppressed=latest.current.primeTowerPreview?.plateId;};
    orbit.addEventListener('start',state.cancelTowerFit);
    state.fit = (view,{bedOnly=false,automatic=false}={}) => {
      damping.settle();
      const preserveOrientation=state.hasFit&&(view===undefined||bedOnly);
      const orientation=preserveOrientation?{back:new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).toArray(),up:new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).toArray()}:undefined;
      const preview=latest.current.primeTowerPreview;
      if(!automatic)state.towerAutoFitSuppressed=preview?.plateId;
      state.pendingFit=!bedOnly&&preview?.status==='loading'?{view,plateId:preview.plateId}:null;
      const visible = bedOnly?[]:latest.current.objects.filter(object => object.visible !== false);
      let bounds = visible.length ? sceneBounds(visible) : null;
      const tower=!bedOnly&&preview?.status==='ready'?primeTowerBounds(preview.result):null;
      if(tower){bounds=bounds?{min:bounds.min.map((v,i)=>Math.min(v,tower.min[i])),max:bounds.max.map((v,i)=>Math.max(v,tower.max[i]))}:tower;}
      const fit = fitSceneCamera({
        bounds: bounds || {min:[minX,minY,0],max:[maxX,maxY,0]},
        aspect: Math.max(container.clientWidth,1) / Math.max(container.clientHeight,1),
        view:view||'Isometric', orientation, minExtent: visible.length ? 30 : 0
      });
      camera.position.set(...fit.position);
      orbit.target.set(...fit.target);
      if (camera.isOrthographicCamera) { state.orthoSpan = fit.orthoSpan; resize(); }
      camera.lookAt(orbit.target); orbit.update();recordCamera();
      state.hasFit=true;renderer.domElement.dataset.cameraView=preserveOrientation?(renderer.domElement.dataset.cameraView||'Isometric'):(view||'Isometric');renderer.domElement.dataset.cameraTarget=JSON.stringify(fit.target);state.requestRender();
    };
    runtime.current = state;
    function resize() {
      const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1);
      renderer.setSize(w, h);
      if (camera.isPerspectiveCamera) camera.aspect = w / h;
      else { const span = state.orthoSpan || state.span; camera.left = -span * w / h / 2; camera.right = span * w / h / 2; camera.top = span / 2; camera.bottom = -span / 2; }
      camera.updateProjectionMatrix();recordCamera();state.requestRender();
    }
    const observer = new ResizeObserver(resize); observer.observe(container); resize(); state.fit('Isometric',{automatic:true});
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let down,rectangle=null,painting=false,paintButton=0,paintShift=false,lastConstraintScreen=null,lastPaintScreen=null,lastHoverScreen=null,cursorSignature=null,cursorMesh=null;
    const isPaintTarget=id=>(latest.current.paintTargetIds||[latest.current.paintTargetId]).includes(id);
    function hitAt(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const plane=normalizeClipPlane(latest.current.clipPlane);const hit=raycaster.intersectObjects([...meshes.children,...clipCaps.children.filter(child=>child.isMesh)].filter(mesh=>latest.current.mode!=='Paint'||isPaintTarget(mesh.userData.id)),false).find(hit=>hit.object.userData.clippingCap||!clipped(hit.point.toArray(),plane));return hit?.object.userData.clippingCap?undefined:hit;}
    function clearCursor(){state.requestRender();fillHover.clear();for(const item of [...cursorGroup.children]){cursorGroup.remove(item);item.geometry.dispose();item.material.dispose();}renderer.domElement.dataset.paintCursor='null';}
    function updateCursor(event){
      if(event){paintShift=event.shiftKey;lastHoverScreen=constrainedPaintPosition(painting?lastConstraintScreen:null,[event.clientX,event.clientY],latest.current.paintCursor?.constraint||'none');}
      const baseOptions=latest.current.paintCursor;const options=baseOptions&&{...baseOptions,state:painting?paintButtonState(baseOptions.channel,{button:paintButton,shiftKey:paintShift,state:baseOptions.state}):baseOptions.state};
      if(!lastHoverScreen||latest.current.mode!=='Paint'||!options){cursorSignature=null;clearCursor();return;}
      const hit=hitAt({clientX:lastHoverScreen[0],clientY:lastHoverScreen[1]});
      if(!hit||!isPaintTarget(hit.object.userData.id)){cursorSignature=null;clearCursor();return;}
      const point=hit.point.toArray(),direction=raycaster.ray.direction.toArray(),sourceMesh=latest.current.objects.find(object=>object.id===hit.object.userData.id),key=JSON.stringify([options,options.tool==='fill'?hit.faceIndex:point,['fill','bucket','facet'].includes(options.tool)?null:direction,painting,hit.object.userData.id,hit.faceIndex,latest.current.clipPlane,latest.current.filamentColors,latest.current.paintFilamentCount]);if(key===cursorSignature&&cursorMesh===sourceMesh)return;
      cursorSignature=key;cursorMesh=sourceMesh;clearCursor();
      try{if(['fill','bucket','facet'].includes(options.tool)){const selection=previewObjectFill(latest.current.objects,latest.current.paintTargetId,{id:hit.object.userData.id,triangleIndex:hit.faceIndex,point},{...options,clipPlane:latest.current.clipPlane,filamentCount:latest.current.paintFilamentCount});fillHover.show(selection,{channel:options.channel,filamentColors:latest.current.filamentColors});return;}
        const shape=paintObjectCursor(latest.current.objects,latest.current.paintTargetId,{id:hit.object.userData.id,point,frontDirection:direction},options);if(!shape)return;
        const color=options.channel==='color'?options.color||'#cccccc':painting?(options.state===2?'#ff0000':'#0000ff'):'#000000',opacity=options.channel==='color'?1:.25;
        if(shape.tool==='sphere'){const cursor=new THREE.Mesh(new THREE.SphereGeometry(shape.radius,24,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}));cursor.position.set(...shape.center);cursor.renderOrder=10;cursorGroup.add(cursor);}
        else if(shape.positions.length){const cursor=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(shape.positions,3)),new THREE.LineBasicMaterial({color:shape.tool==='height'?'#ffffff':color,transparent:shape.tool!=='height',opacity:shape.tool==='height'?1:opacity,depthTest:shape.tool==='height',depthWrite:false}));cursor.renderOrder=10;cursorGroup.add(cursor);}
        renderer.domElement.dataset.paintCursor=JSON.stringify({tool:shape.tool,center:shape.center,...(shape.radius&&{radius:shape.radius}),...(shape.range&&{range:shape.range}),segments:shape.positions?.length/6||0,rendered:cursorGroup.children.length});
      }catch(error){latest.current.onPaint?.({phase:'error',message:error.message});}
    }
    state.updatePaintCursor=()=>updateCursor();
    function paintAt(event,phase){
      const constraint=['circle','sphere','facet','triangle','height'].includes(latest.current.paintCursor?.tool)?latest.current.paintCursor?.constraint||'none':'none';const screen=constrainedPaintPosition(phase==='start'?null:lastConstraintScreen,[event.clientX,event.clientY],constraint);let finalHitScreen=null;
      try{const samples=projectPaintStroke(phase==='start'?null:lastPaintScreen,screen,position=>{
        const hit=hitAt({clientX:position[0],clientY:position[1]});if(!hit||!isPaintTarget(hit.object.userData.id)||!hit.face){finalHitScreen=null;return null;}finalHitScreen=[...position];
        const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
        return{id:hit.object.userData.id,triangleIndex:hit.faceIndex,point:hit.point.toArray(),normal:normal.toArray(),frontDirection:raycaster.ray.direction.toArray()};
      });for(const sample of samples)latest.current.onPaint?.(sample?{...sample,phase,button:paintButton,shiftKey:event.shiftKey}:{phase:'break'});lastPaintScreen=screen;lastConstraintScreen=finalHitScreen;renderer.domElement.dataset.paintStrokeScreen=JSON.stringify(finalHitScreen);}
      catch(error){lastPaintScreen=null;latest.current.onPaint?.({phase:'error',message:error.message});}
    }
    state.brimTool=createBrimEarInteraction(state,()=>latest.current.brimEditing);
    state.towerTool=createPrimeTowerInteraction(state,()=>latest.current);
    const pointerDown=event=>{if(state.brimTool.pointerDown(event)||state.towerTool.pointerDown(event))return;down=[event.clientX,event.clientY];if(event.button===0&&event.shiftKey&&latest.current.mode!=='Paint'&&latest.current.onRectangleSelect){const box=renderer.domElement.getBoundingClientRect();rectangle=[event.clientX-box.left,event.clientY-box.top,event.clientX-box.left,event.clientY-box.top];setSelectionRectangle(rectangle);orbit.enabled=false;transform.enabled=false;event.preventDefault();event.stopPropagation();renderer.domElement.setPointerCapture(event.pointerId);return;}if(latest.current.mode==='Paint'&&latest.current.paintCursor?.tool!=='gap'&&paintButtonState(latest.current.paintCursor.channel,{button:event.button,shiftKey:event.shiftKey,state:latest.current.paintCursor.state})!==null&&hitAt(event)){painting=true;paintButton=event.button;paintShift=event.shiftKey;lastConstraintScreen=null;orbit.enabled=false;event.preventDefault();event.stopImmediatePropagation();renderer.domElement.setPointerCapture?.(event.pointerId);updateCursor(event);paintAt(event,'start');}};
    const pointerMove=event=>{if(state.brimTool.pointerMove(event)||state.towerTool.pointerMove(event))return;if(rectangle){const box=renderer.domElement.getBoundingClientRect();rectangle=[rectangle[0],rectangle[1],event.clientX-box.left,event.clientY-box.top];setSelectionRectangle(rectangle);event.preventDefault();event.stopPropagation();return;}if(latest.current.mode==='Paint')updateCursor(event);if(painting&&(event.buttons&(paintButton===2?2:1))){event.preventDefault();event.stopImmediatePropagation();paintAt(event,'move');}};
    const pointerLeave=()=>{if(!painting){lastHoverScreen=null;cursorSignature=null;clearCursor();}};
    const pointerUp=event=>{
      if(state.brimTool.pointerUp(event)||state.towerTool.pointerUp(event))return;
      if(rectangle){const finished=rectangle;rectangle=null;down=null;setSelectionRectangle(null);event.preventDefault();event.stopPropagation();if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);orbit.enabled=true;transform.enabled=true;if(event.type!=='pointercancel'&&event.shiftKey)try{const ids=pickSceneRectangle(state,finished);renderer.domElement.dataset.rectangleHits=JSON.stringify(ids);latest.current.onRectangleSelect?.(ids,event);}catch(error){setFailure(error.message);}return;}
      if(painting){painting=false;lastPaintScreen=null;lastConstraintScreen=null;orbit.enabled=true;event.preventDefault();event.stopImmediatePropagation();if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);latest.current.onPaint?.({phase:'end'});updateCursor(event);return;}
      if(latest.current.mode==='Paint')return;
      if((event.button!==0&&!(event.button===2&&event.ctrlKey))||!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>4||transform.axis||transform.dragging)return;
      const hit=hitAt(event);if(hit){latest.current.onSelect(hit.object.userData.id,event);if(latest.current.mode==='Place on face'&&hit.face){const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));latest.current.onPlaceFace(hit.object.userData.id,normal.toArray());}}else latest.current.onSelect(null,event);
    };
    renderer.domElement.addEventListener('contextmenu',event=>{if(event.ctrlKey||latest.current.mode==='Paint')event.preventDefault();});renderer.domElement.addEventListener('pointerdown',pointerDown,true);renderer.domElement.addEventListener('pointermove',pointerMove,true);renderer.domElement.addEventListener('pointerup',pointerUp,true);renderer.domElement.addEventListener('pointercancel',pointerUp,true);renderer.domElement.addEventListener('pointerleave',pointerLeave);
    renderer.domElement.addEventListener('wheel',event=>{if(latest.current.mode==='Paint'&&latest.current.onPaintWheel?.(event)){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,passive:false});
    state.requestRender();
    return () => {
      scheduler.dispose();orbit.removeEventListener('change',scheduler.invalidate);orbit.removeEventListener('start',damping.reset);transform.removeEventListener('change',scheduler.invalidate);state.towerTool.dispose();state.brimTool.dispose();observer.disconnect();cameraBinding.dispose();orbit.dispose();transform.dispose();
      scene.traverse(object => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach(material => material.dispose()); else object.material?.dispose(); });
      renderer.dispose(); renderer.domElement.remove(); runtime.current = null;
    };
  }, [projection, bedKey]);

  useEffect(() => {
    const state = runtime.current; if (!state) return;
    state.transform.detach(); state.proxyStartInverse = null;
    const paintingIds=new Set(paintTargetIds||[paintTargetId]);
    const clip=normalizeClipPlane(clipPlane),clippingPlanes=clip?[new THREE.Plane(new THREE.Vector3(...clip.normal).negate(),clip.offset)]:[];
    for(const overlay of [...state.overhangOverlay.children]){state.overhangOverlay.remove(overlay);overlay.geometry.dispose();overlay.material.dispose();}
    state.cameraBinding.apply();
    for(const overlay of [...state.paintOverlay.children]){state.paintOverlay.remove(overlay);overlay.geometry.dispose();overlay.material.dispose();}
    for (const mesh of [...state.meshes.children]) { state.meshes.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    for(const marker of [...state.brimMarkers.children]){state.brimMarkers.remove(marker);marker.geometry.dispose();marker.material.dispose();}
    const ears=objects.filter(object=>object.visible!==false).flatMap(worldBrimEars);
    for(const ear of ears){const marker=new THREE.Mesh(new THREE.CircleGeometry(ear.radius,48),new THREE.MeshBasicMaterial({color:0xe7ac24,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));marker.position.set(ear.position[0],ear.position[1],Math.max(.06,ear.position[2]));state.brimMarkers.add(marker);}
    state.renderer.domElement.dataset.brimEars=JSON.stringify(ears);
    for (const object of objects.filter(item => item.visible !== false)) {
      const source = meshBounds({ ...object, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
      const center = source.center;
      const positions = new Float32Array(object.positions.length);
      for (let index = 0; index < positions.length; index++) positions[index] = object.positions[index] - center[index % 3];
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.computeVertexNormals();
      const appearance = sceneMaterialState(object, { selected: (selectedIds||[selectedId]).includes(object.id), filamentColor: filamentColors[(object.filamentSlot||1)-1] });
      const material = new THREE.MeshStandardMaterial({ color: paintChannel&&paintingIds.has(object.id)?(paintChannel==='color'?filamentColors[(object.filamentSlot||1)-1]||'#cccccc':'#cccccc'):appearance.color, opacity: supportSegments ? .2 : appearance.opacity, transparent: supportSegments ? true : appearance.transparent, depthWrite: supportSegments ? false : appearance.depthWrite, depthTest: appearance.depthTest, side: THREE.DoubleSide, roughness: .6, metalness: .08, wireframe, clippingPlanes });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...center.map((value, index) => value + object.position[index]));
      mesh.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad), 'XYZ'); mesh.scale.set(...object.scale);
      mesh.userData = { id: object.id, sourceCenter: center, nativeRole: appearance.role }; mesh.renderOrder = appearance.renderOrder; state.meshes.add(mesh);
      if (!transformObject?.sceneGroupProxy && object.id === selectedId && ['Move', 'Rotate', 'Scale'].includes(mode)) { state.transform.setMode({ Move: 'translate', Rotate: 'rotate', Scale: 'scale' }[mode]); state.transform.attach(mesh); }
    }
    const paintedCounts={};
    if(paintChannel)for(const object of objects.filter(object=>object.visible!==false&&paintingIds.has(object.id))){
      const facets=paintedFacetGeometry(object,paintChannel,{filamentCount:paintFilamentCount}),positions=[],colors=[];
      for(const facet of facets){const palette=paintChannel==='color'?filamentColors:paintChannel==='fuzzy'?['#1eaed1']:paintChannel==='seam'?['#f4e88e','#e95171']:['#80ff80','#ff8080'];const color=new THREE.Color(palette[facet.state-1]||'#cccccc');paintedCounts[facet.state]=(paintedCounts[facet.state]||0)+1;for(const point of facet.vertices){positions.push(...point);colors.push(color.r,color.g,color.b);}}
      if(positions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.86,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,clippingPlanes});const overlay=new THREE.Mesh(geometry,material);overlay.renderOrder=3;state.paintOverlay.add(overlay);}
    }
    if(overhangAngle>0)for(const object of objects.filter(object=>object.visible!==false&&paintingIds.has(object.id))){
      const positions=overhangFacetGeometry(object,overhangAngle).flatMap(facet=>facet.vertices.flat());if(positions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const material=new THREE.MeshBasicMaterial({color:'#e4a34b',transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,clippingPlanes});const overlay=new THREE.Mesh(geometry,material);overlay.renderOrder=2;state.overhangOverlay.add(overlay);}
    }
    for(const cap of [...state.clipCaps.children]){state.clipCaps.remove(cap);cap.geometry.dispose();cap.material.dispose();}
    const clippingErrors=[];
    if(clip)for(const object of objects.filter(object=>object.visible!==false)){
      try{const key=JSON.stringify([clip,object.position,object.rotation,object.scale]),previous=state.clipCache.get(object.id);let section;
        if(previous?.positions===object.positions&&previous.key===key)section=previous.section;
        else{section=clippingSection(object,clip);state.clipCache.set(object.id,{positions:object.positions,key,section});}
        if(section.positions.length){const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(section.positions,3)),material=new THREE.MeshBasicMaterial({color:new THREE.Color(.25,.25,.25),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});const cap=new THREE.Mesh(geometry,material);cap.userData.clippingCap=true;cap.userData.id=object.id;state.clipCaps.add(cap);}
        const outline=section.contours.flatMap(loop=>loop.flatMap((point,index)=>[...point,...loop[(index+1)%loop.length]]));if(outline.length){const line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(outline,3)),new THREE.LineBasicMaterial({color:0xffffff}));state.clipCaps.add(line);}
      }catch(error){clippingErrors.push(`${object.name}: ${error.message}`);}
    }
    const visibleIds=new Set(objects.map(object=>object.id));for(const id of state.clipCache.keys())if(!visibleIds.has(id))state.clipCache.delete(id);
    latest.current.onClippingError?.(clippingErrors.join('; '));
    state.renderer.domElement.dataset.clippingCapTriangles=String(state.clipCaps.children.filter(child=>child.isMesh).reduce((count,cap)=>count+cap.geometry.attributes.position.count/3,0));
    state.renderer.domElement.dataset.clippingPlane=JSON.stringify(clip);
    state.renderer.domElement.dataset.overhangTriangleCount=String(state.overhangOverlay.children.reduce((count,overlay)=>count+overlay.geometry.attributes.position.count/3,0));
    state.renderer.domElement.dataset.paintedFacets=JSON.stringify(paintedCounts);
    state.renderer.domElement.dataset.paintTriangleCount=String(state.paintOverlay.children.reduce((count,overlay)=>count+overlay.geometry.attributes.position.count/3,0));
    if (transformObject?.sceneGroupProxy && ['Move', 'Rotate', 'Scale'].includes(mode)) {
      const center = meshBounds({ ...transformObject, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }).center;
      state.proxy.position.set(...center.map((value,index) => value + transformObject.position[index]));
      state.proxy.rotation.set(...transformObject.rotation.map(THREE.MathUtils.degToRad),'XYZ'); state.proxy.scale.set(...transformObject.scale);
      state.proxy.userData = { id: selectedId, sourceCenter: center }; state.proxy.updateMatrixWorld(true);
      state.transform.setMode({ Move:'translate', Rotate:'rotate', Scale:'scale' }[mode]); state.transform.attach(state.proxy);
    }
    state.meshes.updateMatrixWorld(true);state.clipCaps.updateMatrixWorld(true);
    state.renderer.domElement.dataset.partMaterials = JSON.stringify(state.meshes.children.map(mesh => ({ id:mesh.userData.id, role:mesh.userData.nativeRole, color:`#${mesh.material.color.getHexString()}`, opacity:mesh.material.opacity, depthWrite:mesh.material.depthWrite, depthTest:mesh.material.depthTest })));
    if (objects.length && !state.fitted) { state.fit('Isometric',{automatic:true}); state.fitted = true; }
    state.renderer.domElement.dataset.objectCount = String(objects.filter(object => object.visible !== false).length);
    state.renderer.domElement.dataset.selectedIds=selectionKey;state.towerTool.sync();state.requestRender();
  }, [objects, selectedId, selectionKey, transformObject, mode, wireframe, projection, bedKey, filamentKey, paintChannel, paintTargetId, paintTargetKey, paintFilamentCount, JSON.stringify(clipPlane), overhangAngle, Boolean(supportSegments)]);

  useEffect(()=>{
    const state=runtime.current;if(!state)return;
    const result=primeTowerPreview?.result;
    const group=createPrimeTowerGeometry(result,filamentColors);state.scene.add(group);group.updateMatrixWorld(true);
    state.towerTool.bind(group,result);
    if(result?.visible){const box=new THREE.Box3().setFromObject(group);state.towerBounds={min:box.min.toArray(),max:box.max.toArray()};}
    else state.towerBounds=null;
    const plateId=primeTowerPreview?.plateId;
    if(state.pendingFit&&state.pendingFit.plateId!==plateId)state.pendingFit=null;
    const pending=state.pendingFit;
    if(pending&&primeTowerPreview?.status!=='loading'){
      state.pendingFit=null;
      if(pending.plateId===plateId&&primeTowerPreview?.status==='ready')state.fit(pending.view,{automatic:true});
    }else if(result?.visible&&state.towerFittedPlate!==result.plateId&&state.towerAutoFitSuppressed!==plateId)state.fit('Isometric',{automatic:true});
    if(result?.visible)state.towerFittedPlate=result.plateId;
    state.renderer.domElement.dataset.primeTower=JSON.stringify({status:primeTowerPreview?.status||'idle',visible:Boolean(result?.visible),...(result?.visible&&{size:result.size,position:result.position,rotation:result.rotation,alpha:result.alpha,extruders:result.extruders}),bands:group.children.length,triangles:group.children.reduce((n,mesh)=>n+mesh.geometry.attributes.position.count/3,0)});
    state.requestRender();
    return()=>{state.towerTool.bind(null,null);state.towerBounds=null;disposePrimeTower(group);state.requestRender();};
  },[primeTowerPreview?.result,primeTowerPreview?.status,primeTowerPreview?.plateId,filamentKey,projection,bedKey]);

  useEffect(()=>{runtime.current?.updatePaintCursor?.();},[JSON.stringify(paintCursor),JSON.stringify(clipPlane),objects,mode,paintTargetId,paintTargetKey,paintFilamentCount,filamentKey]);

  useEffect(()=>{const state=runtime.current;if(!state)return;for(const child of [...state.supportOverlay.children]){state.supportOverlay.remove(child);child.geometry.dispose();child.material.dispose();}
    if(supportSegments?.length){const positions=new Float32Array(supportSegments.length*6);supportSegments.forEach((segment,index)=>positions.set([...segment.start,...segment.end],index*6));const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color:'#f4b64b'}));lines.renderOrder=5;state.supportOverlay.add(lines);}
    state.requestRender();state.renderer.domElement.dataset.supportSegments=String(state.supportOverlay.children.reduce((count,child)=>count+child.geometry.attributes.position.count/2,0));
  },[supportSegments,projection,bedKey]);

  useLayerHeightVisualization(runtime,layerHeightVisualization,[objects,selectedId,selectionKey,transformObject,mode,wireframe,projection,bedKey,filamentKey,paintChannel,paintTargetId,paintTargetKey,paintFilamentCount,JSON.stringify(clipPlane),overhangAngle,Boolean(supportSegments)]);

  useEffect(()=>{runtime.current?.towerTool.sync();},[primeTowerSelected,mode]);
  useEffect(()=>{runtime.current?.brimTool.refresh();},[brimEditing,objects,projection,bedKey]);
  useEffect(()=>{if(cameraCommand)runtime.current?.fit(cameraCommand.view,{bedOnly:cameraCommand.bedOnly});},[cameraCommand]);
  return <section className="scene-viewport" data-fps-overlay={graphics.value.opengl_show_fps_overlay} aria-label="Model workspace" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
    <div ref={host} className="scene-renderer"/><ViewportFpsOverlay graphics={graphics}/>{selectionRectangle&&<div className="scene-selection-rectangle" aria-label="Selection rectangle" style={{left:Math.min(selectionRectangle[0],selectionRectangle[2]),top:Math.min(selectionRectangle[1],selectionRectangle[3]),width:Math.abs(selectionRectangle[2]-selectionRectangle[0]),height:Math.abs(selectionRectangle[3]-selectionRectangle[1])}}/>}
    <div className="scene-views">{['Isometric', 'Top', 'Front', 'Right', 'Back', 'Left', 'Bottom'].map(view => <button key={view} onClick={() => runtime.current?.fit(view)} title={`${view} camera view`}>{view}</button>)}<button onClick={() => runtime.current?.fit()}>Fit</button><button onClick={() => setProjection(value => value === 'Perspective' ? 'Orthographic' : 'Perspective')}>{projection}</button></div>
    {primeTowerPreview?.status==='error'&&<p className="prime-tower-preview-status" role="status">Prime tower preview unavailable: {primeTowerPreview.error}</p>}
    {primeTowerPreview?.status==='loading'&&<p className="prime-tower-preview-status" role="status">Updating prime tower preview…</p>}
    {failure && <p className="render-error" role="alert">{failure}</p>}
    {mode === 'Place on face' && <p className="scene-hint">Click a model face to place it on the bed.</p>}
    {!objects.length && children}
    <p className="scene-axis">{axes.map((axis, index) => <span key={axis} style={{ color: ['#c43838', '#25803d', '#337fd7'][index] }}>{axis}</span>)}<small>{mode==='Paint'?'Drag to paint · Shift erases · Scroll to zoom':nativeCameraHint(cameraPreferences)}</small></p>
  </section>;
}
