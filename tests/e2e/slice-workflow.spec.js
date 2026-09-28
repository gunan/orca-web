import { test, expect } from '@playwright/test';
import path from 'node:path';

const cube = path.resolve('tests/fixtures/cube.stl');

async function presets(request, printerId) {
  const response = await request.get(`/api/presets${printerId ? `?printerId=${encodeURIComponent(printerId)}` : ''}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function selection(request, ids) {
  const response = await request.get(`/api/presets/selection?${new URLSearchParams(ids)}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function ready(page) {
  await page.goto('/');
  await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('OrcaSlicer');
}

test('uploads a model using resolved native presets, slices, and downloads G-code', async ({ page, request }) => {
  const catalog = await presets(request);
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await expect(page.getByText('cube.stl', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Interactive 3D model view' })).toBeVisible();
  await expect(page.getByText('Triangles: 12', { exact: true })).toBeVisible();
  await expect(page.getByTestId('object-dimensions')).toContainText('20 × 20 × 20 mm');
  const submission = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/api/jobs'));
  await page.getByRole('button', { name: 'Slice model' }).click();
  const response = await submission;
  expect(response.status()).toBe(202);
  const received = await response.json();
  for (const key of ['printerId', 'processId', 'filamentId']) expect(received[key]).toBe(catalog.defaults[key]);
  expect(received.overrides).toEqual({});
  await expect(page.getByText('Ready to print')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'G-code toolpath preview' })).toBeVisible();
  await expect(page.getByTestId('toolpath-summary')).toBeVisible();
  const download = page.getByRole('link', { name: 'Download G-code' });
  await expect(download).toHaveAttribute('href', /\/api\/jobs\/.+\/download/);
  const output = await request.get(await download.getAttribute('href'));
  expect(output.ok()).toBeTruthy();
  expect(await output.text()).toContain('G28');
  expect(output.headers()['content-disposition']).toContain('cube.gcode');
});

test('rejects unsupported files without submitting a job', async ({ page }) => {
  await ready(page);
  let submitted = false;
  page.on('request', value => { if (value.method() === 'POST' && value.url().endsWith('/api/jobs')) submitted = true; });
  await page.getByLabel('Choose a 3D model').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert')).toContainText('STL, OBJ, 3MF, AMF, SVG, or STEP');
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeDisabled();
  expect(submitted).toBe(false);
});

test('process selectors stay synchronized, defaults come from native presets, and reset clears overrides', async ({ page, request }) => {
  const catalog = await presets(request);
  expect(catalog.processes.length).toBeGreaterThan(1);
  const alternate = catalog.processes.find(item => item.id !== catalog.defaults.processId);
  const defaults = await selection(request, catalog.defaults);
  const changed = await selection(request, { ...catalog.defaults, processId: alternate.id });
  expect(changed.settings.layer_height).not.toBe(defaults.settings.layer_height);
  await ready(page);
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(defaults.settings.layer_height));
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByLabel('Layer height', { exact: true }).fill('0.31');
  await expect(page.locator('.estimate')).toContainText('0.31 mm layer');
  await page.getByRole('button', { name: '↶ Reset', exact: true }).click();
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(defaults.settings.layer_height));
  await expect(page.locator('.estimate')).toContainText(`${defaults.settings.layer_height} mm layer`);
  await expect(page.getByRole('button', { name: '↶ Reset', exact: true })).toBeDisabled();
  await page.getByLabel('Layer height', { exact: true }).fill('0.32');
  await page.getByLabel('Process preset', { exact: true }).selectOption(alternate.id);
  await expect(page.getByLabel('Print profile')).toHaveValue(alternate.id);
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(changed.settings.layer_height));
  await expect(page.getByRole('button', { name: '↶ Reset', exact: true })).toBeDisabled();
  await expect(page.getByText('cube.stl', { exact: true })).toBeVisible();
  await page.getByLabel('Print profile').selectOption(catalog.defaults.processId);
  await expect(page.getByLabel('Process preset', { exact: true })).toHaveValue(catalog.defaults.processId);
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(defaults.settings.layer_height));
});

test('numeric, enum, and boolean controls submit only explicit overrides in native values', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByLabel('Layer height', { exact: true }).fill('0.16');
  await page.getByLabel('Seam position').selectOption('nearest');
  await page.getByRole('button', { name: 'Support', exact: true }).click();
  await page.getByLabel('Enable support').check();
  await page.getByLabel('Type', { exact: true }).selectOption('tree(auto)');
  const submission = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/api/jobs'));
  await page.getByRole('button', { name: 'Slice model' }).click();
  const response = await submission;
  expect(response.status()).toBe(202);
  expect((await response.json()).overrides).toEqual({
    layer_height: '0.16', seam_position: 'nearest', enable_support: '1', support_type: 'tree(auto)'
  });
  await expect(page.getByText('Ready to print')).toBeVisible({ timeout: 10_000 });
});

test('changing printer refreshes compatible process and filament choices while preserving the file', async ({ page, request }) => {
  const initial = await presets(request);
  const printer = initial.printers.find(item => item.id !== initial.defaults.printerId);
  expect(printer).toBeTruthy();
  const compatible = await presets(request, printer.id);
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByLabel('Printer', { exact: true }).selectOption(printer.id);
  await expect(page.getByLabel('Process preset', { exact: true })).toHaveValue(compatible.defaults.processId);
  await expect(page.getByLabel('Filament', { exact: true })).toHaveValue(compatible.defaults.filamentId);
  await expect(page.getByLabel('Process preset', { exact: true }).locator('option')).toHaveText(compatible.processes.map(item => item.name));
  await expect(page.getByLabel('Filament', { exact: true }).locator('option')).toHaveText(compatible.filaments.map(item => item.name));
  await expect(page.getByText('cube.stl', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeEnabled();
});

test('pending preset requests disable slicing and stale responses cannot replace the latest selection', async ({ page, request }) => {
  const catalog = await presets(request);
  const alternate = catalog.processes.find(item => item.id !== catalog.defaults.processId);
  const defaults = await selection(request, catalog.defaults);
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let requestStarted;
  const started = new Promise(resolve => { requestStarted = resolve; });
  let requestFinished;
  const finished = new Promise(resolve => { requestFinished = resolve; });
  await page.route('**/api/presets/selection?*', async route => {
    if (new URL(route.request().url()).searchParams.get('processId') !== alternate.id) return route.continue();
    const response = await route.fetch();
    requestStarted();
    await blocked;
    await route.fulfill({ response }).catch(() => {});
    requestFinished();
  });
  await page.getByLabel('Print profile').selectOption(alternate.id);
  await started;
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeDisabled();
  await page.getByLabel('Print profile').selectOption(catalog.defaults.processId);
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(defaults.settings.layer_height));
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeEnabled();
  release();
  await finished;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByLabel('Process preset', { exact: true })).toHaveValue(catalog.defaults.processId);
  await expect(page.getByLabel('Layer height', { exact: true })).toHaveValue(String(defaults.settings.layer_height));
});

test('changing a preset invalidates an old download result', async ({ page, request }) => {
  const catalog = await presets(request);
  const alternate = catalog.processes.find(item => item.id !== catalog.defaults.processId);
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByRole('button', { name: 'Slice model' }).click();
  await expect(page.getByRole('link', { name: 'Download G-code' })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Print profile').selectOption(alternate.id);
  await expect(page.getByRole('link', { name: 'Download G-code' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No slicing result' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare', exact: true }).click();
  await expect(page.getByText('cube.stl', { exact: true })).toBeVisible();
});

test('failed jobs display their error and never offer a download', async ({ page }) => {
  await page.route('**/api/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 202, json: { id: 'failed-job', filename: 'cube.stl', status: 'queued' } });
  });
  await page.route('**/api/jobs/failed-job', route => route.fulfill({ json: { id: 'failed-job', filename: 'cube.stl', status: 'failed', error: 'The slicer rejected this model' } }));
  await ready(page);
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await page.getByRole('button', { name: 'Slice model' }).click();
  await expect(page.getByRole('alert')).toContainText('The slicer rejected this model');
  await expect(page.getByRole('heading', { name: 'Slicing failed' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download G-code' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeEnabled();
});

test('unavailable engines prevent slicing and unfinished features are explicit', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { status: 'degraded', engine: { available: false, error: 'OrcaSlicer executable was not found' }, presets: { available: true } } }));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Engine unavailable');
  await expect(page.getByLabel('Layer height', { exact: true })).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await expect(page.getByRole('button', { name: 'Slice model' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('OrcaSlicer executable was not found');
  await expect(page.getByRole('button', { name: 'Move', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Objects', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Device', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Device', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add printer', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project', exact: true })).toBeVisible();
});
