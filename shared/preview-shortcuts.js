// Pinned Orca 8500fcd: GLCanvas3D.cpp 3848–3887 and IMSlider.cpp
// SetLowerValue/SetHigherValue/correct_*/switch_one_layer_mode.
export const PREVIEW_SHORTCUTS=Object.freeze([['Preview','Up / Down','Move active layer thumb','previewLayer'],['Preview','Left / Right','Move by source command; cross layer at endpoint','previewMove'],['Preview','Shift or Mod + Arrow','Move slider five steps','previewStep'],['Preview','L','Toggle remembered single layer','previewSingleLayer'],['Preview','C','Show/hide G-code','previewCode'],['Preview','Home / End','Move to command-range start/end','previewBounds'],['Preview','Tab from canvas','Return to Prepare','previewPrepare'],['Preview','Wheel over slider','Move slider; Shift/Control accelerates','previewWheel'],['Preview','Mod or Shift + G','Jump to the active layer thumb','previewJumpLayer']]);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function previewShortcut(event,{editing=false,modal=false,allowTab=false}={}){
 if(event.defaultPrevented||event.isComposing||event.altKey||editing||modal)return null;
 const key=String(event.key||'').toLowerCase(),command=Boolean(event.ctrlKey||event.metaKey),shift=Boolean(event.shiftKey),amount=command||shift?5:1;
 if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key))return{action:key,amount};
 if(key==='home'||key==='end')return{action:key};
 if(key==='c'&&!command)return{action:'code'};
 if(command||shift)return null;
 if(key==='l')return{action:'singleLayer'};
 if(key==='tab'&&allowTab)return{action:'prepare'};
 return null;
}
export function previewWheel(event,{mac=false}={}){
 if(event.defaultPrevented||event.altKey)return 0;
 const delta=event.deltaY||event.deltaX||0;if(!Number.isFinite(delta)||delta===0)return 0;
 const sign=delta<0?1:-1;
 // Native wxOSX deliberately reverses Shift scrolling and uses Raw Control.
 return sign*(mac?(event.shiftKey?-5:event.ctrlKey?5:1):(event.ctrlKey||event.metaKey||event.shiftKey?5:1));
}
export function previewSliderState({low=0,high=0,maxLayer=0,active='high',singleLayer=false,remembered=Math.trunc((high-low)/2),move=0,maxMove=0}={}){
 if(![low,high,maxLayer,remembered,move,maxMove].every(Number.isInteger)||maxLayer<0||maxLayer>1000000||maxMove>1000000||low<0||high<low||high>maxLayer||maxMove<0||move<0||move>maxMove||!['low','high'].includes(active))throw new RangeError('Invalid preview slider state');
 return{low,high,maxLayer,active,singleLayer:Boolean(singleLayer),remembered,move,maxMove};
}
export function applyPreviewSliderAction(value,action){
 const state={...previewSliderState(value)},amount=action.amount??1;if(!Number.isInteger(amount)||Math.abs(amount)>1000000)throw new RangeError('Invalid preview slider step');
 let layerDirty=false;
 const lower=n=>{state.low=clamp(n,0,state.maxLayer);if(state.low>=state.high||state.singleLayer)state.high=state.low;layerDirty=true;};
 const higher=n=>{state.high=clamp(n,0,state.maxLayer);if(state.high<=state.low||state.singleLayer)state.low=state.high;layerDirty=true;};
 const move=n=>{state.move=clamp(n,0,state.maxMove);};
 switch(action.action){
  case'arrowup':case'arrowdown':{const delta=action.action==='arrowup'?amount:-amount;if(state.active==='high'){higher(state.high+delta);move(state.maxMove);}else lower(state.low+delta);break;}
  case'arrowleft':if(state.move===0&&state.high>0){higher(state.high-1);move(state.maxMove);}else move(state.move-amount);break;
  case'arrowright':if(state.move===state.maxMove&&state.high<state.maxLayer){higher(state.high+1);move(0);}else move(state.move+amount);break;
  case'home':move(0);break;
  case'end':move(state.maxMove);break;
  case'singleLayer':
   state.singleLayer=!state.singleLayer;
   if(!state.singleLayer){state.remembered=state.high;lower(0);higher(state.maxLayer);}
   else if(!state.remembered||state.remembered>state.maxLayer||state.remembered<0){state.remembered=Math.trunc(state.maxLayer/2);higher(state.remembered);}
   else if(state.high===state.maxLayer)higher(state.remembered);else higher(state.high);
   break;
  case'wheelLayer':if(state.singleLayer){const next=state.high+amount;higher(next);state.remembered=next;}else if(state.active==='low')lower(state.low+amount);else higher(state.high+amount);break;
  case'wheelMoves':move(state.move+amount);break;
  case'setLow':lower(amount);break;
  case'setHigh':higher(amount);break;
  default:throw new RangeError('Unknown preview slider action');
 }
 if(layerDirty&&state.singleLayer)lower(state.high);
 return state;
}
/** A shortcut step is a source command, not an arc/acceleration subdivision.
 * This helper is the source-only fallback; native data uses native-preview-range. */
export function previewCommandStops(selection){
 const stops=[0];for(let i=0;i<selection.segments.length;i++)if(i+1===selection.segments.length||selection.segments[i+1].line!==selection.segments[i].line)stops.push(i+1);return stops;
}
export function previewStopIndex(stops,visibleCount){let low=0,high=stops.length;while(low<high){const mid=(low+high)>>>1;if(stops[mid]<=visibleCount)low=mid+1;else high=mid;}return Math.max(0,low-1);}
