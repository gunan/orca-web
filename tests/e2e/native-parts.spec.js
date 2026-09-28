import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exportNative3MF, importNative3MF, nativeSettingsFromSelection } from '../../shared/native-project.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';
import { fixtureCatalog } from '../fixtures/native-project-catalog.js';

async function load(page){
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),project=makeNativeAcceptanceProject(base),catalog=fixtureCatalog(base);
  const selected=catalog.resolveSelection({printerId:'printer',processId:'process',filamentId:'red'}),blue=catalog.resolveSelection({printerId:'printer',processId:'process',filamentId:'blue'}).filament;
  project.nativeSettings={...base.nativeSettings,...nativeSettingsFromSelection({...selected,filaments:[selected.filament,blue]}),single_extruder_multi_material:'1',enable_prime_tower:'0'};
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles({name:'Parts.3mf',mimeType:'model/3mf',buffer:Buffer.from(exportNative3MF(project))});
  await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Objects',exact:true}).click();
  return page.getByRole('dialog',{name:'Object and part settings'});
}
async function selectPart(dialog,name){const option=dialog.getByLabel('Selected native part').locator('option').filter({hasText:name});await dialog.getByLabel('Selected native part').selectOption(await option.getAttribute('value'));}
async function saved(page){await page.getByRole('button',{name:'Project',exact:true}).click();const promise=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await promise).path(),'utf8'));}

test('object and part overrides use native scopes, inherit values and survive project export',async({page})=>{
  const dialog=await load(page);await selectPart(dialog,'Red main');
  await dialog.getByLabel('Search object settings').fill('wall_loops');
  await expect(dialog.getByLabel('Override wall_loops')).toBeChecked();
  await dialog.getByLabel('Wall loops (wall_loops)',{exact:true}).fill('5');
  await selectPart(dialog,'Through hole');await expect(dialog.getByLabel('Wall loops (wall_loops)',{exact:true})).toHaveValue('5');
  await selectPart(dialog,'Dense corner');await dialog.getByLabel('Native settings scope').selectOption('part');
  await dialog.getByLabel('Search object settings').fill('sparse_infill_density');
  const density=dialog.getByLabel('Sparse infill density (sparse_infill_density)',{exact:true});
  await expect(density).toHaveValue('50');await density.fill('65');
  await dialog.getByLabel('Search object settings').fill('layer_height');
  await expect(dialog.locator('[data-native-setting="layer_height"]')).toHaveCount(0);
  await dialog.getByLabel('Native settings scope').selectOption('object');await dialog.getByLabel('Search object settings').fill('layer_height');
  await expect(dialog.getByLabel('Layer height (layer_height)',{exact:true})).toBeDisabled();
  await expect(dialog.getByLabel('Layer height (layer_height)',{exact:true})).toHaveValue('0.16');
  await dialog.getByLabel('Search object settings').fill('travel_speed');await expect(dialog.locator('[data-native-setting="travel_speed"]')).toHaveCount(0);
  await selectPart(dialog,'Blue part');await dialog.getByLabel('Native part filament').selectOption('1');
  await dialog.getByRole('button',{name:'Apply object settings'}).click();await expect(dialog).toHaveCount(0);
  const project=await saved(page),body=project.objects.find(object=>object.name==='Red main'),hole=project.objects.find(object=>object.name==='Through hole'),modifier=project.objects.find(object=>object.name==='Dense corner');
  expect(body.native.objectSettings.wall_loops).toBe('5');expect(hole.native.objectSettings.wall_loops).toBe('5');expect(modifier.native.objectSettings.wall_loops).toBe('5');
  expect(modifier.native.partSettings.sparse_infill_density).toBe('65%');expect(body.native.partSettings.sparse_infill_density).toBeUndefined();
  expect(project.objects.find(object=>object.name==='Blue part').filamentSlot).toBe(1);expect(project.nativeSettings.layer_height).toBe('0.16');
});

test('regrouping adopts object settings and unsupported standalone modifiers are rejected without saving',async({page})=>{
  const dialog=await load(page);await selectPart(dialog,'Through hole');
  await dialog.getByLabel('Native object group').selectOption({label:'Blue object'});
  await dialog.getByLabel('Search object settings').fill('wall_loops');await expect(dialog.getByLabel('Wall loops (wall_loops)',{exact:true})).toHaveValue('2');
  await selectPart(dialog,'Red main');await dialog.getByLabel('Native part role').selectOption('modifier_part');
  await dialog.getByRole('button',{name:'Apply object settings'}).click();await expect(dialog.getByRole('alert')).toContainText('needs a normal part');
  await dialog.getByRole('button',{name:'Cancel changes'}).click();
  const project=await saved(page);expect(project.objects.find(object=>object.name==='Red main').native.partType).toBe('normal_part');
  expect(project.objects.find(object=>object.name==='Through hole').native.groupId).toBe(project.objects.find(object=>object.name==='Red main').native.groupId);
});

test('resetting an override restores inheritance and invalid values stay in the editor',async({page})=>{
  const dialog=await load(page);await selectPart(dialog,'Dense corner');await dialog.getByLabel('Native settings scope').selectOption('part');await dialog.getByLabel('Search object settings').fill('sparse_infill_density');
  await dialog.getByLabel('Override sparse_infill_density').uncheck();await expect(dialog.getByLabel('Sparse infill density (sparse_infill_density)',{exact:true})).toBeDisabled();
  await dialog.getByLabel('Native settings scope').selectOption('object');await dialog.getByLabel('Search object settings').fill('wall_loops');
  await dialog.getByLabel('Wall loops (wall_loops)',{exact:true}).fill('-1');await dialog.getByRole('button',{name:'Apply object settings'}).click();await expect(dialog.getByRole('alert')).toContainText('integer');
  await dialog.getByLabel('Wall loops (wall_loops)',{exact:true}).fill('3');await dialog.getByRole('button',{name:'Apply object settings'}).click();
  const project=await saved(page);expect(project.objects.find(object=>object.name==='Dense corner').native.partSettings.sparse_infill_density).toBeUndefined();
});
