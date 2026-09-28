export {parseNativeHotend} from '../shared/hotend-geometry.js';
import * as THREE from 'three';
// OrcaSlicer resources/shaders/140/gouraud_light.{vs,fs}. Only the GLSL version,
// attribute/uniform binding names and varying syntax change for Three/WebGL.
export const nativeToolMarkerVertexShader=`
#define INTENSITY_CORRECTION 0.6
const vec3 LIGHT_TOP_DIR=vec3(-0.4574957,0.4574957,0.7624929);
#define LIGHT_TOP_DIFFUSE (0.8*INTENSITY_CORRECTION)
#define LIGHT_TOP_SPECULAR (0.125*INTENSITY_CORRECTION)
#define LIGHT_TOP_SHININESS 20.0
const vec3 LIGHT_FRONT_DIR=vec3(0.6985074,0.1397015,0.6985074);
#define LIGHT_FRONT_DIFFUSE (0.3*INTENSITY_CORRECTION)
#define INTENSITY_AMBIENT 0.3
varying vec2 intensity;
void main(){
 vec3 n=normalize(normalMatrix*normal);
 float NdotL=max(dot(n,LIGHT_TOP_DIR),0.0);
 intensity.x=INTENSITY_AMBIENT+NdotL*LIGHT_TOP_DIFFUSE;
 vec4 p=modelViewMatrix*vec4(position,1.0);
 intensity.y=LIGHT_TOP_SPECULAR*pow(max(dot(-normalize(p.xyz),reflect(-LIGHT_TOP_DIR,n)),0.0),LIGHT_TOP_SHININESS);
 NdotL=max(dot(n,LIGHT_FRONT_DIR),0.0);
 intensity.x+=NdotL*LIGHT_FRONT_DIFFUSE;
 gl_Position=projectionMatrix*p;
}`;
export const nativeToolMarkerFragmentShader=`varying vec2 intensity;void main(){gl_FragColor=vec4(vec3(intensity.y)+vec3(1.0)*intensity.x,0.5);}`;
export function createPreviewToolMarker(asset){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(asset.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(asset.normals,3));
 const material=new THREE.ShaderMaterial({vertexShader:nativeToolMarkerVertexShader,fragmentShader:nativeToolMarkerFragmentShader,transparent:true,depthWrite:true,toneMapped:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.visible=false;
 const nativeToWorld=new THREE.Matrix4().makeRotationX(-Math.PI/2),rotation=new THREE.Matrix4().makeRotationX(Math.PI),model=new THREE.Matrix4();
 return {mesh,update(position,visible){mesh.visible=Boolean(visible&&position);if(mesh.visible){model.makeTranslation(position[0],position[1],Math.fround(position[2]+.5)+(asset.bounds.max[2]-asset.bounds.min[2]));model.multiply(rotation);mesh.matrix.multiplyMatrices(nativeToWorld,model);mesh.matrixWorldNeedsUpdate=true;}return mesh.visible;},dispose(){geometry.dispose();material.dispose();}};
}
