import {Matrix4,Vector3} from 'three';
import {bedBounds,createMesh,sceneBounds} from './geometry.js';
import {normalizeNativeTextConfiguration,normalizeNativeEmbossShape} from './native-emboss.js';
import {nativeEmbossSource} from './native-emboss-regeneration.js';
import {normalizeNativeMeshSource} from './native-mesh-source.js';

export const NATIVE_TEXT_FACES=Object.freeze({Top:[0,0,1],Bottom:[0,0,-1],Front:[0,-1,0],Back:[0,1,0],Left:[-1,0,0],Right:[1,0,0]});
const finite=(v,name,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${name} must be between ${min} and ${max}`);return v;};
const vector=(v,name)=>{if(!Array.isArray(v)||v.length!==3)throw new Error(`${name} must have three coordinates`);return v.map(n=>finite(n,name,-100000,100000));};
const group=(objects,selected)=>objects.filter(o=>o.plateId===selected.plateId&&(o.native?.groupId||o.id)===(selected.native?.groupId||selected.id));
export function defaultNativeText(){return{version:1,text:'Text',styleName:'',fontDescriptor:'',fontDescriptorType:'undefined',lineHeight:10,perGlyph:false,horizontal:'center',vertical:'middle'};}
/** Emboss.cpp suggest_up/create_transformation_onto_surface, SurfaceDrag.hpp UP_LIMIT=.9.
 * The orthonormal basis is algebraically the native two axis-angle rotations:
 * local Z follows the hit normal and local Y follows native suggested-up. */
export function nativeTextFrame({anchor=[0,0,0],normal=[0,0,1],angle=0}={}){
 const p=vector(anchor,'Native text anchor'),n=new Vector3(...vector(normal,'Native text normal'));
 if(n.length()<1e-8)throw new Error('Native text normal cannot be zero');n.normalize();
 const wanted=Math.abs(n.z)>.9?new Vector3(0,1,0):new Vector3(0,0,1),up=n.clone().cross(wanted).cross(n).normalize(),right=up.clone().cross(n).normalize();
 const matrix=new Matrix4().makeBasis(right,up,n).setPosition(...p);
 return matrix.multiply(new Matrix4().makeRotationZ(finite(angle,'Native text angle',-180,180)*Math.PI/180));
}
/** Explicit face preset placement. Curved Use surface remains the native CGAL engine;
 * these presets choose the initial anchor, not an approximation of the surface. */
export function nativeTextAnchor(objects,selectedId,face='Top'){
 const selected=objects.find(o=>o.id===selectedId);if(!selected)throw new Error('Select an object for native text');
 const normal=NATIVE_TEXT_FACES[face];if(!normal)throw new Error('Choose a native text face');
 const bounds=sceneBounds(group(objects,selected).filter(o=>(o.native?.partType||'normal_part')==='normal_part').map(o=>({...o,visible:true})));
 if(!bounds)throw new Error('Native text needs a normal part in its object group');
 const anchor=[...bounds.center];normal.forEach((v,i)=>{if(v)anchor[i]=v>0?bounds.max[i]:bounds.min[i];});return{anchor,normal:[...normal],angle:0};
}
export function prepareNativeTextCreation({objects=[],selectedId,plateId='plate-1',bed,textConfiguration=defaultNativeText(),depth=1,useSurface=false,mode='standalone',placement}={}){
 if(!['standalone','emboss','engrave','modifier'].includes(mode))throw new Error('Choose standalone, emboss, engrave or modifier text');
 const selected=objects.find(o=>o.id===selectedId),text=normalizeNativeTextConfiguration(textConfiguration);
 if(mode!=='standalone'&&!selected)throw new Error('Select an object before adding native text to it');
 if(mode==='standalone'&&(useSurface||text.perGlyph))throw new Error('Standalone text has no source surface; turn off Use surface and per-glyph');
 const related=mode==='standalone'?[]:group(objects,selected),body=related.find(o=>(o.native?.partType||'normal_part')==='normal_part');
 if(mode!=='standalone'&&!body)throw new Error('Native text needs a normal part in the selected object group');
 const at=placement||(mode==='standalone'?{anchor:bedBounds(bed).center.map((v,i)=>i===2?0:v),normal:[0,0,1],angle:0}:nativeTextAnchor(objects,selectedId));
 if(mode==='standalone'&&vector(at.normal||[0,0,1],'Native text normal').some((v,i)=>v!==[0,0,1][i]))throw new Error('Standalone native text is placed flat on the bed');
 const frame=nativeTextFrame(at),partType=mode==='engrave'?'negative_part':mode==='modifier'?'modifier_part':'normal_part';
 const shape=normalizeNativeEmbossShape({version:1,scale:1,depth,useSurface,isHealed:true,frame:frame.toArray()});
 const request={...Object.fromEntries(['text','lineHeight','charGap','lineGap','boldness','skew','horizontal','vertical','collection','perGlyph'].filter(k=>text[k]!==undefined).map(k=>[k,text[k]])),depth,useSurface,outside:partType==='normal_part'};
 if(useSurface||text.perGlyph){request.transform=frame.toArray();request.sources=related.filter(o=>(o.native?.partType||'normal_part')==='normal_part').map(nativeEmbossSource);}
 return{request,textConfiguration:text,embossShape:shape,mode,placement:structuredClone(at),plateId:body?.plateId||plateId,filamentSlot:body?.filamentSlot||1,groupId:body?.native?.groupId||body?.id,instanceFamily:body?.native?.instanceFamily,objectName:body?.native?.objectName||body?.name,objectSettings:structuredClone(body?.native?.objectSettings||{}),partType,relatedIds:related.map(o=>o.id)};
}
export function applyNativeTextCreation(objects,prepared,result,{fontName,fontDescriptor}={}){
 const frame=new Matrix4().fromArray(prepared.embossShape.frame);
 if(prepared.mode==='standalone'){
  // EmbossJob.cpp CreateObjectJob: translate bed coordinate minus native local
  // bounds center, then apply style angle. Flat native text rests on Z=0.
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of result.vertices)p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
  const center=min.map((v,i)=>(v+max[i])/2),anchor=prepared.placement.anchor;
  frame.copy(new Matrix4().makeTranslation(anchor[0]-center[0],anchor[1]-center[1],prepared.request.depth/2-center[2])).multiply(new Matrix4().makeRotationZ((prepared.placement.angle||0)*Math.PI/180));
 }
 const positions=result.triangles.flatMap(face=>face.flatMap(index=>new Vector3(...result.vertices[index]).applyMatrix4(frame).toArray()));
 const name=prepared.textConfiguration.text.replaceAll('\n',' ').slice(0,100),native={...(prepared.instanceFamily&&{instanceFamily:prepared.instanceFamily}),groupId:prepared.groupId||crypto.randomUUID(),objectName:prepared.objectName||name,partType:prepared.partType,objectSettings:prepared.objectSettings,partSettings:{},textConfiguration:{...prepared.textConfiguration,...(fontName&&{faceName:fontName}),...(fontDescriptor&&{fontDescriptor,fontDescriptorType:'file_name'})},embossShape:{...prepared.embossShape,frame:frame.toArray(),scale:result.scale,isHealed:result.healed},meshSource:{version:1,vertices:result.vertices.flat(),triangles:result.triangles.flat(),build:new Matrix4().toArray(),component:frame.toArray()}};
 const text=createMesh({name,positions,plateId:prepared.plateId,filamentSlot:prepared.filamentSlot,native});normalizeNativeMeshSource(text);
 const related=new Set(prepared.relatedIds);const next=objects.map(o=>{if(!related.has(o.id))return o;const n={...o.native,groupId:prepared.groupId,objectName:prepared.objectName,partType:o.native?.partType||'normal_part',objectSettings:prepared.objectSettings,partSettings:o.native?.partSettings||{}};delete n.groupTransform;return{...o,native:n};});
 return{objects:[...next,text],selectedId:text.id,text};
}
