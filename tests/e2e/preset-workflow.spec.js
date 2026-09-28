import { test, expect } from '@playwright/test';
import path from 'node:path';
const cube = path.resolve('tests/fixtures/cube.stl');
async function start(page) { await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled(); }

test('a custom process captures current edits, survives reload, and supplies subsequent slice jobs', async ({ page, request }) => {
  await start(page);
  const original = await page.getByLabel('Process preset', { exact: true }).inputValue();
  const name = `Browser process ${Date.now()}`;
  let customId;
  try {
    await page.getByLabel('Layer height', { exact: true }).fill('0.13');
    await page.getByRole('button', { name: 'Edit process preset', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Process preset editor' });
    await expect(dialog.getByLabel('Preset name')).toBeEnabled();
    await dialog.getByLabel('Preset name').fill(name);
    await dialog.getByRole('button', { name: 'Save as new preset', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel('Process preset', { exact: true }).locator('option:checked')).toHaveText(name);
    customId = await page.getByLabel('Process preset', { exact: true }).inputValue();
    expect(customId).not.toBe(original);
    await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue('0.13');
    await expect(page.getByRole('button', { name: 'Reset Layer height', exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByLabel('Process preset', { exact: true })).toBeEnabled();
    await page.getByLabel('Process preset', { exact: true }).selectOption(customId);
    await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue('0.13');
    await page.getByLabel('Choose a 3D model').setInputFiles(cube);
    const posted = page.waitForResponse(response => response.url().endsWith('/api/jobs') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Slice model' }).click();
    const response = await posted; expect(response.status()).toBe(202); expect((await response.json()).processId).toBe(customId);
  } finally { if (customId) await request.delete(`/api/presets/custom/${customId}`); }
});

test('editing an existing custom printer refreshes the selected bed without changing its ID', async ({ page, request }) => {
  const defaults = (await (await request.get('/api/presets')).json()).defaults;
  const created = await request.post('/api/presets/custom', { data: { type: 'machine', name: `Editable printer ${Date.now()}`, baseId: defaults.printerId, settings: { printable_area: ['0x0','220x0','220x180','0x180'] } } });
  expect(created.status()).toBe(201); const record = await created.json();
  try {
    await start(page); await page.getByLabel('Printer', { exact: true }).selectOption(record.id);
    await expect(page.locator('.native-presets small')).toContainText('220 × 180 mm');
    await page.getByRole('button', { name: 'Edit printer preset', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Printer preset editor' });
    await dialog.getByLabel('Search profile settings').fill('printable_area');
    await dialog.getByLabel('Printable area (printable_area) point 2 X', { exact: true }).fill('230');
    await dialog.getByLabel('Printable area (printable_area) point 3 X', { exact: true }).fill('230');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).not.toBeVisible(); await expect(page.getByLabel('Printer', { exact: true })).toHaveValue(record.id);
    await expect(page.locator('.native-presets small')).toContainText('230 × 180 mm');
  } finally { await request.delete(`/api/presets/custom/${record.id}`); }
});

test('editing a secondary filament creates a preset in that slot and keeps the first slot unchanged',async({page,request})=>{
 await start(page);const first=await page.getByLabel('Filament',{exact:true}).inputValue();await page.getByRole('button',{name:'Add filament slot',exact:true}).click();
 const name=`Secondary filament ${Date.now()}`;let savedId;
 try{
  await page.getByRole('button',{name:'Edit filament slot 2 preset',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Filament preset editor'});await expect(dialog.getByLabel('Preset name')).toBeEnabled();await dialog.getByLabel('Preset name').fill(name);
  const saving=page.waitForResponse(response=>response.url().endsWith('/api/presets/custom')&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Save as new preset',exact:true}).click();const response=await saving;expect(response.status(),await response.text()).toBe(201);savedId=(await response.json()).id;
  await expect(dialog).toHaveCount(0);await expect(page.getByLabel('Filament slot 2',{exact:true})).toHaveValue(savedId);await expect(page.getByLabel('Filament',{exact:true})).toHaveValue(first);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Filament slot 2',{exact:true})).toHaveValue(first);await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.getByLabel('Filament slot 2',{exact:true})).toHaveValue(savedId);
 }finally{if(savedId)await request.delete(`/api/presets/custom/${savedId}`);}
});
