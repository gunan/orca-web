import {Matrix4,Vector3} from 'three';
import {createMesh,sourceBounds} from './geometry.js';
import {meshPointMatrix} from './brim-ears.js';
import {normalizeNativeEmbossMetadata,normalizeNativeTextConfiguration} from './native-emboss.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {hasFacetPainting} from './facet-correspondence.js';
const chunks=(array,n)=>Array.from({length:array.length/n},(_,i)=>array.slice(i*n,i*n+n));
const sameGroup=(a,b)=>a.plateId===b.plateId&&(a.native?.groupId||a.id)===(b.native?.groupId||b.id);
export function nativeEmbossSource(object){const source=normalizeNativeMeshSource(object);if(source)return{vertices:chunks(source.vertices,3),triangles:chunks(source.triangles,3),transform:meshPointMatrix(object).multiply(new Matrix4().fromArray(source.build)).multiply(new Matrix4().fromArray(source.component)).toArray()};const vertices=[],triangles=[],lookup=new Map();for(let offset=0;offset<object.positions.length;offset+=9){const face=[];for(let corner=0;corner<3;corner++){const point=object.positions.slice(offset+corner*3,offset+corner*3+3),key=point.join(',');let index=lookup.get(key);if(index===undefined){index=vertices.length;vertices.push(point);lookup.set(key,index);}face.push(index);}triangles.push(face);}return{vertices,triangles,transform:meshPointMatrix(object).toArray()};}
export function nativeEmbossRequest(objects,selectedId,{textConfiguration,depth,useSurface}={}){
 const selected=objects.find(object=>object.id===selectedId);if(!selected?.native?.textConfiguration||!selected.native.embossShape)throw new Error('Choose a native text part with preserved editing metadata');const metadata=normalizeNativeEmbossMetadata(selected.native),text=normalizeNativeTextConfiguration(textConfiguration||metadata.textConfiguration),shape={...metadata.embossShape,...(depth!==undefined&&{depth}),...(useSurface!==undefined&&{useSurface})};
 const request={...Object.fromEntries(['text','lineHeight','charGap','lineGap','boldness','skew','horizontal','vertical','collection','perGlyph'].filter(key=>text[key]!==undefined).map(key=>[key,text[key]])),depth:shape.depth,useSurface:shape.useSurface,outside:(selected.native.partType||'normal_part')==='normal_part'};
 if(request.useSurface||request.perGlyph){request.transform=meshPointMatrix(selected).multiply(new Matrix4().fromArray(shape.frame)).toArray();request.sources=objects.filter(object=>object.id!==selectedId&&sameGroup(object,selected)&&(object.native?.partType||'normal_part')==='normal_part').map(nativeEmbossSource);if(!request.sources.length)throw new Error('Native surface/per-glyph text requires another normal part in its object group');}
 return{request,textConfiguration:text,embossShape:shape};
}
/** Regeneration rebases only the changed part into its existing source frame.
 * The old full world transform is retained despite a changed glyph bounding box. */
export function applyNativeEmbossResult(objects,selectedId,prepared,result,{clearPainting=false,fontName,fontDescriptor}={}){
 const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Native text part was removed');if(hasFacetPainting(selected)&&!clearPainting)throw new Error('Regenerating native text or SVG replaces its triangles; confirm clearing its facet painting');
 const oldPointMatrix=meshPointMatrix(selected),frame=new Matrix4().fromArray(prepared.embossShape.frame),worldFrame=oldPointMatrix.clone().multiply(frame),source=normalizeNativeMeshSource(selected),build=source?new Matrix4().fromArray(source.build):new Matrix4(),component=build.clone().invert().multiply(frame),reversed=frame.determinant()<0;
 const positions=result.triangles.flatMap(triangle=>(reversed?[triangle[0],triangle[2],triangle[1]]:triangle).flatMap(index=>new Vector3(...result.vertices[index]).applyMatrix4(frame).toArray()));
 const metadata={...selected.native,...(prepared.textConfiguration&&{textConfiguration:{...prepared.textConfiguration,...(fontName&&{faceName:fontName}),...(fontDescriptor&&{fontDescriptor,fontDescriptorType:'file_name'})}}),embossShape:{...prepared.embossShape,scale:result.scale,isHealed:result.healed},meshSource:{version:1,vertices:result.vertices.flat(),triangles:result.triangles.flat(),build:build.toArray(),component:component.toArray()}};delete metadata.groupTransform;
 let changed=createMesh({...selected,name:prepared.textConfiguration?prepared.textConfiguration.text.replaceAll('\n',' ').slice(0,100):prepared.embossShape.svg.name,positions,native:metadata});delete changed.painting;delete changed.text;
 const center=sourceBounds(changed).center,worldCenter=new Vector3(...center).applyMatrix4(oldPointMatrix);changed.position=worldCenter.toArray().map((value,index)=>value-center[index]);
 // A changed part invalidates the shared numeric group frame; other members retain their geometry.
 const next=objects.map(object=>{if(object.id===selectedId)return changed;if(!sameGroup(object,selected)||!object.native?.groupTransform)return object;const native={...object.native};delete native.groupTransform;return{...object,native};});
 // Rebinding uses the new center-preserving transform and must retain the native glyph plane.
 const resultingFrame=meshPointMatrix(changed).multiply(new Matrix4().fromArray(changed.native.embossShape.frame));if(resultingFrame.elements.some((value,index)=>Math.abs(value-worldFrame.elements[index])>1e-6))throw new Error('Native text regeneration could not preserve its original transform');normalizeNativeMeshSource(changed);
 return{objects:next,selectedId, text:changed};
}
/** Opening/closing the native gizmo does not call its process() job. Treat the
 * same effective editable parameters as a no-op, preserving the original mesh,
 * metadata and paint. Explicit regeneration is a separate caller decision. */
export function nativeTextSettingsUnchanged(selected,{textConfiguration,depth,useSurface,fontId='',initialFontId=''}={}){
 if(!selected?.native?.textConfiguration||fontId!==initialFontId)return false;
 const signature=text=>JSON.stringify([text.text,text.lineHeight,text.charGap??0,text.lineGap??0,text.boldness??0,text.skew??0,text.horizontal??'center',text.vertical??'middle',text.collection??0,Boolean(text.perGlyph)]);
 return signature(textConfiguration)===signature(selected.native.textConfiguration)&&depth===selected.native.embossShape.depth&&useSurface===selected.native.embossShape.useSurface;
}
