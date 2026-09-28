import {Matrix4,Vector3} from 'three';
import {bedBounds,createMesh} from './geometry.js';
import {meshPointMatrix} from './brim-ears.js';
import {nativeEmbossSource,applyNativeEmbossResult} from './native-emboss-regeneration.js';
import {normalizeNativeSvgSource,normalizeNativeEmbossShape} from './native-emboss.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';
import {nativeTextFrame,nativeTextAnchor} from './native-text-creation.js';
const group=(objects,selected)=>objects.filter(o=>o.plateId===selected.plateId&&(o.native?.groupId||o.id)===(selected.native?.groupId||selected.id));
// GLGizmoSVG calculate_scale stores float axes and resets near-unit squared norms (native EPSILON=1e-4).
const scaleForTolerance=frame=>Math.max(...[0,1].map(i=>{const squared=new Vector3().setFromMatrixColumn(frame,i).lengthSq();return Math.abs(squared-1)<1e-4?1:Math.fround(Math.sqrt(squared));}));
function requestFor(shape,frame,outside,related){
 const request={svg:shape.svg.source,depth:shape.depth,shapeScale:shape.scale,toleranceScale:scaleForTolerance(frame),useSurface:shape.useSurface,outside};
 if(shape.useSurface){request.transform=frame.toArray();request.sources=related.filter(o=>(o.native?.partType||'normal_part')==='normal_part').map(nativeEmbossSource);if(!request.sources.length)throw new Error('Native surface SVG requires another normal part in its object group');}
 return request;
}
export function nativeSvgRequest(objects,selectedId,{svg,depth,useSurface}={}){
 const selected=objects.find(o=>o.id===selectedId);if(!selected?.native?.embossShape?.svg||selected.native.textConfiguration)throw new Error('Choose an embedded native SVG shape');
 const original=selected.native.embossShape,shape=normalizeNativeEmbossShape({...original,...(svg&&{svg}),...(depth!==undefined&&{depth}),...(useSurface!==undefined&&{useSurface})});
 const frame=meshPointMatrix(selected).multiply(new Matrix4().fromArray(shape.frame)),related=group(objects,selected).filter(o=>o.id!==selectedId);
 return{embossShape:shape,request:requestFor(shape,frame,(selected.native.partType||'normal_part')==='normal_part',related)};
}
export function nativeSvgSettingsUnchanged(selected,{svg,depth,useSurface}={}){
 const shape=selected?.native?.embossShape;if(!shape?.svg||selected.native.textConfiguration)return false;
 return shape.svg.name===svg?.name&&shape.svg.source===svg?.source&&shape.depth===depth&&shape.useSurface===useSurface;
}
export function applyNativeSvgResult(objects,selectedId,prepared,result,options){return{...applyNativeEmbossResult(objects,selectedId,prepared,result,options),warnings:result.warnings||[]};}
export function prepareNativeSvgCreation({objects=[],selectedId,plateId='plate-1',bed,svg,depth=10,useSurface=false,mode='standalone',placement}={}){
 if(!['standalone','emboss','engrave','modifier'].includes(mode))throw new Error('Choose standalone, emboss, engrave or modifier SVG');
 svg=normalizeNativeSvgSource(svg);const selected=objects.find(o=>o.id===selectedId);
 if(mode!=='standalone'&&!selected)throw new Error('Select an object before adding a native SVG to it');
 if(mode==='standalone'&&useSurface)throw new Error('Standalone SVG has no source surface');
 const related=mode==='standalone'?[]:group(objects,selected),body=related.find(o=>(o.native?.partType||'normal_part')==='normal_part');if(mode!=='standalone'&&!body)throw new Error('Native SVG requires a normal part in the selected group');
 const at=placement||(mode==='standalone'?{anchor:bedBounds(bed).center.map((v,i)=>i===2?0:v),normal:[0,0,1],angle:0}:nativeTextAnchor(objects,selectedId));
 if(mode==='standalone'&&(at.normal||[0,0,1]).some((v,i)=>v!==[0,0,1][i]))throw new Error('Standalone SVG is placed flat on the bed');
 const frame=nativeTextFrame(at),partType=mode==='engrave'?'negative_part':mode==='modifier'?'modifier_part':'normal_part',shape=normalizeNativeEmbossShape({version:1,scale:1e-6,depth,useSurface,isHealed:true,frame:frame.toArray(),svg});
 return{request:requestFor(shape,frame,partType==='normal_part',related),embossShape:shape,mode,placement:structuredClone(at),partType,plateId:body?.plateId||plateId,filamentSlot:body?.filamentSlot||1,groupId:body?.native?.groupId||body?.id,instanceFamily:body?.native?.instanceFamily,objectName:body?.native?.objectName||body?.name,objectSettings:structuredClone(body?.native?.objectSettings||{}),relatedIds:related.map(o=>o.id)};
}
export function applyNativeSvgCreation(objects,prepared,result){
 const frame=new Matrix4().fromArray(prepared.embossShape.frame);
 if(prepared.mode==='standalone'){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of result.vertices)p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});const center=min.map((v,i)=>(v+max[i])/2),anchor=prepared.placement.anchor;
  frame.copy(new Matrix4().makeTranslation(anchor[0]-center[0],anchor[1]-center[1],prepared.request.depth/2-center[2])).multiply(new Matrix4().makeRotationZ((prepared.placement.angle||0)*Math.PI/180));
 }
 const name=prepared.embossShape.svg.name,positions=result.triangles.flatMap(face=>face.flatMap(index=>new Vector3(...result.vertices[index]).applyMatrix4(frame).toArray()));
 const native={...(prepared.instanceFamily&&{instanceFamily:prepared.instanceFamily}),groupId:prepared.groupId||crypto.randomUUID(),objectName:prepared.objectName||name,partType:prepared.partType,objectSettings:prepared.objectSettings,partSettings:{},embossShape:{...prepared.embossShape,frame:frame.toArray(),scale:result.scale,isHealed:result.healed},meshSource:{version:1,vertices:result.vertices.flat(),triangles:result.triangles.flat(),build:new Matrix4().toArray(),component:frame.toArray()}};
 const shape=createMesh({name,positions,plateId:prepared.plateId,filamentSlot:prepared.filamentSlot,native});normalizeNativeMeshSource(shape);
 const ids=new Set(prepared.relatedIds),next=objects.map(o=>{if(!ids.has(o.id))return o;const n={...o.native,groupId:prepared.groupId,objectName:prepared.objectName,partType:o.native?.partType||'normal_part',objectSettings:prepared.objectSettings,partSettings:o.native?.partSettings||{}};delete n.groupTransform;return{...o,native:n};});
 return{objects:[...next,shape],selectedId:shape.id,text:shape,warnings:result.warnings||[]};
}
