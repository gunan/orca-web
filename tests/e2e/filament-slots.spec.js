import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { importNative3MF } from '../../shared/native-project.js';
test('filament slots, part assignments and directed purge volumes persist into native 3MF', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(path.resolve('tests/fixtures/orca-2.4.2-cube.3mf'));
  await expect(page.getByText('Embedded native presets', { exact: true })).toBeVisible();
  await page.getByRole('button', { name:'Add filament slot', exact:true }).click();
  await expect(page.getByLabel('Filament 2 color')).toBeVisible();
  await page.getByLabel('Object filament slot').selectOption('2');
  await page.getByRole('button', { name:'Remove filament slot 2',exact:true }).click();
  await expect(page.getByRole('alert')).toContainText('Reassign objects');
  await page.getByRole('button', { name:'Flush volumes',exact:true }).click();
  const dialog=page.getByRole('dialog',{name:'Flushing volumes',exact:true});
  await dialog.getByLabel('Flush multiplier').fill('1');
  await dialog.getByLabel('Flush from filament 1 to 2').fill('375');
  await dialog.getByLabel('Flush from filament 2 to 1').fill('185');
  await expect(dialog.getByLabel('Flush from filament 1 to 1')).toBeDisabled();
  await dialog.getByRole('button',{name:'Apply flushing volumes'}).click();
  await page.getByRole('button',{name:'Project',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export native project',exact:true}).click();
  const project=importNative3MF(await readFile(await(await downloading).path()));
  expect(project.nativeSettings.filament_settings_id).toHaveLength(2);expect(project.nativeSettings.nozzle_temperature).toHaveLength(2);expect(project.objects[0].filamentSlot).toBe(2);expect(project.nativeSettings.flush_volumes_matrix).toEqual(['0','375','185','0']);
});
test('the single primary filament selector persists its choice after unused-slot deletion', async ({ page, request }) => {
  const defaults = (await (await request.get('/api/presets')).json()).defaults;
  const response = await request.post('/api/presets/custom',{data:{type:'filament',name:`Slot test filament ${Date.now()}`,baseId:defaults.filamentId,compatiblePrinterIds:[defaults.printerId],settings:{nozzle_temperature:[215]}}});
  expect(response.status()).toBe(201); const added = await response.json();
  try {
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Add filament slot',exact:true}).click();
  const options=await page.getByLabel('Filament',{exact:true}).locator('option').evaluateAll(items=>items.map(item=>item.value));
  expect(options.length).toBeGreaterThan(1);await page.getByLabel('Filament',{exact:true}).selectOption(options[1]);
  await expect(page.getByLabel('Filament',{exact:true})).toHaveValue(options[1]);
  await page.getByRole('button',{name:'Remove filament slot 2',exact:true}).click();await expect(page.getByLabel('Filament slot 2',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Filament',{exact:true})).toHaveValue(options[1]);
  } finally { await request.delete(`/api/presets/custom/${added.id}`); }
});
