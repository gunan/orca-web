import { createMesh } from '../../shared/geometry.js';
export function makeNativeAcceptanceProject(base) {
  const positions=base.objects[0].positions;
  const native={groupId:'cutout',objectName:'Native cutout',objectSettings:{extruder:'1',wall_loops:'4'},partSettings:{},partType:'normal_part'};
  return {...base,name:'Two plates with native overrides',plates:[{id:'plate-1',name:'Cutout & modifiers'},{id:'plate-2',name:'Second "blue" plate'}],activePlateId:'plate-1',selectedId:'base',
    objects:[
      createMesh({id:'base',name:'Red main',positions,plateId:'plate-1',position:[30,40,0],filamentSlot:1,native}),
      createMesh({id:'hole',name:'Through hole',positions,plateId:'plate-1',position:[30,40,0],scale:[.4,.4,1.1],filamentSlot:1,native:{...native,partType:'negative_part'}}),
      createMesh({id:'modifier',name:'Dense corner',positions,plateId:'plate-1',position:[25,35,0],scale:[.5,.5,.5],filamentSlot:1,native:{...native,partType:'modifier_part',partSettings:{sparse_infill_density:'50%'}}}),
      createMesh({id:'blue',name:'Blue part',positions,plateId:'plate-1',position:[60,40,0],filamentSlot:2,native:{...native,groupId:'blue',objectName:'Blue object',objectSettings:{extruder:'2',wall_loops:'2'},partSettings:{outer_wall_speed:'45'}}}),
      createMesh({id:'second',name:'Second plate object',positions,plateId:'plate-2',position:[70,80,0],filamentSlot:2,native:{...native,groupId:'second',objectName:'Second plate object',objectSettings:{extruder:'2'},partSettings:{}}})]};
}
