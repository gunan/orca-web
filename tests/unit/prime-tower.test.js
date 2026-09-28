import test from'node:test';import assert from'node:assert/strict';
import{primeTowerState,updatePrimeTower}from'../../shared/prime-tower.js';import{emptyProject}from'../../shared/project.js';
test('prime tower placement expands native vectors by plate and preserves other plate coordinates and process overrides',()=>{
 const project={...emptyProject(),plates:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],activePlateId:'b',projectOverrides:{wipe_tower_x:['15','25','35'],wipe_tower_y:['20','30','40'],flush_volumes_matrix:['0']},overrides:{wall_loops:'4'}};
 const result=updatePrimeTower(project,{enabled:true,x:'75',y:'80',width:'35',rotation:'90'});assert.deepEqual(result.projectOverrides.wipe_tower_x,['15','75','35']);assert.deepEqual(result.projectOverrides.wipe_tower_y,['20','80','40']);assert.deepEqual(result.projectOverrides.flush_volumes_matrix,['0']);assert.equal(result.overrides.wall_loops,'4');assert.equal(result.overrides.enable_prime_tower,'1');assert.equal(primeTowerState(result).rotation,90);assert.equal(project.projectOverrides.wipe_tower_x[1],'25');
});
test('embedded tower edits retain project metadata and native fallback coordinates while invalid input cannot mutate a project',()=>{
 const project={...emptyProject(),useEmbeddedSettings:true,nativeSettings:{wipe_tower_x:['5'],wipe_tower_y:['6'],filament_colour:['#123456'],prime_tower_width:'40'},plates:[{id:'plate-1',name:'One'},{id:'two',name:'Two'}],activePlateId:'two'};
 const result=updatePrimeTower(project,{...primeTowerState(project),enabled:true,x:20,y:30});assert.deepEqual(result.nativeSettings.wipe_tower_x,['5','20']);assert.deepEqual(result.nativeSettings.filament_colour,['#123456']);assert.equal(result.projectOverrides,undefined);
 for(const invalid of [{width:1},{x:''},{y:'nan'},{rotation:Infinity}])assert.throws(()=>updatePrimeTower(project,{...primeTowerState(project),...invalid}));
});
