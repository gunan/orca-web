import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const cube = path.resolve('tests/fixtures/cube.stl');
async function load(page) {
  await page.goto('/');
  await expect(page.getByLabel('Layer height', { exact:true })).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles(cube);
  await expect(page.getByText('Triangles: 12', { exact:true })).toBeVisible();
}
async function menu(page, name, item) {
  await page.getByRole('button', { name, exact:true }).click();
  await page.getByRole('menuitem', { name:item, exact:true }).click();
}
async function downloaded(page, action) {
  const promise = page.waitForEvent('download'); await action();
  const download = await promise;
  return { name:download.suggestedFilename(), bytes:await readFile(await download.path()) };
}
function stlBounds(bytes) {
  const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength));
  geometry.computeBoundingBox();
  const { min,max }=geometry.boundingBox;
  return { min:min.toArray(),max:max.toArray(),size:[max.x-min.x,max.y-min.y,max.z-min.z], triangles:geometry.getAttribute('position').count/3 };
}

test('actual geometry transforms, undo/redo, camera views and STL export stay consistent',async({page})=>{
  await load(page);
  await expect(page.getByRole('img',{name:'Interactive 3D model view'})).toHaveAttribute('data-object-count','1');
  await expect(page.getByTestId('object-dimensions')).toContainText('20 × 20 × 20');
  await page.getByLabel('Uniform scaling').uncheck();
  await page.getByLabel('scale X',{exact:true}).fill('2');
  await page.getByLabel('scale Y',{exact:true}).fill('0.5');
  await expect(page.getByTestId('object-dimensions')).toContainText('40 × 10 × 20');
  await page.getByLabel('rotation Z',{exact:true}).fill('90');
  await expect(page.getByTestId('object-dimensions')).toContainText('10 × 40 × 20');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByTestId('object-dimensions')).toContainText('40 × 10 × 20');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(page.getByTestId('object-dimensions')).toContainText('10 × 40 × 20');
  const before = await page.getByLabel('position X',{exact:true}).inputValue();
  for (const view of ['Top','Front','Right','Isometric']) await page.getByRole('button',{name:view,exact:true}).click();
  await page.getByRole('button',{name:'Perspective',exact:true}).click();
  await expect(page.getByRole('button',{name:'Orthographic',exact:true})).toBeVisible();
  await expect(page.getByLabel('position X',{exact:true})).toHaveValue(before);
  const output=await downloaded(page,()=>menu(page,'File','Export STL'));
  const bounds=stlBounds(output.bytes);
  expect(bounds.triangles).toBe(12); expect(bounds.size).toEqual([10,40,20]);
});

test('multiple models, duplicates, arrangement and plate selection use separate actual geometry',async({page})=>{
  await load(page);
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  await expect(page.getByText('Triangles: 24',{exact:true})).toBeVisible();
  await page.locator('.toolbar').getByRole('button',{name:'Arrange',exact:true}).click();
  const all=await downloaded(page,()=>menu(page,'File','Export STL'));
  expect(stlBounds(all.bytes).triangles).toBe(24);
  await page.getByRole('button',{name:'Add plate'}).click();
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
  await page.locator('.plate-tabs').getByRole('button',{name:'Plate 1',exact:true}).click();
  await page.locator('.scene-object-row').getByRole('button',{name:'cube.stl',exact:true}).last().click();
  await page.getByLabel('Move object to plate').selectOption({label:'Plate 2'});
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await page.locator('.plate-tabs').getByRole('button',{name:'Plate 2',exact:true}).click();
  await expect(page.locator('.scene-object-row').getByRole('button',{name:'cube.stl',exact:true}).last()).toBeVisible();
  await page.locator('.scene-object-row').getByRole('button',{name:'cube.stl',exact:true}).last().click();
  await page.getByRole('button',{name:'Delete object',exact:true}).click();
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
});

test('project save and reload preserve transformed assets, metadata, plates and process edits',async({page})=>{
  await load(page);
  await page.getByLabel('scale X',{exact:true}).fill('1.5');
  await page.getByLabel('Layer height',{exact:true}).fill('0.16');
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await page.getByLabel('Project name',{exact:true}).fill('Round trip');
  await page.getByLabel('Author',{exact:true}).fill('Test author');
  await page.getByLabel('Description',{exact:true}).fill('Exact scene and settings');
  const output=await downloaded(page,()=>page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click());
  const document=JSON.parse(output.bytes.toString());
  expect(document.objects[0].scale).toEqual([1.5,1.5,1.5]); expect(document.overrides.layer_height).toBe('0.16');
  expect(document.metadata).toEqual({author:'Test author',description:'Exact scene and settings'});
  await menu(page,'File','New project');
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
  await page.getByLabel('Open Orca Web project').setInputFiles({name:output.name,mimeType:'application/json',buffer:output.bytes});
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await expect(page.getByTestId('object-dimensions')).toContainText('30 × 30 × 30');
  await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.16');
  await page.getByRole('button',{name:'Project',exact:true}).click();
  await expect(page.getByLabel('Author',{exact:true})).toHaveValue('Test author');
});

test('autosave recovery, settings undo, keyboard shortcuts and theme controls remain usable',async({page})=>{
  await load(page);
  await page.getByLabel('Layer height',{exact:true}).fill('0.15');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('orca-web-autosave')||'null')?.overrides.layer_height)).toBe('0.15');
  await page.reload();
  await page.getByRole('button',{name:'Restore available autosave'}).click();
  await page.getByRole('button',{name:'Restore autosave',exact:true}).click();
  await page.getByRole('button',{name:'Prepare',exact:true}).click();
  await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.15');
  await page.getByRole('button',{name:'cube.stl',exact:true}).click();
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  await expect(page.getByText('Triangles: 24',{exact:true})).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await menu(page,'View','Dark theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await menu(page,'View','Light theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await menu(page,'Help','Keyboard shortcuts');
  await expect(page.getByRole('dialog',{name:'Keyboard shortcuts'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('malformed geometry and invalid projects do not replace a valid scene',async({page})=>{
  await load(page);
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'broken.stl',mimeType:'model/stl',buffer:Buffer.from('solid nothing\nendsolid nothing')});
  await expect(page.getByRole('alert')).toContainText('STL model');
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await page.getByLabel('Open Orca Web project').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"format":"orca-web-project","version":900}')});
  await expect(page.getByRole('alert')).toContainText('Unsupported Orca Web project');
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
});

test('undo and redo restore printer-specific preset choices without losing history',async({page,request})=>{
  await load(page);
  const original=await(await request.get('/api/presets')).json();
  const alternate=original.printers.find(item=>item.id!==original.defaults.printerId);
  const next=await(await request.get(`/api/presets?printerId=${alternate.id}`)).json();
  await page.getByLabel('Printer',{exact:true}).selectOption(alternate.id);
  await expect(page.getByLabel('Process preset',{exact:true})).toHaveValue(next.defaults.processId);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByLabel('Printer',{exact:true})).toHaveValue(original.defaults.printerId);
  await expect(page.getByLabel('Process preset',{exact:true})).toHaveValue(original.defaults.processId);
  for(const item of original.processes.filter(item=>!item.custom)) await expect(page.getByLabel('Process preset',{exact:true}).locator(`option[value="${item.id}"]`)).toHaveText(item.name);
  for(const item of next.processes.filter(item=>!original.processes.some(old=>old.id===item.id))) await expect(page.getByLabel('Process preset',{exact:true}).locator(`option[value="${item.id}"]`)).toHaveCount(0);
  await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(page.getByLabel('Printer',{exact:true})).toHaveValue(alternate.id);
  await expect(page.getByLabel('Process preset',{exact:true})).toHaveValue(next.defaults.processId);
  for(const item of next.processes.filter(item=>!item.custom)) await expect(page.getByLabel('Process preset',{exact:true}).locator(`option[value="${item.id}"]`)).toHaveText(item.name);
  await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeEnabled();
});

test('missing project presets remain unresolved instead of silently changing slicing configuration',async({page})=>{
  await load(page);
  const output=await downloaded(page,()=>menu(page,'File','Save project'));
  const project=JSON.parse(output.bytes.toString());
  project.ids.processId='no-longer-installed';project.overrides={layer_height:'0.16'};
  await page.getByLabel('Open Orca Web project').setInputFiles({name:'missing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.getByText('Project loaded with unavailable presets.',{exact:false})).toBeVisible();
  await expect(page.getByLabel('Process preset',{exact:true})).toHaveValue('no-longer-installed');
  await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeDisabled();
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
});

test('cancelling an import then starting a new project invalidates the older unfinished read',async({page})=>{
  await page.addInitScript(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(){
      if(this.name!=='delayed.stl')return original.call(this);
      const file=this;
      return new Promise(resolve=>{window.releaseModelImport=()=>original.call(file).then(resolve);});
    };
  });
  await page.goto('/');
  await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByLabel('Choose a 3D model').setInputFiles({name:'delayed.stl',mimeType:'model/stl',buffer:await readFile(cube)});
  await expect.poll(()=>page.evaluate(()=>typeof window.releaseModelImport)).toBe('function');
  await page.getByRole('button',{name:'Cancel import',exact:true}).click();
  await menu(page,'File','New project');
  await page.evaluate(()=>window.releaseModelImport());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Slice model',exact:true})).toBeDisabled();
});


test('assembly, shell splitting, repair and undo operate on the actual scene surfaces',async({page})=>{
  await load(page);
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  await expect(page.getByText('Triangles: 24',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Assemble plate',exact:true}).click();
  await expect(page.getByText('Objects: 1',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Disassemble',exact:true}).click();
  await expect(page.getByText('Objects: 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Split shells',exact:true}).click();
  await expect(page.getByText('Objects: 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Repair mesh',exact:true}).click();
  await expect(page.locator('.editor-notice')).toContainText('Mesh repair: removed 0 degenerate');
  await expect(page.getByText('Triangles: 24',{exact:true})).toBeVisible();
});

test('unsaved replacement can be cancelled or saved, and modal focus stays inside the dialog',async({page})=>{
  await load(page);
  await menu(page,'File','New project');
  const dialog=page.getByRole('dialog',{name:'Unsaved project changes'});
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
  await menu(page,'File','New project');
  const download=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Save and continue',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/\.orca-web\.json$/);
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
  await expect(dialog).not.toBeVisible();
});
