import test from'node:test';import assert from'node:assert/strict';import express from'express';import{BoxGeometry}from'three';
import{createCalibrationSessions}from'../../server/calibration-sessions.js';import{createMesh}from'../../shared/geometry.js';import{prepareFlowRatioObjects}from'../../shared/flow-ratio-calibration.js';
const ids={printerId:'p',processId:'s',filamentId:'f'},request={...ids,mode:'flow-ratio',method:'coarse',pattern:'monotonic'};
const native=()=>({printer:{name:'Printer',gcode_flavor:'marlin2',nozzle_diameter:['0.4'],printable_height:'250',printable_area:['0x0','250x0','250x210','0x210']},process:{name:'Process',initial_layer_print_height:'0.2',top_surface_speed:'100',internal_solid_infill_speed:'150'},filament:{name:'Filament',filament_flow_ratio:['.98'],filament_max_volumetric_speed:['20']}});
async function setup(t,options={}){
 let preset=native(),saves=[];const catalog={resolveSelection:async()=>structuredClone(preset),saveCustom:async input=>{saves.push(input);return{id:'saved-'+saves.length,...input}}};
 const prepareModel=async({plan})=>{const imported=plan.flow.modifiers.map((modifier,index)=>{const geometry=new BoxGeometry(10,10,2).toNonIndexed();geometry.translate(index*12,0,1);const mesh=createMesh({id:'specimen-'+index,name:'flowrate_'+(modifier<0?'m'+Math.abs(modifier):modifier),positions:geometry.attributes.position.array});geometry.dispose();return mesh;});const prepared=prepareFlowRatioObjects(imported,plan,{min:[0,0,0],max:[250,210,250]});return{plan:{...plan,specimens:prepared.specimens},objects:prepared.objects,nativeProject:{project:{objects:prepared.objects},bytes:new Uint8Array([1,2,3]),settings:{},summary:{objectCount:9},warnings:[]}};};
 const sessions=createCalibrationSessions({catalog,prepareModel,...options}),app=express();app.use('/api/calibrations',sessions.router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});t.after(async()=>{await sessions.shutdown();await new Promise(resolve=>server.close(resolve))});
 const post=(route,body)=>fetch(`http://127.0.0.1:${server.address().port}/api/calibrations/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const response=await post('prepare',request),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));
 return{sessions,post,prepared,saves,changePreset:()=>{preset.filament.filament_flow_ratio=['1.01']}};
}
test('flow project token rejects geometry, grouping, ratio, visibility and selection changes',async t=>{
 const context=await setup(t),{prepared,sessions}=context,valid={calibration:prepared.calibration,ids,objects:prepared.objects};assert.deepEqual([...((await sessions.validateProject(valid)).bytes)],[1,2,3]);assert.equal(prepared.nativeProject,undefined);
 for(const change of [objects=>objects[0].positions[0]++,objects=>objects[0].native.groupId='different',objects=>objects[0].native.objectSettings.print_flow_ratio='2',objects=>objects[0].visible=false,objects=>objects.reverse()]){const objects=structuredClone(prepared.objects);change(objects);await assert.rejects(sessions.validateProject({...valid,objects}),/changed/);}
 await assert.rejects(sessions.validateProject({...valid,ids:{...ids,filamentId:'wrong'}}),/selection changed/);
 await assert.rejects(sessions.validateProject({...valid,calibration:{...prepared.calibration,method:'fine'}}),/parameters changed/);
});
test('flow result uses bound specimen formula, creates a new preset and deduplicates identical retries',async t=>{
 const {post,prepared,saves}=await setup(t),specimen=prepared.plan.specimens.find(item=>item.modifier===20),body={token:prepared.calibration.token,objectId:specimen.objectId,name:'Measured flow'};
 const responses=await Promise.all([post('result',body),post('result',body)]),results=await Promise.all(responses.map(response=>response.json()));assert.deepEqual(responses.map(response=>response.status),[201,201]);assert.equal(results[0].preset.id,results[1].preset.id);assert.equal(saves.length,1);assert.deepEqual(saves[0],{type:'filament',name:'Measured flow',baseId:'f',settings:{filament_flow_ratio:['1.176']},compatiblePrinterIds:['p']});
 assert.equal((await post('result',{...body,flowRatio:99})).status,400);assert.equal((await post('result',{...body,objectId:'not-generated'})).status,400);assert.equal((await post('result',{...body,name:''})).status,400);assert.equal(saves.length,1);
});
test('changed or expired source presets cannot save a measured flow result',async t=>{
 let time=100;const context=await setup(t,{now:()=>time,ttlMs:100}),body={token:context.prepared.calibration.token,objectId:context.prepared.plan.specimens[0].objectId,name:'Measured'};context.changePreset();const changed=await context.post('result',body);assert.equal(changed.status,409);assert.match((await changed.json()).error,/preset changed/);time=201;const expired=await context.post('result',body);assert.equal(expired.status,409);assert.match((await expired.json()).error,/expired|restarted/);assert.equal(context.saves.length,0);
});

test('cached flow project export validates the exact token, parameters, presets and geometry before returning cached bytes',async t=>{
 const {post,prepared,changePreset}=await setup(t),body={calibration:prepared.calibration,ids,objects:prepared.objects};
 const exported=await post('project',body);assert.equal(exported.status,200);assert.equal(exported.headers.get('cache-control'),'no-store');assert.match(exported.headers.get('content-disposition'),/flow-ratio-calibration\.3mf/);assert.deepEqual([...new Uint8Array(await exported.arrayBuffer())],[1,2,3]); // Fake transport fixture only; real 3MF validity is checked in native acceptance.
 for(const patch of [{calibration:{...body.calibration,token:'f'.repeat(64)}},{calibration:{...body.calibration,method:'fine'}},{ids:{...ids,filamentId:'other'}},{objects:body.objects.slice(1)}]){const response=await post('project',{...body,...patch});assert.equal(response.status,409);assert.match((await response.json()).error,/Regenerate/);}
 const edited=structuredClone(body.objects);edited[0].position[0]++;assert.equal((await post('project',{...body,objects:edited})).status,409);
 assert.equal((await post('project',{...body,settings:{layer_height:.4}})).status,400);
 changePreset();const changed=await post('project',body);assert.equal(changed.status,409);assert.match((await changed.json()).error,/preset changed/);
});
test('expired or shutdown calibration exports require regeneration and never return cached model bytes',async t=>{
 let time=100;const {post,prepared,sessions}=await setup(t,{now:()=>time,ttlMs:100}),body={calibration:prepared.calibration,ids,objects:prepared.objects};time=200;
 const expired=await post('project',body);assert.equal(expired.status,409);assert.match((await expired.json()).error,/expired or the server restarted.*Regenerate/);
 await sessions.shutdown();const restarted=await post('project',body);assert.equal(restarted.status,409);assert.match((await restarted.json()).error,/unavailable.*Regenerate/);
});
