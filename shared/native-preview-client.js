import {adaptNativePreview} from './native-preview-adapter.js';
import {NATIVE_PREVIEW_LIMITS} from './native-preview-data.js';
async function boundedJson(response,limit){
 if(!response.body?.getReader){const text=await response.text();if(new TextEncoder().encode(text).length>limit)throw new RangeError('Native preview response exceeds safety limit');return JSON.parse(text);}
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw new RangeError('Native preview response exceeds safety limit');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.releaseLock();}
}
/** Raw bytes and native vertices must belong to exactly the same job snapshot. */
export async function loadNativePreview(base,text,{jobId,signal,fetcher=fetch}={}){
 const fallback=reason=>({...base,nativeUnavailable:reason});
 if(!base.source?.complete)return fallback('Complete G-code is required for native processing.');
 try{
  const capabilityResponse=await fetcher('/api/jobs/native-preview/capabilities',{signal});
  if(!capabilityResponse.ok)return fallback('Native G-code processor is not configured.');
  const capabilities=await boundedJson(capabilityResponse,16384);
  if(!capabilities.available)return fallback(capabilities.error||'Native G-code processor is not configured.');
  const response=await fetcher(`/api/jobs/${encodeURIComponent(jobId)}/native-preview`,{signal});
  if(!response.ok){const problem=await boundedJson(response,16384);throw new Error(problem.error||`Native processing failed (${response.status}).`);}
  const data=await boundedJson(response,NATIVE_PREVIEW_LIMITS.outputBytes),bytes=new TextEncoder().encode(text);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(data.sourceSha256!==hash||data.sourceBytes!==bytes.length)throw new Error('Native preview and downloaded G-code do not match. Reload the job.');
  return adaptNativePreview(base,data);
 }catch(problem){if(signal?.aborted)throw problem;return fallback(problem.message||'Native G-code processing failed.');}
}
