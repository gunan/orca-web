import {ShapeUtils,Vector2} from 'three';
import {transformPositions,meshBounds} from './geometry.js';
import {normalizeClipPlane} from './facet-graph.js';
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>v.map(value=>value/Math.hypot(...v));
const inside=(p,polygon)=>{let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;};
/** Native camera clipping points opposite camera-forward and traverses the
 * selected bounding sphere. The browser uses the current world bounds center,
 * because arbitrary imported meshes need not use native centered coordinates. */
export function viewClipPlane(mesh,forward,ratio=.5){
 if(!Array.isArray(forward)||forward.length!==3||!forward.every(Number.isFinite)||Math.hypot(...forward)<1e-12)throw new Error('View clipping needs a finite camera direction');
 if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw new Error('Clipping ratio must be between zero and one');
 const bounds=meshBounds(mesh),normal=unit(forward).map(v=>-v||0),radius=Math.hypot(...bounds.size)/2;
 return{normal,offset:dot(normal,bounds.center)+radius*(1-2*ratio)};
}
/** Display-only plane/mesh section. It never alters source facets. Closed loops
 * triangulate with nested holes; ambiguous/open intersections fail explicitly. */
export function clippingSection(mesh,plane,{tolerance=1e-6,maxTriangles=2000000,maxSegments=200000}={}){
 const clip=normalizeClipPlane(plane);if(!clip)return{positions:[],contours:[],area:0};
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.01)throw new Error('Invalid clipping section tolerance');
 if(mesh.positions.length/9>maxTriangles)throw new Error('Clipping section exceeds the triangle limit');
 const {normal,offset}=clip,vertices=new Map(),segments=new Map(),coincident=new Map(),points=transformPositions(mesh);
 const key=point=>point.map(v=>Math.round(v/tolerance)).join(','),edge=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
 const add=(a,b)=>{const ka=key(a),kb=key(b);if(ka===kb)return;vertices.set(ka,a);vertices.set(kb,b);segments.set(edge(ka,kb),[ka,kb]);if(segments.size>maxSegments)throw new Error('Clipping section exceeds the contour limit');};
 let positive=false,negative=false;
 for(let i=0;i<points.length;i+=9){
  const triangle=[0,3,6].map(j=>Array.from(points.slice(i+j,i+j+3))),distance=triangle.map(p=>dot(p,normal)-offset).map(d=>Math.abs(d)<=tolerance?0:d);
  positive||=distance.some(d=>d>0);negative||=distance.some(d=>d<0);if(distance.every(d=>d===0))continue;
  const planeVertices=distance.map((d,index)=>d===0?index:-1).filter(i=>i>=0);
  if(planeVertices.length===2){const a=triangle[planeVertices[0]],b=triangle[planeVertices[1]],ka=key(a),kb=key(b),id=edge(ka,kb),entry=coincident.get(id)||{a,b,positive:false,negative:false};entry.positive||=distance.some(d=>d>0);entry.negative||=distance.some(d=>d<0);coincident.set(id,entry);if(coincident.size>maxSegments)throw new Error('Clipping section exceeds the contour limit');continue;}
  if(!distance.some(d=>d>0)||!distance.some(d=>d<0))continue;
  const hits=planeVertices.map(index=>triangle[index]);
  for(let j=0;j<3;j++){const k=(j+1)%3;if(distance[j]*distance[k]<0){const fraction=distance[j]/(distance[j]-distance[k]);const point=triangle[j].map((v,axis)=>v+(triangle[k][axis]-v)*fraction),drift=dot(point,normal)-offset;hits.push(point.map((v,axis)=>v-normal[axis]*drift));}}
  const unique=[...new Map(hits.map(point=>[key(point),point])).values()];if(unique.length===2)add(...unique);else if(unique.length>2)throw new Error('Clipping section intersects an ambiguous triangle');
 }
 if(!positive||!negative)return{positions:[],contours:[],area:0};for(const entry of coincident.values())if(entry.positive&&entry.negative)add(entry.a,entry.b);
 const neighbors=new Map();for(const[a,b]of segments.values())for(const[x,y]of[[a,b],[b,a]]){if(!neighbors.has(x))neighbors.set(x,[]);neighbors.get(x).push(y);}
 if([...neighbors.values()].some(values=>values.length!==2))throw new Error('Clipping section is open or branches; repair the model or move the clipping plane');
 const unused=new Set(segments.keys()),loops=[];
 while(unused.size){const[a,b]=segments.get(unused.values().next().value),loop=[a];let previous=a,current=b;unused.delete(edge(a,b));
  while(current!==a){loop.push(current);const next=neighbors.get(current).find(id=>id!==previous);if(!unused.delete(edge(current,next)))throw new Error('Clipping contour cannot form a simple loop');previous=current;current=next;if(loop.length>neighbors.size)throw new Error('Invalid clipping contour');}
  if(loop.length>=3)loops.push(loop.map(id=>vertices.get(id)));if(loops.length>2048)throw new Error('Clipping section exceeds the closed-contour limit');
 }
 const u=unit(cross(Math.abs(normal[2])<.9?[0,0,1]:[0,1,0],normal)),v=cross(normal,u),contours=loops.map(world=>{const points=world.map(p=>new Vector2(dot(p,u),dot(p,v)));return{world,points,area:Math.abs(ShapeUtils.area(points)),parent:null,depth:0};});
 for(let i=0;i<contours.length;i++){let smallest=Infinity;for(let j=0;j<contours.length;j++)if(i!==j&&contours[j].area>contours[i].area&&contours[j].area<smallest&&inside(contours[i].points[0],contours[j].points)){contours[i].parent=j;smallest=contours[j].area;}}
 for(const contour of contours){let parent=contour.parent;while(parent!==null){contour.depth++;parent=contours[parent].parent;}}
 const positions=[];let area=0;
 for(let i=0;i<contours.length;i++){const outer=contours[i];if(outer.depth%2)continue;const holes=contours.filter(c=>c.parent===i&&c.depth===outer.depth+1),world=[...outer.world,...holes.flatMap(c=>c.world)];area+=outer.area-holes.reduce((sum,c)=>sum+c.area,0);
  for(const indices of ShapeUtils.triangulateShape(outer.points,holes.map(c=>c.points))){const triangle=indices.map(index=>world[index]);if(dot(cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])),normal)<0)triangle.reverse();positions.push(...triangle.flat());}
 }
 if(area>tolerance*tolerance&&!positions.length)throw new Error('Could not triangulate clipping section');
 return{positions,contours:loops,area};
}
