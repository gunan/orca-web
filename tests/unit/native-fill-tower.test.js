import test from 'node:test';import assert from 'node:assert/strict';
import {prepareNativeFillBed} from '../../shared/native-fill-bed.js';
import {towerProject,towerSettings} from '../fixtures/native-prime-tower-input.js';
test('Fill derives its tower from the selected plate and complete project without mutating either input',()=>{
 const project=towerProject(),settings=structuredClone(towerSettings);
 project.plates.push({id:'second',name:'Second',native:{metadata:{print_sequence:'by object'}}});
 project.objects[0].plateId='second';project.objects[1].visible=false;
 settings.wipe_tower_x=['7','93'];const before=JSON.stringify({project,settings});
 const request=prepareNativeFillBed(project,settings,{},{isBblPrinter:false});
 assert.equal(request.plate.index,1);assert.equal(request.towerPreview.plateId,'second');
 assert.equal(request.towerPreview.settings.print_sequence,'by object');
 assert.equal(request.towerPreview.objects.length,2);assert.equal(request.towerPreview.placement[0],93);
 assert.deepEqual(request.towerPreview.objects.map(o=>o.instances[0].plateId),['second','plate-1']);
 assert.equal(JSON.stringify({project,settings}),before);
});
test('disabled Fill towers need no redundant geometry; enabled towers reject missing native palette',()=>{
 const project=towerProject(),settings={...towerSettings,enable_prime_tower:'0'};
 delete settings.filament_colour;
 assert.equal('towerPreview' in prepareNativeFillBed(project,settings,{},{isBblPrinter:false}),false);
 settings.enable_prime_tower='1';assert.throws(()=>prepareNativeFillBed(project,settings,{},{isBblPrinter:false}),/native filament palette/);
});
