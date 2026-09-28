/** Native painting raycasts at one screen pixel between pointer events before
 * joining surface hits with capsules. Keep facet transitions and misses, so a
 * fast drag cannot bridge a hole or replace a curved surface by one chord. */
export function projectPaintStroke(from,to,raycast,{maxSamples=8192}={}){
 const point=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite);
 if(!point(to)||from&&!point(from))throw new Error('Stroke coordinates must be finite screen points');
 const count=from?Math.floor(Math.hypot(to[0]-from[0],to[1]-from[1]))+1:0;
 if(count+1>maxSamples)throw new Error('Pointer stroke exceeds the raycast sample limit');
 const samples=[];
 for(let index=0;index<=count;index++){
  const t=count?index/count:1,position=from?from.map((value,axis)=>value+(to[axis]-value)*t):to;
  const hit=raycast(position)||null,previous=samples.at(-1),before=samples.at(-2);
  if(!hit){if(previous!==null)samples.push(null);continue;}
  // A run on one planar source triangle is exactly described by its endpoints.
  if(before&&previous&&hit.id===previous.id&&hit.id===before.id&&hit.triangleIndex===previous.triangleIndex&&hit.triangleIndex===before.triangleIndex)samples[samples.length-1]=hit;
  else samples.push(hit);
 }
 return samples;
}
