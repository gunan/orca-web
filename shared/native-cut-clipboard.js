import {captureNativeClipboard} from './native-clipboard.js';
import {removeMultipleSelection,selectedSceneIds} from './multi-selection.js';
import {invalidateCutMetadata} from './cut-metadata.js';

const group=o=>JSON.stringify([o.plateId,o.native?.groupId||o.id]);
const family=o=>o.native?.cutId?JSON.stringify([o.native.cutId.id,o.native.cutId.checkSum,o.native.cutId.connectorsCount]):null;
const normal=o=>(o.native?.partType||'normal_part')==='normal_part';
function selection(project,objects){const ids=new Set(objects.map(o=>o.id)),selectedIds=(project.selectedIds||[]).filter(id=>ids.has(id));return{...project,objects,selectedIds,selectedId:ids.has(project.selectedId)?project.selectedId:selectedIds[0]||null,selectionFrame:null};}

// Selection::cut_to_clipboard copies first, then erases. ObjectList's processed
// cut-volume prompt only invalidates correspondence or deletes connectors;
// it returns without deleting the requested volume. A second Cut is required.
export function cutNativeClipboard(project,bed,{scope=project.selectionScope||'object',decision}={}){
 const clipboard=captureNativeClipboard(project,bed,{scope});
 const removed=new Set(selectedSceneIds(project,{scope}));
 // Validate the last-normal-part constraint before any destructive decision.
 const next=removeMultipleSelection(project,{scope});
 const selected=project.objects.filter(o=>removed.has(o.id));
 const protectedParts=scope==='part'?selected.filter(o=>family(o)&&['normal_part','negative_part'].includes(o.native?.partType||'normal_part')):[];
 const cutObjects=scope==='object'?selected.filter(o=>family(o)):[];
 const targets=protectedParts.length?protectedParts:cutObjects;
 if(targets.length){
  const families=new Set(targets.map(family)),part=protectedParts.length>0;
  const confirmation={type:part?'part':'object',canDeleteConnectors:part&&targets.every(o=>Boolean(o.native?.cutConnector)),families:[...families]};
  if(decision===undefined)return{clipboard,project,confirmation,warnings:[]};
  if(decision==='cancel')return{clipboard,project,warnings:[]};
  if(part&&decision==='invalidate')return{clipboard,project:selection(project,project.objects.map(o=>families.has(family(o))?{...o,native:invalidateCutMetadata(o.native)}:o)),warnings:['Cut information invalidated. Cut the selected part again to remove it.']};
  if(part&&decision==='delete-connectors'&&confirmation.canDeleteConnectors){
   let objects=project.objects.filter(o=>!(families.has(family(o))&&o.native?.cutConnector));
   const solidGroups=new Set(objects.filter(normal).map(group));
   objects=objects.filter(o=>!families.has(family(o))||solidGroups.has(group(o)));
   return{clipboard,project:selection(project,objects),warnings:['Deleted all connectors from related cut objects; the native cut identity is retained.']};
  }
  if(!part&&decision==='delete')return{clipboard,project:{...next,objects:next.objects.map(o=>families.has(family(o))?{...o,native:invalidateCutMetadata(o.native)}:o)},warnings:[]};
  throw new Error('Choose a valid native cut-correspondence action');
 }
 if(decision!==undefined)throw new Error('This model selection does not need a cut-correspondence decision');
 // ObjectList promotes the final volume's overrides to the object config.
 const changedGroups=new Set(selected.map(group));
 const objects=next.objects.map(o=>{
  if(scope!=='part'||!changedGroups.has(group(o))||next.objects.filter(other=>group(other)===group(o)).length!==1||!Object.keys(o.native?.partSettings||{}).length)return o;
  return{...o,native:{...o.native,objectSettings:{...o.native.objectSettings,...o.native.partSettings},partSettings:{}}};
 });
 return{clipboard,project:{...next,objects},warnings:[]};
}
