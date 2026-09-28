import * as THREE from 'three';
// TriangleMesh.cpp::its_make_cube, matching the native preview's orientation.
const faces=[0,1,2,0,2,3,4,5,6,4,6,7,0,4,7,0,7,1,1,7,6,1,6,2,2,6,5,2,5,3,4,0,3,4,3,5];
export function primeTowerBands(result){
 if(!result?.visible)return[];
 const [x,depth,z]=result.size,count=result.extruders.length;
 if(!count)throw new Error('A visible prime tower needs filament colors');
 return result.extruders.map((extruder,index)=>{
  // Native dimensions and the band's translation are float operations.
  const y=Math.fround(depth/count),offset=Math.fround(Math.fround(depth*index)/count);
  const vertices=[[x,y,0],[x,0,0],[0,0,0],[0,y,0],[x,y,z],[0,y,z],[0,0,z],[x,0,z]].map(p=>[p[0],Math.fround(p[1]+offset),p[2]]);
  return{extruder,positions:faces.flatMap(i=>vertices[i])};
 });
}
export function createPrimeTowerGeometry(result,colors){
 const group=new THREE.Group();group.name='Prime tower preview';
 if(!result?.visible)return group;
 for(const band of primeTowerBands(result)){
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(band.positions,3));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:colors[band.extruder-1]||colors[0]||'#cccccc',transparent:true,opacity:result.alpha,roughness:.6,metalness:.08,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.extruder=band.extruder;group.add(mesh);
 }
 group.position.set(...result.position,0);group.rotation.z=result.rotation;return group;
}
export function disposePrimeTower(group){group?.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});group?.removeFromParent();}

/** Bounds come from the committed preview, independent of effect/render timing.
 * Include both the native picking shell and Float32 rendered band vertices. */
export function primeTowerBounds(result){
 if(!result?.visible)return null;
 const cos=Math.cos(result.rotation),sin=Math.sin(result.rotation),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 const point=([x,y,z])=>{const world=[x*cos-y*sin+result.position[0],x*sin+y*cos+result.position[1],z];world.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});};
 for(const x of [0,result.size[0]])for(const y of [0,result.size[1]])for(const z of [0,result.size[2]])point([x,y,z]);
 for(const band of primeTowerBands(result))for(let i=0;i<band.positions.length;i+=3)point(band.positions.slice(i,i+3).map(Math.fround));
 return{min,max};
}
