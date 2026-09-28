import{useEffect,useRef}from'react';import*as THREE from'three';
// Pinned resources/shaders/140/variable_layer_height.{vs,fs}; native lighting,
// cosine cursor band and derivative-based two-level Z texture selection.
const vertexShader=`
varying vec2 layerIntensity;varying float layerObjectZ;uniform float layerMinZ;
void main(){vec3 n=normalize(normalMatrix*normal);vec3 top=vec3(-.4574957,.4574957,.7624929),front=vec3(.6985074,.1397015,.6985074);vec4 p=modelViewMatrix*vec4(position,1.);layerIntensity.x=.3+max(dot(n,top),0.)*.48+max(dot(n,front),0.)*.18;layerIntensity.y=.075*pow(max(dot(-normalize(p.xyz),reflect(-top,n)),0.),20.);layerObjectZ=(modelMatrix*vec4(position,1.)).z-layerMinZ;gl_Position=projectionMatrix*p;}`;
const fragmentShader=`
varying vec2 layerIntensity;varying float layerObjectZ;uniform sampler2D layerTexture;uniform sampler2D layerTextureLOD;uniform float layerZToRow;uniform float layerRowNormalized;uniform float layerCursorZ;uniform float layerBandWidth;
void main(){float rowValue=layerZToRow*layerObjectZ,row=floor(rowValue),col=rowValue-row;float blend=.25*cos(min(3.141592653589793,abs(3.141592653589793*(layerObjectZ-layerCursorZ)*1.8/layerBandWidth)))+.25;float cells=rowValue*190.;float dx=dFdx(cells),dy=dFdy(cells),lod=clamp(.5*log2(max(dx*dx,dy*dy)),0.,1.);vec4 color=vec4(.25,.25,.25,1.);if(row>=0.)color=mix(texture2D(layerTexture,vec2(col,layerRowNormalized*(row+.5))),texture2D(layerTextureLOD,vec2(col,layerRowNormalized*(row*2.+1.))),lod);gl_FragColor=vec4(vec3(layerIntensity.y),1.)+layerIntensity.x*mix(color,vec4(1.,1.,0.,1.),blend);}`;
export function useLayerHeightVisualization(runtime,visualization,refreshDependencies){
 const active=useRef([]);
 useEffect(()=>{
  const state=runtime.current,data=visualization?.texture,context=visualization?.context;if(!state||!data||!context)return;
  const makeTexture=(bytes,width,height)=>{const t=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.generateMipmaps=false;t.needsUpdate=true;return t;};
  const texture=makeTexture(data.data,data.width,data.height),lod=makeTexture(data.lod,data.width/2,data.height/2),changed=[];
  for(const mesh of state.meshes.children){if(mesh.userData.nativeRole!=='normal_part')continue;const original=mesh.material,uniforms={layerTexture:{value:texture},layerTextureLOD:{value:lod},layerZToRow:{value:(data.cells-1)/(data.width*context.objectHeight)},layerRowNormalized:{value:1/data.height},layerCursorZ:{value:visualization.cursorZ??-1000*context.objectHeight},layerBandWidth:{value:visualization.bandWidth||2},layerMinZ:{value:context.minZ||0}};
   const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:THREE.DoubleSide,toneMapped:false});mesh.material=material;changed.push({mesh,original,material});
  }
  active.current=changed;state.requestRender?.();state.renderer.domElement.dataset.layerTextureCells=String(data.cells);state.renderer.domElement.dataset.layerCount=String(data.layerCount);state.renderer.domElement.dataset.layerShaderObjects=String(changed.length);
  return()=>{state.requestRender?.();for(const{mesh,original,material}of changed){if(mesh.material===material)mesh.material=original;if(!state.meshes.children.includes(mesh))original.dispose();material.dispose();}texture.dispose();lod.dispose();active.current=[];delete state.renderer.domElement.dataset.layerTextureCells;delete state.renderer.domElement.dataset.layerCount;delete state.renderer.domElement.dataset.layerShaderObjects;};
 },[...refreshDependencies,visualization?.texture,visualization?.context]);
 useEffect(()=>{for(const{material}of active.current){material.uniforms.layerCursorZ.value=visualization?.cursorZ??-1000*(visualization?.context?.objectHeight||1);material.uniforms.layerBandWidth.value=visualization?.bandWidth||2;}runtime.current?.requestRender?.();const canvas=runtime.current?.renderer.domElement;if(canvas&&visualization){canvas.dataset.layerCursorZ=String(visualization.cursorZ??'');canvas.dataset.layerBandWidth=String(visualization.bandWidth);}},[visualization?.cursorZ,visualization?.bandWidth,visualization?.texture,visualization?.context]);
}
