import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPresetCatalog } from '../../server/presets.js';
import { createCustomPresetCatalog, CustomPresetStore } from '../../server/custom-presets.js';

async function setup(t) {
  const dataDir=await mkdtemp(path.join(tmpdir(),'orca-custom-presets-'));
  t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const baseCatalog=await createPresetCatalog({profilesDir:path.resolve('tests/fixtures/presets')});
  const catalog=await createCustomPresetCatalog({baseCatalog,dataDir});
  const choices=catalog.list();
  const machineA=choices.printers.find(item=>item.name==='Test Printer A');
  const machineB=choices.printers.find(item=>item.name==='Test Printer B');
  const defaults=catalog.list({printerId:machineA.id}).defaults;
  return {catalog,baseCatalog,dataDir,machineA,machineB,defaults};
}

test('custom machine/process/filament snapshots persist and affect actual selection with strict compatibility',async t=>{
  const c=await setup(t),{catalog,defaults}=c;
  const process=await catalog.saveCustom({type:'process',name:'Fine custom',baseId:defaults.processId,settings:{layer_height:.13},compatiblePrinterIds:[c.machineA.id]});
  const filament=await catalog.saveCustom({type:'filament',name:'Warm custom',baseId:defaults.filamentId,settings:{nozzle_temperature:[215],filament_start_gcode:['; preserved\nM105']},compatiblePrinterIds:[c.machineA.id]});
  const resolved=catalog.resolveSelection({...defaults,processId:process.id,filamentId:filament.id,printerOverrides:{z_offset:.05},filamentOverrides:{nozzle_temperature:[220]}});
  assert.equal(resolved.process.layer_height,'0.13'); assert.deepEqual(resolved.filament.nozzle_temperature,['220']);assert.equal(resolved.printer.z_offset,'0.05');
  assert.deepEqual(resolved.filament.filament_start_gcode,['; preserved\nM105']);
  assert.ok(catalog.list({printerId:c.machineA.id}).processes.some(item=>item.id===process.id));
  assert.ok(!catalog.list({printerId:c.machineB.id}).processes.some(item=>item.id===process.id));
  assert.throws(()=>catalog.resolveSelection({...defaults,printerId:c.machineB.id,processId:process.id}),/incompatible/);
  const reopened=await createCustomPresetCatalog({baseCatalog:c.baseCatalog,dataDir:c.dataDir});
  assert.equal(reopened.getCustom(process.id).overrides.layer_height,'0.13');
  assert.deepEqual(reopened.getCustom(filament.id).overrides.nozzle_temperature,['215']);
  assert.equal(c.baseCatalog.getPreset(defaults.processId,'process').layer_height,'0.2');
});

test('derived machines retain native compatibility ancestry and expose custom bed geometry',async t=>{
  const c=await setup(t),machine=await c.catalog.saveCustom({type:'machine',name:'My derived printer',baseId:c.machineA.id,settings:{printable_area:[[0,0],[250,0],[250,250],[0,250]],printable_height:280}});
  const choices=c.catalog.list({printerId:machine.id});
  assert.ok(choices.processes.length>0);assert.ok(choices.filaments.length>0);
  const resolved=c.catalog.resolveSelection(choices.defaults);
  assert.equal(resolved.printer.name,machine.name);assert.equal(resolved.printer.printable_height,'280');
  assert.deepEqual(resolved.printer.printable_area,['0x0','250x0','250x250','0x250']);
  assert.deepEqual(resolved.process.compatible_printers,[machine.name]);
  const filament=await c.catalog.saveCustom({type:'filament',name:'Derived filament',baseId:c.defaults.filamentId,settings:{},compatiblePrinterIds:[machine.id]});
  await assert.rejects(c.catalog.deleteCustom(machine.id),failure=>failure.status===409);
  await c.catalog.deleteCustom(filament.id);await c.catalog.deleteCustom(machine.id);
});

test('custom edits replace override map relative to frozen base and cannot mutate bundled files',async t=>{
  const c=await setup(t),saved=await c.catalog.saveCustom({type:'process',name:'Editable custom',baseId:c.defaults.processId,settings:{layer_height:.1,wall_loops:5},compatiblePrinterIds:[c.machineA.id]});
  const edited=await c.catalog.saveCustom({name:'Renamed custom',settings:{wall_loops:3}},saved.id);
  assert.equal(edited.id,saved.id);assert.equal(edited.settings.layer_height,'0.2');assert.equal(edited.settings.wall_loops,'3');
  assert.deepEqual(edited.overrides,{wall_loops:'3'});
  const snapshot=c.catalog.getCustom(saved.id);snapshot.preset.wall_loops='999';assert.equal(c.catalog.getCustom(saved.id).settings.wall_loops,'3');
  await assert.rejects(c.catalog.saveCustom({name:'Modify bundled'},c.defaults.processId),failure=>failure.status===404);
  await assert.rejects(c.catalog.deleteCustom(c.defaults.processId),failure=>failure.status===404);
});

test('native inherited JSON imports resolve trusted names and export their native differences',async t=>{
  const c=await setup(t),base=c.baseCatalog.getPreset(c.defaults.filamentId,'filament');
  const imported=await c.catalog.importPreset({preset:{type:'filament',name:'Imported warm PLA',inherits:base.name,from:'user',nozzle_temperature:['218'],filament_retraction_length:['nil'],filament_start_gcode:['G28\n; imported']}});
  const exported=c.catalog.exportPreset(imported.id);
  assert.equal(exported.from,'user');assert.equal(exported.instantiation,undefined);assert.equal(exported.inherits,base.name);
  assert.deepEqual(exported.nozzle_temperature,['218']);assert.deepEqual(exported.filament_retraction_length,['nil']);
  assert.deepEqual(exported.filament_start_gcode,['G28\n; imported']);
  assert.equal(exported.compatible_printers,undefined);assert.deepEqual(imported.preset.compatible_printers,[c.machineA.name]);
  const duplicate=await c.catalog.importPreset({preset:{...exported,name:'Imported roundtrip'}});
  assert.equal(c.catalog.getCustom(duplicate.id).settings.nozzle_temperature[0],'218');
  const renamed=await c.catalog.saveCustom({name:'Renamed standalone import'},duplicate.id);
  assert.equal(renamed.name,'Renamed standalone import');
});

test('native imports reject missing/ambiguous parents, unknown fields, scripts, malformed dependencies, and credentials without saving partial data',async t=>{
  const c=await setup(t),name='Rejected';
  for(const preset of [
    {type:'process',name,inherits:'../../outside.json'},
    {type:'process',name,post_process:['echo dangerous']},
    {type:'process',name,unrecognized_engine_option:'1'},
    {type:'filament',name,compatible_printers_condition:123},
    {type:'filament',name,compatible_prints:'some profile'},
    {type:'machine',name,printhost_apikey:'secret'},
    {type:'machine',name,bed_custom_model:'/etc/passwd'},
  ])await assert.rejects(c.catalog.importPreset({preset}));
  assert.deepEqual(c.catalog.listCustom(),[]);
  await assert.rejects(c.catalog.saveCustom({type:'filament',name,baseId:c.defaults.filamentId,settings:{},compatiblePrinterIds:['missing-printer']}));
});

test('concurrent edits, rename collisions, delete/update races and write failures stay atomic',async t=>{
  const c=await setup(t),input={type:'machine',name:'Concurrent custom',baseId:c.machineA.id,settings:{z_offset:.1}};
  const results=await Promise.allSettled([c.catalog.saveCustom(input),c.catalog.saveCustom(input)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(results.find(item=>item.status==='rejected').reason.status,409);
  const saved=results.find(item=>item.status==='fulfilled').value;
  const updates=await Promise.allSettled([c.catalog.deleteCustom(saved.id),c.catalog.saveCustom({name:'Cannot resurrect'},saved.id)]);
  assert.equal(updates[1].reason.status,404);assert.deepEqual(c.catalog.listCustom(),[]);
  const file=path.join(c.dataDir,'presets/custom-presets.json'),previous=await readFile(file,'utf8');
  await rename(file,`${file}.backup`);await mkdir(file);
  await assert.rejects(c.catalog.saveCustom(input));assert.deepEqual(c.catalog.listCustom(),[]);
  assert.equal(await readFile(`${file}.backup`,'utf8'),previous);
  assert.deepEqual((await readdir(path.dirname(file))).sort(),['custom-presets.json','custom-presets.json.backup']);
  await rm(file,{recursive:true});await rename(`${file}.backup`,file);
  await c.catalog.saveCustom(input);assert.equal(c.catalog.listCustom().length,1);
});

test('corrupt custom store is reported instead of overwritten',async t=>{
  const c=await setup(t),file=path.join(c.dataDir,'presets/custom-presets.json');
  await writeFile(file,'{ broken');
  await assert.rejects(new CustomPresetStore(path.dirname(file)).init(),/Invalid custom preset store/);
  assert.equal(await readFile(file,'utf8'),'{ broken');
});
