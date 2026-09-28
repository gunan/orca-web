// Native geometry provenance: OrcaSlicer8500fcd LibVGCodeWrapper.cpp191,
// ViewerImpl.cpp911 and SegmentTemplate.cpp. Known linear extrusion subset.
const f=Math.fround;
const point=p=>p.map(f);
const equal=(a,b)=>a.every((value,index)=>value===b[index]);
const subtract=(a,b)=>a.map((value,index)=>f(value-b[index]));
const dot=(a,b)=>f(f(f(a[0]*b[0])+f(a[1]*b[1]))+f(a[2]*b[2]));
const validDimension=value=>Number.isFinite(value)&&value>0;
export const nativeSegmentIndices=Object.freeze([0,1,2,0,2,3,0,3,4,0,4,5,0,5,6,0,6,1,5,4,7,5,7,6]);

function hasUnrepresentedEvent(lines,first,last){
 for(let line=first+1;line<last;line++){
  const text=lines[line-1]||'',code=text.split(';',1)[0].trim();
  if(/^T\s*\d+\b|^M1020\b/i.test(code)||/^\s*;\s*(?:COLOR_CHANGE|PAUSE_PRINT|CUSTOM_GCODE)\b/.test(text))return true;
  if(/^G[01]\b/i.test(code)&&/\bE\s*[-+\d.]/i.test(code)&&!/[XYZ]\s*[-+\d.]/i.test(code))return true;
 }
 return false;
}

/** Native endpoint dimensions/turn angles for known linear extrusion segments.
 * G-code attributes and original indices stay external; no parser mutation.
 * Unknown paths/events remain line-rendered rather than acquiring guessed width.
 */
export function buildPreviewVolumeData(parsed,attributes){
 if(!parsed||!Array.isArray(parsed.segments)||!Array.isArray(attributes?.segments))throw new TypeError('Parsed segments and native attributes are required');
 const vertices=[],pairs=new Array(parsed.segments.length).fill(null),lines=parsed.source?.lines||[];
 let previous=null,knownCount=0;
 for(let index=0;index<parsed.segments.length;index++){
  const segment=parsed.segments[index],a=attributes.segments[index];
  const eligible=segment.kind==='extrusion'&&!segment.arc&&validDimension(a?.height)&&validDimension(a?.width)&&validDimension(a?.mm3PerMm)&&segment.start.every(Number.isFinite)&&segment.end.every(Number.isFinite);
  if(!eligible){previous=null;continue;}
  const start=point(segment.start),end=point(segment.end);if(equal(start,end)){previous=null;continue;}
  const joined=previous&&previous.index===index-1&&equal(previous.end,start)&&previous.feature===segment.feature&&previous.mm3PerMm===a.mm3PerMm&&!hasUnrepresentedEvent(lines,previous.line,segment.line);
  const makeVertex=(position,type,sourceIndex)=>({position,type,height:a.height,width:a.width,sourceIndex});
  if(!joined){
   // Break continuity across omitted events/missing paths. The native processor
   // supplies those vertices; this partial geometry pipeline must not bridge them.
   if(vertices.length&&!equal(vertices.at(-1).position,start))vertices.push(makeVertex(start,'Noop',index));
   vertices.push(makeVertex(start,'Extrude',index));
  }
  const from=vertices.length-1;vertices.push(makeVertex(end,'Extrude',index));pairs[index]=[from,vertices.length-1];knownCount++;
  previous={index,end,feature:segment.feature,mm3PerMm:a.mm3PerMm,line:segment.line};
 }
 const validLines=vertices.map((v,index)=>index+1<vertices.length&&vertices[index+1].type===v.type&&!equal(v.position,vertices[index+1].position));
 const converted=vertices.map((v,index)=>{
  const before=index>0&&validLines[index-1]?subtract(v.position,vertices[index-1].position):[0,0,0];
  const after=validLines[index]?subtract(vertices[index+1].position,v.position):[0,0,0];
  const angle=f(Math.atan2(f(f(before[0]*after[1])-f(before[1]*after[0])),dot(before,after)));
  return{position:[v.position[0],v.position[1],v.type==='Extrude'?f(v.position[2]-f(.5*v.height)):v.position[2]],hwa:[v.height,v.width,angle],sourceIndex:v.sourceIndex};
 });
 return {segments:pairs.map(pair=>pair?{start:converted[pair[0]],end:converted[pair[1]]}:null),knownCount,totalExtrusions:parsed.segments.filter(segment=>segment.kind==='extrusion').length};
}
