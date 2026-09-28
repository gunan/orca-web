import{invalidateCutFamily,invalidateCutMetadata}from'./cut-metadata.js';
import{transformPositions}from'./geometry.js';
// Cut IDs describe relationships between processed parts. A topology or
// membership replacement without an exact volume correspondence clears that
// relationship, as native ModelObject::invalidate_cut() does; meshes remain.
export function replaceCutGeometry(objects,selectedIds,replacements){
 const selected=new Set(selectedIds),before=objects.filter(object=>selected.has(object.id));
 if(before.length!==selected.size)throw new Error('Geometry replacement references a missing object');
 const equal=before.length===1&&replacements.length===1&&JSON.stringify([before[0].plateId,before[0].native?.groupId,before[0].native?.partType])===JSON.stringify([replacements[0].plateId,replacements[0].native?.groupId,replacements[0].native?.partType])&&(()=>{const a=transformPositions(before[0]),b=transformPositions(replacements[0]);return a.length===b.length&&a.every((value,index)=>value===b[index]);})();
 const hadCut=before.some(object=>object.native?.cutId||object.native?.cutConnector),invalidate=hadCut&&!equal;
 const updated=invalidate?invalidateCutFamily(objects,selectedIds):objects,parts=invalidate?replacements.map(object=>({...object,native:invalidateCutMetadata(object.native)})):replacements;
 return{objects:[...updated.filter(object=>!selected.has(object.id)),...parts],invalidated:invalidate,parts};
}
