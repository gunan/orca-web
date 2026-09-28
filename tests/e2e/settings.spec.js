import { test, expect } from '@playwright/test';
import path from 'node:path';
import { settingGroups } from '../../shared/settings.js';
const cube = path.resolve('tests/fixtures/cube.stl');
async function start(page) { await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled(); }
const control = (page, key) => page.locator(`[data-setting-key="${key}"]`);

test('every native process page exposes its source-backed settings and source defaults', async ({ page, request }) => {
  await start(page);
  const presets = await (await request.get('/api/presets')).json();
  const selected = await (await request.get(`/api/presets/selection?${new URLSearchParams(presets.defaults)}`)).json();
  expect(Object.keys(selected.settings)).toHaveLength(342);
  let count = 0;
  for (const [name, definitions] of Object.entries(settingGroups)) {
    await page.getByRole('button', { name, exact: true }).click();
    const rendered = await page.locator('[data-setting-row]').evaluateAll(rows => rows.map(row => row.dataset.settingRow));
    expect(rendered.length).toBeGreaterThan(0);
    for (const key of rendered) { expect(definitions.some(definition=>definition.key===key)).toBe(true); await expect(control(page,key)).toHaveCount(1); }
    count += definitions.length;
  }
  expect(count).toBe(342);
  await expect(control(page,'post_process')).toBeDisabled();
  await page.getByLabel('Search settings').fill('outer_wall_line_width');
  await expect(control(page,'outer_wall_line_width')).toHaveValue(selected.settings.outer_wall_line_width);
  await page.getByLabel('Search settings').fill('does_not_exist_123');
  await expect(page.getByText('No settings match this search.')).toBeVisible();
});

test('native percentages, added enum values and vector edits reach the API without shape corruption', async ({ page }) => {
  await start(page); await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  async function find(key) { await page.getByLabel('Search settings').fill(key); return control(page,key); }
  await (await find('outer_wall_line_width')).fill('125%');
  await (await find('ironing_type')).selectOption('topmost');
  await (await find('small_area_infill_flow_compensation')).check();
  await (await find('small_area_infill_flow_compensation_model')).fill('["0,0","0.2,0.4444"]');
  const response = page.waitForResponse(value => value.url().endsWith('/api/jobs') && value.request().method() === 'POST');
  await page.getByRole('button', { name: 'Slice model' }).click();
  const posted = await response; expect(posted.status()).toBe(202);
  expect((await posted.json()).overrides).toEqual({ outer_wall_line_width: '125%', ironing_type: 'topmost', small_area_infill_flow_compensation: '1', small_area_infill_flow_compensation_model: ['0,0','0.2,0.4444'] });
});

test('mode filtering, row reset and preset comparison preserve current edits', async ({ page }) => {
  await start(page);
  const all = await page.locator('[data-setting-row]').count();
  await page.getByLabel('Settings mode').selectOption('Simple');
  expect(await page.locator('[data-setting-row]').count()).toBeLessThan(all);
  await page.getByLabel('Layer height', { exact:true }).fill('0.31');
  await page.getByRole('button', { name:'Compare presets', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'Compare process presets' });
  await expect(dialog.getByRole('cell', { name:'0.31', exact:true })).toBeVisible();
  await dialog.getByRole('button', { name:'Close comparison' }).click();
  await page.getByRole('button', { name:'Reset Layer height', exact:true }).click();
  await expect(page.getByLabel('Layer height', { exact:true })).toHaveValue('0.2');
  await page.getByRole('button', { name:'Compare presets', exact:true }).click();
  await expect(page.getByText('No differences.', { exact:true })).toBeVisible();
});

test('invalid scalar and vector drafts cannot be sliced, and reset restores valid controls', async ({ page }) => {
  await start(page); await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByLabel('Layer height', { exact:true }).fill('0');
  expect(await page.getByLabel('Layer height', { exact:true }).evaluate(el => el.checkValidity())).toBe(false);
  await page.getByRole('button', { name:'Reset Layer height', exact:true }).click();
  expect(await page.getByLabel('Layer height', { exact:true }).evaluate(el => el.checkValidity())).toBe(true);
  await page.getByLabel('Search settings').fill('small_area_infill_flow_compensation');
  await control(page,'small_area_infill_flow_compensation').check();
  await page.getByLabel('Search settings').fill('small_area_infill_flow_compensation_model');
  await control(page,'small_area_infill_flow_compensation_model').fill('[broken');
  expect(await control(page,'small_area_infill_flow_compensation_model').evaluate(el => el.checkValidity())).toBe(false);
  let posted = false; page.on('request', request => { if (request.url().endsWith('/api/jobs') && request.method()==='POST') posted=true; });
  await page.getByRole('button', { name:'Slice model' }).click();
  expect(posted).toBe(false);
});
