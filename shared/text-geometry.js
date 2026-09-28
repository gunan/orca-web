import { parse } from 'opentype.js/dist/opentype.mjs';
import { Euler, ExtrudeGeometry, Matrix4, Quaternion, ShapePath, Vector3 } from 'three';
import { analyzeMesh,bedBounds,createMesh,meshBounds,sceneBounds,sourceBounds } from './geometry.js';

export const TEXT_LIMITS=Object.freeze({characters:256,lines:16,fontBytes:32*1024*1024,triangles:200000,pathCommands:200000});
const finite=(value,name,min,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}`);return value;};
const vector=(value,name)=>{if(!Array.isArray(value)||value.length!==3)throw new Error(`${name} must contain three numbers`);return value.map(number=>finite(number,name,-1e7,1e7));};
export function normalizeTextConfiguration(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||(value.version!==undefined&&value.version!==1))throw new Error('Invalid text configuration');
  const text=value.text??'Text';if(typeof text!=='string'||!text.trim()||[...text].length>TEXT_LIMITS.characters||text.split('\n').length>TEXT_LIMITS.lines||/[\x00-\x08\x0b-\x1f\x7f]/.test(text))throw new Error('Text needs 1–256 printable characters and at most 16 lines');
  const mode=value.mode??'standalone';if(!['standalone','emboss','engrave'].includes(mode))throw new Error('Choose standalone text, emboss or engrave');
  const align=value.align??'center';if(!['left','center','right'].includes(align))throw new Error('Invalid text alignment');
  const normal=vector(value.normal??[0,0,1],'Text normal'),length=Math.hypot(...normal);if(length<1e-8)throw new Error('Text normal cannot be zero');
  const fontId=value.fontId??'';if(typeof fontId!=='string'||fontId.length>128||!/^[a-zA-Z0-9_-]*$/.test(fontId))throw new Error('Invalid bundled font ID');
  const sourceMatrix=value.sourceMatrix??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];if(!Array.isArray(sourceMatrix)||sourceMatrix.length!==16||!sourceMatrix.every(number=>typeof number==='number'&&Number.isFinite(number)&&Math.abs(number)<=1e7)||[3,7,11].some(index=>sourceMatrix[index]!==0)||sourceMatrix[15]!==1||new Matrix4().fromArray(sourceMatrix).determinant()<1e-12)throw new Error('Invalid text source transform');
  const fontName=value.fontName??'';if(typeof fontName!=='string'||fontName.length>256)throw new Error('Invalid font name');
  return{version:1,text,fontId,fontName,mode,align,sourceMatrix:[...sourceMatrix],size:finite(value.size??10,'Font size',.5,200),depth:finite(value.depth??1,'Text depth',.05,100),embed:finite(value.embed??.2,'Text overlap',0,20),charSpacing:finite(value.charSpacing??0,'Character spacing',0,20),lineSpacing:finite(value.lineSpacing??1.2,'Line spacing',.5,5),angle:finite(value.angle??0,'Text angle',-36000,36000),anchor:vector(value.anchor??[0,0,0],'Text anchor'),normal:normal.map(number=>number/length),curveSegments:finite(value.curveSegments??8,'Curve resolution',2,24)};
}
export function parseTextFont(bytes){
  const buffer=bytes instanceof ArrayBuffer?bytes:bytes?.buffer?.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  if(!buffer||buffer.byteLength<12||buffer.byteLength>TEXT_LIMITS.fontBytes)throw new Error('Font must be a valid bundled font of at most 32 MB');
  const font=parse(buffer);if(!font.unitsPerEm||typeof font.getPath!=='function')throw new Error('Font has no supported outlines');return font;
}
export function fontAttribution(font){
  const read=key=>{for(const table of [font.names?.windows,font.names?.macintosh,font.names]){const names=table?.[key];if(names)return names.en||Object.values(names)[0]||'';}return'';};
  return{family:read('preferredFamily')||read('fontFamily'),style:read('preferredSubfamily')||read('fontSubfamily'),name:read('fullName'),copyright:read('copyright'),license:read('license'),licenseURL:read('licenseURL'),designer:read('designer')};
}
function shapesFromCommands(commands){
  const path=new ShapePath();
  for(const command of commands){const {x,y,x1,y1,x2,y2}=command;
    if(command.type==='M')path.moveTo(x,-y);else if(command.type==='L')path.lineTo(x,-y);else if(command.type==='Q')path.quadraticCurveTo(x1,-y1,x,-y);else if(command.type==='C')path.bezierCurveTo(x1,-y1,x2,-y2,x,-y);else if(command.type==='Z')path.currentPath.closePath();else throw new Error(`Unsupported font outline command: ${command.type}`);
  }
  return path.toShapes();
}
/** Font size is an em in millimetres. Planar outlines are centered vertically,
 * aligned horizontally around the anchor, then extruded along the world normal.
 * There is no curved-surface projection or synthetic font style substitution. */
export function createTextMesh(font,options={},metadata={}){
  const config=normalizeTextConfiguration(options),missing=[...new Set([...config.text].filter(character=>!/[\s\u200c\u200d]/u.test(character)&&font.charToGlyphIndex(character)===0))];
  if(missing.length)throw new Error(`The selected font has no glyph for: ${missing.join(' ')}`);
  const shapes=[],lines=config.text.split('\n'),render={kerning:true,letterSpacing:config.charSpacing/config.size};let commands=0;
  for(let index=0;index<lines.length;index++){
    const width=font.getAdvanceWidth(lines[index],config.size,render),x=config.align==='center'?-width/2:config.align==='right'?-width:0;
    const path=font.getPath(lines[index],x,index*config.size*config.lineSpacing,config.size,render);commands+=path.commands.length;if(commands>TEXT_LIMITS.pathCommands)throw new Error('Text font outlines exceed the command limit');shapes.push(...shapesFromCommands(path.commands));
  }
  if(!shapes.length)throw new Error('Text has no printable outline');
  const height=config.depth+(config.mode==='standalone'?0:config.embed),geometry=new ExtrudeGeometry(shapes,{depth:height,bevelEnabled:false,steps:1,curveSegments:Math.round(config.curveSegments)});
  try{
    if(geometry.attributes.position.count/3>TEXT_LIMITS.triangles)throw new Error('Text exceeds the 200,000 triangle limit');
    geometry.computeBoundingBox();const box=geometry.boundingBox,centerY=(box.min.y+box.max.y)/2;
    const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),new Vector3(...config.normal));
    const angle=config.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),bottom=config.mode==='engrave'?-config.depth:config.mode==='emboss'?-config.embed:0;
    const values=geometry.attributes.position.array,positions=new Array(values.length),point=new Vector3(),sourceMatrix=new Matrix4().fromArray(config.sourceMatrix);
    for(let index=0;index<values.length;index+=3){const x=values[index],y=values[index+1]-centerY;point.set(x*c-y*s,x*s+y*c,values[index+2]+bottom).applyQuaternion(rotation).add(new Vector3(...config.anchor)).applyMatrix4(sourceMatrix);for(let axis=0;axis<3;axis++)positions[index+axis]=point.getComponent(axis);}
    const mesh=createMesh({...metadata,name:metadata.name||`Text: ${config.text.replaceAll('\n',' ').slice(0,60)}`,positions,text:config});
    const analysis=analyzeMesh(mesh);if(!analysis.manifold)throw new Error('These font outlines do not produce closed, consistently wound text. Choose another font or text.');return mesh;
  }finally{geometry.dispose();}
}
export const TEXT_SURFACES=Object.freeze({'Top':[0,0,1],'Bottom':[0,0,-1],'Front':[0,-1,0],'Back':[0,1,0],'Left':[-1,0,0],'Right':[1,0,0]});
function members(objects,selected){const group=selected.native?.groupId||selected.id;return objects.filter(object=>object.plateId===selected.plateId&&(object.native?.groupId||object.id)===group);}
export function textSurfaceAnchor(objects,selectedId,surface='Top'){
  const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Select a normal object for embossed or engraved text');
  const normal=TEXT_SURFACES[surface];if(!normal)throw new Error('Choose a text surface');
  const normalParts=members(objects,selected).filter(object=>object.visible!==false&&(object.native?.partType||'normal_part')==='normal_part'&&!object.text);
  const bounds=sceneBounds(normalParts);if(!bounds)throw new Error('Select an object with a normal non-text part');
  const anchor=[...bounds.center];for(let axis=0;axis<3;axis++)if(normal[axis])anchor[axis]=normal[axis]>0?bounds.max[axis]:bounds.min[axis];return{anchor,normal:[...normal]};
}
/** Full scene replacement, suitable for one undo step. Existing editable text
 * retains its source placement and mesh TRS when regenerated. */
export function addTextToScene({objects=[],selectedId,font,options={},plateId='plate-1',bed}){
  const selected=objects.find(object=>object.id===selectedId),editing=Boolean(selected?.text),config=normalizeTextConfiguration(options);
  let related=selected?members(objects,selected):[],groupId,objectName,objectSettings={},instanceFamily;
  if(config.mode!=='standalone'){
    const body=related.find(object=>(object.native?.partType||'normal_part')==='normal_part'&&!object.text);if(!body)throw new Error('Emboss and engrave require a normal non-text part in the selected object');
    instanceFamily=body.native?.instanceFamily;groupId=body.native?.groupId||body.id;objectName=body.native?.objectName||body.name;objectSettings=structuredClone(body.native?.objectSettings||{});plateId=body.plateId;
  }else if(editing){plateId=selected.plateId;related=related.filter(object=>object.id!==selected.id);}
  const metadata={...(editing?selected:{}),plateId,filamentSlot:selected?.filamentSlot||1,native:{...(editing?selected.native:{}),groupId:groupId||(editing&&related.length===0?selected.native?.groupId:null)||crypto.randomUUID(),objectName:objectName||`Text: ${config.text.replaceAll('\n',' ').slice(0,60)}`,partType:config.mode==='engrave'?'negative_part':'normal_part',objectSettings,partSettings:{...(editing?selected.native?.partSettings:{})}}};
  if(config.mode!=='standalone'&&instanceFamily)metadata.native.instanceFamily=instanceFamily;
  else if(config.mode==='standalone'&&related.length)delete metadata.native.instanceFamily;
  delete metadata.painting;delete metadata.native.groupTransform;metadata.name=`Text: ${config.text.replaceAll('\n',' ').slice(0,60)}`;
  const mesh=createTextMesh(font,config,metadata);
  if(editing){const oldCenter=sourceBounds(selected).center,newCenter=sourceBounds(mesh).center,rotation=new Quaternion().setFromEuler(new Euler(...selected.rotation.map(value=>value*Math.PI/180),'XYZ')),delta=new Vector3(...newCenter).sub(new Vector3(...oldCenter)).multiply(new Vector3(...selected.scale)).applyQuaternion(rotation);mesh.position=oldCenter.map((value,axis)=>value+selected.position[axis]-newCenter[axis]+delta.getComponent(axis));}
  if(config.mode==='standalone'&&related.length&&!related.some(object=>(object.native?.partType||'normal_part')==='normal_part'))throw new Error('Detaching text would leave helper volumes without a normal part');
  if(bed&&config.mode!=='engrave'){const bounds=meshBounds(mesh),limits=bedBounds(bed);if(bounds.min.some((number,axis)=>number<limits.min[axis]-.001||bounds.max[axis]>limits.max[axis]+.001))throw new Error('Text is outside the build volume; reduce its size or adjust its position');}
  const relatedIds=new Set(related.map(object=>object.id));
  const next=objects.filter(object=>!editing||object.id!==selected.id).map(object=>{if(!relatedIds.has(object.id))return object;const native={...object.native,groupId:object.native?.groupId||object.id,objectName:object.native?.objectName||object.name,partType:object.native?.partType||'normal_part',objectSettings:{...object.native?.objectSettings},partSettings:{...object.native?.partSettings}};delete native.groupTransform;return{...object,native};});
  return{objects:[...next,mesh],selectedId:mesh.id,text:mesh};
}

/** Preserve editable text when an operation bakes mesh TRS into its vertices.
 * An optional worldMatrix represents an additional world-space placement. */
export function bakeTextConfiguration(mesh,{worldMatrix}={}){
  if(!mesh.text)return undefined;const config=normalizeTextConfiguration(mesh.text),center=sourceBounds(mesh).center;
  const matrix=new Matrix4().compose(new Vector3(...center).add(new Vector3(...mesh.position)),new Quaternion().setFromEuler(new Euler(...mesh.rotation.map(value=>value*Math.PI/180),'XYZ')),new Vector3(...mesh.scale)).multiply(new Matrix4().makeTranslation(...center.map(value=>-value))).multiply(new Matrix4().fromArray(config.sourceMatrix));
  if(worldMatrix)matrix.premultiply(new Matrix4().fromArray(worldMatrix));return normalizeTextConfiguration({...config,sourceMatrix:matrix.toArray()});
}
