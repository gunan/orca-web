import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importNative3MF } from '../../shared/native-project.js';
import { serializeProject } from '../../shared/project.js';

const progress = page => page.getByRole('dialog', { name: 'Importing project' });
async function projectFile(name='Original') {
  const p=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
  p.useEmbeddedSettings=true;p.name=name;p.objects[0].name=name;p.selectedId=p.objects[0].id;
  return {name:`${name}.json`,mimeType:'application/json',buffer:Buffer.from(serializeProject(p))};
}
async function load(page) {
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles(await projectFile());
  await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
  await expect(progress(page)).toHaveCount(0);
}
async function save(page) {
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();
  return {name:'Saved.json',mimeType:'application/json',buffer:await readFile(await(await download).path())};
}
async function holdCatalog(page) {
  let release,arrived;const gate=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
  await page.route(/\/api\/presets(?:\?|$)/,async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response});});
  return {release,seen};
}
test('same-project reload blocks edits until the catalog commits, then Drop and Undo preserve the new edit',async({page})=>{
  await load(page);await page.getByLabel('position X',{exact:true}).fill('5');const saved=await save(page),held=await holdCatalog(page);
  await page.getByLabel('Open Orca Web project').setInputFiles(saved);await held.seen;
  await expect(progress(page)).toBeVisible();await expect(page.getByLabel('position Z',{exact:true})).toBeDisabled();
  await page.keyboard.press('Delete');await page.keyboard.press('Control+z');
  expect(await page.locator('.scene-object-row').count()).toBe(1);
  held.release();await expect(progress(page)).toHaveCount(0);
  await page.getByLabel('position Z',{exact:true}).fill('7');await page.getByRole('button',{name:'Drop to bed',exact:true}).click();
  await expect(page.getByLabel('position Z',{exact:true})).toHaveValue('0');await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByLabel('position Z',{exact:true})).toHaveValue('7');
});
test('cancelled catalog restoration keeps edits, history and preset readiness after the late response',async({page})=>{
  await load(page);const replacement=await projectFile('Replacement');await page.getByLabel('position X',{exact:true}).fill('5');const held=await holdCatalog(page);
  await page.getByLabel('Open Orca Web project').setInputFiles(replacement);
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();await held.seen;
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();await expect(progress(page)).toHaveCount(0);
  await page.getByLabel('position Z',{exact:true}).fill('7');held.release();await page.unrouteAll({behavior:'wait'});
  await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('Original');await expect(page.getByLabel('position X',{exact:true})).toHaveValue('5');
  await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position Z',{exact:true})).toHaveValue('0');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position X',{exact:true})).toHaveValue('0');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('failed catalog restoration preserves the previous catalog, project and dirty state',async({page})=>{
  await load(page);await page.getByRole('button',{name:'Use installed presets',exact:true}).click();
  await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeEnabled();
  const printers=await page.getByLabel('Printer',{exact:true}).locator('option').allTextContents();
  await page.getByLabel('position X',{exact:true}).fill('5');
  await page.route(/\/api\/presets(?:\?|$)/,route=>route.fulfill({status:503,json:{error:'Catalog deliberately unavailable'}}));
  await page.getByLabel('Open Orca Web project').setInputFiles(await projectFile('Replacement'));
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Catalog deliberately unavailable');
  await expect(progress(page)).toHaveCount(0);expect(await page.getByLabel('Printer',{exact:true}).locator('option').allTextContents()).toEqual(printers);
  await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('Original');
  await expect(page.getByLabel('position X',{exact:true})).toHaveValue('5');await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'New project',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Unsaved project changes'})).toBeVisible();
});
test('Escape cancels a native project upload and its late response cannot replace the current project',async({page})=>{
  await load(page);let release,arrived;const gate=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
  const p=JSON.parse((await projectFile('Late native')).buffer.toString());
  await page.route('**/api/projects/import',async route=>{arrived();await gate;await route.fulfill({json:{project:p,selection:{filamentIds:[]}}});});
  await page.getByLabel('Open Orca Web project').setInputFiles(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url).pathname);await seen;
  await expect(progress(page)).toBeVisible();await page.keyboard.press('Escape');await expect(progress(page)).toHaveCount(0);
  release();await page.unrouteAll({behavior:'wait'});await page.getByLabel('position X',{exact:true}).fill('9');
  await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('Original');await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position X',{exact:true})).toHaveValue('0');
});
test('cancelled local model read cannot append geometry after a subsequent import completes',async({page})=>{
  await load(page);
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='late.stl')await new Promise(resolve=>window.releaseModelRead=resolve);return original.call(this);};});
  const stl=await readFile(new URL('../fixtures/cube.stl',import.meta.url));
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'late.stl',mimeType:'model/stl',buffer:stl});
  await expect(page.getByRole('dialog',{name:'Importing models'})).toBeVisible();await page.getByRole('button',{name:'Cancel import',exact:true}).click();
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'new.stl',mimeType:'model/stl',buffer:stl});
  await expect(page.locator('.scene-object-row')).toHaveCount(2);await page.evaluate(()=>window.releaseModelRead());
  const saved=JSON.parse((await save(page)).buffer.toString());expect(saved.objects.map(o=>o.name)).toEqual(['Original','new.stl']);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.scene-object-row')).toHaveCount(1);
});

test('cancelling Open from Preview preserves the completed job and its download',async({page})=>{
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);
  await save(page);await page.getByRole('button',{name:'Slice model',exact:true}).click();
  const download=page.getByRole('link',{name:'↓ Download G-code',exact:true});await expect(download).toBeVisible();const href=await download.getAttribute('href');
  const held=await holdCatalog(page);await page.getByLabel('Open Orca Web project').setInputFiles(await projectFile('Replacement'));await held.seen;
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();held.release();await page.unrouteAll({behavior:'wait'});
  await expect(download).toHaveAttribute('href',href);await expect(page.getByRole('button',{name:'Preview',exact:true})).toHaveClass(/active/);
  await expect(page.getByRole('region',{name:'G-code toolpath preview'})).toContainText('cube.stl · Job status: ready');
  const response=await page.request.get(href);expect(response.ok()).toBe(true);expect(await response.text()).toContain('G1');
});

test('a cancelled local read failure cannot replace the status of a later successful import',async({page})=>{
  await load(page);
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='failure.stl')return new Promise((resolve,reject)=>window.failModelRead=()=>reject(new Error('Late read failed')));return original.call(this);};});
  const stl=await readFile(new URL('../fixtures/cube.stl',import.meta.url));
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'failure.stl',mimeType:'model/stl',buffer:stl});
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'new.stl',mimeType:'model/stl',buffer:stl});await expect(page.locator('.scene-object-row')).toHaveCount(2);
  await page.evaluate(()=>window.failModelRead());await save(page);await expect(page.getByRole('alert')).toHaveCount(0);
});
