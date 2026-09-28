import {test,expect} from '@playwright/test';import path from 'node:path';import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';import {addFilamentSlot} from '../../shared/filament-slots.js';import {serializeProject} from '../../shared/project.js';
const cube=path.resolve('tests/fixtures/cube.stl');
async function load(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(cube);await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Select',exact:true}).click();}
async function saved(page){const wait=page.waitForEvent('download');await page.keyboard.press('ControlOrMeta+s');return JSON.parse(await readFile(await(await wait).path(),'utf8'));}
test('camera-relative arrows follow the selected camera, project to bed, and held movement is one undo',async({page})=>{
 await load(page);const x=await page.getByLabel('position X',{exact:true}).inputValue(),y=Number(await page.getByLabel('position Y',{exact:true}).inputValue());
 await page.keyboard.press('ControlOrMeta+6');await expect(page.locator('.scene-renderer canvas').first()).toHaveAttribute('data-camera-view','Right');
 await page.keyboard.press('ControlOrMeta+ArrowRight');await expect(page.getByLabel('position Y',{exact:true})).toHaveValue(String(y+10));await expect(page.getByLabel('position X',{exact:true})).toHaveValue(x);
 await page.keyboard.press('ControlOrMeta+ArrowUp');await expect(page.getByLabel('position Y',{exact:true})).toHaveValue(String(y+10));
 await page.keyboard.down('ArrowUp');await expect(page.getByLabel('position Y',{exact:true})).toHaveValue(String(y+20));await page.keyboard.down('ArrowUp');await expect(page.getByLabel('position Y',{exact:true})).toHaveValue(String(y+30));await page.keyboard.up('ArrowUp');
 await page.keyboard.press('ControlOrMeta+z');await expect(page.getByLabel('position Y',{exact:true})).toHaveValue(String(y+10));
});
test('native material number sequence selects10–16, delayed1/default0, rejects unavailable slots, and respects modal/text focus',async({page})=>{
 let p={...importNative3MF(await readFile(path.resolve('tests/fixtures/native-gui-shrink98-2.4.2.3mf'))),useEmbeddedSettings:true};for(let i=1;i<16;i++)p=addFilamentSlot(p);
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles({name:'Sixteen.orca-web.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(p))});await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Select',exact:true}).click();
 await page.keyboard.press('1');await page.keyboard.press('6');await expect(page.getByLabel('Object filament slot')).toHaveValue('16');await page.keyboard.press('1');await page.keyboard.press('0');await expect(page.getByLabel('Object filament slot')).toHaveValue('10');await page.keyboard.press('1');await expect(page.getByLabel('Object filament slot')).toHaveValue('1');
 await page.keyboard.press('3');await expect(page.getByLabel('Object filament slot')).toHaveValue('3');await page.keyboard.press('0');await expect(page.getByLabel('Object filament slot')).toHaveValue('1');
 await page.getByLabel('position X',{exact:true}).focus();await page.keyboard.press('2');await expect(page.getByLabel('Object filament slot')).toHaveValue('1');await page.getByRole('button',{name:'Select',exact:true}).click();await page.keyboard.press('?');await page.keyboard.press('3');await page.keyboard.press('Escape');await expect(page.getByLabel('Object filament slot')).toHaveValue('1');
 const savedProject=await saved(page);expect(savedProject.objects[0].native.objectSettings.extruder).toBe('1');
});
test('one material command changes multiple selected objects with one undo and printableV preserves a uniform group state',async({page})=>{
 await load(page);await page.keyboard.press('9');await expect(page.getByLabel('Object filament slot')).toHaveValue('1');await page.getByRole('button',{name:'Add filament slot',exact:true}).click();await page.getByRole('button',{name:'Duplicate',exact:true}).click();await expect(page.locator('.scene-object-row')).toHaveCount(2);await page.getByRole('button',{name:'Select',exact:true}).click();await page.keyboard.press('ControlOrMeta+a');await expect(page.getByLabel('Selection count')).toContainText('2 objects');await page.keyboard.press('2');
 let p=await saved(page);expect(p.objects.map(o=>o.filamentSlot)).toEqual([2,2]);await page.keyboard.press('ControlOrMeta+z');p=await saved(page);expect(p.objects.map(o=>o.filamentSlot||1)).toEqual([1,1]);await page.keyboard.press('v');p=await saved(page);expect(p.objects.map(o=>o.printable)).toEqual([false,false]);await page.keyboard.press('ControlOrMeta+z');p=await saved(page);expect(p.objects.every(o=>o.printable!==false)).toBe(true);
 await page.keyboard.press('ControlOrMeta+Shift+a');await expect(page.getByLabel('Selection count')).toContainText('2 objects');
});
