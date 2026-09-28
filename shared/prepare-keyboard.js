import {selectedSceneIds} from './multi-selection.js';
import {filamentSlotCount} from './filament-slots.js';

// GLCanvas3D::on_key multiplies by the inverse view's 3x3, then
// discards Z. Do not normalize the projected vector: front-view Up is zero.
export function cameraRelativeNudge(delta, matrix) {
  if(!Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite)||!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite))throw new Error('Camera movement needs a finite camera transform');
  return [0,1].map(row=>matrix[row]*delta[0]+matrix[row+4]*delta[1]+matrix[row+8]*delta[2]).concat(0);
}

// Native waits 500 ms after 1. A following 0–6 selects 10–16;
// 7–9 remain 7–9, and a lone 0 means inherit/default, not slot 10.
export function createFilamentKeySequence(apply,{schedule=setTimeout,cancel=clearTimeout}={}) {
  let timer=null;
  const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
  return {push(digit){
    if(!Number.isInteger(digit)||digit<0||digit>9)throw new Error('Invalid filament digit');
    if(digit===1&&timer===null){timer=schedule(()=>{timer=null;apply(1);},500);return;}
    const value=timer!==null&&digit<7?digit+10:digit;clear();apply(value);
  },clear};
}

// ObjectList::set_extruder_for_selected_items updates all selected objects or
// parts. Object changes clear normal-part overrides; modifier overrides stay.
export function assignSelectedFilament(project,slot) {
  if(!Number.isInteger(slot)||slot<0||slot>64)throw new Error('Invalid filament slot');
  if(slot>filamentSlotCount(project))return project;
  const scope=project.selectionScope||'object',selected=new Set(selectedSceneIds(project,{scope}));
  if(!selected.size)return project;
  let changed=false;
  const objects=project.objects.map(object=>{
    if(!selected.has(object.id))return object;
    const role=object.native?.partType||'normal_part';
    if(scope==='part'&&!['normal_part','modifier_part'].includes(role))return object;
    const native={...object.native,groupId:object.native?.groupId||object.id,objectName:object.native?.objectName||object.name,partType:role,objectSettings:{...object.native?.objectSettings},partSettings:{...object.native?.partSettings}};
    const parent=Number(native.objectSettings.extruder)||1;
    let effective;
    if(scope==='object'){
      const next=slot||1;native.objectSettings.extruder=String(next);
      if(role==='normal_part')delete native.partSettings.extruder;
      effective=Number(native.partSettings.extruder)||next;
    }else{
      const next=slot===0&&role==='normal_part'?parent:slot;
      native.partSettings.extruder=String(next);effective=next||parent;
    }
    if(effective===object.filamentSlot&&JSON.stringify(native)===JSON.stringify(object.native))return object;
    changed=true;return{...object,native,filamentSlot:effective};
  });
  return changed?{...project,objects,nativeWorkflow:true}:project;
}

// ObjectList::toggle_printable_state uses the first selected object's state
// for the entire selection; it does not individually invert mixed values.
export function toggleSelectedPrintable(project) {
  if((project.selectionScope||'object')!=='object')return project;
  const ids=new Set(selectedSceneIds(project)),first=project.objects.find(object=>ids.has(object.id));
  if(!first)return project;
  const printable=first.printable===false;
  return {...project,objects:project.objects.map(object=>ids.has(object.id)?{...object,printable}:object)};
}
