import {test,expect}from'@playwright/test';
import{build}from'esbuild';import path from'node:path';import{readFile}from'node:fs/promises';
import{displayedProfileSettings,normalizeProfileOverrides,applyProfileOverrides,editableDefinitionsByScope}from'../../shared/profile-settings.js';
import{getNativeCorrectionPlan,applyNativeCorrectionDecisions}from'../../shared/native-setting-corrections.js';
import{validateNativeConfiguration}from'../../shared/native-config-validation.js';
let script,css;
test.beforeAll(async()=>{
 const output=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import ProfileEditor from ${JSON.stringify(path.resolve('src/ProfileEditor.jsx'))};function Harness(){const p=new URLSearchParams(location.search);const[open,setOpen]=React.useState(true),[id,setId]=React.useState(p.get('id')||'base');window.changeProfileId=setId;return <ProfileEditor open={open} scope={p.get('scope')||'machine'} selectedId={id} initialOverrides={JSON.parse(p.get('initial')||'{}')} printerConfig={JSON.parse(p.get('printer')||'{}')} processConfig={JSON.parse(p.get('process')||'{}')} filamentConfig={JSON.parse(p.get('filament')||'{}')} nativeContext={JSON.parse(p.get('context')||'{}')} printerId="p1" printers={[{id:'p1',name:'Printer One'},{id:'p2',name:'Printer Two'}]} onClose={()=>setOpen(false)} onSaved={value=>{window.savedProfile=value}}/>}createRoot(document.getElementById('root')).render(<Harness/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'unused-profile-test-build',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css')).text;
});
function fixture(scope='machine',{custom=false,id='base',name='Reference preset',overrides={}}={}){
 const preset=scope==='machine'?{type:scope,name,single_extruder_multi_material:'0',nozzle_diameter:['0.4','0.6'],printable_area:['0x0','200x0','200x200','0x200'],extruder_printable_area:['0x0,200x0,200x200,0x200'],machine_max_speed_x:['300','180'],gcode_flavor:'marlin2',input_shaping_type:'ZV',machine_start_gcode:'G28\nM104 S200'}:scope==='process'?{type:scope,name,layer_height:'0.2',bridge_line_width:'0.4',outer_wall_speed:'70',post_process:[]}:{type:scope,name,filament_diameter:['1.75'],filament_retraction_length:['nil','1.2'],filament_density:['1.24'],filament_start_gcode:['M900 K0.02']};
 return{id,type:scope,name,custom,baseId:'original',nativeVersion:'2.4.2',compatiblePrinterIds:scope==='machine'?[]:['p1'],overrides,settings:displayedProfileSettings(scope,preset),preset};
}
// Run the real native rules/signature checks; replace only selected-preset lookup.
function prepareFixture(body,{record,printerConfig={},processConfig={},filamentConfig={},nativeContext={}}){
 const scope=record.type,own={machine:'printer',process:'process',filament:'filament'}[scope];
 const settings=normalizeProfileOverrides(scope,body.settings||{});
 let selected={printer:{...fixture('machine').preset,...printerConfig},process:{...fixture('process').preset,...processConfig},filament:{...fixture('filament').preset,...filamentConfig},context:{...nativeContext,isGlobal:true,isPlate:false,filamentCount:1,mode:body.mode,...(body.projectSettings?{projectSettings:body.projectSettings}:{}),...(body.changedSetting?{changedSetting:{scope,...body.changedSetting}}:{})}};
 selected[own]=applyProfileOverrides(scope,record.preset,settings);
 const changes={};const apply=result=>{selected=result.selection;Object.assign(changes,result.nativeChanges)};
 const automatic=()=>{for(let count=0;count<16;count++){if(!getNativeCorrectionPlan(selected,{scope}).groups.some(group=>group.mode==='automatic'))return;apply(applyNativeCorrectionDecisions(selected,{scope,applyAutomatic:true}))}throw new Error('Native corrections did not converge')};
 automatic();for(const decisions of body.correctionBatches||[]){apply(applyNativeCorrectionDecisions(selected,{scope,decisions}));automatic()}
 const plan=getNativeCorrectionPlan(selected,{scope});plan.warnings=plan.warnings.map(item=>({...item,signature:JSON.stringify([item.scope,item.key,item.message])}));
 const unacknowledgedWarnings=plan.warnings.filter(item=>!body.acknowledgedWarnings?.includes(item.signature));
 const validation=validateNativeConfiguration(selected,{underCli:false}),blockingErrors=validation.errors.filter(item=>item.scope===scope);
 const editable=new Set(editableDefinitionsByScope[scope].map(item=>item.key));
 return{type:scope,settings:{...settings,...Object.fromEntries(Object.entries(changes).filter(([key])=>editable.has(key)))},plan,validation,blockingErrors,unacknowledgedWarnings,ready:!plan.groups.length&&!unacknowledgedWarnings.length&&!blockingErrors.length,effectiveSelection:selected};
}
async function harness(page,{scope='machine',record=fixture(scope),source,prepare,initialOverrides={},printerConfig={},processConfig={},filamentConfig={},nativeContext={isBblPrinter:false,supportWrappingDetection:false}}={}){
 await page.route('**/profile-harness?*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/profile-harness.css"></head><body><div id="root"></div><script src="/profile-harness.js"></script></body></html>'}));
 await page.route('**/profile-harness.js',route=>route.fulfill({contentType:'text/javascript',body:script}));await page.route('**/profile-harness.css',route=>route.fulfill({contentType:'text/css',body:css}));
 await page.route('**/api/presets/custom/source/**',source||((route)=>route.fulfill({json:record})));
 const prepareOptions={record,printerConfig,processConfig,filamentConfig,nativeContext};
 await page.route(/\/api\/presets\/custom\/(?:[^/]+\/)?prepare$/,async route=>{try{const body=route.request().postDataJSON();return prepare?prepare(route,body,()=>prepareFixture(body,prepareOptions)):route.fulfill({json:prepareFixture(body,prepareOptions)})}catch(error){return route.fulfill({status:409,json:{error:error.message}})}});
 await page.goto(`/profile-harness?scope=${scope}&id=${record.id}&initial=${encodeURIComponent(JSON.stringify(initialOverrides))}&printer=${encodeURIComponent(JSON.stringify(printerConfig))}&process=${encodeURIComponent(JSON.stringify(processConfig))}&filament=${encodeURIComponent(JSON.stringify(filamentConfig))}&context=${encodeURIComponent(JSON.stringify(nativeContext))}`);await expect(page.getByRole('dialog')).toBeVisible();
}
async function search(page,key){await page.getByLabel('Search profile settings',{exact:true}).fill(key);return page.locator(`[data-profile-setting="${key}"]`)}
async function capture(page,method='POST'){
 const bodies=[];await page.route('**/api/presets/custom',route=>{expect(route.request().method()).toBe(method);bodies.push(route.request().postDataJSON());return route.fulfill({status:201,json:{id:'new-custom',type:'machine'}})});return bodies;
}

test('printer vectors and bed points save separate native values while native extruder bounds remain read-only',async({page})=>{
 const bodies=await capture(page);await harness(page);let row=await search(page,'nozzle_diameter');await row.getByLabel('Nozzle diameter (nozzle_diameter) 2',{exact:true}).fill('0.8');
 row=await search(page,'printable_area');await page.getByLabel('Printable area (printable_area) point 2 X',{exact:true}).fill('202');
 await expect(page.getByLabel('Extruder printable area (extruder_printable_area) group 1 point 2 X',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 expect(bodies[0].settings).toEqual({nozzle_diameter:['0.4','0.8'],printable_area:['0x0','202x0','200x200','0x200']});expect(bodies[0].baseId).toBe('base');expect(bodies[0].type).toBe('machine');
});

test('custom rename and changed setting preserve earlier saved overrides without flattening all defaults',async({page})=>{
 const record=fixture('machine',{custom:true,id:'custom-machine-1',name:'Saved printer',overrides:{machine_max_speed_x:['300','180']}});let body;
 await page.route('**/api/presets/custom/custom-machine-1',route=>{expect(route.request().method()).toBe('PUT');body=route.request().postDataJSON();return route.fulfill({json:{id:record.id,type:'machine',name:body.name}})});
 await harness(page,{record});await expect(page.getByLabel('Preset name')).toHaveValue('Saved printer');await page.getByLabel('Preset name').fill('Renamed printer');
 await search(page,'nozzle_diameter');await page.getByLabel('Nozzle diameter (nozzle_diameter) 1',{exact:true}).fill('0.5');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>body?.name).toBe('Renamed printer');expect(body.settings).toEqual({machine_max_speed_x:['300','180'],nozzle_diameter:['0.5','0.6']});
});

test('filament nullable vector entries preserve explicit values and native inheritance independently',async({page})=>{
 const record=fixture('filament',{custom:true,id:'custom-filament-1',overrides:{filament_density:['1.24']}});let body;
 await page.route('**/api/presets/custom/custom-filament-1',route=>{body=route.request().postDataJSON();return route.fulfill({json:{id:record.id,type:'filament'}})});
 await harness(page,{scope:'filament',record});await search(page,'filament_retraction_length');
 await expect(page.getByLabel('Length (filament_retraction_length) 1',{exact:true})).toBeDisabled();await page.getByLabel('Inherit Length (filament_retraction_length) 1',{exact:true}).uncheck();
 await page.getByLabel('Length (filament_retraction_length) 1',{exact:true}).fill('0.9');await page.getByLabel('Inherit Length (filament_retraction_length) 2',{exact:true}).check();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>body?.settings?.filament_retraction_length).toEqual(['0.9','nil']);expect(body.settings.filament_density).toEqual(['1.24']);expect(body.compatiblePrinterIds).toEqual(['p1']);
});

test('invalid numeric edits disable saving and reset restores the selected preset value',async({page})=>{
 const bodies=await capture(page);await harness(page);await search(page,'nozzle_diameter');const input=page.getByLabel('Nozzle diameter (nozzle_diameter) 1',{exact:true});await input.fill('');
 await expect(page.getByRole('alert')).toContainText('must be');await expect(page.getByRole('button',{name:'Save as new preset'})).toBeDisabled();expect(bodies).toHaveLength(0);
 await page.getByRole('button',{name:'Reset Nozzle diameter (nozzle_diameter)',exact:true}).click();await expect(input).toHaveValue('0.4');await expect(page.getByRole('alert')).toHaveCount(0);
});

test('scalar enums, booleans and multiline machine G-code save typed native representations',async({page})=>{
 const bodies=await capture(page);await harness(page);await search(page,'gcode_flavor');await page.getByLabel('G-code flavor (gcode_flavor)',{exact:true}).selectOption('klipper');
 await search(page,'use_relative_e_distances');await page.getByLabel('Use relative E distances (use_relative_e_distances)',{exact:true}).uncheck();
 await search(page,'machine_start_gcode');await page.getByLabel('Start G-code (machine_start_gcode)',{exact:true}).fill('G28\n; user-defined start\nM104 S205');
 await page.getByRole('button',{name:'Save as new preset'}).click();await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings).toEqual({gcode_flavor:'klipper',use_relative_e_distances:'0',machine_start_gcode:'G28\n; user-defined start\nM104 S205'});
});

test('native JSON export downloads the saved source and import submits parsed data with scope',async({page})=>{
 const record=fixture('machine');let imported;
 await page.route('**/api/presets/custom/import',route=>{imported=route.request().postDataJSON();return route.fulfill({status:201,json:{id:'imported-machine',type:'machine'}})});
 await harness(page,{record,source:route=>route.fulfill({json:route.request().url().endsWith('/export')?record.preset:record})});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export saved preset'}).click();const download=await downloadPromise;expect(JSON.parse(await readFile(await download.path(),'utf8'))).toEqual(record.preset);
 await page.getByLabel('Import native preset JSON').setInputFiles({name:'printer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...record.preset,name:'Imported printer'}))});
 await expect.poll(()=>imported?.preset?.name).toBe('Imported printer');expect(imported.baseId).toBeUndefined();await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('custom deletion requires its explicit dialog action and reports the deleted ID',async({page})=>{
 const record=fixture('machine',{custom:true,id:'delete-me'});let deleted=0;await page.route('**/api/presets/custom/delete-me',route=>{expect(route.request().method()).toBe('DELETE');deleted++;return route.fulfill({status:204})});
 await harness(page,{record});await expect(page.getByRole('button',{name:'Delete preset'})).toBeEnabled();await page.getByRole('button',{name:'Delete preset'}).click();await expect(page.getByRole('alertdialog')).toBeVisible();expect(deleted).toBe(0);
 await page.getByRole('button',{name:'Keep preset'}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);await page.getByRole('button',{name:'Delete preset'}).click();await page.getByRole('button',{name:'Confirm delete'}).click();
 await expect.poll(()=>page.evaluate(()=>window.savedProfile?.deleted)).toBe(true);expect(deleted).toBe(1);expect(await page.evaluate(()=>window.savedProfile.id)).toBe('delete-me');
});

test('an older source response cannot replace a newly selected preset',async({page})=>{
 let release;const delayed=new Promise(resolve=>release=resolve);const older=fixture('machine',{id:'old',name:'Old printer'}),newer=fixture('machine',{id:'new',name:'New printer'});
 await harness(page,{record:older,source:async route=>{if(route.request().url().endsWith('/old/context')){await delayed;await route.fulfill({json:older}).catch(()=>{});}else await route.fulfill({json:newer});}});
 await page.evaluate(()=>window.changeProfileId('new'));await expect(page.getByLabel('Preset name')).toHaveValue('New printer (custom)');release();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.getByLabel('Preset name')).toHaveValue('New printer (custom)');
});

test('a wrong-scope native import reports an error without replacing the editor',async({page})=>{
 await harness(page);await expect(page.getByLabel('Preset name')).toBeEnabled();await page.getByLabel('Import native preset JSON').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"type":"filament","name":"wrong scope"}')});
 await expect(page.getByRole('alert')).toContainText('Filament preset editor');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('current process overrides and empty vectors are included when saving a custom process',async({page})=>{
 const record=fixture('process',{custom:true,id:'custom-process-1',overrides:{outer_wall_speed:'70'}});let body;
 await page.route('**/api/presets/custom/custom-process-1',route=>{body=route.request().postDataJSON();return route.fulfill({json:{id:record.id,type:'process'}})});
 await harness(page,{scope:'process',record,initialOverrides:{layer_height:0.12,post_process:[]}});await search(page,'layer_height');await expect(page.getByLabel('Layer height (layer_height)',{exact:true})).toHaveValue('0.12');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(()=>body?.settings).toEqual({outer_wall_speed:'70',layer_height:'0.12',post_process:[]});
});
test('a pending source load can be dismissed and its later response is ignored',async({page})=>{
 let release;const pending=new Promise(resolve=>release=resolve);await harness(page,{source:async route=>{await pending;await route.fulfill({json:fixture()}).catch(()=>{})}});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();release();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.evaluate(()=>window.savedProfile)).toBeUndefined();
});

function nativeValues(record, values) {
 record.preset={...record.preset,...values};record.settings=displayedProfileSettings(record.type,record.preset);return record;
}

test('firmware-dependent machine fields hide and dynamic input-shaping choices track the edited flavor',async({page})=>{
 await harness(page);await search(page,'input_shaping_type');const type=page.getByLabel('Input shaper type (input_shaping_type)',{exact:true});
 await expect(type.locator('option')).toHaveText(['ZV','Disable']);await expect(type).toBeDisabled();
 await search(page,'gcode_flavor');await page.getByLabel('G-code flavor (gcode_flavor)',{exact:true}).selectOption('reprapfirmware');
 await search(page,'input_shaping_type');await expect(type.locator('option')).toContainText(['Default','MZV','ZVD']);
 await search(page,'gcode_flavor');await page.getByLabel('G-code flavor (gcode_flavor)',{exact:true}).selectOption('klipper');
 await search(page,'input_shaping_type');await expect(type).toHaveCount(0);
 await search(page,'machine_max_acceleration_travel');await expect(page.locator('[data-profile-setting="machine_max_acceleration_travel"]')).toHaveCount(0);
});

test('nullable inherited display and checkbox enablement are independent for each filament variant',async({page})=>{
 const record=nativeValues(fixture('filament'),{filament_retraction_length:['nil','0'],filament_retraction_speed:['nil','50']});
 await harness(page,{scope:'filament',record,printerConfig:{retraction_length:['0.8','1.2'],retraction_speed:['30','40']}});
 await search(page,'filament_retraction_speed');
 const first=page.getByLabel('Retraction Speed (filament_retraction_speed) 1',{exact:true}),second=page.getByLabel('Retraction Speed (filament_retraction_speed) 2',{exact:true});
 await expect(first).toBeDisabled();await expect(first).toHaveValue('30');await expect(second).toBeDisabled();await expect(second).toHaveValue('40');
 await expect(page.getByLabel('Inherit Retraction Speed (filament_retraction_speed) 2',{exact:true})).toBeDisabled();
 await page.getByLabel('Inherit Retraction Speed (filament_retraction_speed) 1',{exact:true}).uncheck();await expect(first).toBeEnabled();await expect(first).toHaveValue('30');
 await search(page,'filament_retraction_length');await page.getByLabel('Length (filament_retraction_length) 2',{exact:true}).fill('1');
 await search(page,'filament_retraction_speed');await expect(second).toBeEnabled();await expect(second).toHaveValue('50');
});

test('native numeric corrections require acknowledgment and cancel keeps the edited value unsaved',async({page})=>{
 const bodies=await capture(page);await harness(page,{scope:'filament'});await search(page,'filament_max_volumetric_speed');
 const input=page.getByLabel('Max volumetric speed (filament_max_volumetric_speed) 1',{exact:true});await input.fill('0.2');
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});
 await expect(review).toContainText('0.5');expect(bodies).toHaveLength(0);await review.getByRole('button',{name:'Keep editing'}).click();await expect(input).toHaveValue('0.2');expect(bodies).toHaveLength(0);
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await review.getByRole('button',{name:'Apply choices and save'}).click();
 await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings.filament_max_volumetric_speed).toEqual(['0.2']);expect(prepareFixture(bodies[0],{record:fixture('filament')}).settings.filament_max_volumetric_speed).toEqual(['0.5']);
});

test('native firmware retraction confirmation can select its alternative without silently changing wipe values',async({page})=>{
 const bodies=await capture(page);const record=nativeValues(fixture(),{use_firmware_retraction:true,wipe:['1'],retract_before_wipe:['50%']});
 await harness(page,{record});await page.getByRole('button',{name:'Save as new preset',exact:true}).click();
 const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});await expect(review).toContainText('firmware-retraction');expect(bodies).toHaveLength(0);
 await review.getByRole('radio',{name:'Instead set use_firmware_retraction to false'}).check();await review.getByRole('button',{name:'Apply choices and save'}).click();
 await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings).toEqual({});expect(prepareFixture(bodies[0],{record}).settings.use_firmware_retraction).toBe('0');
});

test('native material warnings require explicit acknowledgment before a filament preset is saved',async({page})=>{
 const bodies=await capture(page);const record=nativeValues(fixture('filament'),{filament_type:['PLA'],chamber_temperature:['46']});
 await harness(page,{scope:'filament',record,printerConfig:{support_chamber_temp_control:true}});await page.getByRole('button',{name:'Save as new preset',exact:true}).click();
 const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});await expect(review).toContainText('maximum chamber temperature 45');expect(bodies).toHaveLength(0);
 await review.getByRole('button',{name:'Apply choices and save'}).click();await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings).toEqual({});
});


test('an edited SEMM nozzle diameter presents native synchronization choices before saving',async({page})=>{
 const bodies=await capture(page);const record=nativeValues(fixture(),{single_extruder_multi_material:true,nozzle_diameter:['0.4','0.4']});
 await harness(page,{record});await search(page,'nozzle_diameter');await page.getByLabel('Nozzle diameter (nozzle_diameter) 2',{exact:true}).fill('0.6');
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});
 await expect(review).toContainText('edited nozzle diameter for all extruders');expect(bodies).toHaveLength(0);
 await review.getByRole('button',{name:'Apply choices and save'}).click();await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings.nozzle_diameter).toEqual(['0.4','0.6']);expect(prepareFixture(bodies[0],{record}).settings.nozzle_diameter).toEqual(['0.6','0.6']);
});

test('vase corrections submit signed decisions for hidden settings without expanding ordinary editor overrides',async({page})=>{
 const record=nativeValues(fixture('process'),{enforce_support_layers:'7'}),bodies=await capture(page);
 await harness(page,{scope:'process',record});await search(page,'spiral_mode');await page.getByLabel('Spiral vase (spiral_mode)',{exact:true}).check();
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});
 await expect(review).toContainText('enforce_support_layers');await review.getByRole('button',{name:'Apply choices and save'}).click();
 await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings).toEqual({spiral_mode:'1'});expect(bodies[0].correctionBatches.flat().length).toBeGreaterThan(0);
 const validated=prepareFixture(bodies[0],{record});expect(validated.ready).toBe(true);expect(validated.effectiveSelection.process.enforce_support_layers).toBe('0');expect(validated.settings).not.toHaveProperty('enforce_support_layers');
});

test('native structural validation blocks a schema-valid but unusably small nozzle without a save request',async({page})=>{
 const bodies=await capture(page);await harness(page);await search(page,'nozzle_diameter');await page.getByLabel('Nozzle diameter (nozzle_diameter) 1',{exact:true}).fill('0.004');
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await expect(page.getByRole('alert')).toContainText('0.005');expect(bodies).toHaveLength(0);
 await expect(page.getByLabel('Nozzle diameter (nozzle_diameter) 1',{exact:true})).toHaveValue('0.004');
});

test('stale native decisions fail without saving or discarding the user edit',async({page})=>{
 const bodies=await capture(page),record=fixture('filament');let prepareRequests=0;
 await harness(page,{scope:'filament',record,prepare:(route,body,realPrepare)=>{prepareRequests++;if(body.correctionBatches?.length){body.correctionBatches[0][0].signature='stale';return route.fulfill({json:prepareFixture(body,{record})})}return route.fulfill({json:realPrepare()})}});
 await search(page,'filament_max_volumetric_speed');const input=page.getByLabel('Max volumetric speed (filament_max_volumetric_speed) 1',{exact:true});await input.fill('0.2');
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await page.getByRole('button',{name:'Apply choices and save',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('review the current proposal');expect(prepareRequests).toBe(2);expect(bodies).toHaveLength(0);
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(input).toHaveValue('0.2');
});

test('an immediate native geometry warning retains its explicit choice until the later save',async({page})=>{
 const bodies=await capture(page),record=fixture('process');await harness(page,{scope:'process',record});await search(page,'make_overhang_printable');
 await page.getByLabel('Make overhangs printable (make_overhang_printable)',{exact:true}).check();const review=page.getByRole('alertdialog',{name:'Review native setting corrections'});
 await expect(review).toContainText('changes model geometry');expect(bodies).toHaveLength(0);await review.getByRole('radio',{name:'Enable geometry change',exact:true}).check();await review.getByRole('button',{name:'Apply choices',exact:true}).click();
 await expect(review).toHaveCount(0);await expect(page.getByLabel('Make overhangs printable (make_overhang_printable)',{exact:true})).toBeChecked();expect(bodies).toHaveLength(0);
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].settings.make_overhang_printable).toBe('1');expect(bodies[0].correctionBatches[0][0].choice).toBe('alternative');expect(prepareFixture(bodies[0],{record}).ready).toBe(true);
});
