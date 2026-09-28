import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import {createPresetCatalog}from'../../server/presets.js';import{createCustomPresetCatalog}from'../../server/custom-presets.js';
async function setup(t){const dataDir=await mkdtemp(path.join(tmpdir(),'orca-preset-corrections-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));const baseCatalog=await createPresetCatalog({profilesDir:path.resolve('tests/fixtures/presets')});return {dataDir,baseCatalog,catalog:await createCustomPresetCatalog({baseCatalog,dataDir})};}
const decisions=plan=>plan.groups.map(group=>({id:group.id,signature:group.signature,choice:'apply'}));

test('custom prepare/save derives hidden vase corrections, persists them outside overrides, and reopens durably',async t=>{
 const {catalog,dataDir,baseCatalog}=await setup(t),defaults=catalog.list().defaults;
 const base=await catalog.importPreset({preset:{type:'process',name:'Hidden support layers',enforce_support_layers:'4'},compatiblePrinterIds:[defaults.printerId]});
 const request={type:'process',name:'Corrected vase',baseId:base.id,settings:{spiral_mode:true},compatiblePrinterIds:[defaults.printerId],selection:defaults};
 const first=catalog.prepareCustom(request);assert.equal(first.ready,false);assert.ok(first.plan.groups.some(group=>group.changes.some(change=>change.key==='enforce_support_layers')));
 await assert.rejects(catalog.saveCustom(request),failure=>failure.status===409&&failure.preparation.ready===false);
 request.correctionBatches=[decisions(first.plan)];const prepared=catalog.prepareCustom(request);assert.equal(prepared.ready,true);assert.equal(prepared.settings.enforce_support_layers,undefined);
 const saved=await catalog.saveCustom(request);assert.equal(saved.overrides.enforce_support_layers,undefined);assert.equal(saved.preset.enforce_support_layers,'0');assert.equal(saved.overrides.spiral_mode,'1');
 const reopened=await createCustomPresetCatalog({baseCatalog,dataDir});assert.equal(reopened.getCustom(saved.id).preset.enforce_support_layers,'0');
 const disk=JSON.parse(await readFile(path.join(dataDir,'presets/custom-presets.json'),'utf8')).find(item=>item.id===saved.id);assert.equal(disk.baseConfig.enforce_support_layers,'4');assert.equal(disk.nativeDocument.enforce_support_layers,'0');assert.equal(disk.nativeFullSettings.enforce_support_layers,'0');assert.equal(disk.settings.enforce_support_layers,undefined);
 await reopened.saveCustom({name:'Renamed corrected vase'},saved.id);assert.equal(reopened.getCustom(saved.id).preset.enforce_support_layers,'0');
 const context=await reopened.sourceContext(saved.id,'process',{selection:defaults}),edit={nativeEditor:true,selection:defaults,settings:context.overrides};
 assert.equal((await reopened.prepareCustomResolved(edit,saved.id)).ready,true);await reopened.saveCustom(edit,saved.id);assert.equal(reopened.getCustom(saved.id).preset.enforce_support_layers,'0');assert.equal(reopened.exportPreset(saved.id).enforce_support_layers,'0');
});

test('save never accepts injected hidden settings, native patches, forged decisions, or caller capability flags',async t=>{
 const {catalog}=await setup(t),defaults=catalog.list().defaults;
 const base={type:'process',name:'Invalid patch',baseId:defaults.processId,settings:{},compatiblePrinterIds:[defaults.printerId]};
 for(const patch of [{settings:{enforce_support_layers:999}},{nativeChanges:{enforce_support_layers:999}},{context:{isBblPrinter:true}},{selection:{printer: {name:'fake'}}},{correctionBatches:[[{id:'process:spiral-mode',choice:'apply',signature:'forged'}]]}])await assert.rejects(catalog.saveCustom({...base,...patch}));
 assert.equal(catalog.listCustom().length,0);
});

test('structural failures block persistence and material warnings require their current acknowledgment signature',async t=>{
 const {catalog}=await setup(t),defaults=catalog.list().defaults;
 const machine={type:'machine',name:'Tiny nozzle',baseId:defaults.printerId,settings:{nozzle_diameter:['0.004']}};
 assert.ok(catalog.prepareCustom(machine).blockingErrors.some(item=>item.key==='nozzle_diameter'));await assert.rejects(catalog.saveCustom(machine),failure=>failure.status===409);
 const filament={type:'filament',name:'Reviewed hot PLA',baseId:defaults.filamentId,settings:{nozzle_temperature:[500]},compatiblePrinterIds:[defaults.printerId]};
 const plan=catalog.prepareCustom(filament);assert.ok(plan.unacknowledgedWarnings.some(item=>item.key==='nozzle_temperature'));await assert.rejects(catalog.saveCustom(filament),failure=>failure.status===409);
 filament.acknowledgedWarnings=plan.unacknowledgedWarnings.map(item=>item.signature);const saved=await catalog.saveCustom(filament);assert.deepEqual(saved.overrides.nozzle_temperature,['500']);
});

test('source changes invalidate reviewed hidden corrections and sequential event decisions replay without repeated dialogs',async t=>{
 const {catalog}=await setup(t),defaults=catalog.list().defaults;
 const base=await catalog.saveCustom({type:'process',name:'Mutable base',baseId:defaults.processId,settings:{wall_loops:2},compatiblePrinterIds:[defaults.printerId]});
 const request={type:'process',name:'Vase child',baseId:base.id,settings:{spiral_mode:true},compatiblePrinterIds:[defaults.printerId]};const prepared=catalog.prepareCustom(request);
 await catalog.saveCustom({settings:{wall_loops:5}},base.id);await assert.rejects(catalog.saveCustom({...request,correctionBatches:[decisions(prepared.plan)]}),failure=>failure.status===409);
 const events={type:'process',name:'Precise tower',baseId:defaults.processId,settings:{enable_prime_tower:true,precise_z_height:true},compatiblePrinterIds:[defaults.printerId],changedSetting:{key:'precise_z_height'}};
 let plan=catalog.prepareCustom(events);assert.ok(plan.plan.groups[0].event);events.correctionBatches=[plan.plan.groups.map(group=>({id:group.id,signature:group.signature,choice:'alternative'}))];plan=catalog.prepareCustom(events);assert.equal(plan.ready,true);const saved=await catalog.saveCustom(events);assert.equal(saved.overrides.precise_z_height,'1');
});

test('a standalone imported printer can be renamed even when no bundled process is compatible',async t=>{
 const {catalog}=await setup(t);const printer=await catalog.importPreset({preset:{type:'machine',name:'Standalone unknown',nozzle_diameter:['0.4']}});
 const prepared=catalog.prepareCustom({name:'Standalone renamed'},printer.id);assert.equal(prepared.ready,true);
 const updated=await catalog.saveCustom({name:'Standalone renamed'},printer.id);assert.equal(updated.name,'Standalone renamed');
});
