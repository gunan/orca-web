import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createNativeGcodeWorker} from '../../server/native-gcode-worker.js';
import {nativeFilamentTestInput} from '../fixtures/native-filament-input.js';
import {nativeEditorTestContext} from '../fixtures/native-editor-context.js';
import {routeNativeReadyJobHotend} from '../fixtures/native-preview-job-hotend.js';
import {nativeFilamentUsage,nativeMaterialLabel} from '../../shared/native-filament-preview.js';
import {nativeSummaryMaterialLabels,nativeRoleUsageLabels} from '../../shared/native-display-units.js';
import {nativeAllPlateStatistics} from '../../shared/native-all-plate-statistics.js';
import {nativeFeaturePalette} from '../../shared/gcode-preview.js';
async function setup(page){
 const text=await nativeFilamentTestInput(),worker=createNativeGcodeWorker({binary:process.env.ORCA_GCODE_WORKER_BIN||path.resolve('.native-cache/gcode-build/orca-gcode-worker'),resourcesDir:'/Applications/OrcaSlicer.app/Contents/Resources'});
 let data;try{data={...await worker.process(Buffer.from(text),{context:nativeEditorTestContext()}),sourceSha256:createHash('sha256').update(text).digest('hex'),sourceBytes:Buffer.byteLength(text)};}finally{await worker.shutdown();}
 const errors=[],id='native-units-proof';let requests=0;page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await routeNativeReadyJobHotend(page,id);
 await page.route('**/api/jobs',route=>route.request().method()==='POST'?route.fulfill({status:202,json:{id,status:'ready',filename:'Native Units proof.gcode',nativePreviewProject:{version:1,plates:[{id:'one',name:'One'},{id:'two',name:'Two'}]}}}):route.continue());
 await page.route(`**/api/jobs/${id}/download`,route=>route.fulfill({contentType:'text/plain',body:text}));await page.route(`**/api/jobs/${id}/native-preview`,route=>{requests++;return route.fulfill({json:data});});await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({json:{available:true,engine:data.engine}}));
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));await page.getByRole('button',{name:'Slice model',exact:true}).click();await expect(page.getByRole('img',{name:'3D G-code toolpaths'})).toHaveAttribute('data-processor','native');
 async function units(imperial){await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'});await dialog.getByLabel('Units').selectOption(imperial?'1':'0');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);}
 return{data,errors,units,requests:()=>requests,id};
}
test('Units converts native material tables, summary and Feature rows without reprocessing job data',async({page})=>{
 const ui=await setup(page),select=page.getByLabel('Toolpath color mode');
 for(const imperial of [false,true,false]){
  await ui.units(imperial);await select.selectOption('color');const usage=nativeFilamentUsage(ui.data,{imperial}),legend=page.getByRole('region',{name:'Native filament usage'});
  for(const row of usage.rows)for(const column of usage.columns){const cell=legend.locator(`tbody tr[data-filament="${row.tool}"] td[data-material="${column.key}"]`);await expect(cell).toHaveText(nativeMaterialLabel(row.amounts[column.key],imperial,usage.showTotals));await expect(cell).toHaveAttribute('data-volume',String(row.amounts[column.key].volume));}
  await select.selectOption('summary');const summary=page.getByRole('region',{name:'Native print summary'}),labels=nativeSummaryMaterialLabels(ui.data.editorStatistics,{imperial});await expect(summary.locator('[data-filament-mm]')).toHaveText(labels.length);await expect(summary.locator('[data-filament-grams]')).toHaveText(labels.weight);await expect(summary.locator('[data-filament-mm]')).toHaveAttribute('data-filament-mm',String(ui.data.editorStatistics.filamentMm));
  await select.selectOption('feature');const roles=page.locator('[data-native-role]');expect(await roles.count()).toBeGreaterThan(0);for(const role of await roles.all()){const name=await role.getAttribute('data-native-role'),id=nativeFeaturePalette.find(item=>item.name===name).order,stats=ui.data.roles.find(item=>item.role===id),labels=nativeRoleUsageLabels({...stats,seconds:stats.seconds[0]},ui.data.modes[0],{imperial});await expect(role.locator('[data-native-role-length]')).toHaveText(labels.length);await expect(role.locator('[data-native-role-weight]')).toHaveText(labels.weight);}
  await select.selectOption('width');await expect(page.getByRole('heading',{name:'Line width (mm)',exact:true})).toBeVisible();
 }
 expect(ui.requests()).toBe(1);expect(ui.errors).toEqual([]);await page.screenshot({path:test.info().outputPath('native-units-preview.png')});
});
test('all-plate statistics request and render the current native display units on each opening',async({page})=>{
 const ui=await setup(page),seen=[];await page.route(`**/api/jobs/${ui.id}/native-preview/all-plates?*`,route=>{const units=new URL(route.request().url()).searchParams.get('units');seen.push(units);return route.fulfill({json:nativeAllPlateStatistics([{data:ui.data,extruders:[1,2]},{data:ui.data,extruders:[1,2]}],{imperial:units==='imperial'})});});
 for(const imperial of[true,false]){await ui.units(imperial);await page.getByRole('button',{name:'Statistics of all plates',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Statistics of all plates'});await expect(dialog).toContainText('2 completed plates');const expected=nativeAllPlateStatistics([{data:ui.data,extruders:[1,2]},{data:ui.data,extruders:[1,2]}],{imperial});for(const row of expected.rows)await expect(dialog.locator(`tbody tr[data-filament="${row.tool}"] [data-material="total"]`)).toHaveText(nativeMaterialLabel(row.total,imperial,true));await page.keyboard.press('Escape');}
 expect(seen).toEqual(['imperial','metric']);expect(ui.errors).toEqual([]);
});
