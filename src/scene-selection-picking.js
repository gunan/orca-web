import * as THREE from 'three';

// Native rectangle selection reads visible volume IDs from a depth-tested
// framebuffer. Projected bounding boxes incorrectly select occluded objects.
export function pickSceneRectangle({renderer,camera,meshes},rectangle) {
  if(!Array.isArray(rectangle)||rectangle.length!==4||!rectangle.every(Number.isFinite))throw new Error('Selection rectangle needs four finite coordinates');
  const canvas=renderer.domElement,fullWidth=Math.max(1,canvas.width),fullHeight=Math.max(1,canvas.height),scaleX=fullWidth/Math.max(1,canvas.clientWidth),scaleY=fullHeight/Math.max(1,canvas.clientHeight);
  const left=Math.max(0,Math.floor(Math.min(rectangle[0],rectangle[2])*scaleX)),top=Math.max(0,Math.floor(Math.min(rectangle[1],rectangle[3])*scaleY));
  const right=Math.min(fullWidth,Math.ceil(Math.max(rectangle[0],rectangle[2])*scaleX)),bottom=Math.min(fullHeight,Math.ceil(Math.max(rectangle[1],rectangle[3])*scaleY));
  const width=right-left,height=bottom-top;if(width<=0||height<=0)return[];
  if(width*height>8000000)throw new Error('Selection rectangle exceeds the rendering limit; select a smaller area.');
  const target=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});
  target.texture.colorSpace=THREE.NoColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0);
  const candidates=meshes.children.filter(mesh=>mesh.visible&&mesh.userData.id),materials=[];
  for(const [index,source] of candidates.entries()) {
    const id=index+1,color=new THREE.Color().setRGB((id&255)/255,((id>>8)&255)/255,((id>>16)&255)/255,THREE.LinearSRGBColorSpace);
    const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,toneMapped:false,blending:THREE.NoBlending,fog:false});materials.push(material);
    source.updateWorldMatrix(true,false);const copy=new THREE.Mesh(source.geometry,material);copy.matrixAutoUpdate=false;copy.matrix.copy(source.matrixWorld);scene.add(copy);
  }
  const view=camera.clone();view.setViewOffset(fullWidth,fullHeight,left,top,width,height);view.updateMatrixWorld(true);
  const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,view);
    const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    const found=new Set();for(let index=0;index<pixels.length;index+=4){const id=pixels[index]+(pixels[index+1]<<8)+(pixels[index+2]<<16);if(id>0&&id<=candidates.length)found.add(id-1);}
    return candidates.filter((_,index)=>found.has(index)).map(mesh=>mesh.userData.id);
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();materials.forEach(material=>material.dispose());}
}
