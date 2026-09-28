import * as THREE from 'three';
/** Match the painter's current state colors, then use the native hover rule
 * get_seed_fill_color: multiply each RGB component by 1.25 and clamp to one.
 * Inputs/returned values are display RGB; Three receives explicit sRGB input. */
export function fillHoverColor(state,{channel,filamentColors=[],filamentSlot=1}={}){
 const palette=channel==='color'?filamentColors:channel==='fuzzy'?['#1eaed1']:channel==='seam'?['#f4e88e','#e95171']:['#80ff80','#ff8080'];
 const base=state?palette[state-1]:channel==='color'?filamentColors[filamentSlot-1]:'#cccccc',value=new THREE.Color().setStyle(base||'#cccccc',THREE.LinearSRGBColorSpace);
 return[value.r,value.g,value.b].map(number=>Math.min(1,number*1.25));
}
export function createFillHoverOverlay(scene,renderer){
 const group=new THREE.Group();scene.add(group);
 function clear(){for(const item of[...group.children]){group.remove(item);item.geometry.dispose();item.material.dispose();}renderer.domElement.dataset.paintFillPreview='null';}
 function show(selection,options){
  clear();if(!selection?.facets.length)return;
  const positions=[],colors=[],states={},displayColors={};
  for(const facet of selection.facets){const rgb=fillHoverColor(facet.state,{...options,filamentSlot:selection.filamentSlot}),color=new THREE.Color().setRGB(...rgb,THREE.SRGBColorSpace);states[facet.state]=(states[facet.state]||0)+1;displayColors[facet.state]=rgb;for(const point of facet.vertices){positions.push(...point);colors.push(color.r,color.g,color.b);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  const fill=new THREE.Mesh(geometry,material);fill.renderOrder=4;group.add(fill);
  if(selection.contour.length){const contourMaterial=new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:1,depthWrite:false});contourMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ngl_Position.z -= 0.00001 * gl_Position.w;');};const contour=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(selection.contour,3)),contourMaterial);contour.renderOrder=5;group.add(contour);}
  renderer.domElement.dataset.paintFillPreview=JSON.stringify({tool:selection.tool,objectId:selection.objectId,triangles:selection.facets.length,segments:selection.contour.length/6,states,colors:displayColors});
 }
 clear();return{clear,show};
}
