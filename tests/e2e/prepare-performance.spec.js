import {test,expect} from '@playwright/test';
import path from 'node:path';
import {observeGpu,gpuIdle,gpuRedraw,gpuDraws} from '../fixtures/gpu-observation.js';
async function open(page){await observeGpu(page);await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));await expect(page.getByText('Triangles: 12',{exact:true})).toBeVisible();return page.getByRole('img',{name:'Interactive 3D model view',exact:true});}

test('Prepare stops actual GPU submissions when idle and redraws model, camera, selection and layout changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const canvas=await open(page);await gpuIdle(page,canvas);
 await gpuRedraw(page,canvas,()=>page.getByLabel('position X',{exact:true}).fill('12'));
 await gpuRedraw(page,canvas,()=>page.getByRole('button',{name:'Undo',exact:true}).click());
 await gpuRedraw(page,canvas,()=>page.getByRole('button',{name:'Wireframe',exact:true}).click());
 await gpuRedraw(page,canvas,()=>page.getByRole('button',{name:'Move',exact:true}).click());
 await gpuRedraw(page,canvas,()=>page.getByRole('button',{name:'Select',exact:true}).click());
 await gpuRedraw(page,canvas,()=>page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click());
 const before=await canvas.getAttribute('data-camera-frame');await gpuRedraw(page,canvas,async()=>{const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*.3,b.y+b.height*.7);await page.mouse.down();await page.mouse.move(b.x+b.width*.4,b.y+b.height*.75,{steps:5});await page.mouse.up();});await expect(canvas).not.toHaveAttribute('data-camera-frame',before);
 await gpuRedraw(page,canvas,()=>page.setViewportSize({width:1380,height:780}));
 await gpuRedraw(page,canvas,()=>page.getByRole('button',{name:'Deselect all',exact:true}).click());
 await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();await expect(canvas).toHaveAttribute('data-camera-frame',/Orthographic/);await gpuIdle(page,canvas);
 await page.getByRole('button',{name:'Project',exact:true}).click();await expect(canvas).toHaveCount(0);await page.waitForTimeout(200);expect(errors).toEqual([]);
});

test('paint hover, clipping and cleared cursors redraw while untouched paint workspaces stay idle',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Paint supports',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Paint facets',exact:true}),canvas=dialog.getByRole('img',{name:'Interactive 3D model view',exact:true});
 await dialog.getByRole('button',{name:'Top',exact:true}).click();await dialog.getByLabel('Painting tool',{exact:true}).selectOption('fill');await gpuIdle(page,canvas);const b=await canvas.boundingBox();
 await gpuRedraw(page,canvas,()=>page.mouse.move(b.x+b.width*.5,b.y+b.height*.5));await expect(canvas).toHaveAttribute('data-paint-fill-preview',/triangles/);
 await gpuRedraw(page,canvas,()=>page.mouse.move(b.x+3,b.y+3));await expect(canvas).toHaveAttribute('data-paint-fill-preview','null');
 await gpuRedraw(page,canvas,async()=>{await dialog.getByLabel('Clipping axis').selectOption('Z');await dialog.getByLabel('Clipping offset (mm)').fill('10');});await expect(canvas).toHaveAttribute('data-clipping-cap-triangles',/^[1-9]/);
});

test('variable-layer shader creation, hover uniforms and cleanup submit fresh frames then stop',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Variable layers',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Variable layer heights'}),canvas=dialog.getByRole('img',{name:'Interactive 3D model view'});
 await gpuRedraw(page,canvas,()=>dialog.getByRole('button',{name:'Create uniform profile'}).click());await expect(canvas).toHaveAttribute('data-layer-shader-objects','1');
 const b=await dialog.getByRole('img',{name:'Layer height brush bar'}).boundingBox();await gpuRedraw(page,canvas,()=>page.mouse.move(b.x+b.width*.6,b.y+b.height*.5));await expect(canvas).toHaveAttribute('data-layer-cursor-z',/.+/);
 await gpuRedraw(page,canvas,()=>dialog.getByLabel('Layer brush width').fill('4'));await expect(canvas).toHaveAttribute('data-layer-band-width','4');
 const previous=await gpuDraws(canvas);await dialog.getByRole('button',{name:'Cancel changes',exact:true}).click();await expect(dialog).toHaveCount(0);expect(previous).toBeGreaterThan(0);await gpuIdle(page,page.getByRole('img',{name:'Interactive 3D model view'}));
});
