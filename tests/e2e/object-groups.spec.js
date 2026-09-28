import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exportNative3MF,importNative3MF } from '../../shared/native-project.js';
import { meshBounds,transformPositions } from '../../shared/geometry.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';

async function load(page){
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),project=makeNativeAcceptanceProject(base);project.objects=project.objects.slice(0,3);project.plates=project.plates.slice(0,1);
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles({name:'Object groups.3mf',mimeType:'model/3mf',buffer:Buffer.from(exportNative3MF(project))});await expect(page.locator('[data-tree-kind=volume]')).toHaveCount(3);return base;
}
async function save(page){await page.getByRole('button',{name:'Project',exact:true}).click();const promise=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();const project=JSON.parse(await readFile(await(await promise).path(),'utf8'));await page.getByRole('button',{name:'Prepare',exact:true}).click();return project;}
const find=(project,name)=>project.objects.find(object=>object.name===name);

test('object transforms, arrangement and duplication preserve coherent native groups and editing frames',async({page})=>{
  await load(page);await expect(page.getByLabel('Transform scope')).toHaveValue('object');
  await page.getByLabel('position X',{exact:true}).fill('50');await page.getByLabel('rotation Z',{exact:true}).fill('90');await page.getByLabel('Uniform scaling').uncheck();await page.getByLabel('scale X',{exact:true}).fill('1.5');await page.getByLabel('scale Y',{exact:true}).fill('0.5');
  await expect(page.getByLabel('position X',{exact:true})).toHaveValue('50');await expect(page.getByLabel('rotation Z',{exact:true})).toHaveValue('90');
  await page.locator('.toolbar').getByRole('button',{name:'Arrange',exact:true}).click();await expect(page.locator('.editor-notice')).toContainText('Arranged 1');await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  await expect(page.locator('[data-tree-kind=volume]')).toHaveCount(6);const project=await save(page),groups=new Map();for(const object of project.objects){if(!groups.has(object.native.groupId))groups.set(object.native.groupId,[]);groups.get(object.native.groupId).push(object);}expect(groups.size).toBe(2);
  for(const parts of groups.values()){expect(parts).toHaveLength(3);expect(new Set(parts.map(object=>JSON.stringify(object.native.groupTransform))).size).toBe(1);[0,0,90].forEach((angle,index)=>expect(parts[0].native.groupTransform.rotation[index]).toBeCloseTo(angle,10));const normal=parts.find(object=>object.native.partType==='normal_part'),negative=parts.find(object=>object.native.partType==='negative_part');[10,30,20].forEach((size,index)=>expect(meshBounds(normal).size[index]).toBeCloseTo(size,8));meshBounds(normal).center.forEach((coordinate,index)=>expect(meshBounds(negative).center[index]).toBeCloseTo(coordinate,8));}
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('[data-tree-kind=volume]')).toHaveCount(3);
});

test('part scope isolates the selected volume and prevents deleting the last normal part',async({page})=>{
  await load(page);await page.getByLabel('rotation Z',{exact:true}).fill('30');const before=await save(page);await page.getByLabel('Transform scope').selectOption('part');await page.getByRole('button',{name:'Through hole',exact:true}).click();const originalX=Number(await page.getByLabel('position X',{exact:true}).inputValue());await page.getByLabel('position X',{exact:true}).fill(String(originalX+3));await expect(page.getByLabel('position X',{exact:true})).toHaveValue(String(originalX+3));
  const after=await save(page);expect(Array.from(transformPositions(find(after,'Red main')))).toEqual(Array.from(transformPositions(find(before,'Red main'))));expect(meshBounds(find(after,'Through hole')).center[0]).toBeCloseTo(meshBounds(find(before,'Through hole')).center[0]+3,4);
  await page.getByRole('button',{name:'Red main',exact:true}).click();await page.getByRole('button',{name:'Delete object',exact:true}).click();await expect(page.getByRole('alert')).toContainText('without a normal part');await expect(page.locator('[data-tree-kind=volume]')).toHaveCount(3);
});

test('viewport creates actual translucent role materials and shows a group transform proxy',async({page})=>{
  const base=await load(page);await page.locator('[data-tree-kind=object]').getByRole('button',{name:'Native cutout',exact:true}).click();
  const canvas=page.getByRole('img',{name:'Interactive 3D model view'});await expect(canvas).toHaveAttribute('data-object-count','3');
  const materials=JSON.parse(await canvas.getAttribute('data-part-materials')),normal=materials.find(value=>value.role==='normal_part'),negative=materials.find(value=>value.role==='negative_part'),modifier=materials.find(value=>value.role==='modifier_part');
  expect(normal.opacity).toBe(1);expect(normal.depthWrite).toBe(true);expect(normal.color).toBe('#11b68b');expect(JSON.parse(await canvas.getAttribute('data-selected-ids'))).toHaveLength(3);
  for(const helper of [negative,modifier]){expect(helper.opacity).toBeGreaterThan(0);expect(helper.opacity).toBeLessThan(1);expect(helper.depthWrite).toBe(false);expect(helper.depthTest).toBe(false);}expect(negative.color).not.toBe(modifier.color);
  await page.getByRole('button',{name:'Move',exact:true}).click();await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('Native cutout');
  await page.screenshot({path:test.info().outputPath('native-volume-materials.png')});
});
