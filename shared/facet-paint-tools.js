import {distancePointSegment,distanceSegmentTriangle} from './facet-brush-math.js';
import {meshPointMatrix} from './brim-ears.js';
import {Triangle,Vector3} from 'three';
import {transformPositions} from './geometry.js';
import {PAINT_CHANNELS,PAINT_LIMITS,normalizePainting,decodeFacet,encodeFacet,paintingVertices,splitFacetVertices} from './facet-codec.js';
import {paintMeshContext,facetAdjacency,finishLeafPainting,nearestPaintLeaf,triangleVertices,normalizeClipPlane,clipped,dot,triangleArea} from './facet-graph.js';
export const NATIVE_PAINT_LIMITS=Object.freeze({radiusMin:.4,radiusMax:8,fillAngleMin:0,fillAngleMax:90,gapAreaMin:0,gapAreaMax:5});
function finite(value,label,min,max){if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}`);return value;}
function direction(value){if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite)||Math.hypot(...value)<1e-12)throw new Error('Circle painting needs a camera direction');const length=Math.hypot(...value);return value.map(number=>number/length);}
function vector(value,label){if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))throw new Error(`${label} needs three finite coordinates`);return value;}
const overhang=(face,angle)=>angle===0||face.normal[2]<-Math.cos(angle*Math.PI/180);
const allowed=(face,angle,plane)=>overhang(face,angle)&&!face.vertices.some(point=>clipped(point,plane));
const paintState=(state,channel,filamentCount)=>encodeFacet({state},{channel,filamentCount});
export function paintMesh(mesh,{channel,state,tool='triangle',triangleIndex,point,radius=2,resolution,frontDirection,filamentCount=16,fillAngle=30,clipPlane,overhangAngle=0,heightStart,height=.1,previousPoint,previousTriangleIndex,previewOnly=false}={}){
 const code=paintState(state,channel,filamentCount),count=mesh.positions.length/9;finite(overhangAngle,'Overhang angle',0,90);const plane=normalizeClipPlane(clipPlane);
 if(previewOnly&&!['fill','bucket','facet'].includes(tool))throw new Error('Only connected or subfacet tools provide fill previews');
 if(!['triangle','facet','sphere','circle','fill','bucket','height'].includes(tool))throw new Error('Unknown paint tool');
 if(!Number.isInteger(triangleIndex)||triangleIndex<0||triangleIndex>=count)throw new Error('Choose a surface facet');
 if(tool==='triangle'){
  const painting=normalizePainting(mesh.painting||{version:1},count,{filamentCount}),vertices=triangleVertices(transformPositions(mesh),triangleIndex),normal=new Triangle(...vertices.map(point=>new Vector3(...point))).getNormal(new Vector3()).toArray(),map={...painting[channel]};
  if(!allowed({vertices,normal},overhangAngle,plane))return{mesh,report:{changedFacets:0,visitedNodes:0}};if(code==='0')delete map[triangleIndex];else map[triangleIndex]=code;return{mesh:{...mesh,painting:normalizePainting({...painting,[channel]:map},count,{filamentCount})},report:{changedFacets:1,visitedNodes:1}};
 }
 if(tool==='bucket'||tool==='facet')return bucket(mesh,{channel,state,triangleIndex,point,filamentCount,fillAngle,clipPlane:plane,overhangAngle,propagate:tool==='bucket',previewOnly});
 const context=paintMeshContext(mesh,{channel,filamentCount,leaves:previewOnly}),map={...context.painting[channel]},changed=new Set();let visited=0;
 const selectedOriginals=new Set();const set=(index,value)=>{if(value===map[index]||value==='0'&&!map[index])return;if(value==='0')delete map[index];else map[index]=value;changed.add(index);};
 if(tool==='fill'){
  finite(fillAngle,'Smart-fill angle',0,90);const neighbors=facetAdjacency(context.original),pending=[triangleIndex],seen=new Set(),threshold=Math.cos(fillAngle*Math.PI/180)-1e-8;
  while(pending.length){const index=pending.pop();if(seen.has(index))continue;seen.add(index);visited++;const face=context.original[index];if(!allowed(face,overhangAngle,plane))continue;selectedOriginals.add(index);if(!previewOnly)set(index,code);for(const next of neighbors[index])if(!seen.has(next)&&Math.max(0,Math.min(1,dot(face.localNormal,context.original[next].localNormal)))>=threshold)pending.push(next);}
 }else{
  const range=tool==='height';if(range){finite(heightStart??point?.[2],'Height-range start',-1e7,1e7);finite(height,'Height range',.1,1000);}else{finite(radius,'Native brush radius',.4,8);vector(point,'Brush point');}
  const detail=resolution??(range ? .1 : Math.min(radius/5,.05));finite(detail,'Brush resolution',.005,10);
  const view=tool==='circle'?direction(frontDirection):null,start=heightStart??point?.[2],end=start+height;
  const projected=value=>{const difference=value.map((number,axis)=>number-point[axis]),depth=view?dot(difference,view):0;return difference.map((number,axis)=>number-depth*(view?.[axis]||0));};
  if(previousPoint)vector(previousPoint,'Previous brush point');const capsuleStart=previousPoint?projected(previousPoint):[0,0,0];
  const inside=vertex=>!clipped(vertex,plane)&&(range?vertex[2]>start-.02&&vertex[2]<end+.02:distancePointSegment(projected(vertex),capsuleStart,[0,0,0])<radius);
  const intersects=vertices=>{if(plane&&vertices.every(vertex=>clipped(vertex,plane)))return false;if(range)return Math.max(...vertices.map(v=>v[2]))>=start&&Math.min(...vertices.map(v=>v[2]))<=end;return distanceSegmentTriangle(vertices.map(projected),capsuleStart,[0,0,0])<=radius;};
  function brush(node,vertices,depth){if(++visited>PAINT_LIMITS.strokeNodes)throw new Error('Brush stroke exceeds the refinement limit; increase its resolution');if(!intersects(vertices))return node;if(vertices.every(inside))return{state};if(Object.hasOwn(node,'state')&&node.state===state)return node;
   if(!Object.hasOwn(node,'state')){const children=splitFacetVertices(vertices,node.split,node.side);return{...node,children:node.children.map((child,index)=>brush(child,children[index],depth+1))};}
   const lengths=[0,1,2].map(index=>Math.hypot(...vertices[(index+1)%3].map((value,axis)=>value-vertices[(index+2)%3][axis]))>detail),split=lengths.filter(Boolean).length;
   if(!split||depth>=24){const center=[0,1,2].map(axis=>vertices.reduce((sum,vertex)=>sum+vertex[axis],0)/3);return inside(center)?{state}:node;}
   const side=split===3?0:split===2?lengths.indexOf(false):lengths.indexOf(true);return{split,side,children:splitFacetVertices(vertices,split,side).map(child=>brush({state:node.state},child,depth+1))};
  }
  const neighbors=range?null:facetAdjacency(context.original),pending=range?context.original.map((_,index)=>index):[triangleIndex,...(previousPoint&&Number.isInteger(previousTriangleIndex)&&previousTriangleIndex>=0&&previousTriangleIndex<count?[previousTriangleIndex]:[])],seen=new Set();
  while(pending.length){const index=pending.pop();if(seen.has(index))continue;seen.add(index);const face=context.original[index];if(!overhang(face,overhangAngle)||view&&dot(face.normal,view)>=0||!intersects(face.vertices))continue;
   const tree=map[index]?decodeFacet(map[index],{channel,filamentCount}).tree:{state:0};set(index,encodeFacet(brush(tree,paintingVertices(face.vertices,context.painting),0),{channel,filamentCount,collapse:true}));if(neighbors)for(const next of neighbors[index])if(!seen.has(next))pending.push(next);
  }
 }
 if(previewOnly)return{mesh,facets:context.facets.filter(f=>selectedOriginals.has(f.original)),report:{changedFacets:0,visitedNodes:visited}};
 return{mesh:{...mesh,painting:normalizePainting({...context.painting,[channel]:map},count,{filamentCount})},report:{changedFacets:changed.size,visitedNodes:visited}};
}
function bucket(mesh,{channel,state,triangleIndex,point,filamentCount,fillAngle,clipPlane,overhangAngle,propagate,previewOnly}){
 vector(point,'Fill point');if(fillAngle!==-1)finite(fillAngle,'Fill angle',0,90);const context=paintMeshContext(mesh,{channel,filamentCount,leaves:true}),start=nearestPaintLeaf(context.facets,triangleIndex,point),neighbors=propagate?facetAdjacency(context.facets):null,seed=context.facets[start].state,pending=[start],seen=new Set(),changed=new Set(),threshold=fillAngle<0?-1:Math.cos(fillAngle*Math.PI/180)-1e-8,selected=new Set();
 while(pending.length){const index=pending.pop();if(seen.has(index))continue;seen.add(index);const face=context.facets[index];if(face.state!==seed||!allowed(face,overhangAngle,clipPlane))continue;selected.add(index);if(!previewOnly&&face.node.state!==state){face.node.state=state;changed.add(face.original);}if(neighbors)for(const next of neighbors[index])if(!seen.has(next)&&Math.max(0,Math.min(1,dot(face.localNormal,context.facets[next].localNormal)))>=threshold)pending.push(next);}
 if(previewOnly)return{mesh,facets:[...selected].map(index=>context.facets[index]),report:{changedFacets:0,visitedNodes:seen.size}};
 return{mesh:finishLeafPainting(context,changed),report:{changedFacets:changed.size,visitedNodes:seen.size}};
}
/** Native gap fill uses source-mesh area and the smallest neighboring state.
 * All decisions use the original snapshot, not prior changes in this pass. */
export function gapFillPainting(mesh,{channel,areaThreshold=1,filamentCount=16}={}){
 finite(areaThreshold,'Native gap area',0,5);const context=paintMeshContext(mesh,{channel,filamentCount,leaves:true}),neighbors=facetAdjacency(context.facets),seen=new Set(),patches=[],changed=new Set();let changedPatches=0;
 for(let index=0;index<context.facets.length;index++){if(seen.has(index))continue;const state=context.facets[index].state,pending=[index],indices=[],states=new Set();let area=0;
  while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);indices.push(current);area+=triangleArea(context.facets[current].local);for(const next of neighbors[current]){if(context.facets[next].state!==state)states.add(context.facets[next].state);else if(!seen.has(next))pending.push(next);}}
  patches.push({state,area,indices,neighbors:[...states].sort((a,b)=>a-b)});
 }
 for(const patch of patches){if(patch.area>=areaThreshold||!patch.neighbors.length)continue;changedPatches++;for(const index of patch.indices){const facet=context.facets[index];facet.node.state=patch.neighbors[0];changed.add(facet.original);}}
 return{mesh:finishLeafPainting(context,changed),report:{changedFacets:changed.size,changedPatches,patches:patches.map(({state,area,indices,neighbors})=>({state,area,facetCount:indices.length,neighborStates:neighbors}))}};
}
export function paintByOverhangAngle(mesh,{state=1,angle=40,filamentCount=16}={}){
 finite(angle,'Overhang angle',0,90);const context=paintMeshContext(mesh,{channel:'supports',filamentCount}),map={...context.painting.supports},inverse=meshPointMatrix(mesh).invert(),down=new Vector3(0,0,-1).transformDirection(inverse),limit=new Vector3(Math.sin(angle*Math.PI/180),0,-Math.cos(angle*Math.PI/180)).transformDirection(inverse),threshold=limit.dot(down);let changed=0;for(const face of context.original)if(new Vector3(...face.localNormal).dot(down)>threshold){if(state===0)delete map[face.index];else map[face.index]=paintState(state,'supports',filamentCount);changed++;}
 return{mesh:{...mesh,painting:normalizePainting({...context.painting,supports:map},context.count,{filamentCount})},report:{changedFacets:changed}};
}
export function overhangFacetGeometry(mesh,angle){finite(angle,'Overhang angle',0,90);const points=transformPositions(mesh),facets=[];for(let index=0;index<points.length/9;index++){const vertices=triangleVertices(points,index),normal=new Triangle(...vertices.map(point=>new Vector3(...point))).getNormal(new Vector3());if(angle>0&&normal.z<-Math.cos(angle*Math.PI/180))facets.push({triangleIndex:index,vertices});}return facets;}

/** Exact selected leaf geometry without committing paint or changing the source mesh. */
export function previewPaintFill(mesh,options){return paintMesh(mesh,{...options,state:0,previewOnly:true}).facets.map(({vertices,local,state,original})=>({vertices,local,state,original}));}
