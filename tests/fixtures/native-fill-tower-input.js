import {towerProject,towerSettings} from './native-prime-tower-input.js';
import {prepareNativeFillBed} from '../../shared/native-fill-bed.js';
export function fillTowerCases(){
 const cases=[];
 const add=(name,edit=()=>{})=>{
  const project=towerProject(),settings={...structuredClone(towerSettings),prime_tower_brim_width:'3',skirt_loops:'0',filament_type:['PLA','PLA','PLA'],printer_structure:'i3'};
  project.objects[0].scale=[2,2,1];project.objects[0].position=[45,45,10];project.objects[1].position=[135,55,10];
  edit(project,settings);
  cases.push({name,request:prepareNativeFillBed(project,settings,{},{isBblPrinter:false})});
 };
 add('two materials with double brim');
 add('larger prime volume',(_p,s)=>s.prime_volume='200');
 add('zero brim',(_p,s)=>s.prime_tower_brim_width='0');
 add('automatic brim from native shell height',(p,s)=>{s.prime_tower_brim_width='-1';p.objects[1].scale=[1,1,6];p.objects[1].position[2]=60;});
 add('edge placement clamps raw coordinates',(_p,s)=>{s.wipe_tower_x=['-15.123456789'];s.wipe_tower_y=['199.987654321'];});
 add('native Fill deliberately ignores tower rotation',(_p,s)=>s.wipe_tower_rotation_angle='67.123456789');
 add('second plate retains native zero obstacle bed index',(p,s)=>{p.plates.push({id:'second',name:'Second'});p.activePlateId='second';p.objects.forEach(o=>o.plateId='second');s.wipe_tower_x=['5','90.123456789'];s.wipe_tower_y=['10','155.987654321'];});
 add('sequential plate hides a two-instance tower',(p)=>p.plates[0].native={metadata:{print_sequence:'by object'}});
 add('single used material hides tower',(p)=>p.objects.pop());
 add('single material smooth timelapse still reserves tower',(p,s)=>{p.objects.pop();s.filament_colour=['#0080FF'];s.timelapse_type='1';});
 add('wrapping detection still reserves single-material tower',(p,s)=>{p.objects.pop();s.filament_colour=['#0080FF'];s.enable_wrapping_detection='1';});
 add('tool change adds third native filament',(p)=>p.plates[0].layerEvents={version:1,items:[{id:'change',height:2,type:'ToolChange',extruder:3}]});
 add('native float grid retains tower only in candidate budgeting',(p)=>p.objects[0].scale=[.8,.8,1]);
 return cases;
}
