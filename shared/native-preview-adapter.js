import {nativeColorPrintLayers,nativeColorPrintColor} from './native-filament-preview.js';
import {validateNativePreview} from './native-preview-data.js';
import {nativeFeaturePalette,nativeFeatureColor,nativeMotionColors} from './gcode-preview.js';
import {nativePreviewOptions} from './native-preview-range.js';
import {nativeScalarColor} from './gcode-scalar-colors.js';
const f=Math.fround,hex=rgb=>'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
export const nativeTimingModes=Object.freeze({actualFlow:{label:'Actual flow',unit:'mm³/s'},layerTime:{label:'Layer time',unit:'s'},layerTimeLog:{label:'Layer time logarithmic',unit:'s'}});
export const nativeScalarModes=Object.freeze({speed:{label:'Speed',unit:'mm/s',precision:0},actualSpeed:{label:'Actual speed',unit:'mm/s',precision:0},fanSpeed:{label:'Fan speed',unit:'%',precision:0},temperature:{label:'Temperature',unit:'°C',precision:0},pressureAdvance:{label:'Pressure advance',unit:'',precision:3},acceleration:{label:'Acceleration',unit:'mm/s²',precision:0},jerk:{label:'Jerk',unit:'mm/s',precision:1}});
const motionScalarModes=new Set(['speed','actualSpeed','acceleration','jerk']);
export function nativeScalarRangeKey({travels=false,wipes=false}={}){return `travel${travels?'Visible':'Hidden'}Wipe${wipes?'Visible':'Hidden'}`;}
/** Native vertex identity is separate from both raw spatial and display indices. */
export function adaptNativePreview(base,data,{timeMode='normal'}={}){
 validateNativePreview(data);if(!base?.source?.complete||!Array.isArray(base.source.lines))throw new TypeError('Complete source text is required for native command mapping');
 const modeIndex=data.modes.findIndex(mode=>mode.name===timeMode);if(modeIndex<0)throw new RangeError('Native timing mode is unavailable');
 for(const v of data.vertices)if(v[12]>base.source.lines.length)throw new RangeError('Native source line is outside the downloaded G-code');
 const segments=[],attributes=[],volumes=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},layerRows=data.layers.map(layer=>({index:layer.id,number:layer.id+1,nativeNumber:layer.id,z:layer.z,preamble:false,startSegment:0,endSegment:0,extrusionSegments:0}));
 const endVertexToSegment=new Map(),events=[];
 for(let i=0;i<data.vertices.length;i++){
  const start=data.vertices[i],end=data.vertices[i+1];
  if(start[11]>0&&start[11]<8)events.push({vertexIndex:i,type:start[11],position:start.slice(0,3),line:start[12],layer:start[13]});
  if(start[26]!==1||!end||![8,9,10].includes(start[11]))continue;
  const index=segments.length,kind=end[11]===10?'extrusion':end[11]===9?'wipe':'travel',a=start.slice(0,3),b=end.slice(0,3),line=end[12];
  if(!line)continue;
  const sourceCode=base.source.lines[line-1].split(';',1)[0].trim(),layer=layerRows[end[13]];
  if(!layer)throw new RangeError('Native segment layer is invalid');
  const segment={start:a,end:b,kind,feature:nativeFeaturePalette[end[10]].name,layer:end[13],line,tool:end[14],speed:end[5],feedrate:f(end[5]*60),length:Math.hypot(...a.map((v,j)=>b[j]-v)),arc:/^G[23](?:\s|[XYZIJKRFE])/i.test(sourceCode),nativeStartVertex:i,nativeEndVertex:i+1};
  if(layer.endSegment===0)layer.startSegment=index;layer.endSegment=index+1;if(kind==='extrusion')layer.extrusionSegments++;
  segments.push(segment);attributes.push(nativeVertexAttributes(data,i+1,timeMode));endVertexToSegment.set(i+1,index);
  for(const point of[a,b])point.forEach((value,axis)=>{bounds.min[axis]=Math.min(bounds.min[axis],value);bounds.max[axis]=Math.max(bounds.max[axis],value);});
  if(start[22]>0&&start[23]>0&&end[22]>0&&end[23]>0){const point=(v,vertex)=>({position:[v[0],v[1],v[21]],hwa:[v[22],v[23],v[24],v[25]],sourceIndex:endVertexToSegment.get(vertex)??index,nativeVertexIndex:vertex});volumes.push({start:point(start,i),end:point(end,i+1)});}else volumes.push(null);
 }
 const volumeData={segments:volumes,knownCount:volumes.filter((v,index)=>v&&segments[index].kind==='extrusion').length,totalExtrusions:segments.filter(s=>s.kind==='extrusion').length,solidCount:volumes.filter(Boolean).length,totalMotions:segments.length,travelCount:volumes.filter((v,index)=>v&&segments[index].kind==='travel').length,wipeCount:volumes.filter((v,index)=>v&&segments[index].kind==='wipe').length};
 return{...base,segments,layers:layerRows,bounds:segments.length?bounds:null,features:[...new Set(segments.filter(s=>s.kind==='extrusion').map(s=>s.feature))],tools:[...new Set(segments.map(s=>s.tool))],native:{data,timeMode,modeIndex,events,volumeData,attributes,colorPrintLayers:nativeColorPrintLayers(data)},truncated:false,warnings:data.nativeWarnings.map(w=>w.message),assumptions:['Geometry, motion timing, layer durations and material statistics are processed by pinned OrcaSlicer2.4.2 native code.','Native stationary events retain their original vertex and source-line identities; visibility follows the native option controls.','Commanded machine motion is processed as in the native G-code viewer; physical firmware/macros/bed leveling are not simulated.']};
}
/** The color path needs one value, not a fresh inspector dictionary per endpoint. */
export function nativeVertexScalar(data,index,mode,timeMode='normal'){
 const v=data.vertices[index];switch(mode){
  case 'height':return v[3];case 'width':return v[4];case 'speed':return v[5];case 'actualSpeed':return v[6];
  case 'fanSpeed':return v[8];case 'temperature':return v[9];case 'pressureAdvance':return v[18];
  case 'acceleration':return v[19];case 'jerk':return v[20];case 'flow':return f(v[5]*v[7]);case 'actualFlow':return f(v[6]*v[7]);
  case 'layerTime':case 'layerTimeLog':return data.layers[v[13]].seconds[data.modes.findIndex(item=>item.name===timeMode)];
  default:return undefined;
 }
}
export function nativeVertexAttributes(data,index,timeMode='normal'){
 const v=data.vertices[index],modeIndex=data.modes.findIndex(mode=>mode.name===timeMode),layerTime=data.layers[v[13]].seconds[modeIndex];
 return{height:v[3],width:v[4],flow:f(v[5]*v[7]),actualFlow:f(v[6]*v[7]),mm3PerMm:v[7],layerTime,layerTimeLog:layerTime,speed:v[5],actualSpeed:v[6],fanSpeed:v[8],temperature:v[9],pressureAdvance:v[18],acceleration:v[19],jerk:v[20],nativeVertexIndex:index,reason:null};
}
export function nativePreviewRange(parsed,mode,{hiddenFeatures=[],options={}}={}){
 const {data,timeMode,attributes}=parsed.native,isScalar=Object.hasOwn(nativeScalarModes,mode),motions=motionScalarModes.has(mode),source=isScalar?data.scalarRanges?.[nativeScalarRangeKey(options)]?.[mode]:data.ranges?.[timeMode]?.[hiddenFeatures.includes('Custom')?'customHidden':'customVisible']?.[mode];
 const scope=motions?'motion':'extrusion';
 if(!source)return{min:null,max:null,count:0,available:0,total:0,missing:0,values:[],palette:[],scope,unavailable:true};
 let total=0,available=0;parsed.segments.forEach((segment,index)=>{
  if(segment.kind!=='extrusion'&&!(motions&&((segment.kind==='travel'&&options.travels)||(segment.kind==='wipe'&&options.wipes))))return;
  total++;if(Number.isFinite(attributes[index]?.[mode]))available++;
 });
 return{...source,available,total,missing:total-available,native:true,mode,scope};
}
export function nativePreviewLegendRows(range){const count=range?.values?.length||0;if(!count)return[];return range.values.map((value,index)=>({value,color:hex(range.palette[count===2&&index===1?range.palette.length-1:index])}));}
export function nativeVertexColor(parsed,index,mode,range){
 const data=parsed.native.data,v=data.vertices[index];
 if(v[11]===9&&!motionScalarModes.has(mode))return '#ffff00';
 if(v[11]===8&&!['tool','color','summary'].includes(mode)&&!motionScalarModes.has(mode))return nativeMotionColors.travel;
 if(v[11]<8)return nativePreviewOptions.find(option=>option.type===v[11])?.color||'#404040';
 if(mode==='feature')return nativeFeatureColor(nativeFeaturePalette[v[10]].name);
 if(mode==='color'||mode==='summary')return nativeColorPrintColor(data,index,parsed.native.colorPrintLayers);
 if(mode==='tool'){const rgb=data.toolsColors?.[v[14]];return rgb?hex(rgb):'#404040';}
 if(mode==='layerTime'||mode==='layerTimeLog'){const rgb=range?.layerColors?.[v[13]];return rgb?hex(rgb):'#b8bdc0';}
 return range?nativeScalarColor(nativeVertexScalar(data,index,mode,parsed.native.timeMode),range):'#b8bdc0';
}
