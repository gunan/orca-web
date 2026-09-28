import React,{useEffect,useMemo,useRef,useState} from 'react';
import SceneViewport from './SceneViewport.jsx';
import {loadSlicedSupport} from './support-preview-client.js';
import {parseSupportPreview} from '../shared/support-preview.js';
export default function SlicedSupportPreview({objects,displayObjects=objects,bed,filamentColors,onCreate,onBack}){
 const initial=useRef({objects,onCreate}),request=useRef(),[job,setJob]=useState(null),[preview,setPreview]=useState(null),[error,setError]=useState(''),[status,setStatus]=useState('Submitting native support preview…'),[low,setLow]=useState(0),[high,setHigh]=useState(0);
 useEffect(()=>{const controller=new AbortController();request.current=controller;let mounted=true;
  loadSlicedSupport(initial.current.onCreate,initial.current.objects,{signal:controller.signal,onJob:next=>{if(mounted){setJob(next);setStatus(`Native slice: ${next.status}`);}}}).then(result=>{if(!mounted)return;const parsed=parseSupportPreview(result.text,{inputTruncated:result.truncated});setPreview(parsed);setHigh(Math.max(0,parsed.layers.length-1));setStatus('Native support toolpaths ready.');}).catch(error=>{if(!mounted)return;if(error.name==='AbortError')setStatus('Support preview cancelled.');else{setError(error.message);setStatus('Support preview failed.');}});
  return()=>{mounted=false;controller.abort();};
 },[]);
 const visible=useMemo(()=>preview?.segments.filter(segment=>segment.layer>=(preview.layers[low]?.index??0)&&segment.layer<=(preview.layers[high]?.index??Infinity))||[],[preview,low,high]);
 const done=preview||error||status==='Support preview cancelled.';
 return <section className="sliced-support-preview" aria-label="Sliced support preview"><header><h3>Sliced support preview</h3><button onClick={onBack}>Back to painting</button>{!done&&<button onClick={()=>{setStatus('Cancelling support preview…');request.current?.abort();}}>Cancel support preview</button>}</header><p role="status">{status}</p>{error&&<p role="alert">{error}</p>}
 <p>Actual support and support-interface extrusion paths from the current native slice. Printer and process settings are unchanged. This is separate from native pre-slice support-volume geometry.</p>
 {preview&&<><p>{preview.truncated?'Partial preview. ':''}{preview.metrics.segments.toLocaleString()} support deposition segments · {preview.metrics.pathLengthMm.toFixed(2)} mm of support paths · {preview.layers.length} layers.</p>{preview.truncated&&<p role="alert">The bounded G-code preview is incomplete. No support outside the loaded portion is shown.</p>}{!preview.segments.length&&<p>{preview.truncated?'No support was found in the loaded portion.':'The native slice generated no support deposition. Check the current support settings and painted regions.'}</p>}
 <div className="paint-controls"><label>First support layer<input aria-label="First support preview layer" type="range" min="0" max={Math.max(0,preview.layers.length-1)} value={low} disabled={!preview.layers.length} onChange={event=>{const value=Number(event.target.value);setLow(value);if(value>high)setHigh(value);}}/></label><label>Last support layer<input aria-label="Last support preview layer" type="range" min="0" max={Math.max(0,preview.layers.length-1)} value={high} disabled={!preview.layers.length} onChange={event=>{const value=Number(event.target.value);setHigh(value);if(value<low)setLow(value);}}/></label><span>{visible.length.toLocaleString()} visible support segments</span></div>
 <div className="paint-preview"><SceneViewport objects={displayObjects} selectedId={null} bed={bed} filamentColors={filamentColors} mode="Support preview" supportSegments={visible} onSelect={()=>{}} onTransform={()=>{}} onPlaceFace={()=>{}}/></div>
 <details><summary>Native job and parser details</summary><p>Job {job?.id} · {preview.features.join(', ')||'No support features'}</p>{preview.warnings.length>0&&<ul>{preview.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}</details></>}
 </section>;
}
