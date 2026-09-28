import {Matrix4,Vector3} from 'three';
import {meshPointMatrix} from './brim-ears.js';
const matrix=value=>{
 if(!Array.isArray(value)||value.length!==16||!value.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9)||[3,7,11].some(i=>value[i]!==0)||value[15]!==1)throw new Error('Invalid retained native mesh transform');
 const result=new Matrix4().fromArray(value);if(Math.abs(result.determinant())<1e-18)throw new Error('Singular retained native mesh transform');return result;
};
/** Retained indexed geometry is a precision carrier, never a second editable
 * model. Verify every triangle against the authoritative browser source mesh. */
export function normalizeNativeMeshSource(object){
 const source=object.native?.meshSource;if(source==null)return null;
 const n=object.positions.length;if(source.version!==1||!Array.isArray(source.vertices)||!Array.isArray(source.triangles)||source.vertices.length%3||source.vertices.length>n||source.triangles.length!==n/3||!source.vertices.length)throw new Error('Invalid retained native mesh dimensions');
 if(!source.vertices.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7)||!source.triangles.every(i=>Number.isInteger(i)&&i>=0&&i<source.vertices.length/3))throw new Error('Invalid retained native mesh coordinates or indices');
 if(new Set(source.triangles).size!==source.vertices.length/3)throw new Error('Retained native mesh must not contain unreferenced vertices');
 const build=matrix(source.build),component=matrix(source.component),combined=build.clone().multiply(component),reversed=combined.determinant()<0;
 for(let face=0;face<source.triangles.length;face+=3)for(let v=0;v<3;v++){
  const index=source.triangles[face+(reversed?[0,2,1][v]:v)]*3,point=new Vector3(...source.vertices.slice(index,index+3)).applyMatrix4(combined);
  for(let axis=0;axis<3;axis++){const actual=object.positions[face*3+v*3+axis],expected=point.getComponent(axis),tolerance=2e-5+Math.max(Math.abs(actual),Math.abs(expected))*2**-22;if(!Number.isFinite(actual)||Math.abs(actual-expected)>tolerance)throw new Error('Retained native mesh no longer matches edited geometry; regenerate or remove stale source metadata');}
 }
 return {version:1,vertices:[...source.vertices],triangles:[...source.triangles],build:build.toArray(),component:component.toArray()};
}
export function captureNativeMeshSource(object,{vertices,faces,build,component,plateOrigin}){
 const original=faces.flatMap(face=>['v1','v2','v3'].map(key=>Number(face[`@_${key}`]))),used=[...new Set(original)].sort((a,b)=>a-b),indices=new Map(used.map((value,index)=>[value,index]));
 const source={version:1,vertices:used.flatMap(index=>vertices[index]),triangles:original.map(index=>indices.get(index)),build:new Matrix4().makeTranslation(...plateOrigin.map(v=>-v)).multiply(build).toArray(),component:component.toArray()};
 return normalizeNativeMeshSource({...object,native:{...object.native,meshSource:source}});
}
export function bakeNativeMeshSource(object,{worldMatrix}={}){
 const source=normalizeNativeMeshSource(object);if(!source)return{};
 const build=meshPointMatrix(object).multiply(matrix(source.build));if(worldMatrix)build.premultiply(worldMatrix instanceof Matrix4?worldMatrix:new Matrix4().fromArray(worldMatrix));
 return{meshSource:{...source,build:build.toArray()}};
}
export function nativeMeshSourceGroup(parts,origin,{hasBrim=false}={}){
 const sources=parts.map(normalizeNativeMeshSource);if(hasBrim||sources.some(source=>!source))return null;
 const builds=sources.map((source,index)=>new Matrix4().makeTranslation(...origin).multiply(meshPointMatrix(parts[index])).multiply(matrix(source.build))),first=builds[0];
 if(builds.some(build=>build.elements.some((value,index)=>Math.abs(value-first.elements[index])>1e-9)))return null;
 return{build:first,sources};
}
export const nativeMatrix12=value=>[0,1,2,4,5,6,8,9,10,12,13,14].map(index=>value.elements[index]).join(' ');
