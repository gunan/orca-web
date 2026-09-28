import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {observeGpu,gpuIdle} from '../fixtures/gpu-observation.js';
import {frame,cameraDrag} from '../fixtures/camera-browser.js';
import {expectSceneInCamera} from '../fixtures/camera-frustum-assertions.js';
const rotation=f=>[0,1,2,4,5,6,8,9,10].map(i=>f.matrixWorldInverse[i]);
const sameDirection=(a,b)=>rotation(a).forEach((v,i)=>expect(rotation(b)[i]).toBeCloseTo(v,10));
async function open(page){await observeGpu(page);await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);const canvas=page.getByRole('img',{name:'Interactive 3D model view'});await gpuIdle(page,canvas);return canvas;}
async function save(page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await event).path(),'utf8'));}
for(const projection of ['Perspective','Orthographic'])test(`Prepare Fit and Zoom to bed preserve the current ${projection} viewing axes and Undo history`,async({page})=>{
 const canvas=await open(page),buttons=page.locator('.scene-views');if(projection==='Orthographic')await buttons.getByRole('button',{name:'Perspective',exact:true}).click();await buttons.getByRole('button',{name:'Front',exact:true}).click();await gpuIdle(page,canvas);await cameraDrag(page,canvas,'left');await cameraDrag(page,canvas,'middle');const before=await frame(canvas),saved=await save(page);
 await buttons.getByRole('button',{name:'Fit',exact:true}).click();await gpuIdle(page,canvas);const fitted=await frame(canvas);sameDirection(before,fitted);expect(fitted.target).not.toEqual(before.target);expectSceneInCamera(saved.objects,null,fitted);expect(await save(page)).toEqual(saved);
 await canvas.focus();await page.keyboard.press('ControlOrMeta+0');await gpuIdle(page,canvas);const bed=await frame(canvas);sameDirection(fitted,bed);expect(bed.target[2]).toBe(0);expect(bed.target).not.toEqual(fitted.target);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.scene-object-row')).toHaveCount(0);
});
test('Fit toolpaths preserves a user orbit and pan while fitting the visible preview without slicing again',async({page})=>{
 let slices=0;await page.route('**/api/jobs',route=>{if(route.request().method()!=='POST')return route.continue();slices++;return route.fulfill({status:202,json:{id:'fit-preview',filename:'Fit.gcode',status:'ready'}});});
 await page.route('**/api/jobs/fit-preview/download',route=>route.fulfill({contentType:'text/plain',body:'G21\nG90\nM82\nG92 X0 Y0 Z0 E0\n;LAYER_CHANGE\n;Z:0.2\nG1 Z0.2 F600\n;TYPE:Outer wall\nG1 X120 E1 F1200\nG1 Y20 E2\nG1 X0 E3\nG1 Y0 E4\n'}));await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({json:{available:false,error:'Source-only camera fixture'}}));
 await open(page);await page.getByRole('button',{name:'Slice model',exact:true}).click();const canvas=page.getByRole('img',{name:'3D G-code toolpaths'});await gpuIdle(page,canvas);await cameraDrag(page,canvas,'left');await cameraDrag(page,canvas,'middle');const before=await frame(canvas);
 await page.getByRole('button',{name:'Fit toolpaths',exact:true}).click();await gpuIdle(page,canvas);sameDirection(before,await frame(canvas));expect((await frame(canvas)).target).not.toEqual(before.target);expect(slices).toBe(1);
});
