import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importNative3MF } from '../../shared/native-project.js';
async function open(page) {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(path.resolve('tests/fixtures/orca-2.4.2-cube.3mf'));
  await expect(page.getByText('Embedded native presets', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Layer events', exact: true }).click();
  return page.getByRole('dialog', { name: 'Layer events', exact: true });
}
test('per-plate pause and multiline G-code events survive browser edit and native archive export', async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByLabel('Layer event height').fill('1.16');
  await dialog.getByLabel('Layer pause message').fill('Insert the nut');
  await dialog.getByRole('button', { name: 'Add layer event', exact: true }).click();
  await dialog.getByLabel('Layer event action').selectOption('Custom');
  await dialog.getByLabel('Layer event height').fill('2.12');
  await dialog.getByLabel('Layer event G-code').fill('M117 Browser event\n; Preserve this second line');
  await dialog.getByRole('button', { name: 'Add layer event', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply layer events' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Layer events', exact: true }).click();
  await expect(dialog.getByText('Z 1.16 mm · Pause print', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit event at 1.16 mm' }).click();
  await dialog.getByLabel('Layer pause message').fill('Updated instruction');
  await dialog.getByRole('button', { name: 'Update layer event' }).click();
  await dialog.getByRole('button', { name: 'Apply layer events' }).click();
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export native project', exact: true }).click();
  const project = importNative3MF(await readFile(await (await downloadPromise).path()));
  expect(project.plates[0].layerEvents.items.map(({ gcode, ...item }) => item)).toEqual([
    { printZ: 1.16, type: 'PausePrint', extruder: 1, color: '#FF8000', extra: 'Updated instruction' },
    { printZ: 2.12, type: 'Custom', extruder: 1, color: '#FF8000', extra: 'M117 Browser event\n; Preserve this second line' }
  ]);
});
test('duplicate heights and empty custom commands are rejected; cancellation preserves saved events', async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Add layer event', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add layer event', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('already exists');
  await dialog.getByLabel('Layer event action').selectOption('Custom');
  await dialog.getByLabel('Layer event height').fill('2');
  await dialog.getByRole('button', { name: 'Add layer event', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter G-code');
  await dialog.getByRole('button', { name: 'Cancel changes' }).click();
  await page.getByRole('button', { name: 'Layer events', exact: true }).click();
  await expect(dialog.getByText('No layer events on this plate.', { exact: true })).toBeVisible();
});
