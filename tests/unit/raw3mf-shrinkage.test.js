import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{XMLParser,XMLBuilder}from'fast-xml-parser';import{strFromU8,strToU8,zipSync}from'fflate';
import{initializeRawNativeArchive,rawArchiveMaterialContext,prepareRaw3MFShrinkageWarmup}from'../../server/raw3mf-shrinkage.js';import{extractBoundedZip}from'../../shared/import-limits.js';import{importNative3MF,exportNative3MF}from'../../shared/native-project.js';import{shrinkageCase}from'../fixtures/shrinkage-cases.js';
import{mkdtemp,writeFile,rm,mkdir,truncate}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false}),builder=new XMLBuilder({ignoreAttributes:false}),array=v=>Array.isArray(v)?v:[v];
const fixture=await readFile(new URL('../fixtures/native-gui-shrink98-2.4.2.3mf',import.meta.url));
function rewrite(bytes,edit){const files=extractBoundedZip(bytes);edit(files);return zipSync(files);}
test('raw native warmup preserves original mesh resources, part metadata and embedded assets',async()=>{
 for(const bytes of[fixture,(await shrinkageCase('brim')).bytes,(await shrinkageCase('range-same')).bytes,(await shrinkageCase('paint-same')).bytes]){
  const project=importNative3MF(bytes),warm=initializeRawNativeArchive(bytes,project.nativeSettings),original=extractBoundedZip(bytes),actual=extractBoundedZip(warm.bytes),om=parser.parse(strFromU8(original['3D/3dmodel.model'])),am=parser.parse(strFromU8(actual['3D/3dmodel.model'])),oc=parser.parse(strFromU8(original['Metadata/model_settings.config'])),ac=parser.parse(strFromU8(actual['Metadata/model_settings.config']));
  assert.equal(warm.sourceMode,'native-archive');assert.deepEqual(am.model.resources,om.model.resources);assert.deepEqual(array(am.model.build.item).slice(0,array(om.model.build.item).length),array(om.model.build.item));assert.deepEqual(ac.config.object,oc.config.object);
  for(const name of Object.keys(original).filter(name=>!['3D/3dmodel.model','Metadata/model_settings.config','Metadata/project_settings.config','Metadata/orca-web.json','Metadata/filament_sequence.json','Metadata/custom_gcode_per_layer.xml'].includes(name)))assert.deepEqual(actual[name],original[name],name);
  const imported=importNative3MF(warm.bytes);assert.equal(imported.plates.length,2);assert.equal(imported.objects.length,project.objects.length*2);assert.deepEqual(imported.objects.slice(0,project.objects.length).map(o=>o.positions),project.objects.map(o=>o.positions));
 }
});
test('native merged material vectors control initialization, including embedded slots after slot one',async()=>{
 const p=(await shrinkageCase('range-same')).project;p.objects[0].native.layerConfigRanges=[];p.objects[0].filamentSlot=2;p.objects[0].native.objectSettings.extruder='2';const bytes=exportNative3MF(p),settings={...p.nativeSettings,filament_shrink:['100','98'],filament_shrinkage_compensation_z:['100','98']};assert.deepEqual(initializeRawNativeArchive(bytes,settings).summary.usedFilamentSlots,[2]);
 p.objects[0].filamentSlot=1;p.objects[0].native.objectSettings.extruder='1';assert.equal(initializeRawNativeArchive(exportNative3MF(p),settings),null);assert.equal(initializeRawNativeArchive(bytes,settings,{engineVersion:'OrcaSlicer-2.5.0'}),null);
});
test('multiple build instances of one source resource receive distinct appended instance IDs',()=>{
 const bytes=rewrite(fixture,files=>{const model=parser.parse(strFromU8(files['3D/3dmodel.model'])),config=parser.parse(strFromU8(files['Metadata/model_settings.config']));model.model.build.item=[model.model.build.item,{...model.model.build.item}];const plate=array(config.config.plate)[0],other=structuredClone(plate.model_instance);array(other.metadata).find(v=>v['@_key']==='instance_id')['@_value']='1';plate.model_instance=[plate.model_instance,other];files['3D/3dmodel.model']=strToU8(builder.build(model));files['Metadata/model_settings.config']=strToU8(builder.build(config));}),warm=initializeRawNativeArchive(bytes,importNative3MF(bytes).nativeSettings),parsed=parser.parse(strFromU8(extractBoundedZip(warm.bytes)['Metadata/model_settings.config']));
 assert.deepEqual(parsed.config.plate[1].model_instance.map(node=>node.metadata.find(v=>v['@_key']==='instance_id')['@_value']),['2','3']);
});
test('raw warmup rejects unsafe scripts and missing native plate membership before slicing',()=>{
 const settings=importNative3MF(fixture).nativeSettings;
 assert.throws(()=>initializeRawNativeArchive(rewrite(fixture,files=>{files['Metadata/project_settings.config']=strToU8(JSON.stringify({...settings,post_process:['unsafe']}));}),settings),/post_process/);
 assert.throws(()=>initializeRawNativeArchive(rewrite(fixture,files=>{const config=parser.parse(strFromU8(files['Metadata/model_settings.config']));delete array(config.config.plate)[0].model_instance;files['Metadata/model_settings.config']=strToU8(builder.build(config));}),settings),/outside its selected plate/);
});

test('raw context follows native single-volume extruder normalization without mutating the source',()=>{
 const project=importNative3MF(fixture);project.nativeSettings.filament_settings_id=['First','Second'];const original=project.objects[0];original.filamentSlot=2;original.native.partSettings.extruder='2';original.native.objectSettings.extruder='1';const context=rawArchiveMaterialContext(project);assert.equal(context.objects[0].filamentSlot,1);assert.equal(original.filamentSlot,2);
 original.native.objectSettings.extruder='2';assert.equal(rawArchiveMaterialContext(project).objects[0].filamentSlot,2);
 original.native.objectSettings.extruder='3';assert.equal(rawArchiveMaterialContext(project).objects[0].filamentSlot,1);
});
test('raw settings resolution preserves native arguments, cancellation and bounded output validation',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-raw-settings-unit-'));t.after(()=>rm(directory,{recursive:true,force:true}));const input=path.join(directory,'model.3mf');await writeFile(input,fixture);const settings=importNative3MF(fixture).nativeSettings;
 for(const mode of['success','abort','oversize']){
  const work=path.join(directory,mode);await mkdir(work);const controller=new AbortController();let calls=0;
  const operation=prepareRaw3MFShrinkageWarmup({input,engineVersion:'OrcaSlicer-2.4.2',binary:'/native/OrcaSlicer',work,printerPath:'/job/printer.json',profilePath:'/job/process.json',filamentPath:'/job/filament.json',signal:controller.signal,timeoutMs:1234,runNative:async(binary,args,options)=>{calls++;assert.equal(binary,'/native/OrcaSlicer');assert.equal(options.signal,controller.signal);assert.ok(options.timeoutMs>0&&options.timeoutMs<=1234);assert.ok(options.cwd.startsWith(work));assert.equal(args[args.indexOf('--load-settings')+1],'/job/printer.json;/job/process.json');assert.equal(args[args.indexOf('--load-filaments')+1],'/job/filament.json');assert.equal(args.includes('--slice'),false);assert.equal(args.includes('--export-3mf'),false);assert.equal(args.at(-1),input);await writeFile(args[args.indexOf('--export-settings')+1],mode==='oversize'?' '.repeat(4*1024*1024+1):JSON.stringify(settings));if(mode==='abort')controller.abort();}});
  if(mode==='success')assert.equal((await operation).sourceMode,'native-archive');else await assert.rejects(operation,mode==='abort'?/aborted/i:/4 MB/);assert.equal(calls,1);
 }
});


test('non-native3MF normalization uses a relative archive export, preserves source input and shares the deadline',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-raw-normalize-unit-'));t.after(()=>rm(directory,{recursive:true,force:true}));const source=rewrite(fixture,files=>{delete files['Metadata/model_settings.config'];}),input=path.join(directory,'source.3mf');await writeFile(input,source);const settings=importNative3MF(fixture).nativeSettings;
 for(const mode of['success','unity','abort','deadline','unsafe','oversize']){
  const work=path.join(directory,mode);await mkdir(work);const controller=new AbortController();let calls=0,firstTimeout;
  const operation=prepareRaw3MFShrinkageWarmup({input,engineVersion:'OrcaSlicer-2.4.2',binary:'/native/OrcaSlicer',work,printerPath:'/job/printer.json',profilePath:'/job/process.json',filamentPath:'/job/filament.json',signal:controller.signal,timeoutMs:mode==='deadline'?100:5000,runNative:async(_binary,args,options)=>{
   calls++;assert.deepEqual(await readFile(input),Buffer.from(source),'Input source archive is never rewritten');assert.equal(options.signal,controller.signal);assert.equal(args.at(-1),input);assert.equal(args.includes('--slice'),false);assert.equal(args.includes('--export-stl'),false);assert.equal(args[args.indexOf('--load-settings')+1],'/job/printer.json;/job/process.json');assert.equal(args[args.indexOf('--load-filaments')+1],'/job/filament.json');assert.equal(args[args.indexOf('--datadir')+1],path.join(options.cwd,'config'));
   await writeFile(args[args.indexOf('--export-settings')+1],JSON.stringify(mode==='unity'?{...settings,filament_shrink:['100'],filament_shrinkage_compensation_z:['100']}:settings));
   if(calls===1){firstTimeout=options.timeoutMs;assert.equal(args.includes('--export-3mf'),false);if(mode==='abort')controller.abort();if(mode==='deadline')await new Promise(resolve=>setTimeout(resolve,120));else await new Promise(resolve=>setTimeout(resolve,3));return;}
   assert.ok(options.timeoutMs<firstTimeout,'Both native invocations consume one timeout budget');const filename=args[args.indexOf('--export-3mf')+1];assert.equal(filename,'normalized.3mf');assert.equal(path.isAbsolute(filename),false);const output=path.join(options.cwd,filename);await writeFile(output,mode==='unsafe'?rewrite(fixture,files=>{files['Metadata/project_settings.config']=strToU8(JSON.stringify({...settings,post_process:['prohibited']}));}):fixture);if(mode==='oversize')await truncate(output,128*1024*1024+1);
  }});
  if(mode==='success'){const result=await operation;assert.equal(result.summary.configuration,'native-archive-normalization');assert.equal(result.sourceMode,'native-archive');const model=xmlModel(result.bytes);assert.deepEqual(model.resources,xmlModel(fixture).resources);}
  else if(mode==='unity')assert.equal(await operation,null);
  else await assert.rejects(operation,{abort:/aborted/i,deadline:/timed out/,unsafe:/post_process/,oversize:/128 MB/}[mode]);
  assert.equal(calls,['unity','abort','deadline'].includes(mode)?1:2);
 }
 function xmlModel(bytes){return parser.parse(strFromU8(extractBoundedZip(bytes)['3D/3dmodel.model'])).model;}
});

test('Prusa configuration carriers cannot silently enter the BBS-only CLI normalization path',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'orca-raw-prusa-unit-'));t.after(()=>rm(directory,{recursive:true,force:true}));const input=path.join(directory,'source.3mf');await writeFile(input,rewrite(fixture,files=>{delete files['Metadata/project_settings.config'];delete files['Metadata/model_settings.config'];files['Metadata/Slic3r_PE_model.config']=strToU8('<config><object id="1"><metadata type="object" key="perimeters" value="5"/></object></config>');}));let calls=0;await assert.rejects(prepareRaw3MFShrinkageWarmup({input,engineVersion:'OrcaSlicer-2.4.2',binary:'/native/OrcaSlicer',work:directory,runNative:async()=>{calls++;}}),/Prusa 3MF settings require the native archive importer/);assert.equal(calls,0);
});
