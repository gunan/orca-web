import {previewPaintFill} from './facet-paint-tools.js';
import {paintObjectMembers} from './paint-object-group.js';
import {facetAdjacency,PAINT_GRAPH_LIMITS,dot} from './facet-graph.js';
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=v=>Math.hypot(...v),epsilon=1e-7;
/** Boundary of selected native leaves, in world coordinates. Connectivity is
 * the same unequal-subedge graph used by bucket fill. Subtract the UNION of
 * shared intervals: an original edge adjoining several smaller leaves must
 * not leave a false white seam, or erase a genuinely uncovered half-edge. */
export function fillBoundarySegments(facets){
 const neighbors=facetAdjacency(facets),positions=[];let comparisons=0;
 for(const [index,facet] of facets.entries())for(let edge=0;edge<3;edge++){
  const vertices=facet.local||facet.vertices,a=vertices[edge],b=vertices[(edge+1)%3],delta=subtract(b,a),size=length(delta);if(size<epsilon)continue;
  const unit=delta.map(value=>value/size),covered=[];
  for(const neighbor of neighbors[index]){const points=facets[neighbor].local||facets[neighbor].vertices;for(let other=0;other<3;other++){
   if(++comparisons>PAINT_GRAPH_LIMITS.edgeComparisons*9)throw new Error('Fill preview boundary exceeds the connectivity limit; reduce or repair the mesh');
   const c=subtract(points[other],a),d=subtract(points[(other+1)%3],a);if(length(cross(c,unit))>epsilon||length(cross(d,unit))>epsilon)continue;
   const lo=Math.max(0,Math.min(dot(c,unit),dot(d,unit))),hi=Math.min(size,Math.max(dot(c,unit),dot(d,unit)));if(hi-lo>epsilon)covered.push([lo,hi]);
  }}
  covered.sort((left,right)=>left[0]-right[0]);let cursor=0;
  const emit=(lo,hi)=>{if(hi-lo<=epsilon)return;for(const t of[lo/size,hi/size])positions.push(...facet.vertices[edge].map((value,axis)=>value+t*(facet.vertices[(edge+1)%3][axis]-value)));};
  for(const [lo,hi]of covered){if(lo>cursor)emit(cursor,lo);cursor=Math.max(cursor,hi);}emit(cursor,size);
 }
 return positions;
}
/** Native hover targets only the current normal-volume hit. Never joins other
 * volumes in the selected object and never commits painting or scene state. */
export function previewObjectFill(objects,selectedId,event,options={}){
 if(!['fill','bucket','facet'].includes(options.tool))return null;
 const hit=paintObjectMembers(objects,selectedId).find(object=>object.id===event.id);if(!hit)return null;
 const facets=previewPaintFill(hit,{...options,...event});
 return{tool:options.tool,objectId:hit.id,filamentSlot:hit.filamentSlot||1,facets,contour:fillBoundarySegments(facets)};
}
