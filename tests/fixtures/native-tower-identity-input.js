import {towerProject,towerSettings} from './native-prime-tower-input.js';
import {instanceGroupKey} from '../../shared/native-instances.js';
export function towerIdentityCases(){
 const cases=[],add=(name,mutate)=>{const project=towerProject();mutate(project);project.selectedId=project.objects[0].id;project.selectedIds=[project.selectedId];cases.push({name,project,settings:structuredClone(towerSettings)});};
 add('family token equals a standalone group key',p=>p.objects[0].native={instanceFamily:instanceGroupKey(p.objects[1])});
 add('standalone group precedes a colliding family token',p=>{p.objects[0].native={instanceFamily:instanceGroupKey(p.objects[1])};p.objects.reverse();});
 add('long plate and object IDs compose beyond the worker bound',p=>{const plate='P'.repeat(180);p.plates[0].id=plate;p.activePlateId=plate;p.objects.forEach((o,i)=>{o.plateId=plate;o.id=String(i)+'X'.repeat(180);});});
 add('escaped group IDs exceed the bound only after JSON encoding',p=>p.objects.forEach((o,i)=>o.native={groupId:String(i)+'"\\'.repeat(90)}));
 add('multibyte group IDs exceed the worker byte bound',p=>p.objects.forEach((o,i)=>o.native={groupId:String(i)+'工具'.repeat(100)}));
 add('multibyte family token exceeds the worker byte bound',p=>p.objects[0].native={instanceFamily:'工具'.repeat(100)});
 add('user family token collides with an allocated worker ID',p=>{p.objects[0].native={groupId:'X'.repeat(256)};p.objects[1].native={instanceFamily:'tower-model-0'};});
 add('allocated worker ID skips an existing user family token',p=>{p.objects[0].native={instanceFamily:'tower-model-1'};p.objects[1].native={groupId:'X'.repeat(256)};});
 return cases;
}
