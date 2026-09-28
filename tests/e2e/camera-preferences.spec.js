import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {observeGpu,gpuIdle} from '../fixtures/gpu-observation.js';
import {frame,distance,vectorDistance,cameraDrag,cameraWheel,preferences,expectPan} from '../fixtures/camera-browser.js';
const key='orca-web:native-camera-preferences-v1';
async function open(page){await observeGpu(page);await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Choose a 3D model').setInputFiles(new URL('../fixtures/cube.stl',import.meta.url).pathname);const canvas=page.getByRole('img',{name:'Interactive 3D model view'});await gpuIdle(page,canvas);return canvas;}
async function save(page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));}

test('native default middle drag pans; remapped None and Rotate actions persist without changing project history',async({page},info)=>{
 const canvas=await open(page),saved=await save(page);await expectPan(page,canvas);
 await preferences(page,async dialog=>{for(const [button,value] of [['Left','2'],['Middle','1'],['Right','1']]){await expect(dialog.getByLabel(`${button} Mouse Drag`)).toHaveValue(value);await expect(dialog.getByLabel(`${button} Mouse Drag`).locator('option')).toHaveText(['None','Pan','Rotate']);}await dialog.getByLabel('Middle Mouse Drag').selectOption('0');await dialog.getByLabel('Right Mouse Drag').selectOption('2');await dialog.screenshot({path:info.outputPath('native-camera-preferences.png')});});
 await expect(page.locator('.scene-axis small')).toHaveText('Left/Right drag to orbit · Scroll to zoom');
 const before=await frame(canvas);await cameraDrag(page,canvas);expect(await frame(canvas)).toEqual(before);
 await cameraDrag(page,canvas,'right',['Control']);const rotated=await frame(canvas);expect(vectorDistance(rotated.position,before.position)).toBeGreaterThan(1);expect(vectorDistance(rotated.target,before.target)).toBeLessThan(1e-8);
 expect(await save(page)).toEqual(saved);await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('button',{name:'Prepare',exact:true}).click();await gpuIdle(page,canvas);const remounted=await frame(canvas);await cameraDrag(page,canvas);expect(await frame(canvas)).toEqual(remounted);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.scene-object-row')).toHaveCount(0);
 await page.reload();await preferences(page,async dialog=>{await expect(dialog.getByLabel('Middle Mouse Drag')).toHaveValue('0');await expect(dialog.getByLabel('Right Mouse Drag')).toHaveValue('2');});
});
test('reverse mouse wheel applies immediately in perspective and orthographic Prepare',async({page})=>{
 const canvas=await open(page),before=await frame(canvas);await cameraWheel(page,canvas);const normal=await frame(canvas);expect(distance(normal)).toBeGreaterThan(distance(before));
 await preferences(page,dialog=>dialog.getByLabel('Reverse mouse zoom').check());await cameraWheel(page,canvas);expect(distance(await frame(canvas))).toBeLessThan(distance(normal));
 await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();await gpuIdle(page,canvas);const ortho=await frame(canvas);expect(ortho.projection).toBe('Orthographic');await cameraWheel(page,canvas);expect((await frame(canvas)).projectionMatrix[0]).toBeGreaterThan(ortho.projectionMatrix[0]);
});
test('orbit speed clamps and commits on Enter or blur; invalid drafts preserve the existing camera setting',async({page})=>{
 await open(page);await preferences(page,async dialog=>{const input=dialog.getByLabel('Orbit speed multiplier');await expect(input).toHaveValue('1.0');await input.fill('0');await input.press('Enter');await expect(input).toHaveValue('0.05');await input.fill('3');await input.press('Tab');await expect(input).toHaveValue('2.00');await input.fill('');await input.press('Tab');await expect(dialog.getByRole('alert')).toHaveText('Enter a number for orbit speed.');});
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).camera_orbit_mult,key)).toBe('2.00');await preferences(page,async dialog=>{await expect(dialog.getByLabel('Orbit speed multiplier')).toHaveValue('2.00');});
});
test('malformed camera preferences recover to native defaults and storage failures retain explicit session-only changes',async({page})=>{
 await page.addInitScript(k=>{localStorage.setItem(k,'{"version":9}');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===k)throw new DOMException('Storage disabled','QuotaExceededError');return original.call(this,name,value);};},key);
 const canvas=await open(page);await preferences(page,async dialog=>{await expect(dialog.getByLabel('Middle Mouse Drag')).toHaveValue('1');await dialog.getByLabel('Reverse mouse zoom').check();await expect(dialog.getByRole('alert')).toHaveText('Camera controls changed for this session, but browser storage could not save them.');});
 const before=await frame(canvas);await cameraWheel(page,canvas);expect(distance(await frame(canvas))).toBeLessThan(distance(before));
});
test('camera settings propagate to painting workspaces without converting a left brush stroke into a camera gesture',async({page})=>{
 await open(page);await preferences(page,dialog=>dialog.getByLabel('Middle Mouse Drag').selectOption('2'));await page.getByRole('button',{name:'Paint supports',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Paint facets'}),canvas=dialog.getByRole('img',{name:'Interactive 3D model view'});await gpuIdle(page,canvas);
 const before=await frame(canvas);await cameraDrag(page,canvas,'middle');const rotated=await frame(canvas);expect(vectorDistance(rotated.position,before.position)).toBeGreaterThan(1);expect(vectorDistance(rotated.target,before.target)).toBeLessThan(1e-8);
 await dialog.getByRole('button',{name:'Top',exact:true}).click();await gpuIdle(page,canvas);const top=await frame(canvas),b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5+8,b.y+b.height*.5,{steps:3});await page.mouse.up();await gpuIdle(page,canvas);expect(await frame(canvas)).toEqual(top);await expect(dialog.getByRole('button',{name:'Undo paint',exact:true})).toBeEnabled();
});
test('Preview shares native middle pan and reverse wheel preferences across workspace remounts',async({page})=>{
 await page.route('**/api/jobs',route=>route.request().method()==='POST'?route.fulfill({status:202,json:{id:'camera-preview',filename:'Camera.gcode',status:'ready'}}):route.continue());
 await page.route('**/api/jobs/camera-preview/download',route=>route.fulfill({contentType:'text/plain',body:'G21\nG90\nM82\nG92 X0 Y0 Z0 E0\n;LAYER_CHANGE\n;Z:0.2\nG1 Z0.2 F600\n;TYPE:Outer wall\nG1 X20 E1 F1200\nG1 Y20 E2\nG1 X0 E3\nG1 Y0 E4\n'}));
 await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({json:{available:false,error:'Source-only camera fixture'}}));
 await open(page);await preferences(page,dialog=>dialog.getByLabel('Reverse mouse zoom').check());await page.getByRole('button',{name:'Slice model',exact:true}).click();const canvas=page.getByRole('img',{name:'3D G-code toolpaths'});await gpuIdle(page,canvas);await expectPan(page,canvas);
 const before=await frame(canvas);await cameraWheel(page,canvas);expect(distance(await frame(canvas))).toBeLessThan(distance(before));await page.getByRole('button',{name:'Prepare',exact:true}).click();await page.getByRole('button',{name:'Preview',exact:true}).click();await gpuIdle(page,canvas);await expectPan(page,canvas);
});

for(const theme of ['light','dark'])test(`Preferences has an opaque, legible ${theme} surface and usable controls at compact sizes`,async({page},info)=>{
 await page.goto('/');if(theme==='dark'){await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('menuitem',{name:'Dark theme',exact:true}).click();}
 await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'});
 const appearance=await dialog.evaluate(element=>{const style=getComputedStyle(element);return{background:style.backgroundColor,color:style.color};});
 expect(appearance.background).toBe(theme==='light'?'rgb(255, 255, 255)':'rgb(38, 45, 48)');expect(appearance.color).toBe(theme==='light'?'rgb(41, 51, 56)':'rgb(237, 241, 243)');
 const checkbox=dialog.getByLabel('Reverse mouse zoom'),box=await checkbox.boundingBox();expect(box.width).toBeLessThan(30);expect(box.height).toBeLessThan(30);await checkbox.check();await dialog.screenshot({path:info.outputPath(`preferences-${theme}.png`)});
 await page.setViewportSize({width:480,height:400});await dialog.getByLabel('Right Mouse Drag').selectOption('0');await expect(dialog.getByLabel('Right Mouse Drag')).toHaveValue('0');
 const overflow=await dialog.evaluate(element=>({width:element.scrollWidth,client:element.clientWidth}));expect(overflow.width).toBeLessThanOrEqual(overflow.client);await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toHaveCount(0);
});
