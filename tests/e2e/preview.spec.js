import { test, expect } from '@playwright/test';
import path from 'node:path';

const gcode = `; generated preview fixture, not native acceptance
; estimated printing time (normal mode) = 1m 2s
; filament used [g] = 0.5
G21
G90
M82
G92 X0 Y0 Z0 E0
;LAYER_CHANGE
;Z:0.2
G1 Z0.2 F600
;TYPE:Outer wall
G1 X20 E1 F1200
G1 Y20 E2
G1 X0 E3
G1 Y0 E4
;LAYER_CHANGE
;Z:0.4
G1 Z0.4
T1
;TYPE:Sparse infill
G1 X20 Y20 E5 F2400
G1 X0 Y0 E6
`;

async function readyPreview(page, { content = gcode, status = 200, jobStatus = 'ready' } = {}) {
  await page.route('**/api/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 202, json: { id: 'preview-fixture', filename: 'cube.stl', status: jobStatus } });
  });
  await page.route('**/api/jobs/preview-fixture/download', route => route.fulfill({ status, contentType: 'text/plain', body: content }));
  await page.goto('/');
  await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));
  await page.getByRole('button', { name: 'Slice model', exact: true }).click();
}

test('renders actual parsed paths and supports layer, color, travel, fit and playback controls', async ({ page }) => {
  await readyPreview(page);
  await expect(page.getByRole('heading', { name: 'G-code toolpath preview' })).toBeVisible();
  await expect(page.getByRole('img', { name: '3D G-code toolpaths' })).toBeVisible();
  await expect(page.getByTestId('toolpath-summary')).toContainText('2 printed layers');
  await expect(page.getByTestId('toolpath-summary')).toContainText('8 parsed segments');
  await expect(page.getByTestId('toolpath-visible-count')).toHaveText('6 / 6 segments');
  await expect(page.getByLabel('Toolpath legend')).toContainText('Outer wall');
  await expect(page.getByText('1m 2s', { exact: true })).toBeVisible();
  await page.getByLabel('Last preview layer').fill('0');
  await expect(page.getByTestId('toolpath-visible-count')).toHaveText('4 / 4 segments');
  await page.getByLabel('Show travel and retractions').check();
  await expect(page.getByTestId('toolpath-visible-count')).toHaveText('5 / 5 segments');
  await page.getByLabel('Toolpath color mode').selectOption('speed');
  await expect(page.getByLabel('Toolpath legend')).toContainText('40 mm/s');
  await page.getByLabel('Toolpath color mode').selectOption('tool');
  await expect(page.getByLabel('Toolpath legend')).toContainText('Tool 1');
  await page.getByRole('button', { name: 'Fit toolpaths' }).click();
  await page.getByLabel('Visible toolpath segments').focus();
  await page.getByLabel('Visible toolpath segments').press('Home');
  await expect(page.getByTestId('toolpath-visible-count')).toHaveText('0 / 5 segments');
  await page.getByRole('button', { name: 'Play toolpath playback' }).click();
  await expect.poll(() => page.getByTestId('toolpath-visible-count').textContent()).not.toBe('0 / 5 segments');
});

test('missing native estimates stay unavailable instead of deriving a fabricated print time', async ({ page }) => {
  await readyPreview(page, { content: gcode.replace(/^; (?:estimated printing time|filament used).*\n/gm, '') });
  await expect(page.getByRole('heading', { name: 'G-code toolpath preview' })).toBeVisible();
  await expect(page.getByText('Not present in this G-code. Time, mass and cost are not inferred.')).toBeVisible();
});

test('reports failed G-code fetch rather than displaying a substitute preview', async ({ page }) => {
  await readyPreview(page, { status: 404, content: 'No output' });
  await expect(page.getByRole('heading', { name: 'Preview unavailable' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Cannot load G-code (404)');
  await expect(page.getByRole('img', { name: '3D G-code toolpaths' })).toHaveCount(0);
});

test('cancelled jobs show their terminal state without fetching G-code', async ({ page }) => {
  let requested = false;
  page.on('request', request => { if (request.url().includes('/preview-fixture/download')) requested = true; });
  await readyPreview(page, { jobStatus: 'cancelled' });
  await expect(page.getByRole('heading', { name: 'Slicing cancelled' })).toBeVisible();
  expect(requested).toBe(false);
});

// These fixtures exercise the bounded source-only parser; native processing has separate real-worker coverage.
test.beforeEach(async({page})=>{await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({status:200,json:{available:false,error:'Source-only preview fixture'}}));});
