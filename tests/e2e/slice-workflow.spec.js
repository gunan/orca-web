import { test, expect } from '@playwright/test';
import path from 'node:path';

test('uploads a model, slices it, and offers the G-code', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your slicer. Anywhere.' })).toBeVisible();
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));
  await expect(page.getByText('cube.stl')).toBeVisible();
  await page.getByRole('button', { name: 'Slice model' }).click();
  await expect(page.getByText('Ready to print')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Download G-code' })).toHaveAttribute('href', /\/api\/jobs\/.+\/download/);
});

test('validates files before starting a job', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose a 3D model').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') });
  await expect(page.getByRole('alert')).toContainText('STL, OBJ, or 3MF');
});
