import express from 'express';
import {parseNativeHotend} from '../shared/hotend-geometry.js';
import path from 'node:path';
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
const version=1,maxBytes=5*1024*1024;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const text=value=>typeof value==='string'&&value.length<=512&&!value.includes('\0');
const component=value=>text(value)&&value!=='.'&&value!=='..'&&!/[\\/]/.test(value)&&value.length>0;
const assetPath=value=>text(value)&&!path.isAbsolute(value)&&!value.includes('\\')&&value.split('/').every(component)&&/\.stl$/i.test(value);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function readAsset(root,relative){
 if(!root)return null;
 if(!assetPath(relative))throw error('Native hotend resource path is invalid');
 let handle;
 try{
  const directory=await realpath(root),filename=path.resolve(directory,relative),parent=await realpath(path.dirname(filename));
  if(parent!==directory&&!parent.startsWith(directory+path.sep))throw error('Native hotend resource escapes its configured directory');
  handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();
  if(!stat.isFile()||stat.size<15||stat.size>maxBytes)throw error('Native hotend resource exceeds geometry bounds');
  const bytes=await handle.readFile();if(bytes.length!==stat.size)throw error('Native hotend resource changed while reading',409);
  try{parseNativeHotend(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}catch{throw error('Native hotend resource contains invalid STL geometry');}
  return bytes;
 }catch(problem){if(['ENOENT','ENOTDIR'].includes(problem.code))return null;if(problem.status)throw problem;throw error('Native hotend resource could not be read safely',503);}finally{await handle?.close();}
}
export function createNativeHotendService({catalog,jobStore,profilesDir=catalog?.directory,nativeVendorDir=process.env.ORCA_NATIVE_VENDOR_DIR}={}){
 const index=catalog?.listHotendModels?.()||{models:[],warnings:['Native hotend model metadata is unavailable.']};
 function snapshot({printerId,printer,embedded=false}={}){
  const printerModel=typeof printer?.printer_model==='string'?printer.printer_model:'',source=printerId&&!embedded?catalog?.getPresetSource?.(printerId,'machine'):null;
  const system=Boolean(source&&!source.snapshot&&source.vendor),models=index.models||[];
  // Native system lookup uses ID within the preset's vendor. Custom lookup scans
  // std::map vendors by display name, overwriting earlier matching vendor values.
  const candidates=new Map();for(const model of models)if(model.name===(printerModel||'MyKlipper 0.4 nozzle')&&!candidates.has(model.vendor))candidates.set(model.vendor,model);
  const model=system?models.find(m=>m.vendor===source.vendor&&m.id===printerModel):[...candidates.values()].sort((a,b)=>a.vendor<b.vendor?-1:a.vendor>b.vendor?1:0).at(-1);
  return {version,printerModel,selection:system?'system':embedded?'embedded':'custom',vendor:model?.vendor||null,modelId:model?.id||null,modelName:model?.name||null,hotendModel:model?.hotendModel||'',warnings:[...(index.warnings||[])]};
 }
 function owned(id){const job=jobStore.get(id);if(!job)throw error('Job not found',404);if(job.status!=='ready')throw error('Native hotend preview requires a completed job',409);return job;}
 async function resolve(id){
  const job=owned(id),binding=job.nativeHotend;
  const old=!binding,snapshotValue=old?{version,printerModel:'',selection:'legacy',vendor:null,modelId:null,modelName:null,hotendModel:'',warnings:['This older job has no printer-model snapshot; the native default hotend is shown.']}:binding;
  if(snapshotValue.version!==version||!text(snapshotValue.printerModel)||!text(snapshotValue.hotendModel)||snapshotValue.vendor!==null&&!component(snapshotValue.vendor))throw error('Stored native hotend binding is invalid');
  const warnings=[...(Array.isArray(snapshotValue.warnings)?snapshotValue.warnings:[])];let bytes=null,source='bundled-default',resource='hotend.stl';
  if(snapshotValue.vendor&&snapshotValue.hotendModel){
   resource=`${snapshotValue.vendor}/${snapshotValue.hotendModel}`;
   if(!assetPath(resource))throw error('Stored native hotend resource path is invalid');
   if(nativeVendorDir){bytes=await readAsset(nativeVendorDir,resource);if(bytes)source='configured-vendor';}
   if(!bytes){bytes=await readAsset(profilesDir,resource);if(bytes)source='bundled-vendor';}
  }
  if(!bytes){resource='hotend.stl';source='bundled-default';bytes=await readAsset(profilesDir,resource);}
  if(!nativeVendorDir)warnings.push('Native user vendor asset overrides require ORCA_NATIVE_VENDOR_DIR; only bundled assets are searched.');
  const meta={version,available:Boolean(bytes),printerModel:snapshotValue.printerModel,modelName:snapshotValue.modelName,vendor:snapshotValue.vendor,source,resource,legacy:old,warnings,...(bytes?{sha256:sha(bytes),bytes:bytes.length,url:`/api/jobs/${encodeURIComponent(id)}/hotend/model?sha256=${sha(bytes)}`}:{error:'The native hotend model resource is unavailable.'})};
  return {meta,bytes};
 }
 const router=express.Router();router.get('/:id/hotend',async(req,res)=>{try{res.set('Cache-Control','no-store').json((await resolve(req.params.id)).meta);}catch(problem){res.status(problem.status||503).json({error:problem.message});}});
 router.get('/:id/hotend/model',async(req,res)=>{try{const{meta,bytes}=await resolve(req.params.id);if(!bytes)throw error(meta.error,404);if(req.query.sha256!==meta.sha256)throw error('Native hotend resource changed; reload its metadata',409);res.set({'Cache-Control':'no-store','Content-Type':'model/stl','X-Content-Type-Options':'nosniff','ETag':`"${meta.sha256}"`}).send(bytes);}catch(problem){res.status(problem.status||503).json({error:problem.message});}});
 return {router,snapshot,resolve};
}
