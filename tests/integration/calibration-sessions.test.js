import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {BoxGeometry} from 'three';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import{tmpdir}from'node:os';import path from'node:path';
import{createCalibrationSessions}from'../../server/calibration-sessions.js';
import{createMesh,exportSTL}from'../../shared/geometry.js';
const request={printerId:'p',processId:'s',filamentId:'f',mode:'temperature',start:230,end:225,step:5};
const selected=()=>({printer:{name:'Test printer',printer_technology:'FFF',gcode_flavor:'marlin2',machine_max_junction_deviation:['0'],nozzle_diameter:['0.4'],printable_height:'250',printable_area:['0x0','250x0','250x210','0x210']},process:{name:'Test process',layer_height:'0.2',line_width:'0.45',outer_wall_speed:'120'},filament:{name:'Test filament',filament_max_volumetric_speed:['12']}});
function fixtureModel(){const geometry=new BoxGeometry(20,20,20).toNonIndexed();geometry.translate(40,40,10);const mesh=createMesh({positions:geometry.attributes.position.array});geometry.dispose();return mesh;}
async function setup(t,options={}){
 const directory=await mkdtemp(path.join(tmpdir(),'orca-calibration-session-test-'));let current=selected();
 const sessions=createCalibrationSessions({binary:'fixture',resourcesDir:'/fixture',catalog:{resolveSelection:async()=>structuredClone(current)},prepareModel:async({plan})=>({calibration:plan.request,plan,objects:[fixtureModel()]}),...options});
 const app=express();app.use('/api/calibrations',sessions.router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 t.after(async()=>{await sessions.shutdown();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})});
 const post=body=>fetch(`http://127.0.0.1:${server.address().port}/api/calibrations/prepare`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return{sessions,post,directory,changePreset:()=>{current.process.layer_height='0.16'}};
}
async function prepare(context){const response=await context.post(request);assert.equal(response.status,200);const result=await response.json();const inputPath=path.join(context.directory,`${Math.random()}.stl`);await writeFile(inputPath,new Uint8Array(exportSTL(result.objects)));return{...result,inputPath};}
const validation=prepared=>({calibration:prepared.calibration,ids:request,inputPath:prepared.inputPath,overrides:{}});

test('prepare binds a random token to exact STL bytes, native preset snapshot and allowed parameters',async t=>{
 const context=await setup(t),prepared=await prepare(context);
 assert.match(prepared.calibration.token,/^[a-f0-9]{64}$/);const validated=await context.sessions.validateUpload(validation(prepared));
 assert.equal(validated.plan.request.start,230);assert.equal(validated.selection.printer.name,'Test printer');
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),ids:{...request,printerId:'different'}}),/preset selection changed/);
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),overrides:{layer_height:'0.3'}}),/without process overrides/);
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,end:220}}),/parameters changed/);
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,plan:{}}}),/metadata was changed/);
 const modified=Buffer.from(exportSTL(prepared.objects));modified[100]^=1;await writeFile(prepared.inputPath,modified);
 await assert.rejects(context.sessions.validateUpload(validation(prepared)),/geometry changed/);
});
test('same IDs with changed resolved native configuration cannot reuse a calibration',async t=>{
 const context=await setup(t),prepared=await prepare(context);context.changePreset();await assert.rejects(context.sessions.validateUpload(validation(prepared)),/native preset changed/);
});
test('expired, evicted and unknown tokens require regeneration; cache is bounded',async t=>{
 let time=100;const context=await setup(t,{now:()=>time,ttlMs:100,maxSessions:1});const first=await prepare(context),second=await prepare(context);
 await assert.rejects(context.sessions.validateUpload(validation(first)),/expired or the server restarted/);
 await context.sessions.validateUpload(validation(second));time=201;await assert.rejects(context.sessions.validateUpload(validation(second)),/expired or the server restarted/);
 await assert.rejects(context.sessions.validateUpload({...validation(second),calibration:{...second.calibration,token:'f'.repeat(64)}}),/Regenerate/);
});
test('prepare rejects extra user-supplied settings and unsupported modes before model work',async t=>{
 let calls=0;const context=await setup(t,{prepareModel:async()=>{calls++;throw new Error('Should not reach conversion')}});
 assert.equal((await context.post({...request,plan:{gcode:'M104 S999'}})).status,400);
 assert.equal((await context.post({...request,mode:'unknown-mode'})).status,400);assert.equal(calls,0);
});
test('expensive native preparations are serialized by rejection and shutdown aborts active work',async t=>{
 let started,aborted=false;const ready=new Promise(resolve=>started=resolve);
 const context=await setup(t,{prepareModel:({signal})=>new Promise((resolve,reject)=>{started();signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'))},{once:true})})});
 const first=context.post(request);await ready;assert.equal((await context.post(request)).status,429);
 await context.sessions.shutdown();assert.equal(aborted,true);assert.equal((await first).status,503);
});
test('disconnecting the prepare response aborts native work and frees the preparation slot',async t=>{
 let started,stopped;const ready=new Promise(resolve=>started=resolve),abortObserved=new Promise(resolve=>stopped=resolve);
 const context=await setup(t,{prepareModel:({signal})=>new Promise((resolve,reject)=>{started();signal.addEventListener('abort',()=>{stopped();reject(new Error('cancelled'))},{once:true})})});
 // Use a short timeout on the operation itself so a broken abort path cannot hang the suite.
 const controller=new AbortController();
 const app=express();app.use('/api/calibrations',context.sessions.router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=fetch(`http://127.0.0.1:${server.address().port}/api/calibrations/prepare`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:controller.signal});
 await ready;controller.abort();await assert.rejects(response,/abort/i);
 await Promise.race([abortObserved,new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Native preparation was not aborted')),1000);timer.unref()})]);
});
test('input shaping sessions bind model, firmware shaper, axis ranges and damping parameters',async t=>{
 const context=await setup(t),parameters={printerId:'p',processId:'s',filamentId:'f',mode:'input-shaping-frequency',testModel:'fast',shaperType:'ZV',frequencyStartX:15,frequencyEndX:110,frequencyStartY:20,frequencyEndY:100,damping:.15};
 const response=await context.post(parameters);const prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));
 prepared.inputPath=path.join(context.directory,'shaping.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));
 const checked=await context.sessions.validateUpload(validation(prepared));assert.equal(checked.plan.request.frequencyEndY,100);
 for(const change of [{testModel:'ringing'},{frequencyEndY:95},{damping:.2}]) await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,...change}}),/parameters changed/);
 assert.equal((await context.post({...parameters,command:'M593 F999'})).status,400);
});
test('cornering sessions bind native model and range without allowing a client-selected firmware parameter kind',async t=>{
 const context=await setup(t),parameters={printerId:'p',processId:'s',filamentId:'f',mode:'cornering',testModel:'scv',start:1,end:15};
 const response=await context.post(parameters),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));assert.equal(prepared.plan.corneringKind,'jerk');
 prepared.inputPath=path.join(context.directory,'cornering.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));
 await context.sessions.validateUpload(validation(prepared));
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,end:20}}),/parameters changed/);
 assert.equal((await context.post({...parameters,corneringKind:'junction-deviation'})).status,400);
});
test('VFA sessions bind exact native geometry, preset snapshot and speed schedule',async t=>{
 const context=await setup(t),parameters={printerId:'p',processId:'s',filamentId:'f',mode:'vfa',start:40,end:80,step:20};
 const response=await context.post(parameters),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));assert.equal(prepared.plan.overrides.process.spiral_mode,'1');
 prepared.inputPath=path.join(context.directory,'vfa.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));await context.sessions.validateUpload(validation(prepared));
 for(const change of [{start:50},{end:100},{step:10}])await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,...change}}),/parameters changed/);
 assert.equal((await context.post({...parameters,outer_wall_speed:900})).status,400);
 context.changePreset();await assert.rejects(context.sessions.validateUpload(validation(prepared)),/native preset changed/);
});
test('max volumetric sessions bind the generated ramp and reject arbitrary nozzle and process overrides',async t=>{
 const context=await setup(t,{catalog:{resolveSelection:async()=>({...selected(),filament:{...selected().filament,filament_flow_ratio:['.98']}})}}),parameters={printerId:'p',processId:'s',filamentId:'f',mode:'max-volumetric-speed',start:5,end:7,step:1};
 const response=await context.post(parameters),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));assert.equal(prepared.plan.overrides.process.layer_height,'0.32');assert.equal(prepared.plan.overrides.filament.filament_max_volumetric_speed[0],'200');
 prepared.inputPath=path.join(context.directory,'volumetric.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));await context.sessions.validateUpload(validation(prepared));
 for(const change of [{start:4},{end:8},{step:.5}])await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,...change}}),/parameters changed/);
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),overrides:{outer_wall_line_width:'1'}}),/without process overrides/);assert.equal((await context.post({...parameters,nozzle:.8})).status,400);
});

test('retraction sessions bind the native extrusion range and reject changed wipe metadata or settings',async t=>{
 const context=await setup(t,{catalog:{resolveSelection:async()=>({...selected(),printer:{...selected().printer,retraction_length:['.8'],z_hop:['0'],retract_before_wipe:['70'],retract_restart_extra:['0']},filament:{...selected().filament,slow_down_layer_time:['0'],filament_retraction_length:['nil'],filament_z_hop:['nil'],filament_retract_before_wipe:['nil'],filament_retract_restart_extra:['nil']}})}}),parameters={printerId:'p',processId:'s',filamentId:'f',mode:'retraction',start:0,end:.4,step:.2};
 const response=await context.post(parameters),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));assert.equal(prepared.plan.overrides.printer.use_firmware_retraction,'0');assert.equal(prepared.plan.overrides.process.gcode_comments,'1');
 prepared.inputPath=path.join(context.directory,'retraction.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));await context.sessions.validateUpload(validation(prepared));
 for(const change of [{start:.1},{end:.6},{step:.1}])await assert.rejects(context.sessions.validateUpload({...validation(prepared),calibration:{...prepared.calibration,...change}}),/parameters changed/);
 await assert.rejects(context.sessions.validateUpload({...validation(prepared),overrides:{retraction_length:'10'}}),/without process overrides/);assert.equal((await context.post({...parameters,beforeWipe:0})).status,400);
});

test('native calibration resolution keeps scalar parsing and native sparse defaults consistent at preparation and validation',async t=>{
 const current=selected();delete current.printer.machine_max_junction_deviation;current.process.bridge_speed=['57','83'];
 let preparedSelection;const context=await setup(t,{catalog:{resolveSelection:async()=>structuredClone(current)},prepareModel:async({plan,selection})=>{preparedSelection=selection;return{plan,objects:[fixtureModel()]};}});
 const parameters={printerId:'p',processId:'s',filamentId:'f',mode:'cornering',start:0,end:.2,testModel:'scv'},response=await context.post(parameters),prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));
 assert.equal(prepared.plan.corneringKind,'junction-deviation','Absent Marlin2 field uses the actual native default rather than a JS zero fallback');assert.ok(Number(preparedSelection.printer.machine_max_junction_deviation[0])>0);assert.equal(preparedSelection.process.bridge_speed,'57');
 prepared.inputPath=path.join(context.directory,'normalized.stl');await writeFile(prepared.inputPath,new Uint8Array(exportSTL(prepared.objects)));
 const valid=await context.sessions.validateUpload(validation(prepared));assert.equal(valid.selection.process.bridge_speed,'57');
 current.process.bridge_speed=['58','83'];await assert.rejects(context.sessions.validateUpload(validation(prepared)),/native preset changed/);
});

test('calibration session binds inactive native material alternatives without using them as active values',async t=>{
 const current=selected();Object.assign(current.filament,{filament_extruder_variant:['Direct Drive Standard','Direct Drive High Flow'],filament_max_volumetric_speed:['12','40']});
 let preparedSelection;const context=await setup(t,{catalog:{resolveSelection:async()=>structuredClone(current)},prepareModel:async({plan,selection})=>{preparedSelection=selection;return{plan,objects:[fixtureModel()]};}}),prepared=await prepare(context);
 assert.deepEqual(preparedSelection.filament.filament_max_volumetric_speed,['12']);await context.sessions.validateUpload(validation(prepared));
 current.filament.filament_max_volumetric_speed=['12','45'];await assert.rejects(context.sessions.validateUpload(validation(prepared)),/native preset changed/);
});
