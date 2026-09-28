import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {paintedFacetGeometry} from '../../shared/facet-painting.js';

async function saved(page){await page.getByRole('button',{name:'Project',exact:true}).click();const pending=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();const project=JSON.parse(await readFile(await(await pending).path(),'utf8'));await page.getByRole('button',{name:'Prepare',exact:true}).click();return project;}
async function cube(page){await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();}
async function editor(page){await page.getByRole('button',{name:'Paint supports',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Paint facets'});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Top',exact:true}).click();return dialog;}
async function paintAt(dialog,offset={x:15,y:12}){const canvas=dialog.getByRole('img',{name:'Interactive 3D model view'}),bounds=await canvas.boundingBox();await canvas.click({position:{x:bounds.width/2+offset.x,y:bounds.height/2+offset.y}});return canvas;}

test('raycast painting refines actual surface regions, preserves channels and geometry, and supports undo',async({page})=>{
 await cube(page);const before=await saved(page),dialog=await editor(page);await dialog.getByLabel('Painting tool',{exact:true}).selectOption('triangle');const canvas=await paintAt(dialog);await expect(canvas).toHaveAttribute('data-painted-facets','{"1":1}');
 await dialog.getByLabel('Painting channel').selectOption('fuzzy');await dialog.getByLabel('Painting tool',{exact:true}).selectOption('sphere');await dialog.getByLabel('Brush radius').fill('2');await dialog.getByLabel('Brush resolution').fill('.25');await paintAt(dialog);
 await expect.poll(async()=>Number(await canvas.getAttribute('data-paint-triangle-count'))).toBeGreaterThan(4);
 await dialog.getByRole('button',{name:'Apply painting'}).click();const result=await saved(page),mesh=result.objects[0];expect(mesh.positions).toEqual(before.objects[0].positions);expect(mesh.painting.supports).toBeTruthy();expect(mesh.painting.fuzzy).toBeTruthy();expect(paintedFacetGeometry(mesh,'fuzzy').length).toBeGreaterThan(4);expect(result.nativeWorkflow).toBe(true);
 await page.getByRole('button',{name:'Undo',exact:true}).click();const restored=await saved(page);expect(restored.objects[0].painting).toBeUndefined();
});

test('imported native subfacets render exactly and survive reflection and native project export',async({page})=>{
 const source=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));source.objects[0].position=[50,50,0];source.objects[0].painting={version:1,supports:{6:'0482'},seam:{2:'00443'},color:{3:'0442'},fuzzy:{4:'04403'}};
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles({name:'Painted native.3mf',mimeType:'model/3mf',buffer:Buffer.from(exportNative3MF(source))});await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
 const dialog=await editor(page),canvas=dialog.getByRole('img',{name:'Interactive 3D model view'});await expect(canvas).toHaveAttribute('data-painted-facets','{"1":1,"2":1}');await expect(canvas).toHaveAttribute('data-paint-triangle-count','2');await dialog.getByLabel('Painting channel').selectOption('seam');await expect(canvas).toHaveAttribute('data-paint-triangle-count','2');await dialog.getByRole('button',{name:'Cancel painting'}).click();
 await page.getByRole('button',{name:'Mirror X',exact:true}).click();const result=await saved(page),mesh=result.objects[0];expect(mesh.painting.winding).toBe(-1);expect(mesh.painting.supports[6]).toBe('0482');
 // The production export endpoint validates and writes exact native attributes.
 const response=await page.request.post('/api/projects/export',{data:{project:result,useEmbeddedSettings:true}});expect(response.ok()).toBe(true);const loaded=importNative3MF(await response.body());for(const channel of ['supports','seam','color','fuzzy'])expect(paintedFacetGeometry(loaded.objects[0],channel)).toEqual(paintedFacetGeometry(mesh,channel));
});

test('connected fill, erase, channel clearing and cancellation edit only the intended channel',async({page})=>{
 await cube(page);const dialog=await editor(page),canvas=dialog.getByRole('img',{name:'Interactive 3D model view'});await dialog.getByLabel('Painting tool',{exact:true}).selectOption('fill');await dialog.getByLabel('Fill angle').fill('1');await paintAt(dialog);await expect(canvas).toHaveAttribute('data-painted-facets','{"1":2}');
 await dialog.getByLabel('Painting channel').selectOption('color');await paintAt(dialog);await expect(canvas).toHaveAttribute('data-painted-facets','{"1":2}');await dialog.getByRole('button',{name:'Clear this channel'}).click();await expect(canvas).toHaveAttribute('data-painted-facets','{}');await dialog.getByRole('button',{name:'Undo paint'}).click();await expect(canvas).toHaveAttribute('data-painted-facets','{"1":2}');
 await dialog.getByLabel('Painting channel').selectOption('supports');await dialog.getByLabel('Paint action').selectOption('0');await paintAt(dialog);await expect(canvas).toHaveAttribute('data-painted-facets','{}');await dialog.getByLabel('Painting channel').selectOption('color');await expect(canvas).toHaveAttribute('data-painted-facets','{"1":2}');await dialog.getByRole('button',{name:'Cancel painting'}).click();const result=await saved(page);expect(result.objects[0].painting).toBeUndefined();
});
