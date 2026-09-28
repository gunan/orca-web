import {filamentSlotCount} from '../shared/filament-slots.js';
import {useEffect,useMemo,useState} from 'react';
import {nativeProjectRequest} from '../shared/native-project-client.js';
import {primeTowerState} from '../shared/prime-tower.js';

/** Abort obsolete work and remove its geometry immediately when the model,
 * presets, palette or active plate change. Selection-only edits do not reslice. */
export function usePrimeTowerPreview(project,process,{active=true,revision=0}={}){
 const input=useMemo(()=>({project,process}),[project.objects,project.plates,project.activePlateId,project.ids,project.overrides,project.projectOverrides,project.nativeSettings,project.filamentIds,project.useEmbeddedSettings,project.processCorrectionDecisions,project.calibration,project.generatedPatternBinding,process,revision]);
 const [state,setState]=useState({input:null,status:'idle',result:null});
 let enabled=false;try{const values={...process,...(project.useEmbeddedSettings?project.nativeSettings:project.projectOverrides),...project.overrides},scalar=v=>Array.isArray(v)?v[0]:v;const needed=scalar(values.timelapse_type)==='1'||scalar(values.timelapse_type)===1||[true,1,'1'].includes(scalar(values.enable_wrapping_detection));enabled=active&&Boolean(process)&&project.objects.length>0&&primeTowerState(project,process).enabled&&(filamentSlotCount(project)>1||needed);}catch{}
 useEffect(()=>{
  if(!enabled){setState({input,status:'idle',result:null});return;}
  const controller=new AbortController();setState({input,status:'loading',result:null});
  const timer=setTimeout(async()=>{try{
   const response=await fetch('/api/geometry/prime-tower',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectRequest:nativeProjectRequest(input.project,{allPlates:true})}),signal:controller.signal});
   const data=await response.json();if(!response.ok)throw new Error(data.error||`Prime tower preview failed (${response.status})`);
   if(data.result?.format!=='orca-native-prime-tower'||data.result.plateId!==input.project.activePlateId||typeof data.result.visible!=='boolean')throw new Error('Prime tower preview returned invalid data');
   if(!controller.signal.aborted)setState({input,status:'ready',result:data.result});
  }catch(error){if(!controller.signal.aborted)setState({input,status:'error',error:error.message,result:null});}},300);
  return()=>{clearTimeout(timer);controller.abort();};
 },[input,enabled]);
 return {plateId:project.activePlateId,...(!enabled?{status:'idle',result:null}:state.input===input?state:{status:'loading',result:null})};
}
