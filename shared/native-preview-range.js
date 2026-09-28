// OrcaSlicer 2.4.2 / 8500fcd: ViewerImpl::update_view_full_range,
// update_enabled_entities, ViewRange and GCodeViewer::update_moves_slider.
// Array indices always refer to original native vertices, never spatial segments.
import {nativeFeaturePalette,previewCommandWindow} from './gcode-preview.js';
import {previewSliderState,applyPreviewSliderAction} from './preview-shortcuts.js';
export const nativePreviewOptions=Object.freeze([
 {key:'travels',label:'Travel',type:8,color:'#38489b'},
 {key:'wipes',label:'Wipe',type:9,color:'#ffff00'},
 {key:'retractions',label:'Retract',type:1,color:'#cd22d6'},
 {key:'unretractions',label:'Unretract',type:2,color:'#49adcf'},
 {key:'seams',label:'Seam',type:3,color:'#e6e6e6'},
 {key:'toolChanges',label:'Tool change',type:4,color:'#c1be63'},
 {key:'colorChanges',label:'Color change',type:5,color:'#da948b'},
 {key:'pausePrints',label:'Pause print',type:6,color:'#52f083'},
 {key:'customGCodes',label:'Custom G-code',type:7,color:'#e2d243'}
].map(Object.freeze));
export const nativeDefaultOptions=Object.freeze(Object.fromEntries(nativePreviewOptions.map(row=>[row.key,row.type===3])));
const optionForType=new Map(nativePreviewOptions.map(row=>[row.type,row]));
const option=v=>v[11]>0&&v[11]<8;
const ordered=(a,b)=>a<=b?[a,b]:[b,a];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const roleNames=nativeFeaturePalette.map(row=>row.name);
/** Data is already validated at the native worker boundary. This function also
 * rejects invalid control values and bounds every vertex traversal. */
export function nativePreviewRangeState(data,{firstLayer=0,lastLayer=data?.layers?.length-1,hiddenFeatures=[],options=nativeDefaultOptions,topLayerOnly=true,visibleRange=null}={}){
 if(!data||!Array.isArray(data.vertices)||data.vertices.length>500000||!Array.isArray(data.layers))throw new TypeError('Validated native preview data is required');
 if(!data.layers.length&&!data.vertices.length)return{full:[0,0],enabled:[0,0],visible:[0,0],ticks:[],tickIndex:0,segmentIds:[],eventIds:[],dimLowerLayers:false};
 if(!Number.isInteger(firstLayer)||!Number.isInteger(lastLayer)||firstLayer<0||lastLayer<firstLayer||lastLayer>=data.layers.length)throw new RangeError('Native layer range is invalid');
 if(typeof topLayerOnly!=='boolean'||Object.values(options).some(value=>typeof value!=='boolean')||Object.keys(options).some(key=>!Object.hasOwn(nativeDefaultOptions,key)))throw new TypeError('Native option visibility must contain known booleans');
 if(visibleRange!==null&&(!Array.isArray(visibleRange)||visibleRange.length!==2||visibleRange.some(value=>!Number.isSafeInteger(value)||value<0)))throw new RangeError('Native visible range must contain two nonnegative vertex IDs');
 const vertices=data.vertices,n=vertices.length,visibility={...nativeDefaultOptions,...options},hidden=new Set(hiddenFeatures);
 const visible=v=>v[11]===10?!hidden.has(roleNames[v[10]]):Boolean(visibility[optionForType.get(v[11])?.key]);
 let full=[0,0],enabled=[0,0],first=0;
 while(first<n&&(vertices[first][13]<firstLayer||!visible(vertices[first])))++first;
 if(first>0&&first<n&&vertices[first][11]===10)--first;
 if(first<n){
  const tailType=v=>(visibility.travels&&v[11]===8)||(visibility.wipes&&v[11]===9);
  if(visibility.travels||visibility.wipes)while(first>0&&tailType(vertices[first]))--first;
  let last=first;while(last<n&&vertices[last][13]<=lastLayer)++last;if(last!==first)--last;
  while(last!==first&&!visible(vertices[last]))--last;
  if(visibility.travels||visibility.wipes)while(last+1<n&&tailType(vertices[last])&&vertices[last][11]===vertices[last+1][11])++last;
  if(first!==last)full=ordered(first,last);
  if(topLayerOnly){
   let topFirst=full[0],shortened=false;while(topFirst<n&&(vertices[topFirst][13]<lastLayer||!visible(vertices[topFirst]))){++topFirst;shortened=true;}
   if(shortened)--topFirst;
   // Native uses unsigned indices; guard malformed/degenerate input instead of
   // reproducing underflow when a spiral first vertex has no predecessor.
   if(data.spiralVase&&firstLayer>0&&firstLayer===lastLayer)topFirst=Math.max(0,topFirst-1);
   enabled=ordered(topFirst,full[1]);
  }else enabled=[...full];
 }
 const range=visibleRange?ordered(...visibleRange).map(value=>clamp(value,...enabled)):[...enabled];
 const ticks=[];
 for(let i=enabled[0];i<=enabled[1]&&i<n;i++){
  const line=vertices[i][12];if(ticks.length&&ticks.at(-1).line===line)ticks.at(-1).vertexIndex=i;else ticks.push({vertexIndex:i,line});
 }
 const target=range[1];let tickIndex=ticks.findIndex(tick=>tick.vertexIndex>=target);if(tickIndex<0)tickIndex=Math.max(0,ticks.length-1);
 let start=topLayerOnly?full[0]:range[0],end=range[1];
 if(vertices[end]&&option(vertices[end])&&end<n-1)++end;
 if(data.spiralVase&&firstLayer>0&&firstLayer===lastLayer)start=Math.max(0,start-1);
 const segmentIds=[],eventIds=[];
 for(let i=start;i<end&&i<n;i++){
  const v=vertices[i];if((v[26]!==1&&!option(v))||!visible(v))continue;
  if(option(v))eventIds.push(i);else if([8,9,10].includes(v[11]))segmentIds.push(i);
 }
 return{full,enabled,visible:range,ticks,tickIndex,segmentIds,eventIds,dimLowerLayers:topLayerOnly&&full[1]!==range[1]};
}
export function nativePreviewSelection(parsed,state){
 const wanted=new Set(state.segmentIds),indices=[],segments=[];
 parsed.segments.forEach((segment,index)=>{if(wanted.has(segment.nativeStartVertex)){indices.push(index);segments.push(segment);}});
 return{indices,segments};
}
export function nativePreviewCommandWindow(parsed,state){
 const vertexIndex=state.visible[1],v=parsed.native.data.vertices[vertexIndex];
 if(!v)return{...previewCommandWindow(parsed,{indices:[],segments:[]}),nativeVertexIndex:null,event:null};
 const index=parsed.segments.findIndex(segment=>segment.nativeEndVertex===vertexIndex),line=v[12];
 // A stationary event need not have a spatial segment. Reuse bounded raw-line
 // formatting while preserving its actual native command/vertex identity.
 const current={line,arc:index>=0?parsed.segments[index].arc:false};
 const window=previewCommandWindow(parsed,line>0?{indices:[index],segments:[current]}:{indices:[],segments:[]});
 return{...window,segmentIndex:index>=0?index:null,nativeVertexIndex:vertexIndex,event:optionForType.get(v[11])?.label??null,firstLine:parsed.native.data.vertices[state.enabled[0]]?.[12]||null,lastLine:line||null};
}
export function nativePreviewVertexDimmed(data,state,vertexIndex,lastLayer){return state.dimLowerLayers&&data.vertices[vertexIndex][13]<lastLayer&&(!data.spiralVase||vertexIndex!==state.enabled[0]);}

/** Native layer events rebuild the horizontal range. A thumb that was at its
 * minimum remains there; otherwise the new range ends at its maximum. */
export function nativePreviewStep(data,current,action,settings){
 const control={...settings,firstLayer:current.low,lastLayer:current.high},before=nativePreviewRangeState(data,{...control,visibleRange:current.nativeCursor==null&&current.nativeStart==null?null:[current.nativeStart??0,current.nativeCursor??Number.MAX_SAFE_INTEGER]}),state=previewSliderState({...current,maxLayer:data.layers.length-1,move:before.tickIndex,maxMove:Math.max(0,before.ticks.length-1)}),next=applyPreviewSliderAction(state,action),changed=next.low!==current.low||next.high!==current.high;
 const after=changed?nativePreviewRangeState(data,{...settings,firstLayer:next.low,lastLayer:next.high}):before;
 const index=changed?(next.move===0?0:after.ticks.length-1):Math.min(next.move,after.ticks.length-1);
 return{...next,nativeStart:changed?null:current.nativeStart,nativeCursor:index===after.ticks.length-1?null:after.ticks[index]?.vertexIndex??null,changed};
}
/** Exact ViewRange clamping order used by native visibility toggles. A partial
 * range must not silently grow when a hidden role is enabled again. */
export function nativePreviewVisibilityTransition(data,previous,nextSettings,{kind='role'}={}){
 if(!['role','option'].includes(kind))throw new RangeError('Unknown native visibility transition');
 const next=nativePreviewRangeState(data,nextSettings),oldEnabledClamped=previous.enabled.map(value=>clamp(value,...next.full));
 let range=previous.visible.map(value=>clamp(value,...oldEnabledClamped)).map(value=>clamp(value,...next.enabled));
 if(kind==='option'&&(previous.enabled[0]!==next.enabled[0]||previous.enabled[1]!==next.enabled[1])){
  if(previous.enabled.every((value,index)=>value===range[index]))range=[...next.enabled];
  else if(nextSettings.topLayerOnly!==false&&next.enabled[0]<range[0])range[0]=next.enabled[0];
 }
 return nativePreviewRangeState(data,{...nextSettings,visibleRange:range});
}
