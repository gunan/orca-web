import { test, expect } from '@playwright/test';
import path from 'node:path';

async function ready(page) {
  await page.goto('/');
  await expect(page.getByLabel('Layer height', { exact:true })).toBeEnabled();
  return page.getByRole('separator', { name:'Resize settings panel' });
}
const width = page => page.locator('.native-sidebar').evaluate(element => element.getBoundingClientRect().width);

test('settings divider responds to pointer and keyboard, persists, and resets without changing model history', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  const divider = await ready(page), initial = await width(page);
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 75, box.y + 120); await page.mouse.up();
  await expect.poll(() => width(page)).toBe(initial + 75);
  await divider.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(page)).toBe(initial + 85);
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));
  const undo = page.getByRole('button', {name:'Undo',exact:true});
  await divider.focus(); await page.keyboard.press('ArrowLeft');
  await undo.click(); await expect(page.getByText('Triangles: 0', {exact:true})).toBeVisible();
  await page.reload(); await expect(divider).toBeVisible();
  await expect.poll(() => width(page)).toBe(initial + 75);
  await divider.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => width(page)).toBe(initial);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('orca-web-prepare-sidebar-width'))).toBeNull();
});

test('large saved panels clamp to available space and restore their preference when the window grows', async ({ page }) => {
  await page.setViewportSize({width:1759,height:1002});
  const divider = await ready(page);
  await divider.focus(); await page.keyboard.press('End');
  await expect.poll(() => width(page)).toBe(680);
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));
  for (const viewport of [{width:1050,height:850},{width:720,height:800}]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await page.locator('.scene-center').boundingBox()).width).toBeGreaterThanOrEqual(250);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const sidebar = await page.locator('.native-sidebar').boundingBox();
    await expect(divider).toHaveAttribute('aria-valuenow',String(Math.round(sidebar.width)));
    await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeVisible();
    await page.getByLabel('Layer height',{exact:true}).fill('0.16');
    await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.16');
  }
  await page.setViewportSize({width:1759,height:1002});
  await expect.poll(() => width(page)).toBe(680);
});

test('malformed saved panel width falls back to a usable default', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('orca-web-prepare-sidebar-width', 'Infinity'));
  const divider = await ready(page);
  await expect(divider).toHaveAttribute('aria-valuenow', /^\d+$/);
  await divider.focus(); await page.keyboard.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow','280');
});
