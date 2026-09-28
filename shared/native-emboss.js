import {bakeNativeMeshSource} from './native-mesh-source.js';
import {Matrix4,Vector3} from 'three';
import {meshPointMatrix} from './brim-ears.js';

// OrcaSlicer 2.4.2 / 8500fcd: bbs_3mf.cpp 9171–9455, Model.cpp 2600,
// EmbossJob.cpp update_volume. This retains regeneration data; it does not
// substitute another font triangulator or approximate native cut_surface.
export const NATIVE_EMBOSS_SURFACE_OVERLAP=.015;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const number=(value,name,min,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid native emboss ${name}`);return value;};
const string=(value,name,max=4096)=>{if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new Error(`Invalid native emboss ${name}`);return value;};
const choice=(value,allowed,name)=>{if(!allowed.includes(value))throw new Error(`Invalid native emboss ${name}`);return value;};
const bool=(value,name)=>{if(typeof value!=='boolean')throw new Error(`Invalid native emboss ${name}`);return value;};
const integer=(value,name,min,max)=>{number(value,name,min,max);if(!Number.isInteger(value))throw new Error(`Invalid native emboss ${name}`);return value;};
const identity=()=>new Matrix4();
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('\n','&#10;').replaceAll('\r','&#13;').replaceAll('\t','&#9;');
const attrs=values=>Object.entries(values).filter(([,value])=>value!==undefined).map(([key,value])=>` ${key}="${xml(value)}"`).join('');
export function normalizeEmbossFrame(value){
  if(!Array.isArray(value)||value.length!==16||!value.every(item=>typeof item==='number'&&Number.isFinite(item)&&Math.abs(item)<=1e9)||[3,7,11].some(index=>value[index]!==0)||value[15]!==1||Math.abs(new Matrix4().fromArray(value).determinant())<1e-18)throw new Error('Invalid native emboss regeneration frame');
  return [...value];
}
export function normalizeNativeTextConfiguration(value){
  if(!plain(value)||value.version!==1)throw new Error('Unsupported native text configuration');
  const result={version:1,text:string(value.text,'text',100000),styleName:string(value.styleName??'','style name'),fontDescriptor:string(value.fontDescriptor??'','font descriptor',16384),fontDescriptorType:choice(value.fontDescriptorType,['file_name','wxFontDescriptor_Windows','wxFontDescriptor_Linux','wxFontDescriptor_MacOsX','undefined'],'font descriptor type'),lineHeight:number(value.lineHeight,'line height',.000001,10000),perGlyph:bool(value.perGlyph??false,'per glyph'),horizontal:choice(value.horizontal??'center',['left','center','right'],'horizontal alignment'),vertical:choice(value.vertical??'middle',['top','middle','bottom'],'vertical alignment')};
  for(const key of ['charGap','lineGap'])if(value[key]!==undefined)result[key]=integer(value[key],key,-2147483648,2147483647);
  for(const [key,limit]of [['boldness',500000],['skew',100]])if(value[key]!==undefined)result[key]=number(value[key],key,-limit,limit);
  if(value.collection!==undefined)result.collection=integer(value.collection,'font collection',0,65535);
  for(const key of ['family','faceName','style','weight'])if(value[key]!==undefined)result[key]=string(value[key],key);
  return result;
}
export function normalizeNativeSvgSource(value){
  if(!plain(value))throw new Error('Invalid native emboss SVG source');
  const name=string(value.name??'shape.svg','SVG name',256).split(/[\\/]/).pop();
  const source=string(value.source,'SVG source',2*1024*1024);if(new TextEncoder().encode(source).length>2*1024*1024)throw new Error('Native emboss SVG source exceeds 2 MiB');
  if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(source)||/<!DOCTYPE|<!ENTITY|<script(?:\s|>)|\bon\w+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:[a-z]+:|\/\/)/i.test(source))throw new Error('Native emboss SVG must be self-contained and contain no active content');
  return{name:name||'shape.svg',source};
}
export function normalizeNativeEmbossShape(value){
  if(!plain(value)||value.version!==1)throw new Error('Unsupported native emboss shape');
  return{version:1,scale:number(value.scale,'shape scale',1e-15,1000),depth:number(value.depth,'depth',1e-8,10000),useSurface:bool(value.useSurface??false,'use surface'),isHealed:bool(value.isHealed??true,'healed flag'),frame:normalizeEmbossFrame(value.frame),...(value.svg&&{svg:normalizeNativeSvgSource(value.svg)})};
}
export function normalizeNativeEmbossMetadata(native={}){
  const result={};
  if(native.textConfiguration)result.textConfiguration=normalizeNativeTextConfiguration(native.textConfiguration);
  if(native.embossShape)result.embossShape=normalizeNativeEmbossShape(native.embossShape);
  if(result.textConfiguration&&!result.embossShape)throw new Error('Native text is missing its regeneration frame');
  return result;
}
function affine12(value){
  if(value===undefined||value==='')return identity();
  if(typeof value!=='string')throw new Error('Invalid native emboss transform');
  const a=value.trim().split(/\s+/).map(Number);if(a.length!==12||!a.every(Number.isFinite))throw new Error('Invalid native emboss transform');
  const m=new Matrix4().set(a[0],a[3],a[6],a[9],a[1],a[4],a[7],a[10],a[2],a[5],a[8],a[11],0,0,0,1);normalizeEmbossFrame(m.toArray());return m;
}
const matrix12=matrix=>{const a=matrix.elements;return[0,1,2,4,5,6,8,9,10,12,13,14].map(index=>a[index]).join(' ');};
function one(value,label){if(Array.isArray(value)||value!==undefined&&!plain(value))throw new Error(`Invalid native ${label} element`);return value;}
/** Read per-part XML before mesh placement. External filenames are descriptive
 * data only. SVG content is read exclusively from already bounded archive data. */
export function readNativeEmbossPart(part,readAsset){
  const t=one(part['slic3rpe:text'],'text'),s=one(part['slic3rpe:shape'],'shape');if(!t&&!s)return null;
  let textConfiguration;
  if(t){const a=key=>t[`@_${key}`],align=(value,labels,fallback)=>value===undefined?fallback:/^[012]$/.test(value)?labels[Number(value)]:value;
    textConfiguration=normalizeNativeTextConfiguration({version:1,text:a('text')??'',styleName:a('style_name')??'',fontDescriptor:a('font_descriptor')??'',fontDescriptorType:a('font_descriptor_type')||'undefined',lineHeight:Number(a('line_height')),perGlyph:a('per_glyph')==='1',horizontal:align(a('horizontal'),['left','center','right'],'center'),vertical:align(a('vertical'),['top','middle','bottom'],'middle'),...Object.fromEntries([['char_gap','charGap'],['line_gap','lineGap'],['boldness','boldness'],['skew','skew'],['collection','collection']].filter(([key])=>a(key)!==undefined).map(([key,target])=>[target,Number(a(key))])),...Object.fromEntries([['family','family'],['face_name','faceName'],['style','style'],['weight','weight']].filter(([key])=>a(key)!==undefined).map(([key,target])=>[target,a(key)]))});
  }
  const source=s||t, a=key=>source[`@_${key}`],rawDepth=Number(a('depth')??10),asset=a('filepath3mf');
  const svg=asset?{name:(a('filepath')||asset).split(/[\\/]/).pop(),source:readAsset(asset)}:undefined;
  if(!t&&!svg)throw new Error('Native embossed shape is missing its embedded SVG source');
  return{textConfiguration,shape:normalizeNativeEmbossShape({version:1,scale:Number(a('scale')??.001),depth:Math.abs(rawDepth)<1e-8?10:rawDepth,useSurface:a('use_surface')==='1',isHealed:a('unhealed')!=='1',frame:identity().toArray(),...(svg&&{svg})}),fix:affine12(a('transform')).toArray()};
}
function centerOfPoints(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const point of points)for(let axis=0;axis<3;axis++){const value=Math.fround(point[axis]);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}if(!min.every(Number.isFinite))throw new Error('Native emboss mesh is empty');return min.map((value,axis)=>(value+max[axis])/2);}
/** Native load centers raw geometry, then regeneration removes fix_3mf_tr.
 * Store the equivalent canonical glyph -> browser source-vertex coordinates. */
export function importNativeEmbossMetadata(data,vertices,matrix,{unit=1,plateOrigin=[0,0,0]}={}){
  if(!data)return{};
  if(unit!==1)throw new Error('Native emboss metadata currently requires millimeter 3MF geometry');
  const center=centerOfPoints(vertices),frame=new Matrix4().makeTranslation(...plateOrigin.map(value=>-value)).multiply(matrix).multiply(new Matrix4().makeTranslation(...center)).multiply(new Matrix4().fromArray(data.fix).invert());
  return{...(data.textConfiguration&&{textConfiguration:data.textConfiguration}),embossShape:normalizeNativeEmbossShape({...data.shape,frame:frame.toArray()})};
}
export function bakeNativeEmbossMetadata(mesh,{worldMatrix}={}){
  const result={...normalizeNativeEmbossMetadata(mesh.native),...bakeNativeMeshSource(mesh,{worldMatrix})};if(!result.embossShape)return result;
  const frame=meshPointMatrix(mesh).multiply(new Matrix4().fromArray(result.embossShape.frame));if(worldMatrix)frame.premultiply(worldMatrix instanceof Matrix4?worldMatrix:new Matrix4().fromArray(worldMatrix));
  result.embossShape=normalizeNativeEmbossShape({...result.embossShape,frame:frame.toArray()});return result;
}
/** Export vertices are already transformed (and optionally reflected to retain
 * native paint winding). Native import will center those vertices again. Thus
 * fix = desiredGlyphFrame^-1 * Translation(exportedMeshCenter). */
export function nativeEmbossXML(mesh,{origin=[0,0,0],reversed=false,assetName='Metadata/emboss-shape.svg',writeAsset,sourceMesh}={}){
  const data=normalizeNativeEmbossMetadata(mesh.native);if(!data.embossShape)return'';
  const shape=data.embossShape,vertexMatrix=new Matrix4().makeScale(reversed?-1:1,1,1).multiply(new Matrix4().makeTranslation(...origin)).multiply(meshPointMatrix(mesh));
  if(sourceMesh)vertexMatrix.copy(new Matrix4().fromArray(sourceMesh.build).multiply(new Matrix4().fromArray(sourceMesh.component)).invert());
  const points=[];if(sourceMesh){for(let offset=0;offset<sourceMesh.vertices.length;offset+=3)points.push(sourceMesh.vertices.slice(offset,offset+3));}else for(let offset=0;offset<mesh.positions.length;offset+=3)points.push(new Vector3(...mesh.positions.slice(offset,offset+3)).applyMatrix4(vertexMatrix).toArray());
  const center=centerOfPoints(points),frame=vertexMatrix.clone().multiply(new Matrix4().fromArray(shape.frame)),fix=frame.invert().multiply(new Matrix4().makeTranslation(...center));normalizeEmbossFrame(fix.toArray());
  const shapeAttrs={scale:shape.scale,depth:shape.depth,unhealed:shape.isHealed?undefined:1,use_surface:shape.useSurface?1:undefined,transform:matrix12(fix)};
  if(shape.svg){if(!writeAsset)throw new Error('Native emboss SVG exporter is unavailable');writeAsset(assetName,shape.svg.source);shapeAttrs.filepath=shape.svg.name;shapeAttrs.filepath3mf=assetName;}
  let result=`<slic3rpe:shape${attrs(shapeAttrs)}/>`;
  if(data.textConfiguration){const t=data.textConfiguration;result+=`<slic3rpe:text${attrs({text:t.text,style_name:t.styleName,font_descriptor:t.fontDescriptor,font_descriptor_type:t.fontDescriptorType,line_height:t.lineHeight,char_gap:t.charGap,line_gap:t.lineGap,boldness:t.boldness,skew:t.skew,per_glyph:t.perGlyph?1:undefined,horizontal:t.horizontal,vertical:t.vertical,collection:t.collection,family:t.family,face_name:t.faceName,style:t.style,weight:t.weight})}/>`;}
  return result;
}
export const hasNativeEmboss=mesh=>Boolean(mesh?.native?.textConfiguration||mesh?.native?.embossShape);
export function invalidateNativeEmboss(native){const result={...native};delete result.textConfiguration;delete result.embossShape;delete result.meshSource;return result;}
export function nativeEmbossLossMessage(objects){return objects.some(hasNativeEmboss)?'This operation replaces native text or embossed-shape geometry. Native text and shape editing metadata will be removed; the resulting mesh stays printable.':null;}
