import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeMesh,meshBounds,transformPositions } from '../../shared/geometry.js';
import { exportNative3MF,importNative3MF } from '../../shared/native-project.js';
import { makeNativeAcceptanceProject } from '../fixtures/native-project.js';

async function save(page){await page.getByRole('button',{name:'Project',exact:true}).click();const promise=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await promise).path(),'utf8'));}
async function cube(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cut',exact:true}).click();return page.getByRole('dialog',{name:'Cut object'});}

test('cut preview shows real closed halves, applies placement and supports undo',async({page})=>{
  const dialog=await cube(page);await dialog.getByLabel('Cut plane offset').fill('7');
  await expect(dialog.getByRole('button',{name:'Apply cut'})).toBeEnabled();await expect(dialog.getByRole('status')).toContainText('2 retained parts');
  await expect(dialog.getByRole('img',{name:'Interactive 3D model view'})).toHaveAttribute('data-object-count','2');
  await dialog.getByRole('button',{name:'Apply cut'}).click();await expect(page.locator('.scene-object-row')).toHaveCount(2);
  const project=await save(page);expect(project.objects).toHaveLength(2);expect(project.objects.every(object=>analyzeMesh(object).manifold)).toBe(true);
  expect(project.objects.map(object=>meshBounds(object).size[2]).sort((a,b)=>a-b)).toEqual([7,13]);
  expect(project.objects.every(object=>meshBounds(object).min[2]===0)).toBe(true);
  expect(project.objects.reduce((sum,object)=>sum+analyzeMesh(object).volume,0)).toBeCloseTo(8000,3);
  await page.getByRole('button',{name:'Prepare',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.scene-object-row')).toHaveCount(1);await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();
});

test('invalid cut planes block apply, and custom normal can retain one real capped side',async({page})=>{
  const dialog=await cube(page);await dialog.getByLabel('Cut plane offset').fill('10000');await expect(dialog.getByRole('alert')).toContainText('interior');await expect(dialog.getByRole('button',{name:'Apply cut'})).toBeDisabled();
  await dialog.getByLabel('Cut plane axis').selectOption('Custom');await dialog.getByLabel('Cut normal X').fill('0');await dialog.getByLabel('Cut normal Y').fill('0');await dialog.getByLabel('Cut normal Z').fill('2');await dialog.getByLabel('Cut plane offset').fill('10');await dialog.getByLabel('Cut retained sides').selectOption('lower');
  await expect(dialog.getByRole('button',{name:'Apply cut'})).toBeEnabled();await expect(dialog.getByRole('status')).toContainText('1 retained part');await dialog.getByRole('button',{name:'Apply cut'}).click();
  const project=await save(page);expect(project.objects).toHaveLength(1);expect(analyzeMesh(project.objects[0]).manifold).toBe(true);expect(meshBounds(project.objects[0]).size).toEqual([20,20,10]);
});

test('native grouped cut keeps negative and modifier parts with matching object overrides on both halves',async({page})=>{
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),project=makeNativeAcceptanceProject(base);project.objects=project.objects.slice(0,3);project.plates=project.plates.slice(0,1);
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles({name:'Grouped cut.3mf',mimeType:'model/3mf',buffer:Buffer.from(exportNative3MF(project))});await expect(page.locator('[data-tree-kind=volume]')).toHaveCount(3);
  await page.getByRole('button',{name:'Cut',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Cut object'});await dialog.getByLabel('Cut plane offset').fill('10');await expect(dialog.getByRole('button',{name:'Apply cut'})).toBeEnabled();await expect(dialog.getByRole('status')).toContainText('6 retained parts');await dialog.getByRole('button',{name:'Apply cut'}).click();
  const result=await save(page);expect(result.objects).toHaveLength(6);expect(new Set(result.objects.map(object=>object.native.groupId)).size).toBe(2);
  for(const role of ['normal_part','negative_part','modifier_part'])expect(result.objects.filter(object=>object.native.partType===role)).toHaveLength(2);
  expect(result.objects.every(object=>object.native.objectSettings.wall_loops==='4')).toBe(true);
  expect(result.objects.filter(object=>object.native.partType==='modifier_part').every(object=>object.native.partSettings.sparse_infill_density==='50%')).toBe(true);
});

test('mirror action reflects asymmetric surfaces with outward winding and undo restores geometry',async({page})=>{
  const vertices=[[0,0,0],[10,0,0],[0,10,0],[0,0,20]],faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],stl='solid tetra\n'+faces.map(face=>'facet normal 0 0 0\nouter loop\n'+face.map(index=>'vertex '+vertices[index].join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid tetra';
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles({name:'Asymmetric.stl',mimeType:'model/stl',buffer:Buffer.from(stl)});await expect(page.getByText('Triangles: 4',{exact:true})).toBeVisible();
  const before=(await save(page)).objects[0];await page.getByRole('button',{name:'Prepare',exact:true}).click();await page.getByRole('button',{name:'Mirror X',exact:true}).click();const after=(await save(page)).objects[0];
  const averageX=object=>{const positions=transformPositions(object);let sum=0;for(let i=0;i<positions.length;i+=3)sum+=positions[i];return sum/(positions.length/3);};
  expect(averageX(after)).toBeCloseTo(2*meshBounds(before).center[0]-averageX(before),5);expect(averageX(after)).not.toBeCloseTo(averageX(before),2);expect(analyzeMesh(after).manifold).toBe(true);expect(analyzeMesh(after).signedVolume).toBeCloseTo(analyzeMesh(before).signedVolume,3);
  await page.getByRole('button',{name:'Prepare',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();const restored=(await save(page)).objects[0];expect(Array.from(transformPositions(restored))).toEqual(Array.from(transformPositions(before)));
});
