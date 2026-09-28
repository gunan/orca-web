import {Triangle,Vector3} from 'three';
import {transformPositions} from './geometry.js';
import {normalizePainting,decodeFacet,encodeFacet,splitFacetVertices,paintingVertices,PAINT_CHANNELS} from './facet-codec.js';
export const PAINT_GRAPH_LIMITS=Object.freeze({facets:200000,leaves:200000,edgeComparisons:2000000});
export const triangleVertices=(points,index)=>[0,3,6].map(offset=>Array.from(points.slice(index*9+offset,index*9+offset+3)));
export const faceNormal=vertices=>new Triangle(...vertices.map(point=>new Vector3(...point))).getNormal(new Vector3()).toArray();
export const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
export const triangleArea=vertices=>new Triangle(...vertices.map(point=>new Vector3(...point))).getArea();
export function normalizeClipPlane(value){if(value==null)return null;if(!value||!Array.isArray(value.normal)||value.normal.length!==3||!value.normal.every(Number.isFinite)||!Number.isFinite(value.offset))throw new Error('Clipping plane needs a finite normal and offset');const length=Math.hypot(...value.normal);if(length<1e-12)throw new Error('Clipping plane normal cannot be zero');return{normal:value.normal.map(number=>number/length),offset:value.offset/length};}
export const clipped=(point,plane)=>Boolean(plane&&dot(point,plane.normal)>plane.offset+1e-7);
/** Shared line intervals join unequal midpoint subedges, including native
 * propagated neighbors where one original facet is more deeply subdivided. */
export function facetAdjacency(facets){
 if(facets.length>PAINT_GRAPH_LIMITS.leaves)throw new Error('Painting connectivity exceeds 200,000 facets; reduce mesh detail before using connected tools');
 const lines=new Map(),neighbors=Array.from({length:facets.length},()=>new Set());let comparisons=0;
 facets.forEach((facet,index)=>{const vertices=facet.local||facet.vertices;for(let edge=0;edge<3;edge++){
  const a=vertices[edge],b=vertices[(edge+1)%3],delta=b.map((value,axis)=>value-a[axis]),length=Math.hypot(...delta);if(length<1e-10)continue;let direction=delta.map(value=>value/length);if(direction.find(value=>Math.abs(value)>1e-9)<0)direction=direction.map(value=>-value);
  const origin=a.map((value,axis)=>value-dot(a,direction)*direction[axis]),key=direction.map(value=>Math.round(value*1e7)).join(',')+'|'+origin.map(value=>Math.round(value*1e5)).join(',');const lo=Math.min(dot(a,direction),dot(b,direction)),hi=lo+length;if(!lines.has(key))lines.set(key,[]);lines.get(key).push({lo,hi,index});
 }});
 for(const edges of lines.values()){
  edges.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length&&edges[j].lo<edges[i].hi-1e-7;j++){
   if(++comparisons>PAINT_GRAPH_LIMITS.edgeComparisons)throw new Error('Painting connectivity is too ambiguous; repair overlapping or non-manifold surfaces first');if(edges[i].index===edges[j].index)continue;if(Math.min(edges[i].hi,edges[j].hi)-Math.max(edges[i].lo,edges[j].lo)<=1e-7)continue;neighbors[edges[i].index].add(edges[j].index);neighbors[edges[j].index].add(edges[i].index);
  }
 }
 return neighbors;
}
export function paintMeshContext(mesh,{channel,filamentCount=16,leaves=false}={}){
 if(!Object.hasOwn(PAINT_CHANNELS,channel))throw new Error('Unknown painting channel');const count=mesh.positions.length/9;if(count>PAINT_GRAPH_LIMITS.facets)throw new Error('Connected painting supports at most 200,000 original facets; reduce mesh detail first');
 const painting=normalizePainting(mesh.painting||{version:1},count,{filamentCount}),world=transformPositions(mesh),roots=new Map(),original=[],facets=[];
 for(let index=0;index<count;index++){
  const local=triangleVertices(mesh.positions,index),vertices=triangleVertices(world,index),face={index,local,vertices,normal:faceNormal(vertices),localNormal:faceNormal(local)};original.push(face);
  if(!leaves)continue;const tree=painting[channel]?.[index]?decodeFacet(painting[channel][index],{channel,filamentCount}).tree:{state:0};roots.set(index,tree);
  function expand(node,localPoints,worldPoints,path){if(Object.hasOwn(node,'state')){if(facets.length>=PAINT_GRAPH_LIMITS.leaves)throw new Error('Painting subdivision connectivity exceeds 200,000 leaf facets');facets.push({original:index,node,path,local:localPoints,vertices:worldPoints,state:node.state,normal:face.normal,localNormal:face.localNormal});return;}const localChildren=splitFacetVertices(localPoints,node.split,node.side),children=splitFacetVertices(worldPoints,node.split,node.side);node.children.forEach((child,which)=>expand(child,localChildren[which],children[which],[...path,which]));}
  expand(tree,paintingVertices(local,painting),paintingVertices(vertices,painting),[]);
 }
 return{mesh,count,channel,filamentCount,painting,original,facets,roots};
}
export function finishLeafPainting(context,changed){
 const map={...context.painting[context.channel]};for(const index of changed){const code=encodeFacet(context.roots.get(index),{channel:context.channel,filamentCount:context.filamentCount,collapse:true});if(code==='0')delete map[index];else map[index]=code;}
 return{...context.mesh,painting:normalizePainting({...context.painting,[context.channel]:map},context.count,{filamentCount:context.filamentCount})};
}
export function nearestPaintLeaf(facets,triangleIndex,point){const target=new Vector3(...point);let best=null,distance=Infinity;facets.forEach((facet,index)=>{if(facet.original!==triangleIndex)return;const triangle=new Triangle(...facet.vertices.map(value=>new Vector3(...value))),closest=triangle.closestPointToPoint(target,new Vector3()),d=closest.distanceTo(target);if(d<distance){distance=d;best=index;}});if(best===null||distance>1e-3)throw new Error('Choose a point on the painted facet');return best;}
