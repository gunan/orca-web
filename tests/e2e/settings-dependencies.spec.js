import { test, expect } from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';
import {serializeProject} from '../../shared/project.js';
const control=(page,key)=>page.locator(`[data-setting-key="${key}"]`);
async function start(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();}
async function find(page,key){await page.getByLabel('Search settings',{exact:true}).fill(key);return control(page,key);}
test('support and infill controls follow their native dependencies and explain disabled search results',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Support',exact:true}).click();await expect(control(page,'support_type')).toBeDisabled();
 await control(page,'enable_support').check();await expect(control(page,'support_type')).toBeEnabled();await control(page,'support_type').selectOption('tree(auto)');
 await expect(control(page,'tree_support_branch_angle_organic')).toBeEnabled();
 await find(page,'small_area_infill_flow_compensation_model');await expect(control(page,'small_area_infill_flow_compensation_model')).toBeDisabled();await expect(page.getByText('Requires small-area flow compensation.',{exact:true})).toBeVisible();
 await (await find(page,'small_area_infill_flow_compensation')).check();await expect(control(page,'small_area_infill_flow_compensation_model')).toBeEnabled();
});
test('spiral mode presents the actual native related changes and supports its native alternative',async({page})=>{
 await start(page);await (await find(page,'spiral_mode')).check();
 await page.getByRole('button',{name:'Review required changes'}).click();const dialog=page.getByRole('dialog',{name:'Native setting changes',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('one wall');await dialog.getByRole('button',{name:'Use native alternative'}).click();await expect(control(page,'spiral_mode')).not.toBeChecked();
 await control(page,'spiral_mode').check();await page.getByRole('button',{name:'Review required changes'}).click();await dialog.getByRole('button',{name:'Apply required changes'}).click();
 await expect(page.getByRole('button',{name:'Review required changes'})).toHaveCount(0);await expect(await find(page,'wall_loops')).toHaveValue('1');await expect(await find(page,'top_shell_layers')).toHaveValue('0');await expect(await find(page,'sparse_infill_density')).toHaveValue('0');
});
test('native layer height limits require an acknowledged correction before submitting',async({page})=>{
 await page.route('**/api/presets/selection?*',async route=>{const response=await route.fetch();const json=await response.json();json.printerSettings.max_layer_height=['0.28'];await route.fulfill({response,json});});
 await start(page);await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));await page.getByLabel('Layer height',{exact:true}).fill('0.8');
 let submitted=0;page.on('request',request=>{if(request.url().endsWith('/api/jobs')&&request.method()==='POST')submitted++;});await page.getByRole('button',{name:'Slice model'}).click();
 const dialog=page.getByRole('dialog',{name:'Native setting changes',exact:true});await expect(dialog).toBeVisible();expect(submitted).toBe(0);await dialog.getByRole('button',{name:'Apply required changes'}).click();
 await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.28');await page.getByRole('button',{name:'Slice model'}).click();await expect.poll(()=>submitted).toBe(1);
});

test('imported hidden spiral correction survives save and reaches native export; edits require a fresh review',async({page})=>{
 const project=importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf'));
 project.useEmbeddedSettings=true;project.nativeWorkflow=true;project.nativeSettings.enforce_support_layers='7';
 await start(page);
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'hidden.orca-web.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(project))});
 await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
 await (await find(page,'spiral_mode')).check();
 await page.getByRole('button',{name:'Review required changes'}).click();
 const dialog=page.getByRole('dialog',{name:'Native setting changes',exact:true});
 await expect(dialog).toContainText('enforce_support_layers');
 await dialog.getByRole('button',{name:'Apply required changes'}).click();
 await expect(page.getByRole('button',{name:'Review required changes'})).toHaveCount(0);
 await page.getByRole('button',{name:'Project',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export native project',exact:true}).click();
 const download=await downloadPromise,exported=importNative3MF(await readFile(await download.path()));
 expect(exported.nativeSettings.enforce_support_layers).toBe('0');expect(exported.nativeSettings.wall_loops).toBe('1');
 await page.getByRole('button',{name:'Prepare',exact:true}).click();
 await (await find(page,'layer_height')).fill('0.12');
 await expect(page.getByRole('button',{name:'Review required changes'})).toBeVisible();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('button',{name:'Review required changes'})).toHaveCount(0);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Review required changes'}).click();
 await dialog.getByRole('button',{name:'Apply required changes'}).click();
 const response=page.waitForResponse(value=>value.url().endsWith('/api/jobs/project')&&value.request().method()==='POST');
 await page.getByRole('button',{name:'Slice model'}).click();const result=await response;
 expect(result.status()).toBe(202);expect(result.request().postDataJSON().processCorrectionDecisions).toHaveLength(1);
 await expect(page.getByRole('link',{name:'Download G-code',exact:false})).toBeVisible();
});

test('stale saved native choices show a recoverable error instead of crashing the editor',async({page})=>{
 const project=importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf'));
 project.useEmbeddedSettings=true;project.nativeWorkflow=true;project.processCorrectionDecisions=[{id:'process:spiral-mode',signature:'old',choice:'apply'}];
 await start(page);
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'stale.orca-web.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(project))});
 await expect(page.getByRole('alert')).toContainText('Previous native setting choices need review');
 await page.getByRole('button',{name:'Reset native choices'}).click();
 await expect(page.getByText('Previous native setting choices need review',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Slice model'})).toBeEnabled();
});
