import test from 'node:test';import assert from 'node:assert/strict';
import{needsNativeProfileContext,nativeScopeDifference,resolveNativeProfileContext}from'../../server/native-profile-editor.js';
test('variant scopes are distinguished from ordinary profile vectors and native differences exclude metadata and hidden settings',()=>{
 assert.equal(needsNativeProfileContext('filament',{filament_extruder_variant:['Direct Drive Standard','Direct Drive High Flow']}),true);
 assert.equal(needsNativeProfileContext('machine',{nozzle_diameter:['.4','.6']}),false);
 assert.deepEqual(nativeScopeDifference('filament',{filament_density:['1.2'],filament_max_volumetric_speed:['25','40']},{filament_density:['1.2'],filament_max_volumetric_speed:['27','40'],filament_extruder_variant:['x','y'],name:'Edited'}),{filament_max_volumetric_speed:['27','40']});
 const changed={filament_max_volumetric_speed:['27','40']},diff=nativeScopeDifference('filament',{},changed);diff.filament_max_volumetric_speed[1]='43';assert.equal(changed.filament_max_volumetric_speed[1],'40');
});
test('malformed editor context is rejected before catalog or native process access',async()=>{
 const catalog={source(){assert.fail('Malformed context must not access catalog')}},nativeConfig={run(){assert.fail('Malformed context must not spawn')}};
 for(const bad of [{type:'x'},{selection:[]},{selection:{host:'secret'}},{selection:{printerId:1}},{projectSettings:[]},{filamentIndex:-1},{filamentIndex:64},{filamentIndex:1.5}])await assert.rejects(()=>resolveNativeProfileContext({catalog,nativeConfig,type:'filament',id:'safe',...bad}),/scope|selection|context|slot/);
});
