import {createPrimeTowerMoveHandles} from './prime-tower-move-handles.js';
import {primeTowerAxisProjection} from '../shared/prime-tower-gizmo.js';
import * as THREE from 'three';
import {constrainPrimeTowerDrag} from '../shared/prime-tower-drag.js';

export function createPrimeTowerInteraction(state,getOptions) {
 const {renderer,camera,orbit,scene,meshes,transform}=state,canvas=renderer.domElement,ray=new THREE.Raycaster();
 let group=null,result=null,drag=null,selectedPlate=null,outline=null,pickShell=null;
 const handles=createPrimeTowerMoveHandles(state);
 const refreshHandles=()=>handles.update(result,group?.position.toArray().slice(0,2),selectedPlate===result?.plateId&&getOptions().mode==='Move'&&available());
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const setRay=event=>{const b=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(2*(event.clientX-b.left)/b.width-1,1-2*(event.clientY-b.top)/b.height),camera);};
 const available=()=>result?.visible&&result.dragContext?.version===1&&getOptions().primeTowerPreview?.status==='ready'&&['Select','Move'].includes(getOptions().mode)&&Boolean(getOptions().onPrimeTowerMove);
 function record(){state.requestRender?.();refreshHandles();canvas.dataset.primeTowerInteraction=JSON.stringify({available:Boolean(available()),selected:Boolean(selectedPlate&&selectedPlate===result?.plateId),dragging:Boolean(drag),position:group?group.position.toArray().slice(0,2):null});}
 function removeOutline(){outline?.removeFromParent();outline?.geometry.dispose();outline?.material.dispose();outline=null;}
 function showSelection(){removeOutline();if(group&&selectedPlate===result?.plateId){group.updateMatrixWorld(true);outline=new THREE.BoxHelper(group,0x009b78);scene.add(outline);}record();}
 function release(event,cancel=false,{notify=true}={}){
  if(!drag)return false;const finished=drag;drag=null;
  if(cancel&&group===finished.group)group.position.set(...finished.result.position,0);
  orbit.enabled=finished.orbitEnabled;transform.enabled=finished.transformEnabled;
  if(canvas.hasPointerCapture?.(finished.pointerId))canvas.releasePointerCapture(finished.pointerId);
  showSelection();if(event)consume(event);if(notify)getOptions().onPrimeTowerSelect?.(selectedPlate,{dragging:false});
  if(!cancel&&finished.moved&&group===finished.group){const position=group.position.toArray().slice(0,2);if(position.some((v,i)=>v!==finished.result.position[i]))getOptions().onPrimeTowerMove(position,finished.result.plateId);}
  return true;
 }
 function pointerDown(event){
  if(drag){consume(event);return true;}
  if(!available()||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||transform.axis)return false;
  setRay(event);group.updateMatrixWorld(true);refreshHandles();const axis=handles.pick(ray);if(event.shiftKey&&!axis)return false;
  // Native load_wipe_tower_preview gives its raycaster the entire shell,
  // not the separate color bands and their internal faces.
  pickShell.matrixWorld.copy(group.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(...result.size.map(v=>v/2)));
  const hit=ray.intersectObjects([...meshes.children,pickShell],false)[0];
  if(!axis&&(!hit||hit.object!==pickShell)){selectedPlate=null;getOptions().onPrimeTowerSelect?.(null);showSelection();return false;}
  const alreadySelected=selectedPlate===result.plateId;selectedPlate=result.plateId;getOptions().onPrimeTowerSelect?.(selectedPlate,{dragging:true});
  canvas.focus();getOptions().onSelect?.(null,event);transform.detach();
  drag={group,result,axis,start:axis?new THREE.Vector3(...axis.handle):hit.point.clone(),screen:[event.clientX,event.clientY],pointerId:event.pointerId,orbitEnabled:orbit.enabled,transformEnabled:transform.enabled,moved:false,threshold:!axis&&!alreadySelected};
  orbit.enabled=false;transform.enabled=false;canvas.setPointerCapture(event.pointerId);showSelection();consume(event);return true;
 }
 function pointerMove(event){
  if(!drag)return false;
  if(event.pointerId!==drag.pointerId){consume(event);return true;}
  if(!(event.buttons&1)){release(event,true);return true;}
  if(!available()||result!==drag.result){release(event,true);return true;}
  consume(event);
  if(drag.threshold&&Math.abs(event.clientX-drag.screen[0])<=5&&Math.abs(event.clientY-drag.screen[1])<=5)return true;
  drag.threshold=false;setRay(event);let point;
  if(drag.axis){
   try{const movement=primeTowerAxisProjection({...drag.axis,ray:[ray.ray.origin.toArray(),ray.ray.origin.clone().add(ray.ray.direction).toArray()],shift:event.shiftKey}),displacement=[0,0];displacement[drag.axis.axis]=movement;const position=constrainPrimeTowerDrag(result,displacement);group.position.set(...position,0);group.updateMatrixWorld(true);outline?.update();drag.moved=true;record();}catch(error){release(event,true);getOptions().onPrimeTowerError?.(error.message);}
   return true;
  }
  const forward=camera.getWorldDirection(new THREE.Vector3());
  if(Math.abs(forward.z)<1e-4){
   // Original side-view projection, dropping Z for the tower's planar position.
   const direction=ray.ray.direction,delta=drag.start.clone().sub(ray.ray.origin);
   point=ray.ray.origin.clone().addScaledVector(direction,delta.dot(direction)/direction.lengthSq());
  }else point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-drag.start.z),new THREE.Vector3());
  if(!point)return true;
  try {const position=constrainPrimeTowerDrag(result,[point.x-drag.start.x,point.y-drag.start.y]);group.position.set(...position,0);group.updateMatrixWorld(true);outline?.update();drag.moved=true;record();}
  catch(error){release(event,true);getOptions().onPrimeTowerError?.(error.message);}
  return true;
 }
 function pointerUp(event){if(drag&&event.pointerId!==drag.pointerId){consume(event);return true;}return release(event,event.type==='pointercancel');}
 function lostCapture(event){if(drag&&event.pointerId===drag.pointerId)release(null,true);}
 const doc=canvas.ownerDocument,view=doc?.defaultView;
 const interrupted=()=>release(null,true),visibility=()=>{if(doc.hidden)interrupted();};
 canvas.addEventListener('lostpointercapture',lostCapture);view?.addEventListener('blur',interrupted);doc?.addEventListener('visibilitychange',visibility);
 function keyDown(event){if(event.key==='Escape'&&drag)release(event,true);}
 canvas.addEventListener('keydown',keyDown,true);
 return {
  pointerDown,pointerMove,pointerUp,frame:refreshHandles,
  bind(nextGroup,nextResult){release(null,true);removeOutline();pickShell?.geometry.dispose();pickShell?.material.dispose();pickShell=nextResult?.visible?new THREE.Mesh(new THREE.BoxGeometry(...nextResult.size),new THREE.MeshBasicMaterial()):null;if(nextResult?.plateId&&selectedPlate!==nextResult.plateId)selectedPlate=null;group=nextGroup;result=nextResult;showSelection();},
  sync(){if(drag&&!available())release(null,true);if(!drag&&getOptions().primeTowerSelected!==selectedPlate){selectedPlate=getOptions().primeTowerSelected;showSelection();}record();},
  dispose(){release(null,true,{notify:false});handles.dispose();removeOutline();pickShell?.geometry.dispose();pickShell?.material.dispose();canvas.removeEventListener('keydown',keyDown,true);canvas.removeEventListener('lostpointercapture',lostCapture);view?.removeEventListener('blur',interrupted);doc?.removeEventListener('visibilitychange',visibility);}
 };
}
