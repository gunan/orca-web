import * as THREE from 'three';
import {nativeSegmentIndices} from '../shared/preview-volume.js';
import {nativePreviewVolumeVertexShader,nativePreviewVolumeFragmentShader} from './preview-volume-shader.js';

/** Instanced native segment shader. Eligibility and original indices are kept
 * explicit so existing layer/role/move-range controls retain their meaning. */
export function createPreviewVolumeRenderer(volumeData,eligibleIndices,colorFor){
 const rows=[];eligibleIndices.forEach((originalIndex,eligibleIndex)=>{const data=volumeData.segments[originalIndex];if(data)rows.push({data,eligibleIndex});});
 if(!rows.length)return null;
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setIndex([...nativeSegmentIndices]);
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(24),3));
 geometry.setAttribute('native_vertex_id',new THREE.Float32BufferAttribute([0,1,2,3,4,5,6,7],1));
 for(const[end,name]of[['start','start'],['end','end']]){
  const positions=new Float32Array(rows.length*3),hwa=new Float32Array(rows.length*4),colors=new Float32Array(rows.length*3);
  rows.forEach(({data},index)=>{positions.set(data[end].position,index*3);hwa.set([...data[end].hwa.slice(0,3),data[end].hwa[3]??0],index*4);const color=colorFor(data[end].sourceIndex,data[end].nativeVertexIndex),rgb={r:0,g:0,b:0};if(Number.isInteger(data[end].nativeVertexIndex)){
   // Native palettes are uint8 RGB. Recover their exact channels after Three's
   // approximate linear/sRGB roundtrip, before the original shader lighting.
   const value=color.getHex(THREE.SRGBColorSpace);colors.set([(value>>>16&255)/255,(value>>>8&255)/255,(value&255)/255],index*3);
  }else{color.getRGB(rgb,THREE.SRGBColorSpace);colors.set([rgb.r,rgb.g,rgb.b],index*3);}});
  geometry.setAttribute('native_'+name,new THREE.InstancedBufferAttribute(positions,3));
  geometry.setAttribute('native_hwa_'+name,new THREE.InstancedBufferAttribute(hwa,4));
  geometry.setAttribute('native_color_'+name,new THREE.InstancedBufferAttribute(colors,3));
 }
 geometry.instanceCount=rows.length;
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:nativePreviewVolumeVertexShader,fragmentShader:nativePreviewVolumeFragmentShader,uniforms:{camera_position:{value:new THREE.Vector3()}},side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 const cameraPosition=new THREE.Vector3();mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(cameraPosition);material.uniforms.camera_position.value.set(cameraPosition.x,-cameraPosition.z,cameraPosition.y);};
 return {mesh,count:rows.length,setVisibleCount(count){let low=0,high=rows.length;while(low<high){const middle=(low+high)>>>1;if(rows[middle].eligibleIndex<count)low=middle+1;else high=middle;}geometry.instanceCount=low;mesh.visible=low>0;return low;},dispose(){geometry.dispose();material.dispose();}};
}
