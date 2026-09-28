import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { importNative3MF } from '../../shared/native-project.js';
const fixture = path.resolve('tests/fixtures/orca-2.4.2-cube.3mf');

test('native project import preserves embedded settings and exports edited settings back to native 3MF', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(fixture);
  await expect(page.getByText('Embedded native presets', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue('0.16');
  await expect(page.getByLabel('Printer', { exact: true })).toBeDisabled();
  await expect(page.locator('.scene-object-row')).toHaveCount(1);
  await page.getByLabel('Layer height', { exact: true }).fill('0.12');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export native project', exact: true }).click();
  const download = await downloadPromise;
  const project = importNative3MF(await readFile(await download.path()));
  expect(project.nativeSettings.layer_height).toBe('0.12'); expect(project.objects).toHaveLength(1); expect(project.plates).toHaveLength(1);
  expect(project.nativePresetNames.printer).toContain('Prusa');
});

test('embedded native projects slice through the project endpoint without replacing unmatched presets', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeEnabled();
  const response = page.waitForResponse(value => value.url().endsWith('/api/jobs/project') && value.request().method() === 'POST');
  await page.getByRole('button', { name: 'Slice model' }).click();
  const posted = await response; expect(posted.status()).toBe(202);
  const body = await posted.json(); expect(body.nativeProject.source).toBe('embedded'); expect(body.nativeProject.partCount).toBe(1); expect(body.settings.layer_height).toBe('0.16');
  await expect(page.getByRole('link', { name: 'Download G-code', exact: false })).toBeVisible();
});

test('explicitly switching an unmatched native project to installed presets enables compatible replacement choices', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(fixture);
  await expect(page.getByText('Embedded native presets', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use installed presets' }).click();
  await expect(page.getByText('Embedded native presets', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Printer', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue('0.2');
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeEnabled();
});


test('fresh native GUI project imports, exports and slices with its embedded filament visual metadata', async ({page})=>{
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 await page.getByLabel('Open Orca Web project').setInputFiles(path.resolve('tests/fixtures/native-gui-cube-2.4.2.3mf'));
 await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.16');
 await page.getByRole('button',{name:'Project',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export native project',exact:true}).click();
 const project=importNative3MF(await readFile(await(await pending).path()));
 expect(project.nativeSettings.filament_colour_type).toEqual(['1']);expect(project.nativeSettings.filament_multi_colour).toEqual(['#F2754E']);
 await page.getByRole('button',{name:'Prepare',exact:true}).click();
 const submitted=page.waitForResponse(r=>r.url().endsWith('/api/jobs/project')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Slice model',exact:true}).click();expect((await submitted).status()).toBe(202);
 await expect(page.getByRole('link',{name:'Download G-code',exact:false})).toBeVisible();
});
