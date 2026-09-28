import {BoxGeometry,Matrix4} from 'three';
import {createMesh} from '../../shared/geometry.js';
import {emptyProject} from '../../shared/project.js';
import {prepareNativePrimeTower} from '../../shared/native-prime-tower.js';
export const towerSettings={printer_technology:'FFF',printable_area:['0x0','200x0','200x200','0x200'],printable_height:'250',bed_exclude_area:[],extruder_printable_area:[],extruder_printable_height:['0'],filament_colour:['#0080FF','#FF4000','#40FF00'],nozzle_diameter:['0.4'],filament_diameter:['1.75','1.75','1.75'],filament_change_length:['10','10','10'],enable_prime_tower:'1',print_sequence:'by layer',timelapse_type:'0',enable_wrapping_detection:'0',layer_height:'0.2',prime_tower_width:'60',prime_volume:'45',prime_tower_infill_gap:'150',wipe_tower_wall_type:'rectangle',wipe_tower_rib_width:'10',wipe_tower_extra_rib_length:'0',wipe_tower_x:['100'],wipe_tower_y:['140'],wipe_tower_rotation_angle:'0',enable_support:'0',raft_layers:'0',support_filament:'0',support_interface_filament:'0',outer_wall_filament_id:'0',inner_wall_filament_id:'0',sparse_infill_filament_id:'0',internal_solid_filament_id:'0',top_surface_filament_id:'0',bottom_surface_filament_id:'0'};
export function towerCube(id,slot=1,position=[35,35,10],options={}){return createMesh({id,name:'Cube',plateId:'plate-1',positions:[...new BoxGeometry(20,20,20).toNonIndexed().attributes.position.array],position,filamentSlot:slot,...options});}
export function towerProject(){return{...emptyProject(),objects:[towerCube('one'),towerCube('two',2,[70,35,10])],selectedId:'one',selectedIds:['one']};}
export function primeTowerCases(){
 const base=prepareNativePrimeTower(towerProject(),towerSettings),cases=[];
 const add=(name,fn=()=>{})=>{const request=structuredClone(base);fn(request);cases.push({name,request});};
 add('two-material rectangle');
 add('tower disabled',r=>r.settings.enable_prime_tower='0');
 add('single palette',r=>{r.filamentCount=1;r.objects.pop();});
 add('single used filament',r=>{r.objects.pop();});
 add('single smooth timelapse',r=>{r.filamentCount=1;r.objects.pop();r.settings.timelapse_type='1';});
 add('single wrapping detection',r=>{r.filamentCount=1;r.objects.pop();r.settings.enable_wrapping_detection='1';});
 add('sequential two printable',r=>r.settings.print_sequence='by object');
 add('sequential one nonprintable',r=>{r.settings.print_sequence='by object';r.objects[1].instances[0].printable=false;});
 add('outside second object',r=>r.objects[1].instances[0].matrix[12]=230);
 add('overheight second object',r=>r.objects[1].instances[0].matrix[14]=260);
 add('excluded second object',r=>r.plate.excluded=[[55,20],[85,20],[85,50],[55,50]]);
 add('sinking exclusion original limitation',r=>{r.objects[1].instances[0].matrix[14]=8;r.plate.excluded=[[55,20],[85,20],[85,50],[55,50]];});
 add('sinking partly outside bed',r=>{r.objects[1].instances[0].matrix[12]=198;r.objects[1].instances[0].matrix[14]=8;});
 add('nonrectangular native nonsinking bounds',r=>{r.plate.shape=[[0,0],[200,0],[0,200]];r.objects[1].instances[0].matrix[12]=170;r.objects[1].instances[0].matrix[13]=170;});
 add('nonrectangular sinking exact volume',r=>{r.plate.shape=[[0,0],[200,0],[0,200]];r.objects[1].instances[0].matrix[12]=100;r.objects[1].instances[0].matrix[13]=100;r.objects[1].instances[0].matrix[14]=8;});
 add('linked first instance on another plate',r=>{const i=structuredClone(r.objects[1].instances[0]);i.plateId='plate-2';i.matrix[12]+=240;r.objects[1].instances.unshift(i);});
 add('linked remote instance extends native height',r=>{const i=structuredClone(r.objects[1].instances[0]);i.plateId='plate-2';i.matrix[12]+=240;i.matrix[14]+=80;r.objects[1].instances.push(i);});
 add('ranges and support assignments',r=>{r.objects.pop();r.objects[0].ranges=[{extruder:'2'}];r.assignments.enable_support='1';r.assignments.support_interface_filament='3';});
 add('painted second filament',r=>{r.objects.pop();r.objects[0].parts[0].color={'0':'8'};});
 add('tool change third filament',r=>{r.events=[{type:'ToolChange',extruder:3}];});
 add('rib wall tall tower',r=>{r.settings.wipe_tower_wall_type='rib';r.settings.wipe_tower_extra_rib_length='5';r.objects[0].instances[0].matrix[10]=6;r.objects[0].instances[0].matrix[14]=60;});
 add('dual nozzle change volume',r=>{r.settings.nozzle_diameter=['0.4','0.4'];r.settings.filament_change_length=['12','18','10'];r.settings.filament_diameter=['1.75','2.85','1.75'];});
 add('float narrowed rotated offset',r=>{r.placement=[93.123456789,101.987654321,37.123456789];r.settings.prime_tower_width='59.123456789';r.settings.prime_volume='41.123456789';});
 add('empty model ignores tool events',r=>{r.objects=[];r.events=[{type:'ToolChange',extruder:2}];});
 add('second plate native origins',r=>{r.plateId='plate-2';r.plate.origin=[240,0,0];r.plate.shape=r.plate.shape.map(([x,y])=>[x+240,y]);for(const o of r.objects)for(const i of o.instances){i.plateId='plate-2';i.matrix[12]+=240;}r.placement=[93.123456789,140,0];});
 add('native default single exclusion sentinel',r=>r.plate.excluded=[[0,0]]);
 add('native trailing exclusion points ignored',r=>r.plate.excluded=[[55,20],[85,20],[85,50],[55,50],[100,100]]);
 return cases;
}
