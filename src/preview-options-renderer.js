import * as THREE from 'three';
import{nativeOptionPositions,nativeOptionNormals,nativeOptionsVertexShader,nativeOptionsFragmentShader}from'./preview-options-data.js';
/** Native option diamonds, including the original platform scale, lighting and
 * eye-space bias. IDs remain original native vertices throughout rendering. */
export function createPreviewOptionsRenderer(data,eventIds,colorFor,{mac=/Mac|iPhone|iPad/.test(globalThis.navigator?.platform||'')}={}){
 if(!eventIds.length)return null;
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(nativeOptionPositions,3));
 geometry.setAttribute('in_position',new THREE.Float32BufferAttribute(nativeOptionPositions,3));
 geometry.setAttribute('in_normal',new THREE.Float32BufferAttribute(nativeOptionNormals,3));
 const positions=new Float32Array(eventIds.length*3),hwa=new Float32Array(eventIds.length*4),colors=new Float32Array(eventIds.length*3);
 eventIds.forEach((id,index)=>{const v=data.vertices[id];positions.set([v[0],v[1],v[21]],index*3);hwa.set([v[22],v[23],v[24],v[25]],index*4);const color=colorFor(id),rgb={r:0,g:0,b:0};color.getRGB(rgb,THREE.SRGBColorSpace);colors.set([rgb.r,rgb.g,rgb.b],index*3);});
 geometry.setAttribute('native_position',new THREE.InstancedBufferAttribute(positions,3));geometry.setAttribute('native_hwa',new THREE.InstancedBufferAttribute(hwa,4));geometry.setAttribute('native_color',new THREE.InstancedBufferAttribute(colors,3));geometry.instanceCount=eventIds.length;
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:nativeOptionsVertexShader,fragmentShader:nativeOptionsFragmentShader,uniforms:{scaling_factor:{value:mac?.75:1.5}},side:THREE.FrontSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
 return{mesh,count:eventIds.length,setVisibleVertex(id){let lo=0,hi=eventIds.length;while(lo<hi){const mid=(lo+hi)>>>1;if(eventIds[mid]<=id)lo=mid+1;else hi=mid;}geometry.instanceCount=lo;mesh.visible=lo>0;return lo;},dispose(){geometry.dispose();material.dispose();}};
}
