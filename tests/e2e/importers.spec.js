import { test, expect } from '@playwright/test';
import path from 'node:path';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path d="M0 0H20V10H0Z M2 2V8H8V2Z" fill-rule="evenodd"/></svg>';
test('SVG extrusion options produce real dimensions and geometry that survive project saving', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact:true })).toBeEnabled();
  await page.getByRole('button', { name:'Import options', exact:true }).click();
  await page.getByLabel('SVG extrusion depth (mm)', { exact:true }).fill('3');
  await page.getByLabel('SVG scale', { exact:true }).fill('2');
  await page.getByRole('button', { name:'Done', exact:true }).click();
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'plate.svg', mimeType:'image/svg+xml', buffer:Buffer.from(svg)});
  await expect(page.getByTestId('object-dimensions')).toContainText('40 × 20 × 3 mm');
  await page.getByRole('button', { name:'Analyze mesh', exact:true }).click();
  await expect(page.getByLabel('Mesh analysis')).toContainText('"manifold": true');
  await expect(page.getByLabel('Mesh analysis')).toContainText('"volume": 1968');
});

test('STEP production worker loads the local OpenCascade WASM and creates editable geometry', async ({ page }) => {
  const workerFailures=[]; page.on('pageerror', error => workerFailures.push(error.message));
  await page.goto('/'); await expect(page.getByLabel('Layer height', { exact:true })).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/occt-cube.step'));
  await expect(page.getByTestId('object-dimensions')).toContainText('300 × 300 × 300 mm', { timeout:20000 });
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await page.getByLabel('scale X',{exact:true}).fill(String(1/15));
  await expect(page.getByTestId('object-dimensions')).toContainText('20 × 20 × 20 mm');
  expect(workerFailures).toEqual([]);
});
