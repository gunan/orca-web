// OrcaSlicer8500fcd: libvgcode ViewerImpl.cpp283 and Types.hpp extrusion roles.
// Geometry interpretation stays in gcode.js; helpers here only select/render it.
const roleRows=[
 ['Undefined',[230,179,179]],['Inner wall',[255,230,77]],['Outer wall',[255,125,56]],['Overhang wall',[31,31,255]],
 ['Sparse infill',[176,48,41]],['Internal solid infill',[150,84,204]],['Top surface',[240,64,64]],['Ironing',[255,140,105]],
 ['Bridge',[77,128,186]],['Gap infill',[255,255,255]],['Skirt',[0,135,110]],['Support',[0,255,0]],['Support interface',[0,128,0]],
 ['Prime tower',[179,227,171]],['Custom',[94,209,148]],['Bottom surface',[102,92,199]],['Internal Bridge',[77,128,186]],
 ['Brim',[0,59,110]],['Support transition',[0,64,0]],['Multiple',[128,128,128]]
];
export const nativeFeaturePalette=Object.freeze(roleRows.map(([name,rgb],order)=>Object.freeze({name,order,color:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')})));
const byName=new Map(nativeFeaturePalette.map(item=>[item.name,item]));
// GCodeProcessor.cpp3838 classifies a spatial move with negative E as Travel.
// The existing parser keeps that E sign as 'retraction'; no event markers are added.
export const nativeMotionColors=Object.freeze({travel:'#38489b',retraction:'#38489b'});
export function nativeFeatureColor(name){return(byName.get(name)||nativeFeaturePalette[0]).color;}
export function previewFeatureLegend(parsed){const counts=new Map();for(const segment of parsed?.segments||[])if(segment.kind==='extrusion')counts.set(segment.feature,(counts.get(segment.feature)||0)+1);return[...counts].map(([name,count])=>({name,count,color:nativeFeatureColor(name),known:byName.has(name),order:byName.get(name)?.order??0})).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));}
/** Selection contains original indices, so hiding a role cannot move a scrubbed
 * command forward to an unrelated later move. No E/time estimates are inferred. */
export function selectPreviewSegments(parsed,{firstLayer=0,lastLayer=parsed?.layers?.length-1,hiddenFeatures=[],showTravel=false}={}){
 if(!parsed||!Array.isArray(parsed.segments)||!Array.isArray(parsed.layers))throw new TypeError('A parsed G-code result is required');
 if(!Number.isInteger(firstLayer)||!Number.isInteger(lastLayer)||firstLayer<0||lastLayer<firstLayer||lastLayer>=parsed.layers.length){if(!parsed.layers.length&&firstLayer===0&&lastLayer===-1)return{segments:[],indices:[]};throw new RangeError('Preview layer range is invalid');}
 const hidden=new Set(hiddenFeatures),segments=[],indices=[];parsed.segments.forEach((segment,index)=>{if(segment.layer>=firstLayer&&segment.layer<=lastLayer&&(segment.kind==='extrusion'?!hidden.has(segment.feature):showTravel)){segments.push(segment);indices.push(index);}});return{segments,indices};
}
export function previewVisibleCount(selection,cursor=null){if(cursor===null)return selection.indices.length;if(!Number.isInteger(cursor)||cursor< -1)throw new RangeError('Preview cursor must be an original segment index');let low=0,high=selection.indices.length;while(low<high){const middle=(low+high)>>>1;if(selection.indices[middle]<=cursor)low=middle+1;else high=middle;}return low;}
export function previewCursorForCount(selection,count){if(!Number.isInteger(count)||count<0||count>selection.indices.length)throw new RangeError('Visible segment count is outside the selected range');return count===selection.indices.length?null:count===0?-1:selection.indices[count-1];}
export function previewCommandWindow(parsed,selection,cursor=null,{lineCount=25,maxLineCharacters=4096}={}){
 if(!Number.isInteger(lineCount)||lineCount<1||lineCount>81)throw new RangeError('G-code window must contain 1–81 lines');
 if(!Number.isInteger(maxLineCharacters)||maxLineCharacters<1||maxLineCharacters>16384)throw new RangeError('G-code line display limit is invalid');
 const source=parsed.source,lines=source?.lines||[],count=previewVisibleCount(selection,cursor),current=count?selection.segments[count-1]:null,currentLine=current?.line||null;
 if(currentLine!==null&&(!Number.isInteger(currentLine)||currentLine<1||currentLine>lines.length))return{rows:[],currentLine:null,firstLine:null,lastLine:null,visibleCount:count,unavailable:true};
 const center=currentLine||selection.segments[0]?.line||1,start=Math.max(1,Math.min(center-Math.floor(lineCount/2),lines.length-lineCount+1)),end=Math.min(lines.length,start+lineCount-1),rows=[];
 for(let line=start;line<=end;line++){const raw=lines[line-1],text=raw.slice(0,maxLineCharacters),semicolon=text.indexOf(';'),code=semicolon<0?text:text.slice(0,semicolon),match=code.match(/^(\s*)(\S*)(.*)$/);rows.push({line,text,command:(match?.[1]||'')+(match?.[2]||''),parameters:match?.[3]||'',comment:semicolon<0?'':text.slice(semicolon),selected:line===currentLine,truncated:raw.length>maxLineCharacters});}
 return{rows,currentLine,segmentIndex:count?selection.indices[count-1]:null,firstLine:count?selection.segments[0].line:null,lastLine:currentLine,visibleCount:count,unavailable:!source,sourceComplete:source?.complete===true,processedThroughLine:source?.processedThroughLine||0,arc:current?.arc===true};
}
