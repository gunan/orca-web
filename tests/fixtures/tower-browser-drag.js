import * as THREE from 'three';
/** Convert actual browser pointer coordinates through the independently read
 * camera. Browsers may quantize synthetic pointer positions to device pixels. */
export async function dragWorldPoint(page,canvas,point,delta) {
 const box=await canvas.boundingBox(),frame=JSON.parse(await canvas.getAttribute('data-camera-frame'));
 const camera=frame.projection==='Orthographic'?new THREE.OrthographicCamera():new THREE.PerspectiveCamera();camera.matrixWorldInverse.fromArray(frame.matrixWorldInverse);camera.matrixWorld.copy(camera.matrixWorldInverse).invert();camera.projectionMatrix.fromArray(frame.projectionMatrix);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 const screen=p=>{const v=new THREE.Vector3(...p).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);return[box.x+(v.x+1)*box.width/2,box.y+(1-v.y)*box.height/2];};
 await page.evaluate(()=>{window.__towerPointer={};window.__towerPointerListener=e=>{if(e.target.getAttribute?.('aria-label')==='Interactive 3D model view'){if(e.type==='pointerdown')window.__towerPointer.start=[e.clientX,e.clientY];if(e.type==='pointermove')window.__towerPointer.end=[e.clientX,e.clientY];}};window.addEventListener('pointerdown',window.__towerPointerListener,true);window.addEventListener('pointermove',window.__towerPointerListener,true);});
 try{
  await page.mouse.move(...screen(point));await page.mouse.down();await page.mouse.move(...screen([point[0]+delta[0],point[1]+delta[1],point[2]]),{steps:8});
  const events=await page.evaluate(()=>window.__towerPointer);if(!events.start||!events.end)throw new Error('Tower gesture did not reach the canvas: '+JSON.stringify({point,screen:screen(point),box,events,element:await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.outerHTML,screen(point))}));
  const ray=new THREE.Raycaster(),world=([x,y])=>{ray.setFromCamera(new THREE.Vector2(2*(x-box.x)/box.width-1,1-2*(y-box.y)/box.height),camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-point[2]),new THREE.Vector3());};
  const displacement=world(events.end).sub(world(events.start));return displacement.toArray().slice(0,2);
 }finally{await page.evaluate(()=>{window.removeEventListener('pointerdown',window.__towerPointerListener,true);window.removeEventListener('pointermove',window.__towerPointerListener,true);});}
}

export async function dragTower(page,canvas,result,delta){const point=[result.position[0]+result.size[0]/2,result.position[1]+result.size[1]/2,result.size[2]],movement=await dragWorldPoint(page,canvas,point,delta);return result.position.map((v,i)=>v+movement[i]);}
