import test from 'node:test';import assert from 'node:assert/strict';import express from'express';
import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{createPresetCatalog}from'../../server/presets.js';import{createCustomPresetCatalog,createCustomPresetRouter}from'../../server/custom-presets.js';

test('HTTP preparation reviews hidden native corrections and final save revalidates signed decisions durably',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'orca-correction-api-')),baseCatalog=await createPresetCatalog({profilesDir:path.resolve('tests/fixtures/presets')}),catalog=await createCustomPresetCatalog({baseCatalog,dataDir});
 const app=express();app.use(express.json({limit:'1mb'}));app.use('/api/presets/custom',createCustomPresetRouter({catalog}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});
 const host=`http://127.0.0.1:${server.address().port}`,defaults=catalog.list().defaults;
 async function call(url,body,method='POST',origin=host){const response=await fetch(`${host}/api/presets/custom${url}`,{method,headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
 const imported=await call('/import',{preset:{type:'process',name:'Native source hidden support',enforce_support_layers:'7'},compatiblePrinterIds:[defaults.printerId]});assert.equal(imported.status,201);
 const body={type:'process',name:'Safe vase',baseId:imported.data.id,settings:{spiral_mode:true},compatiblePrinterIds:[defaults.printerId],selection:defaults};
 assert.equal((await call('/prepare',body,'POST','http://untrusted.invalid')).status,403);
 let response=await call('/prepare',body);assert.equal(response.status,200);assert.equal(response.data.ready,false);assert.ok(response.data.plan.groups[0].signature);
 const pending=await call('',body);assert.equal(pending.status,409);assert.equal(pending.data.preparation.ready,false);assert.equal(catalog.listCustom().length,1);
 const decisions=response.data.plan.groups.map(group=>({id:group.id,signature:group.signature,choice:'apply'}));
 const rejected=await call('',{...body,correctionBatches:[decisions.map(item=>({...item,value:{enforce_support_layers:1000}}))]});assert.equal(rejected.status,400);
 body.correctionBatches=[decisions];response=await call('/prepare',body);assert.equal(response.status,200);assert.equal(response.data.ready,true);assert.equal(response.data.settings.enforce_support_layers,undefined);
 const saved=await call('',body);assert.equal(saved.status,201);assert.equal(saved.data.preset.enforce_support_layers,'0');assert.equal(saved.data.overrides.enforce_support_layers,undefined);
 response=await call(`/${saved.data.id}/prepare`,{name:'Renamed vase'});assert.equal(response.status,200);assert.equal(response.data.ready,true);
 assert.equal((await call(`/${saved.data.id}`,{name:'Renamed vase'},'PUT')).status,200);
 const reopened=await createCustomPresetCatalog({baseCatalog,dataDir});assert.equal(reopened.getCustom(saved.data.id).preset.enforce_support_layers,'0');
 const badImport=await call('/import',{preset:{type:'machine',name:'Invalid tiny nozzle',nozzle_diameter:['0.004']}});assert.equal(badImport.status,400);assert.match(badImport.data.error,/nozzle_diameter/);
});
