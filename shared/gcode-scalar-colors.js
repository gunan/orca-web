// OrcaSlicer 8500fcd libvgcode ColorRange.{hpp,cpp}, Types.cpp and
// ViewerImpl::round_to_bin/update_ranges. No timing is inferred here.
const f=Math.fround;
export const nativeScalarPalette=Object.freeze([[11,44,122],[19,89,133],[28,136,145],[4,214,15],[170,242,0],[252,249,3],[245,206,10],[227,136,32],[209,104,48],[194,82,60],[148,38,22]].map(rgb=>Object.freeze(rgb)));
export const previewScalarModes=Object.freeze({height:{label:'Layer height',unit:'mm'},width:{label:'Line width',unit:'mm'},flow:{label:'Flow',unit:'mm³/s'}});
export function nativeRangeBin(value){
 if(!Number.isFinite(value)||value<0)throw new RangeError('Scalar value must be finite and nonnegative');
 value=f(value);if(!Number.isFinite(value))throw new RangeError('Scalar value exceeds native float range');
 const scale=[100,1000,10000,100000,1000000],inverse=[.01,.001,.0001,.00001,.000001],threshold=[.095,.0095,.00095,.000095,.0000095].map(f);
 let i=0;while(i<4&&value<threshold[i])i++;
 const scaled=f(value*scale[i]);
 if(!Number.isFinite(scaled)||scaled>=2**63)throw new RangeError('Scalar value exceeds native bin range');
 return f(f(Math.floor(scaled+.5))*f(inverse[i]));
}
export function previewScalarRange(parsed,attributes,mode,{hiddenFeatures=[]}={}){
 if(!previewScalarModes[mode])throw new RangeError('Unknown preview scalar mode');
 let min=Infinity,max=-Infinity,count=0,available=0,total=0;
 parsed.segments.forEach((segment,index)=>{
  if(segment.kind!=='extrusion')return;total++;
  const value=attributes.segments[index]?.[mode];if(!Number.isFinite(value))return;
  let v;try{v=nativeRangeBin(value);}catch{return;}available++;
  // Native ranges cover the whole file, including hidden normal roles. Custom
  // exclusion affects width/flow, while height continues to include Custom.
  if(mode!=='height'&&segment.feature==='Custom'&&hiddenFeatures.includes('Custom'))return;
  if(v!==min&&v!==max)count++;min=Math.min(min,v);max=Math.max(max,v);
 });
 return {min:count?min:null,max:count?max:null,count,available,total,missing:total-available};
}
export function nativeScalarColor(value,range){
 if(!Number.isFinite(value)||range.min===null||range.max===null)return '#b8bdc0';
 const min=f(range.min),max=f(range.max),step=f(f(max-min)/10),v=f(Math.max(min,Math.min(max,f(value))));
 const t=step>0?f(f(v-min)/step):0,low=Math.min(10,Math.max(0,Math.trunc(t))),high=Math.min(10,low+1),local=f(Math.max(0,Math.min(1,f(t-low)))),inverse=f(1-local);
 const rgb=nativeScalarPalette[low].map((value,index)=>Math.trunc(f(f(inverse*value)+f(local*nativeScalarPalette[high][index]))));
 return '#'+rgb.map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function nativeScalarLegend(range){
 if(!range.count)return [];
 if(range.count===1)return [range.min];
 if(range.count===2)return [range.min,range.max];
 const step=f(f(range.max-range.min)/10);
 return nativeScalarPalette.map((_,index)=>f(range.min+f(index*step)));
}
export function nativeScalarLegendRows(range){
 const values=nativeScalarLegend(range);
 return values.map((value,index)=>({value,color:'#'+nativeScalarPalette[values.length===2&&index===1?10:index].map(channel=>channel.toString(16).padStart(2,'0')).join('')}));
}
