import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPresetCatalog } from '../../server/presets.js';
import { createCustomPresetCatalog } from '../../server/custom-presets.js';
async function fixture(t, { capability = { '00.00.00.00': { support_wrapping_detection: true } }, modelId = 'TEST-01' } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-context-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const profilesDir = path.join(directory, 'profiles');
  for (const name of ['profiles/BBL/machine','profiles/Other/machine','profiles/Other/process','profiles/Other/filament','printers']) await mkdir(path.join(directory,name),{recursive:true});
  const docs = {
    'BBL/machine/model.json': {type:'machine_model',name:'Authoritative model',model_id:modelId},
    'Other/machine/printer.json': {type:'machine',name:'Unrelated printer name',from:'system',instantiation:'true',printer_model:'Authoritative model',nozzle_diameter:['0.4']},
    'Other/process/process.json': {type:'process',name:'Process',from:'system',instantiation:'true'},
    'Other/filament/filament.json': {type:'filament',name:'Filament',from:'system',instantiation:'true'}
  };
  for (const [file,value] of Object.entries(docs)) await writeFile(path.join(profilesDir,file),JSON.stringify(value));
  if (capability !== null) await writeFile(path.join(directory,'printers/TEST-01.json'),typeof capability==='string'?capability:JSON.stringify(capability));
  return { directory, base:await createPresetCatalog({profilesDir,resourcesDir:directory}) };
}

test('selection context uses the native machine-model vendor and capability resource, not preset names or folders',async t=>{
  const {base}=await fixture(t); const selected=base.resolveSelection(base.list().defaults);
  assert.equal(selected.context.isBblPrinter,true); assert.equal(selected.context.supportWrappingDetection,true);
  assert.equal(selected.context.vendor,'BBL');assert.equal(selected.context.modelId,'TEST-01');
  assert.equal(selected.context.provenance.modelSource,'BBL/machine/model.json');
  selected.context.warnings.push('mutated'); const models=base.listMachineModels();models[0].vendor='Mutated';
  assert.equal(base.getSettingsContext(selected.printer).isBblPrinter,true); assert.deepEqual(base.getSettingsContext(selected.printer).warnings,[]);
  assert.equal(base.getSettingsContext({name:'Bambu Lab fake',printer_model:'Unknown'}).isBblPrinter,false);
  assert.equal(base.getSettingsContext({printer_model:'Unknown'}).supportWrappingDetection,false);
});

test('missing native capability property or file matches native false; malformed resources remain explicitly unresolved',async t=>{
  for (const capability of [{ '00.00.00.00':{} },null]) {
    const {base}=await fixture(t,{capability});assert.equal(base.resolveSelection(base.list().defaults).context.supportWrappingDetection,false);
  }
  for(const capability of ['bad json',{ '00.00.00.00':{support_wrapping_detection:'true'}}]) {
    const {base}=await fixture(t,{capability}); const context=base.resolveSelection(base.list().defaults).context;
    assert.equal(context.isBblPrinter,true);assert.equal(context.supportWrappingDetection,null);assert.ok(context.warnings.length);
  }
});

test('capability model IDs cannot traverse paths and absent resource roots remain unresolved',async t=>{
  const {base}=await fixture(t,{modelId:'../TEST-01'}); const context=base.resolveSelection(base.list().defaults).context;
  assert.equal(context.supportWrappingDetection,null);assert.match(context.warnings[0],/Invalid native/);
  const f=await fixture(t);await rm(path.join(f.directory,'printers'),{recursive:true});
  const catalog=await createPresetCatalog({profilesDir:path.join(f.directory,'profiles'),resourcesDir:f.directory});
  assert.equal(catalog.resolveSelection(catalog.list().defaults).context.supportWrappingDetection,null);
});

test('custom frozen machine selections retain native model context and wrapper metadata stays defensive',async t=>{
  const {base,directory}=await fixture(t);const catalog=await createCustomPresetCatalog({baseCatalog:base,dataDir:path.join(directory,'data')});
  const defaults=catalog.list().defaults;
  const machine=await catalog.saveCustom({type:'machine',name:'My machine',baseId:defaults.printerId,settings:{z_offset:0.05}});
  const selected=catalog.resolveSelection({...defaults,printerId:machine.id});
  assert.equal(selected.context.isBblPrinter,true);assert.equal(selected.context.supportWrappingDetection,true);
  const models=catalog.listMachineModels();models[0].vendor='bad';assert.equal(catalog.listMachineModels()[0].vendor,'BBL');
  assert.equal(catalog.getSettingsContext({printer_model:'Unknown'}).isBblPrinter,false);
});
