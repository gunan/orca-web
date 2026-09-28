import {nativeFixed} from './native-format.js';
export {nativeFixed} from './native-format.js';
import {nativeFeaturePalette} from './gcode-preview.js';
import {nativeVertexAttributes} from './native-preview-adapter.js';
const f=Math.fround;
export function nativeElapsedLabel(value){let remaining=f(value);const days=Math.trunc(f(remaining/86400));remaining=f(remaining-f(days*86400));const hours=Math.trunc(f(remaining/3600));remaining=f(remaining-f(hours*3600));const minutes=Math.trunc(f(remaining/60));remaining=f(remaining-f(minutes*60));return days?`${days}d ${hours}h ${minutes}m ${Math.trunc(remaining)}s`:hours?`${hours}h ${minutes}m ${Math.trunc(remaining)}s`:minutes?`${minutes}m ${Math.trunc(remaining)}s`:remaining>1?`${Math.trunc(remaining)}s`:`${nativeFixed(remaining,6)}s`;}
const roleName=id=>id===0?'Unknown':id===16?'Internal bridge':nativeFeaturePalette[id].name;
const names=['Noop','Retract','Unretract','Seam','Tool Change','Color Change','Pause Print','Custom G-code','Travel','Wipe','Extrude'];
const validIndex=(data,id)=>Number.isInteger(id)&&id>=0&&id<data.vertices.length;
export const nativeToolMarkerScope='Native default hotend model; printer-specific hotend assets are not yet selected.';
export function nativeToolMarkerVisible(previous,state){return Boolean(state?.ticks?.length&&(previous||state.visible[1]!==state.full[1]));}
export function nativeEstimatedTimes(data,timeMode='normal'){
 const slot=data.modes.findIndex(mode=>mode.name===timeMode);if(slot<0)throw new RangeError('Native timing mode is unavailable');
 let total=0;return Float32Array.from(data.vertices,vertex=>(total=f(total+vertex[16+slot])));
}
/** GCodeViewer::Marker uses the selected vertex for geometry, but substitutes the
 * preceding vertex for seam properties in every view except FeatureType. */
export function nativeToolPosition(data,id,{mode='feature',timeMode='normal',estimatedTimes}={}){
 if(!validIndex(data,id))return null;
 const selected=data.vertices[id],propertyId=mode!=='feature'&&selected[11]===3&&id>0?id-1:id,v=data.vertices[propertyId],isExtrusion=v[11]===10;
 const a=nativeVertexAttributes(data,propertyId,timeMode),slot=data.modes.findIndex(m=>m.name===timeMode),position=v.slice(0,3),max=Math.round(Math.max(...position)),precision=max>9999?1:max>999?2:3;
 const value=(key,digits,unit='',extrusionOnly=false)=>extrusionOnly&&!isExtrusion?'N/A':Number.isFinite(a[key])?`${nativeFixed(a[key],digits)}${unit?' '+unit:''}`:'Unavailable';
 const detail={feature:isExtrusion?roleName(v[10]):v[11]?names[v[11]]:'N/A',height:`Height: ${value('height',2,'',true)}`,width:`Width: ${value('width',2,'',true)}`,flow:`Flow: ${value('flow',2,'',true)}`,fanSpeed:`Fan: ${value('fanSpeed',0)}`,temperature:`Temperature: ${value('temperature',0)}`,layerTime:`Layer Time: ${value('layerTime',1)}`,layerTimeLog:`Layer Time: ${value('layerTime',1)}`,tool:`Tool: ${v[14]+1}`,color:`Color: ${v[15]+1}`,acceleration:`Acceleration: ${value('acceleration',0)}`,jerk:`Jerk: ${value('jerk',1)}`,pressureAdvance:`PA: ${value('pressureAdvance',4)}`}[mode]||'';
 const elapsed=(estimatedTimes||nativeEstimatedTimes(data,timeMode))[propertyId],duration=v[16+slot];
 return {selectedVertexId:id,propertyVertexId:propertyId,sourceLine:v[12],markerPosition:selected.slice(0,3),position,positionText:position.map(x=>nativeFixed(x,precision)),speedText:value('speed',0),detail,elapsed,duration,rows:[['Type',names[v[11]]],['Line Type',isExtrusion?roleName(v[10]):'N/A'],['Width',value('width',3,'mm',true)],['Height',value('height',3,'mm',true)],['Layer',String(v[13]+1)],['Speed',value('speed',1,'mm/s')],['Acceleration',value('acceleration',0,'mm/s²')],['Jerk',value('jerk',1,'mm/s')],['Flow rate',value('flow',3,'mm³/s',true)],['Fan speed',value('fanSpeed',0,'%')],['Temperature',value('temperature',0,'°C')],['Pressure Advance',value('pressureAdvance',4)],['Time',`${nativeElapsedLabel(elapsed)} (${nativeFixed(duration,3)}s)`]]};
}
/** Original ENABLE_ACTUAL_SPEED_DEBUG=1 path: collect one source command's native
 * interpolation vertices, include the previous endpoint, omit its trailing seam,
 * then preserve endpoints while compressing speeds rounded to one decimal. */
export function nativeActualSpeedProfile(data,id,{enabledEnd=data.vertices.length-1}={}){
 if(!validIndex(data,id)||id===enabledEnd||![3,8,9,10].includes(data.vertices[id][11]))return null;
 const vertices=data.vertices,current=vertices[id];let start=id,end=id;
 while(start>0){start--;if(vertices[start][12]!==current[12])break;}
 while(end<vertices.length-1){end++;if(vertices[end][12]!==current[12])break;}
 if(end>0&&vertices[end-1][11]===3)end--;
 // The original asserts this bound; invalid/degenerate native data is unavailable.
 if(end-start<2)return null;
 const points=[];let total=0;
 for(let i=start;i<end;i++){
  const vertex=vertices[i];let length=0;
  if(i>start){const delta=vertex.slice(0,3).map((v,k)=>f(v-vertices[i-1][k])),squares=delta.map(v=>f(v*v));length=f(Math.sqrt(f(f(squares[0]+squares[1])+squares[2])));}
  total=f(total+length);if(i===start||length>1e-4)points.push({position:total,speed:vertex[6],internal:vertex[16]===0});
 }
 const same=(a,b)=>Math.round(f(a*10))===Math.round(f(b*10)),compressed=[];
 if(points.length){compressed.push(points[0]);for(let i=1;i<points.length;i++){const prev=same(points[i].speed,points[i-1].speed),next=i+1<points.length&&same(points[i].speed,points[i+1].speed);if(!prev){if(!same(compressed.at(-1).speed,points[i-1].speed))compressed.push(points[i-1]);compressed.push(points[i]);}else if(!next)compressed.push(points[i]);}if(compressed.at(-1).position!==points.at(-1).position)compressed.push(points.at(-1));}
 return {sourceLine:current[12],startVertex:start,endVertexExclusive:end,points:compressed};
}
