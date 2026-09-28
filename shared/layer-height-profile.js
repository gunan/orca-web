// OrcaSlicer 2.4.2 / 8500fcd Slicing.cpp:layer_height_profile_from_ranges.
const EPSILON=.0001;
const approximate=(a,b)=>Math.abs(a-b)<EPSILON;
export function layerHeightProfileFromRanges(context,{editable=true}={}){
 if(!context||!['objectHeight','layerHeight','firstLayerHeight'].every(key=>Number.isFinite(context[key])&&context[key]>0))throw new Error('Layer profile initialization needs positive native heights');
 const shrink=context.shrinkageCompensationZ??1,top=context.objectHeight,printTop=top*shrink;if(!Number.isFinite(shrink)||shrink<=0||shrink>1000)throw new Error('Invalid native Z shrinkage compensation');
 const ranges=context.ranges||[];if(!Array.isArray(ranges)||ranges.length>1024)throw new Error('Too many height ranges for profile initialization');
 const sorted=ranges.map(range=>{const height=Number(range.settings?.layer_height);if(![range.minZ,range.maxZ,height].every(Number.isFinite)||range.minZ<0||range.maxZ<=range.minZ||height<=0)throw new Error('Invalid height range for profile initialization');return{lo:range.minZ,hi:Math.min(range.maxZ,printTop),height};}).sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
 const trimmed=context.firstLayerFixed?[{lo:0,hi:context.firstLayerHeight,height:context.firstLayerHeight}]:[];
 for(const range of sorted){const lo=trimmed.length?Math.max(range.lo,trimmed.at(-1).hi):range.lo;if(lo+EPSILON<range.hi)trimmed.push({...range,lo});}
 const result=[],lastZ=()=>result.length?result.at(-2):0;
 function append(z,height){if(result.length&&approximate(result.at(-1),height)){if(approximate(result.at(-2),z))return;if(result.length>=4&&approximate(result.at(-3),height)){result[result.length-2]=z;return;}}result.push(z,height);}
 for(const range of trimmed){const z=lastZ();if(range.lo>z+EPSILON){append(z,context.layerHeight);append(range.lo,context.layerHeight);}append(range.lo,range.height);append(range.hi,range.height);}
 if(lastZ()<top){append(lastZ(),context.layerHeight);append(top,context.layerHeight);}
 if(editable){if(result.at(-2)>top+.001)throw new Error('This object has no editable layer band above its fixed first layer');if(result.length===4)result.splice(2,0,(result[0]+result[2])/2,(result[1]+result[3])/2);}
 return result;
}
