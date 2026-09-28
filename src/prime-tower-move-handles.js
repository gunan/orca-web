import * as THREE from 'three';
import {primeTowerBounds} from './prime-tower-renderer.js';

/** World X/Y handles for native tower movement; Z is intentionally unavailable. */
export function createPrimeTowerMoveHandles({scene,camera,renderer}){
 const canvas=renderer.domElement,group=new THREE.Group(),items=[];group.name='Prime tower move handles';scene.add(group);let signature='';
 for(let axis=0;axis<2;axis++){
  const color=axis===0?0xc43838:0x25803d,material=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false});
  const handle=new THREE.Mesh(new THREE.ConeGeometry(1,1,16),material);handle.userData.towerAxis=axis;handle.renderOrder=1001;handle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(axis===0?1:0,axis===1?1:0,0));
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false}));line.renderOrder=1000;
  group.add(line,handle);items.push({axis,handle,line});
 }
 let state={visible:false,axes:[]};
 function update(result,position,enabled){
  group.visible=Boolean(enabled&&result?.visible);state={visible:group.visible,axes:[]};
  if(group.visible){
   const bounds=primeTowerBounds({...result,position}),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),origin=new THREE.Vector3(...center),height=Math.max(canvas.getBoundingClientRect().height,1);
   const depth=Math.abs(origin.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
   const pixel=camera.isOrthographicCamera?(camera.top-camera.bottom)/(camera.zoom*height):2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
   for(const item of items){const end=[...center];end[item.axis]=bounds.max[item.axis]+20*pixel;item.handle.position.set(...end);item.handle.scale.set(6*pixel,14*pixel,6*pixel);const points=item.line.geometry.attributes.position;points.setXYZ(0,...center);points.setXYZ(1,...end);points.needsUpdate=true;item.line.geometry.computeBoundingSphere();state.axes.push({axis:item.axis,center:[...center],handle:end});}
   group.updateMatrixWorld(true);
  }
  const next=JSON.stringify(state);if(next!==signature){canvas.dataset.primeTowerGizmo=next;signature=next;}
 }
 return{update,pick(ray){if(!group.visible)return null;const hit=ray.intersectObjects(items.map(item=>item.handle),false)[0];if(!hit)return null;return state.axes.find(item=>item.axis===hit.object.userData.towerAxis);},dispose(){group.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});group.removeFromParent();delete canvas.dataset.primeTowerGizmo;}};
}
