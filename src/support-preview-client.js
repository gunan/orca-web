const active=job=>['queued','slicing'].includes(job?.status);
const abortError=()=>new DOMException('Support preview cancelled','AbortError');
const wait=(delay,signal)=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(abortError());},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},delay);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();});
async function json(response){if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw new Error(error||`Support preview request failed (${response.status})`);}return response.json();}
export async function readSupportGcode(response,{limit=25000000,signal}={}){
 if(!response.ok)throw new Error(`Cannot load support G-code (${response.status})`);
 if(!response.body?.getReader){const text=await response.text();return{text:text.slice(0,limit),truncated:text.length>limit};}
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0,truncated=false;
 const abort=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
 try{while(true){if(signal?.aborted)throw abortError();const{value,done}=await reader.read();if(done)break;const remaining=limit-bytes;if(value.length>remaining){text+=decoder.decode(value.subarray(0,remaining),{stream:true});truncated=true;await reader.cancel();break;}text+=decoder.decode(value,{stream:true});bytes+=value.length;}text+=decoder.decode();if(signal?.aborted)throw abortError();return{text,truncated};}
 finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}
/** Creation is allowed to settle even when closed, so its returned job ID can
 * be cancelled. Read requests abort promptly, and no unrelated job is touched. */
export async function loadSlicedSupport(create,objects,{signal,onJob=()=>{},fetchImpl=fetch,pollMs=400,maxBytes=25000000}={}){
 if(signal?.aborted)throw abortError();let job,cancelPromise;
 const cancel=()=>{if(!active(job))return Promise.resolve();if(!cancelPromise)cancelPromise=(async()=>{const response=await fetchImpl(`/api/jobs/${encodeURIComponent(job.id)}/cancel`,{method:'POST'});const cancelled=await json(response);if(active(cancelled))throw new Error('Support preview cancellation did not stop the active job');job=cancelled;})();return cancelPromise;};
 const onAbort=()=>{void cancel().catch(()=>{});};signal?.addEventListener('abort',onAbort,{once:true});
 try{
  job=await create(objects,{});if(!job||typeof job.id!=='string')throw new Error('Support preview did not return a job');if(signal?.aborted){await cancel();throw abortError();}onJob(job);
  while(active(job)){await wait(pollMs,signal);job=await json(await fetchImpl(`/api/jobs/${encodeURIComponent(job.id)}`,{signal}));if(signal?.aborted){await cancel();throw abortError();}onJob(job);}
  if(job.status!=='ready')throw new Error(job.error||`Support preview ${job.status}`);
  const result=await readSupportGcode(await fetchImpl(`/api/jobs/${encodeURIComponent(job.id)}/download`,{signal}),{limit:maxBytes,signal});return{job,...result};
 }catch(error){if(active(job))await cancel();if(signal?.aborted)throw abortError();throw error;}
 finally{signal?.removeEventListener('abort',onAbort);}
}
