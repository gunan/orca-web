import {parseNativeHotend} from './hotend-geometry.js';
const maxBytes=5*1024*1024;
export async function loadNativeHotend({jobId,signal,fetchImpl=fetch}={}){
 const base=`/api/jobs/${encodeURIComponent(jobId)}/hotend`;let info;
 try{
  const response=await fetchImpl(base,{signal});let url;
  if(response.status===404){info={version:1,source:'legacy-bundled-default',legacy:true,resource:'hotend.stl',warnings:['This server or older job has no printer-model binding; the bundled native default is shown.']};url='/native-preview/hotend.stl';}
  else{
   if(!response.ok)throw new Error(`Native hotend metadata is unavailable (${response.status}).`);
   info=await response.json();if(info.version!==1||typeof info.available!=='boolean')throw new Error('Native hotend metadata is invalid.');
   if(!info.available)throw new Error(info.error||'The native hotend model resource is unavailable.');
   if(!/^[a-f0-9]{64}$/.test(info.sha256))throw new Error('Native hotend checksum is invalid.');
   url=`${base}/model?sha256=${info.sha256}`;
  }
  const assetResponse=await fetchImpl(url,{signal});if(!assetResponse.ok)throw new Error(`Native hotend asset is unavailable (${assetResponse.status}).`);
  if(Number(assetResponse.headers?.get('content-length'))>maxBytes)throw new Error('Native hotend asset exceeds its size limit.');
  const bytes=await assetResponse.arrayBuffer();if(bytes.byteLength>maxBytes)throw new Error('Native hotend asset exceeds its size limit.');
  if(info.sha256){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==info.sha256)throw new Error('Native hotend asset checksum changed.');}
  return {asset:parseNativeHotend(bytes),info};
 }catch(error){error.metadata=info;throw error;}
}
export function nativeHotendDescription(info){
 if(!info)return 'Native hotend model provenance is unavailable.';
 const origin={'bundled-vendor':'Bundled printer hotend','configured-vendor':'Configured native vendor hotend','bundled-default':'Native default hotend','legacy-bundled-default':'Native default hotend; printer binding unavailable'}[info.source]||'Native hotend';
 return `${origin}${info.modelName?' · '+info.modelName:''}${info.resource?' · '+info.resource:''}`;
}
