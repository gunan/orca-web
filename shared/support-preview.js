import {parseGcode} from './gcode.js';
export const supportSegment=segment=>segment.kind==='extrusion'&&/\bsupport\b/i.test(segment.feature);
export function parseSupportPreview(text,{inputTruncated=false}={}){
 const parsed=parseGcode(text,{inputTruncated,maxSegments:500000}),segments=parsed.segments.filter(supportSegment),layers=[...new Set(segments.map(segment=>segment.layer))].map(index=>parsed.layers[index]),features=[...new Set(segments.map(segment=>segment.feature))];
 const bounds=segments.length?{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}:null;
 let length=0,extrusion=0;for(const segment of segments){length+=segment.length;extrusion+=segment.extrusion;for(const point of [segment.start,segment.end])point.forEach((value,axis)=>{bounds.min[axis]=Math.min(bounds.min[axis],value);bounds.max[axis]=Math.max(bounds.max[axis],value);});}
 return{segments,layers,features,bounds,truncated:parsed.truncated,warnings:parsed.warnings,metrics:{segments:segments.length,pathLengthMm:length,filamentMm:extrusion}};
}
