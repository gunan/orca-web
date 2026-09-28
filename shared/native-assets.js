// OrcaSlicer 2.4.2 bbs_3mf.cpp:352–355,6129–6221,6550–6595.
// Imported render images are reusable only while their plate appearance is unchanged.
// This signature detects accidental edits; it is not authentication of a client image.
const MAX_IMAGE=8*1024*1024,MAX_TOTAL=24*1024*1024,MAX_PIXELS=4096*4096;
const kinds=['thumbnail','small','noLight','top','pick'];
const metadataKeys={thumbnail:'thumbnail_file',noLight:'thumbnail_no_light_file',top:'top_file',pick:'pick_file'};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes,start,end){let value=0xffffffff;for(let i=start;i<end;i++)value=crcTable[(value^bytes[i])&255]^(value>>>8);return(value^0xffffffff)>>>0;}
export function inspectThumbnail(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<45||bytes.length>MAX_IMAGE)throw new Error('Native thumbnail exceeds its size bounds');
 if(![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value))throw new Error('Native thumbnail must contain PNG data');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,width=0,height=0,data=false,ended=false;
 while(offset<bytes.length){if(offset+12>bytes.length)throw new Error('Truncated native thumbnail chunk');const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw new Error('Truncated native thumbnail data');const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(!/^[A-Za-z]{4}$/.test(type)||crc(bytes,offset+4,end-4)!==view.getUint32(end-4))throw new Error('Invalid native thumbnail chunk');
  if(offset===8){if(type!=='IHDR'||length!==13)throw new Error('Native thumbnail is missing its image header');width=view.getUint32(offset+8);height=view.getUint32(offset+12);if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)throw new Error('Native thumbnail dimensions exceed the limit');}
  else if(type==='IHDR')throw new Error('Duplicate native thumbnail header');
  if(type==='IDAT')data=true;if(type==='IEND'){if(length!==0||end!==bytes.length||!data)throw new Error('Invalid native thumbnail end');ended=true;}
  offset=end;
 }
 if(!ended)throw new Error('Native thumbnail has no complete image data');return{width,height};
}
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function decode(text){if(typeof text!=='string'||text.length>Math.ceil(MAX_IMAGE/3)*4||!text.length||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw new Error('Invalid native thumbnail encoding');const binary=atob(text);if(btoa(binary)!==text)throw new Error('Noncanonical native thumbnail encoding');const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));inspectThumbnail(bytes);return bytes;}
function signature(value){let a=0x811c9dc5,b=0x9e3779b9,length=0;const text=v=>{const s=String(v);length+=s.length;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);}};const walk=v=>{if(v===null||typeof v!=='object'){text(typeof v);text(String(v).length);text(':');text(v);return;}text(Array.isArray(v)?'[':'{');for(const key of Array.isArray(v)?v.keys():Object.keys(v).sort()){text(key);text(':');walk(v[key]);}text(Array.isArray(v)?']':'}');};walk(value);return`${length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;}
export function plateAppearanceSignature(project,plateId,settings=project.nativeSettings||{}){
 const objects=(project.objects||[]).filter(o=>o.plateId===plateId).map(o=>({id:o.id,positions:o.positions,position:o.position,rotation:o.rotation,scale:o.scale,visible:o.visible!==false,printable:o.printable!==false,slot:o.filamentSlot||1,type:o.native?.partType||'normal_part',color:o.painting?.color||{},winding:o.painting?.winding||1}));
 return signature({objects,colors:settings.filament_colour||[],multiColors:settings.filament_multi_colour||[],colorTypes:settings.filament_colour_type||[],bed:settings.printable_area||[]});
}
function safePath(value){if(typeof value!=='string'||!/^Metadata\/[A-Za-z0-9_ -]+\.png$/.test(value))throw new Error('Unsafe native thumbnail reference');return value;}
export function captureNativeAssets(entries,project,{warnings=[]}={}){
 const plates=[];let total=0;
 for(const plate of project.plates){const images={},metadata=plate.native?.metadata||{},number=plate.native?.number||project.plates.indexOf(plate)+1;
  for(const kind of kinds){const raw=kind==='small'?`Metadata/plate_${number}_small.png`:metadata[metadataKeys[kind]];if(!raw)continue;const path=safePath(raw),bytes=entries[path];if(!bytes){if(kind!=='small')warnings.push(`Native thumbnail is missing: ${path}`);continue;}inspectThumbnail(bytes);if((total+=bytes.length)>MAX_TOTAL)throw new Error('Native thumbnail assets exceed the combined limit');images[kind]=encode(bytes);}
  if(Object.keys(images).length)plates.push({plateId:plate.id,signature:plateAppearanceSignature(project,plate.id),images});
 }
 return plates.length?{version:1,plates}:undefined;
}
export function normalizeNativeAssets(value){
 if(value===undefined)return undefined;if(!plain(value)||value.version!==1||!Array.isArray(value.plates)||value.plates.length>36)throw new Error('Invalid native thumbnail assets');let total=0;const ids=new Set();
 return{version:1,plates:value.plates.map(plate=>{if(!plain(plate)||typeof plate.plateId!=='string'||!plate.plateId||plate.plateId.length>512||ids.has(plate.plateId)||typeof plate.signature!=='string'||!/^\d+:[a-f0-9]{1,8}:[a-f0-9]{1,8}$/.test(plate.signature)||!plain(plate.images))throw new Error('Invalid native thumbnail plate');ids.add(plate.plateId);const images={};for(const[kind,text]of Object.entries(plate.images)){if(!kinds.includes(kind))throw new Error('Unsupported native thumbnail kind');const bytes=decode(text);if((total+=bytes.length)>MAX_TOTAL)throw new Error('Native thumbnail assets exceed the combined limit');images[kind]=text;}return{plateId:plate.plateId,signature:plate.signature,images};})};
}
export function exportNativeAssets(project,plates,settings=project.nativeSettings||{}){
 const assets=normalizeNativeAssets(project.nativeAssets),files={},metadata=new Map(),stale=[];if(!assets)return{files,metadata,stale};
 for(const plate of plates){const record=assets.plates.find(item=>item.plateId===plate.id);if(!record)continue;if(record.signature!==plateAppearanceSignature(project,plate.id,settings)){stale.push(plate.id);continue;}const index=plates.indexOf(plate)+1,paths={thumbnail:`Metadata/plate_${index}.png`,small:`Metadata/plate_${index}_small.png`,noLight:`Metadata/plate_no_light_${index}.png`,top:`Metadata/top_${index}.png`},values={};
  // Picking images encode original object/instance IDs, which export renumbers.
  // Keep those original bytes in web JSON, but never reference a stale pick buffer.
  for(const[kind,path]of Object.entries(paths))if(record.images[kind]){files[path]=decode(record.images[kind]);if(metadataKeys[kind])values[metadataKeys[kind]]=path;}metadata.set(plate.id,values);
 }
 return{files,metadata,stale};
}
