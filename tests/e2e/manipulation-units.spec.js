import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {meshBounds} from '../../shared/geometry.js';
async function open(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('cube.stl');}
async function units(page,value){await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'});await dialog.getByLabel('Units').selectOption(value);await dialog.getByRole('button',{name:'Close',exact:true}).click();}
async function save(page){const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await waiting).path(),'utf8'));}

test('Prepare positions and dimensions switch units without changing geometry, settings or Undo',async({page})=>{
 await open(page);const initialX=await page.getByLabel('position X',{exact:true}).inputValue();await page.getByLabel('position X',{exact:true}).fill('25.4');const metric=await save(page);
 await units(page,'1');await expect(page.getByRole('group',{name:'Position offset (in)',exact:true})).toBeVisible();await expect(page.locator('.statusbar')).toContainText('Inches');
 await expect(page.getByLabel('position X',{exact:true})).toHaveValue('1');await expect(page.getByTestId('object-dimensions')).toHaveText('Size: 0.787 × 0.787 × 0.787 in');
 const imperial=await save(page);expect(imperial).toEqual(metric);
 await units(page,'0');await expect(page.getByLabel('position X',{exact:true})).toHaveValue('25.4');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position X',{exact:true})).toHaveValue(initialX);
});

test('inch position edits commit millimeters, leave angle and scale units unchanged, and survive save/reopen and Undo',async({page})=>{
 await open(page);await units(page,'1');await page.getByLabel('position X',{exact:true}).fill('1.25');await page.getByLabel('position Y',{exact:true}).fill('-0.5');
 await page.getByLabel('rotation Z',{exact:true}).fill('90');await page.getByLabel('scale X',{exact:true}).fill('2');
 const saved=await save(page);expect(saved.objects[0].position).toEqual([31.75,-12.7,0]);expect(saved.objects[0].rotation).toEqual([0,0,90]);expect(saved.objects[0].scale).toEqual([2,2,2]);
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'Inches.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.getByRole('dialog',{name:'Importing project'})).toHaveCount(0);
 await expect(page.getByLabel('position X',{exact:true})).toHaveValue('1.25');await page.getByLabel('position Z',{exact:true}).fill('0.25');
 await page.getByRole('button',{name:'Drop to bed',exact:true}).click();expect(meshBounds((await save(page)).objects[0]).min[2]).toBeCloseTo(0,6);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position Z',{exact:true})).toHaveValue('0.25');expect((await save(page)).objects[0].position[2]).toBe(6.35);
});

test('inch edits of a joint selection preserve millimeter spacing and native-sized saved geometry',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Duplicate',exact:true}).click();await page.getByRole('button',{name:'Select all',exact:true}).click();
 const before=await save(page),bounds=before.objects.map(meshBounds);
 await units(page,'1');await page.getByLabel('position X',{exact:true}).fill('1');const after=await save(page);
 for(let i=0;i<after.objects.length;i++){const actual=meshBounds(after.objects[i]);
  // Mesh bounds use Float32 world vertices; compare the exact representable bounds.
  expect(actual.min[0]).toBe(Math.fround(bounds[i].min[0]+25.4));expect(actual.max[0]).toBe(Math.fround(bounds[i].max[0]+25.4));

 }
 expect(after.selectionFrame.position[0]).toBe(25.4);
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).objects).toEqual(before.objects);
});
