import test from 'node:test';import assert from 'node:assert/strict';
import express from 'express';import {once} from 'node:events';
import {createNativeArrangementService} from '../../server/native-arrangement.js';
import {towerProject,towerSettings} from '../fixtures/native-prime-tower-input.js';
test('Fill service ignores forged tower data, uses effective native presets, and omits redundant geometry from its reply',async t=>{
 let nativeRequest;
 const service=createNativeArrangementService({projects:{prepareGeometry:async()=>({project:towerProject(),settings:{...towerSettings,prime_tower_width:'999'},effectiveSettings:towerSettings,context:{isBblPrinter:false},warnings:[]})},worker:{identity:async()=>({metadata:{}}),shutdown:async()=>{},process:async bytes=>{
  nativeRequest=JSON.parse(bytes);const source=nativeRequest.objects.find(o=>o.id===nativeRequest.selectedObjectId);
  return{format:'orca-native-fill-bed',version:1,sourceRevision:nativeRequest.sourceRevision,selectedObjectId:source.id,selectedInstanceId:nativeRequest.selectedInstanceId,added:0,requiresArrange:false,instances:source.instances.map((i,index)=>({...i,index,sourceInstanceId:i.id}))};
 }}});
 const app=express();app.use('/api/geometry',service.router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await service.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/geometry/fill-bed`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectRequest:{project:towerProject()},towerPreview:{visible:false,size:[1,1,1]},options:{}})});
 assert.equal(response.status,200);const body=await response.json();assert.equal(nativeRequest.towerPreview.operation,'prime-tower-preview');
 assert.equal(nativeRequest.towerPreview.settings.prime_tower_width,'60');assert.equal(nativeRequest.towerPreview.objects.length,2);
 assert.equal('towerPreview' in body.request,false);assert.equal(body.result.added,0);
});
test('Arrange prepares every plate for the existing tower and never accepts client-provided footprints',async t=>{
 let preparation,native;
 const service=createNativeArrangementService({projects:{prepareGeometry:async input=>{preparation=input;return{project:towerProject(),effectiveSettings:towerSettings,warnings:[]};}},worker:{identity:async()=>({metadata:{}}),shutdown:async()=>{},process:async bytes=>{native=JSON.parse(bytes);return{format:'orca-native-arrangement',version:1,sourceRevision:native.sourceRevision,objects:native.objects.map(o=>({id:o.id,matrix:o.matrix,bedIndex:0}))};}}});
 const app=express();app.use('/api/geometry',service.router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await service.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/geometry/arrange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectRequest:{project:towerProject(),allPlates:false},towerPreview:{visible:false},towerPlateIndex:35,options:{}})});
 assert.equal(response.status,200);assert.equal(preparation.allPlates,true);assert.equal(native.towerPlateIndex,0);assert.equal(native.towerPreview.plateId,'plate-1');assert.equal(native.towerPreview.objects.length,2);assert.equal('towerPreview' in (await response.json()).request,false);
});
