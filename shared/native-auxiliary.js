// OrcaSlicer 2.4.2 Auxiliary.hpp/Auxiliary.cpp and bbs_3mf.cpp.
// Attachments are opaque archive bytes. They are never interpreted as scripts,
// fetched from a URL or extracted onto the server filesystem by this module.
import {inspectThumbnail} from './native-assets.js';
export const AUXILIARY_GROUPS = Object.freeze({
  'Model Pictures': ['png','jpg','jpeg','bmp'],
  'Bill of Materials': ['xls','xlsx','pdf'],
  'Assembly Guide': ['pdf'],
  Others: ['txt']
});
export const AUXILIARY_LIMITS = Object.freeze({file:32*1024*1024,total:64*1024*1024,count:256});
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const forbidden=new Set(['.','..','__proto__','constructor','prototype']);
export function auxiliaryPath(path){
  if(typeof path!=='string'||path.length>1024||!path.startsWith('Auxiliaries/')||/[\\\x00-\x1f\x7f:]/.test(path))throw new Error('Unsafe project attachment path');
  const parts=path.split('/');
  if(parts.length<2||parts.length>16||parts.some(p=>!p||p.length>255||forbidden.has(p)||/[. ]$/.test(p)))throw new Error('Unsafe project attachment path');
  return path;
}
export function encodeAttachment(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>AUXILIARY_LIMITS.file)throw new Error('Project attachment exceeds 32 MiB');
  let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);
}
export function decodeAttachment(data){
  if(typeof data!=='string'||data.length>Math.ceil(AUXILIARY_LIMITS.file/3)*4||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error('Invalid project attachment encoding');
  const value=atob(data);if(btoa(value)!==data||value.length>AUXILIARY_LIMITS.file)throw new Error('Invalid project attachment encoding');
  return Uint8Array.from(value,c=>c.charCodeAt(0));
}
export function normalizeAuxiliary(value){
  if(value===undefined)return undefined;
  if(!plain(value)||value.version!==1||!Array.isArray(value.files)||value.files.length>AUXILIARY_LIMITS.count)throw new Error('Invalid project attachments');
  let total=0;const names=new Set();
  const files=value.files.map(file=>{
    if(!plain(file))throw new Error('Invalid project attachment');const path=auxiliaryPath(file.path),key=path.normalize('NFC').toLocaleLowerCase('en-US');
    if(names.has(key))throw new Error('Duplicate project attachment name');names.add(key);
    const bytes=decodeAttachment(file.data);total+=bytes.length;if(total>AUXILIARY_LIMITS.total)throw new Error('Project attachments exceed 64 MiB');
    return{path,data:file.data};
  });
  const covers={};if(value.covers!==undefined){if(!plain(value.covers))throw new Error('Invalid project cover references');for(const[k,path]of Object.entries(value.covers)){if(!['cover','small','middle'].includes(k))throw new Error('Invalid project cover kind');auxiliaryPath(path);if(!files.some(f=>f.path===path))throw new Error('Project cover attachment is missing');covers[k]=path;}}
  return{version:1,files,...(Object.keys(covers).length?{covers}:{})};
}
export function captureAuxiliary(entries,{relations=[],warnings=[]}={}){
  const files=Object.entries(entries).filter(([path])=>path.startsWith('Auxiliaries/')&&!path.endsWith('/')).map(([path,bytes])=>({path:auxiliaryPath(path),data:encodeAttachment(bytes)})),covers={};
  const types={
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail':'cover',
    'http://schemas.bambulab.com/package/2021/cover-thumbnail-small':'small',
    'http://schemas.bambulab.com/package/2021/cover-thumbnail-middle':'middle'
  };
  for(const relation of relations){const kind=types[relation['@_Type']],raw=relation['@_Target'];if(!kind||typeof raw!=='string'||!raw.replace(/^\//,'').startsWith('Auxiliaries/'))continue;
    if(relation['@_TargetMode']==='External')throw new Error('External project cover references are not supported');const path=auxiliaryPath(raw.replace(/^\//,''));
    if(files.some(f=>f.path===path))covers[kind]=path;else warnings.push(`Project cover attachment is missing: ${path}`);
  }
  return files.length?normalizeAuxiliary({version:1,files,covers}):undefined;
}
export function exportAuxiliary(value){const normalized=normalizeAuxiliary(value);return{files:Object.fromEntries((normalized?.files||[]).map(f=>[f.path,decodeAttachment(f.data)])),covers:normalized?.covers||{}};}
export function attachmentInfo(file){const parts=auxiliaryPath(file.path).split('/'),padding=file.data.endsWith('==')?2:file.data.endsWith('=')?1:0;return{name:parts.at(-1),group:parts.length===2?'Other imported files':parts[1],size:file.data.length*3/4-padding};}
export function attachmentImageSource(file){
  // Only static raster headers with bounded dimensions may reach an image
  // element. Other imported bytes remain downloadable without interpretation.
  try{
    if(attachmentInfo(file).group!=='Model Pictures')return null;
    const ext=file.path.split('.').at(-1).toLowerCase(),bytes=decodeAttachment(file.data),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,type;
    if(ext==='png'){
      ({width,height}=inspectThumbnail(bytes));type='image/png';
      for(let offset=8;offset+12<=bytes.length;offset+=12+view.getUint32(offset))if(String.fromCharCode(...bytes.subarray(offset+4,offset+8))==='acTL')return null;
    }else if(['jpg','jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216){
      type='image/jpeg';let cursor=2;
      while(cursor+4<=bytes.length){if(bytes[cursor++]!==255)return null;while(bytes[cursor]===255)cursor++;const marker=bytes[cursor++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
        const size=view.getUint16(cursor);if(size<2||cursor+size>bytes.length)return null;
        if([0xc0,0xc1,0xc2].includes(marker)){if(size<8)return null;height=view.getUint16(cursor+3);width=view.getUint16(cursor+5);break;}cursor+=size;
      }
    }else if(ext==='bmp'&&bytes.length>=54&&bytes[0]===66&&bytes[1]===77&&view.getUint32(14,true)>=40&&view.getUint32(30,true)<=3){type='image/bmp';width=view.getInt32(18,true);height=Math.abs(view.getInt32(22,true));}
    if(!type||width<=0||height<=0||width>4096||height>4096||width*height>16*1024*1024)return null;
    return{url:`data:${type};base64,${file.data}`,width,height};
  }catch{return null;}
}
export function addAttachments(value,group,files){
  if(!Object.hasOwn(AUXILIARY_GROUPS,group))throw new Error('Unknown attachment category');
  const current=normalizeAuxiliary(value)||{version:1,files:[]};
  const additions=files.map(file=>{if(typeof file.name!=='string'||file.name.includes('/')||!AUXILIARY_GROUPS[group].includes(file.name.split('.').at(-1).toLowerCase()))throw new Error(`Unsupported file type for ${group}`);return{path:auxiliaryPath(`Auxiliaries/${group}/${file.name}`),data:encodeAttachment(file.bytes)};});
  return normalizeAuxiliary({...current,files:[...current.files,...additions]});
}
export function renameAttachment(value,path,name){
  const current=normalizeAuxiliary(value);if(!current?.files.some(f=>f.path===path))throw new Error('Project attachment no longer exists');
  if(typeof name!=='string'||name.includes('/'))throw new Error('Invalid attachment name');
  const destination=auxiliaryPath(path.slice(0,path.lastIndexOf('/')+1)+name);
  if(name.split('.').at(-1).toLowerCase()!==path.split('.').at(-1).toLowerCase())throw new Error('Keep the attachment file extension');
  return normalizeAuxiliary({...current,files:current.files.map(f=>f.path===path?{...f,path:destination}:f),covers:Object.fromEntries(Object.entries(current.covers||{}).map(([kind,p])=>[kind,p===path?destination:p]))});
}
export function removeAttachment(value,path){
  const current=normalizeAuxiliary(value);if(!current?.files.some(f=>f.path===path))throw new Error('Project attachment no longer exists');
  return normalizeAuxiliary({...current,files:current.files.filter(f=>f.path!==path),covers:Object.fromEntries(Object.entries(current.covers||{}).filter(([,p])=>p!==path))});
}
export const NATIVE_MODEL_METADATA_KEYS=Object.freeze(['Origin','DesignerCover','Copyright','License','model_id','Region','ProfileTitle','ProfileDescription','ProfileUserName','MakerLab','MakerLabVersion']);
export function normalizeModelMetadata(value){
  if(value===undefined)return undefined;if(!plain(value))throw new Error('Invalid native model metadata');const result={};let total=0;
  for(const[key,text]of Object.entries(value)){if(!NATIVE_MODEL_METADATA_KEYS.includes(key)||typeof text!=='string'||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)||(total+=text.length)>131072)throw new Error('Invalid native model metadata');result[key]=text;}
  if(result.DesignerCover){if(result.DesignerCover.includes('/'))throw new Error('Unsafe designer cover name');auxiliaryPath(`Auxiliaries/Model Pictures/${result.DesignerCover}`);}
  return result;
}
export function captureModelMetadata(metadata){return normalizeModelMetadata(Object.fromEntries(NATIVE_MODEL_METADATA_KEYS.filter(key=>metadata[key]!==undefined).map(key=>[key,String(metadata[key])])));}
export function renameProjectAttachment(project,path,name){
  const nativeAuxiliary=renameAttachment(project.nativeAuxiliary,path,name),nativeModelMetadata={...project.nativeModelMetadata};
  if(path===`Auxiliaries/Model Pictures/${nativeModelMetadata.DesignerCover}`)nativeModelMetadata.DesignerCover=name;
  return{...project,nativeAuxiliary,nativeModelMetadata};
}
export function removeProjectAttachment(project,path){
  let nativeAuxiliary=removeAttachment(project.nativeAuxiliary,path);const nativeModelMetadata={...project.nativeModelMetadata};
  if(path===`Auxiliaries/Model Pictures/${nativeModelMetadata.DesignerCover}`){
    delete nativeModelMetadata.DesignerCover;
    const generated=new Set(['Auxiliaries/.thumbnails/thumbnail_3mf.png','Auxiliaries/.thumbnails/thumbnail_small.png','Auxiliaries/.thumbnails/thumbnail_middle.png']);
    nativeAuxiliary=normalizeAuxiliary({...nativeAuxiliary,files:nativeAuxiliary.files.filter(f=>!generated.has(f.path)),covers:Object.fromEntries(Object.entries(nativeAuxiliary.covers||{}).filter(([,p])=>!generated.has(p)))});
  }
  return{...project,nativeAuxiliary,nativeModelMetadata};
}
