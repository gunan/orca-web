import {invalidateNativeEmboss,bakeNativeEmbossMetadata} from './native-emboss.js';
import {flipPaintingWinding} from './facet-painting.js';
import {worldBrimEars} from './brim-ears.js';
import { ShapeUtils, Vector2, Matrix4 } from 'three';
import { analyzeMesh, bedBounds, createMesh, meshBounds, sceneBounds, transformPositions, translateMesh } from './geometry.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((value,index)=>value-b[index]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=vector=>{if(!Array.isArray(vector)||vector.length!==3||!vector.every(Number.isFinite)||Math.hypot(...vector)<1e-12)throw new Error('Cut normal must contain three finite numbers and cannot be zero');const length=Math.hypot(...vector);return vector.map(value=>value/length);};
const key=(point,tolerance)=>point.map(value=>Math.round(value/tolerance)).join(',');
const edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
function baked(mesh){
  const points=Array.from(transformPositions(mesh));
  if(mesh.scale.reduce((product,value)=>product*value,1)<0)for(let i=0;i<points.length;i+=9)for(let axis=0;axis<3;axis++)[points[i+3+axis],points[i+6+axis]]=[points[i+6+axis],points[i+3+axis]];
  return points;
}
function outputMesh(mesh,positions,side){
  const {assemblyParts:_assembly,text:_text,brimEars:_brimEars,painting:_painting,...metadata}=mesh;
  const result=createMesh({...metadata,id:undefined,name:`${mesh.name} ${side}`,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],cutFrom:mesh.id});
  if(mesh.native){result.native={...invalidateNativeEmboss(structuredClone(mesh.native)),groupId:result.id,objectName:result.name};delete result.native.groupTransform;delete result.native.instanceFamily;}
  return result;
}
function addTriangle(output,a,b,c,tolerance){if(Math.hypot(...cross(sub(b,a),sub(c,a)))>tolerance*tolerance)output.push(...a,...b,...c);}
function inside(point,polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;}

function cap(positions,normal,offset,tolerance,direction){
  const vertices=new Map(),edges=new Map();
  for(let start=0;start<positions.length;start+=9){
    const points=[0,3,6].map(index=>positions.slice(start+index,start+index+3));
    for(let index=0;index<3;index++){
      const a=points[index],b=points[(index+1)%3];
      if(Math.abs(dot(a,normal)-offset)>tolerance||Math.abs(dot(b,normal)-offset)>tolerance)continue;
      const ka=key(a,tolerance),kb=key(b,tolerance);if(ka===kb)continue;
      vertices.set(ka,a);vertices.set(kb,b);const id=edgeKey(ka,kb),edge=edges.get(id)||{a:ka,b:kb,count:0};edge.count++;edges.set(id,edge);
    }
  }
  const adjacent=new Map(),unused=new Set();
  for(const[id,edge]of edges){if(edge.count>2)throw new Error('Cut plane has a non-manifold boundary');if(edge.count!==1)continue;unused.add(id);for(const[a,b]of [[edge.a,edge.b],[edge.b,edge.a]]){if(!adjacent.has(a))adjacent.set(a,[]);adjacent.get(a).push(b);}}
  if(!unused.size)return{loops:0,triangles:0};
  if([...adjacent.values()].some(neighbors=>neighbors.length!==2))throw new Error('Cut boundary is open or touches itself; choose a different plane or repair the mesh');
  const loops=[];
  while(unused.size){
    const seed=edges.get(unused.values().next().value),loop=[seed.a];let previous=seed.a,current=seed.b;unused.delete(edgeKey(previous,current));
    while(current!==loop[0]){loop.push(current);const next=adjacent.get(current).find(vertex=>vertex!==previous);if(!unused.delete(edgeKey(current,next)))throw new Error('Cut boundary cannot form a simple closed loop');previous=current;current=next;if(loop.length>adjacent.size)throw new Error('Invalid cut boundary');}
    if(loop.length<3)throw new Error('Cut contour has fewer than three vertices');loops.push(loop);
  }
  const u=unit(cross(Math.abs(normal[2])<.9?[0,0,1]:[0,1,0],normal)),v=cross(normal,u);
  const projected=new Map([...vertices].map(([id,point])=>[id,new Vector2(dot(point,u),dot(point,v))]));
  // Earcut may remove collinear contour vertices. Keep each original boundary
  // chain so caps share every edge with the clipped surface, avoiding T-junctions.
  const chains=new Map(),contours=loops.map(loop=>{
    const corners=loop.filter((id,index)=>{const a=projected.get(loop[(index+loop.length-1)%loop.length]),b=projected.get(id),c=projected.get(loop[(index+1)%loop.length]);return Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>tolerance*(Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(c.x-b.x,c.y-b.y));});
    if(corners.length<3)throw new Error('Cut contour has zero area');
    for(let index=0;index<corners.length;index++){const a=corners[index],b=corners[(index+1)%corners.length],chain=[a];let cursor=loop.indexOf(a);while(loop[cursor]!==b){cursor=(cursor+1)%loop.length;chain.push(loop[cursor]);}chains.set(edgeKey(a,b),chain);}
    const points=corners.map(id=>projected.get(id));return{ids:corners,points,area:Math.abs(ShapeUtils.area(points)),parent:null,depth:0};
  });
  for(let index=0;index<contours.length;index++){
    const current=contours[index];let parentArea=Infinity;
    for(let other=0;other<contours.length;other++)if(other!==index&&contours[other].area>current.area&&contours[other].area<parentArea&&inside(current.points[0],contours[other].points)){current.parent=other;parentArea=contours[other].area;}
  }
  for(const contour of contours){let parent=contour.parent;while(parent!==null){contour.depth++;parent=contours[parent].parent;}}
  const before=positions.length;
  for(let index=0;index<contours.length;index++){
    const contour=contours[index];if(contour.depth%2)continue;
    const holes=contours.filter(other=>other.parent===index&&other.depth===contour.depth+1),ids=[...contour.ids,...holes.flatMap(hole=>hole.ids)];
    const triangles=ShapeUtils.triangulateShape(contour.points,holes.map(hole=>hole.points));
    if(!triangles.length)throw new Error('Could not triangulate the cut cap');
    for(const triangle of triangles){
      let face=triangle.map(vertex=>ids[vertex]);const points=face.map(id=>vertices.get(id));
      if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),normal)*direction<0)face=[face[0],face[2],face[1]];
      const perimeter=[];
      for(let edge=0;edge<3;edge++){const a=face[edge],b=face[(edge+1)%3];let chain=chains.get(edgeKey(a,b))||[a,b];if(chain[0]!==a)chain=[...chain].reverse();perimeter.push(...chain.slice(0,-1));}
      if(perimeter.length===3)addTriangle(positions,...perimeter.map(id=>vertices.get(id)),tolerance);
      else{const center=[0,1,2].map(axis=>face.reduce((sum,id)=>sum+vertices.get(id)[axis],0)/3);for(let edge=0;edge<perimeter.length;edge++)addTriangle(positions,center,vertices.get(perimeter[edge]),vertices.get(perimeter[(edge+1)%perimeter.length]),tolerance);}
    }
  }
  return{loops:loops.length,triangles:(positions.length-before)/9};
}

// Cutting near an existing edge can create vertices distinct in double precision
// that coincide after the Float32 conversion used by the renderer and STL.
// Weld that representation and split matching collinear boundary edges, rather
// than moving the plane or filling an unrelated hole.
function finalizeCutPositions(positions,tolerance){
  const points=[],lookup=new Map(),faces=[];let weldedVertices=0,removedTriangles=0,splitEdges=0;
  const values=new Float32Array(positions);
  for(let start=0;start<values.length;start+=9){const face=[];for(let i=0;i<3;i++){const point=Array.from(values.slice(start+i*3,start+i*3+3)),id=key(point,tolerance);if(!lookup.has(id)){lookup.set(id,points.length);points.push(point);}else if(points[lookup.get(id)].some((value,axis)=>value!==point[axis]))weldedVertices++;face.push(lookup.get(id));}faces.push(face);}
  const valid=face=>new Set(face).size===3&&Math.hypot(...cross(sub(points[face[1]],points[face[0]]),sub(points[face[2]],points[face[0]])))>2*tolerance*tolerance;
  let current=faces.filter(face=>{if(valid(face))return true;removedTriangles++;return false;});
  for(let pass=0;pass<3;pass++){
    const edges=new Map();for(let index=0;index<current.length;index++)for(let e=0;e<3;e++){const a=current[index][e],b=current[index][(e+1)%3],id=edgeKey(a,b),edge=edges.get(id)||{a,b,count:0};edge.count++;edges.set(id,edge);}
    const boundary=[...edges.values()].filter(edge=>edge.count===1);if(!boundary.length)break;if(boundary.length>2048)break;
    const vertices=[...new Set(boundary.flatMap(edge=>[edge.a,edge.b]))],chains=new Map();
    for(const edge of boundary){const a=points[edge.a],b=points[edge.b],delta=sub(b,a),length=dot(delta,delta),near=[];if(length<=tolerance*tolerance)continue;
      for(const id of vertices){if(id===edge.a||id===edge.b)continue;const d=sub(points[id],a),fraction=dot(d,delta)/length;if(fraction<=0||fraction>=1)continue;const distance=Math.hypot(...d.map((value,axis)=>value-delta[axis]*fraction));if(distance<=tolerance)near.push({id,fraction});}
      if(near.length){near.sort((x,y)=>x.fraction-y.fraction);chains.set(edgeKey(edge.a,edge.b),[edge.a,...near.map(value=>value.id),edge.b]);splitEdges++;}
    }
    if(!chains.size)break;const next=[];
    for(const face of current){const perimeter=[];let changed=false;for(let e=0;e<3;e++){const a=face[e],b=face[(e+1)%3];let chain=chains.get(edgeKey(a,b))||[a,b];if(chain.length>2)changed=true;if(chain[0]!==a)chain=[...chain].reverse();perimeter.push(...chain.slice(0,-1));}if(!changed){next.push(face);continue;}
      const center=[0,1,2].map(axis=>Math.fround(face.reduce((sum,id)=>sum+points[id][axis],0)/3)),id=points.length;points.push(center);for(let e=0;e<perimeter.length;e++){const triangle=[id,perimeter[e],perimeter[(e+1)%perimeter.length]];if(valid(triangle))next.push(triangle);else removedTriangles++;}
    }
    current=next;
  }
  return{positions:current.flatMap(face=>face.flatMap(id=>points[id])),report:{weldedVertices,removedTriangles,splitEdges}};
}

/** Plane convention: dot(normalized normal, world point) = offset (millimetres).
 * Closed, consistently wound meshes may contain nested cavities or disconnected
 * shells. Open/non-manifold/ambiguous surfaces fail before a project is changed.
 */
export function cutMesh(mesh,{normal=[0,0,1],offset,keep='both',tolerance=1e-5}={}){
  normal=unit(normal);if(!Number.isFinite(offset))throw new Error('Cut offset must be a finite number');
  if(!['upper','lower','both'].includes(keep))throw new Error('Choose the upper half, lower half, or both');
  if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.01)throw new Error('Cut tolerance must be positive and at most 0.01 mm');
  const analysis=analyzeMesh(mesh,{tolerance});if(!analysis.manifold)throw new Error('Cut requires a closed, consistently wound manifold mesh; repair the model first');
  const positions=baked(mesh),halves={upper:[],lower:[]},intersections=new Map();let positive=false,negative=false;
  function intersect(a,b,da,db){const edge=edgeKey(key(a,tolerance),key(b,tolerance));if(!intersections.has(edge)){const ratio=da/(da-db);const point=a.map((value,axis)=>value+(b[axis]-value)*ratio),distance=dot(point,normal)-offset;intersections.set(edge,point.map((value,axis)=>value-normal[axis]*distance));}return intersections.get(edge);}
  for(let start=0;start<positions.length;start+=9){
    const original=[0,3,6].map(index=>positions.slice(start+index,start+index+3));
    const distances=original.map(point=>dot(point,normal)-offset),points=original.map((point,index)=>Math.abs(distances[index])<=tolerance?point.map((value,axis)=>value-normal[axis]*distances[index]):point);
    const d=distances.map(value=>Math.abs(value)<=tolerance?0:value);positive||=d.some(value=>value>0);negative||=d.some(value=>value<0);
    if(d.every(value=>value===0)){const side=dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),normal)>0?'lower':'upper';addTriangle(halves[side],...points,tolerance);continue;}
    for(const[side,sign]of [['upper',1],['lower',-1]]){
      const polygon=[];
      for(let index=0;index<3;index++){const next=(index+1)%3,a=points[index],b=points[next],da=d[index]*sign,db=d[next]*sign;if(da>=0)polygon.push(a);if(da*db<0)polygon.push(intersect(a,b,d[index],d[next]));}
      for(let index=1;index<polygon.length-1;index++)addTriangle(halves[side],polygon[0],polygon[index],polygon[index+1],tolerance);
    }
  }
  if(!positive||!negative)throw new Error('Cut plane must pass through the interior of the model');
  const caps={upper:cap(halves.upper,normal,offset,tolerance,-1),lower:cap(halves.lower,normal,offset,tolerance,1)};
  const precision={upper:finalizeCutPositions(halves.upper,tolerance),lower:finalizeCutPositions(halves.lower,tolerance)};
  const upper=outputMesh(mesh,precision.upper.positions,'upper'),lower=outputMesh(mesh,precision.lower.positions,'lower');
  const reports={upper:analyzeMesh(upper,{tolerance}),lower:analyzeMesh(lower,{tolerance})};
  if(!reports.upper.manifold||!reports.lower.manifold)throw new Error('Cut could not produce two closed manifold surfaces at this plane');
  if((upper.positions.length+lower.positions.length)/9>2000000)throw new Error('Cut result exceeds the two million triangle project limit');
  return{upper,lower,objects:keep==='both'?[upper,lower]:[keep==='upper'?upper:lower],report:{normal,offset,caps,precision:{upper:precision.upper.report,lower:precision.lower.report},volumeBefore:analysis.volume,volumeAfter:reports.upper.volume+reports.lower.volume,upper:reports.upper,lower:reports.lower}};
}

/** Reflection is baked and triangle winding reversed; scale stays positive so
 * saved projects remain valid and exported surfaces have outward normals. */
export function mirrorMesh(mesh,axis='x',{center=meshBounds(mesh)?.center}={}){
  const index=typeof axis==='number'?axis:['x','y','z'].indexOf(String(axis).toLowerCase());if(![0,1,2].includes(index))throw new Error('Mirror axis must be X, Y, or Z');
  if(!Array.isArray(center)||center.length!==3||!center.every(Number.isFinite))throw new Error('No valid mirror center');
  const positions=baked(mesh);for(let offset=0;offset<positions.length;offset+=3)positions[offset+index]=2*center[index]-positions[offset+index];
  for(let offset=0;offset<positions.length;offset+=9)for(let coordinate=0;coordinate<3;coordinate++)[positions[offset+3+coordinate],positions[offset+6+coordinate]]=[positions[offset+6+coordinate],positions[offset+3+coordinate]];
  const{assemblyParts:_assembly,text:_text,brimEars:_brimEars,...metadata}=mesh;if(metadata.native){const reflection=new Matrix4().makeTranslation(...center).multiply(new Matrix4().makeScale(...[0,1,2].map(axis=>axis===index?-1:1))).multiply(new Matrix4().makeTranslation(...center.map(value=>-value)));metadata.native={...metadata.native,...bakeNativeEmbossMetadata(mesh,{worldMatrix:reflection})};delete metadata.native.groupTransform;}return createMesh({...metadata,...(mesh.painting&&{painting:flipPaintingWinding(mesh.painting,mesh.positions.length/9)}),...(mesh.brimEars&&{brimEars:worldBrimEars(mesh).map(ear=>({...ear,position:ear.position.map((value,axis)=>axis===index?2*center[index]-value:value)}))}),positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
}

const groupId=object=>object.native?.groupId||object.id;
export function nativeCutMembers(objects,selectedId){
  const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Select an object to cut');
  return objects.filter(object=>object.plateId===selected.plateId&&groupId(object)===groupId(selected));
}

/** Cut each native part in the same world plane, then regroup corresponding
 * halves. Modifiers outside a surviving normal part group are discarded, so a
 * partial cut cannot leave orphaned negative/support/modifier objects. */
export function cutNativeGroup(objects,selectedId,options){
  const members=nativeCutMembers(objects,selectedId),normal=unit(options.normal||[0,0,1]),offset=options.offset,tolerance=options.tolerance??1e-5,keep=options.keep||'both';
  if(!Number.isFinite(offset))throw new Error('Cut offset must be a finite number');if(!['both','upper','lower'].includes(keep))throw new Error('Choose the upper half, lower half, or both');
  if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.01)throw new Error('Cut tolerance must be positive and at most 0.01 mm');
  const halves={upper:[],lower:[]},reports=[];let hasUpper=false,hasLower=false;
  for(const object of members){
    const positions=baked(object);let min=Infinity,max=-Infinity;
    for(let i=0;i<positions.length;i+=3){const distance=dot(positions.slice(i,i+3),normal)-offset;min=Math.min(min,distance);max=Math.max(max,distance);}
    hasUpper||=max>tolerance;hasLower||=min< -tolerance;
    if(max>tolerance&&min< -tolerance){const result=cutMesh(object,{...options,normal,keep:'both'});halves.upper.push(result.upper);halves.lower.push(result.lower);reports.push({id:object.id,...result.report});}
    else{const side=max>tolerance?'upper':'lower';halves[side].push(outputMesh(object,positions,side));}
  }
  if(!hasUpper||!hasLower)throw new Error('Cut plane must pass through the interior of the object group');
  const originalName=members[0].native?.objectName||members[0].name,discarded=[];
  for(const side of ['upper','lower']){
    const primary=halves[side].find(object=>object.visible!==false&&(object.native?.partType||'normal_part')==='normal_part');
    if(!primary){discarded.push(...halves[side].map(object=>object.name));halves[side]=[];continue;}
    halves[side]=halves[side].map(object=>({...object,native:{...object.native,groupId:primary.id,objectName:`${originalName} ${side}`,partType:object.native?.partType||'normal_part',objectSettings:structuredClone(members[0].native?.objectSettings||{}),partSettings:structuredClone(object.native?.partSettings||{})}}));
  }
  const created=(keep==='both'?[...halves.upper,...halves.lower]:halves[keep]);if(!created.length)throw new Error('The retained side has no normal printable part');
  if(created.reduce((total,object)=>total+object.positions.length/9,0)>2000000)throw new Error('Cut result exceeds the two million triangle project limit');
  const replaceIds=members.map(object=>object.id),next=objects.filter(object=>!replaceIds.includes(object.id));
  return{objects:[...next,...created],created,upper:halves.upper,lower:halves.lower,replaceIds,report:{normal,offset,parts:reports,discarded}};
}

export function mirrorNativeGroup(objects,selectedId,axis='x'){
  const members=nativeCutMembers(objects,selectedId),ids=new Set(members.map(object=>object.id)),center=sceneBounds(members.map(object=>({...object,visible:true})))?.center;
  return objects.map(object=>ids.has(object.id)?mirrorMesh(object,axis,{center}):object);
}

/** Place retained cut groups side by side, translating every modifier and part
 * together. Bounds and bed contact come from their normal printable parts. */
export function arrangeCutResult(result,bed,{gap=10,margin=5}={}){
  if(![gap,margin].every(value=>Number.isFinite(value)&&value>=0))throw new Error('Cut placement gap and margin must be nonnegative');
  const target=bedBounds({...bed,origin:bed.origin||[bed.minX||0,bed.minY||0,0]}),retained=new Set(result.created.map(object=>object.id));
  const groupMap=new Map();for(const object of result.created){const id=object.native?.groupId||object.id;if(!groupMap.has(id))groupMap.set(id,[]);groupMap.get(id).push(object);}const groups=[...groupMap.values()].map(objects=>({objects}));
  for(const group of groups)group.bounds=sceneBounds(group.objects.filter(object=>(object.native?.partType||'normal_part')==='normal_part'));
  const width=groups.reduce((sum,group)=>sum+group.bounds.size[0],0)+gap*Math.max(0,groups.length-1),depth=Math.max(...groups.map(group=>group.bounds.size[1]));
  if(width>target.size[0]-margin*2||depth>target.size[1]-margin*2||groups.some(group=>group.bounds.size[2]>target.size[2]))throw new Error('Cut groups do not fit side by side on this bed; keep their placement or keep one side');
  let x=target.center[0]-width/2;const changed=new Map();
  for(const group of groups){const delta=[x-group.bounds.min[0],target.center[1]-group.bounds.center[1],target.min[2]-group.bounds.min[2]];for(const object of group.objects)changed.set(object.id,translateMesh(object,delta));x+=group.bounds.size[0]+gap;}
  return{...result,objects:result.objects.map(object=>changed.get(object.id)||object),created:result.created.map(object=>changed.get(object.id)||object),upper:result.upper.map(object=>changed.get(object.id)||object),lower:result.lower.map(object=>changed.get(object.id)||object),...(result.dowels&&{dowels:result.dowels.map(object=>changed.get(object.id)||object)})};
}
