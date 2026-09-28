import {paintMesh,gapFillPainting,paintByOverhangAngle,normalizePainting} from './facet-painting.js';
import {sceneBounds} from './geometry.js';
import {paintCursorGeometry} from './paint-cursor.js';
const groupId=o=>o.native?.groupId||o.id;
export function paintObjectMembers(objects,selectedId){
 const source=objects.find(o=>o.id===selectedId);if(!source)throw new Error('Select an object to paint');
 const members=objects.filter(o=>o.plateId===source.plateId&&groupId(o)===groupId(source)&&(o.native?.partType||'normal_part')==='normal_part'&&o.visible!==false);
 if(!members.length)throw new Error('Painting needs a visible normal part');return members;
}
export function paintObjectBoundsMesh(objects,selectedId){
 const bounds=sceneBounds(paintObjectMembers(objects,selectedId));return{positions:[...bounds.min,...bounds.max,...bounds.center],position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
}
/** Native painter ray hits target a normal volume of one selected object.
 * Native HEIGHT_RANGE additionally visits every normal volume in that object
 * (GLGizmoPainterBase.cpp:592-655,780-813; TriangleSelector.cpp:311-320). */
export function paintObjectGroup(objects,selectedId,event,options={}){
 const members=paintObjectMembers(objects,selectedId),hit=members.find(o=>o.id===event.id);if(!hit)return{objects,report:{changedFacets:0,visitedNodes:0}};
 const targets=options.tool==='height'?members:[hit],targetIds=new Set(targets.map(o=>o.id)),bounds=sceneBounds(members);
 const heightStart=options.tool==='height'&&options.atPointer!==false?Math.fround(event.point[2]):options.heightStart;
 if(options.tool==='height'&&(!Number.isFinite(options.height)||options.height<.1||options.height>8))throw new Error('Native height brush must be between 0.1 and 8 mm');
 let changedFacets=0,visitedNodes=0;const next=objects.map(object=>{
  if(!targetIds.has(object.id))return object;const previous=options.previousHit?.id===object.id?options.previousHit:null;
  const result=paintMesh(object,{...options,...event,triangleIndex:object.id===hit.id?event.triangleIndex:0,heightStart,previousPoint:previous?.point,previousTriangleIndex:previous?.triangleIndex});changedFacets+=result.report.changedFacets;visitedNodes+=result.report.visitedNodes||0;return result.mesh;
 });return{objects:next,report:{changedFacets,visitedNodes},bounds};
}
export function changeObjectPaint(objects,selectedId,action,options={}){
 const ids=new Set(paintObjectMembers(objects,selectedId).map(o=>o.id));let changedFacets=0,changedPatches=0;
 const next=objects.map(object=>{if(!ids.has(object.id))return object;if(action==='clear'){const painting={...normalizePainting(object.painting||{version:1},object.positions.length/9,options)};delete painting[options.channel];return{...object,painting};}
  const result=action==='gap'?gapFillPainting(object,options):action==='overhang'?paintByOverhangAngle(object,options):null;if(!result)throw new Error('Unknown object paint action');changedFacets+=result.report.changedFacets||0;changedPatches+=result.report.changedPatches||0;return result.mesh;
 });return{objects:next,report:{changedFacets,changedPatches}};
}
export function paintObjectCursor(objects,selectedId,event,options){
 const members=paintObjectMembers(objects,selectedId),hit=members.find(o=>o.id===event.id);if(!hit)return null;
 if(options.tool!=='height')return paintCursorGeometry(hit,{...options,...event});
 const bounds=sceneBounds(members),start=options.atPointer!==false?Math.fround(event.point[2]):options.heightStart;
 if(!Number.isFinite(options.height)||options.height<.1||options.height>8)throw new Error('Native height brush must be between 0.1 and 8 mm');
 const shapes=members.map(mesh=>paintCursorGeometry(mesh,{...options,...event,heightStart:start,atPointer:false}));return{tool:'height',center:[...event.point],range:[start,Math.min(bounds.max[2],start+options.height)],positions:shapes.flatMap(s=>s.positions)};
}
