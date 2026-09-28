import {test,expect} from '@playwright/test';
import {observeGpu,gpuIdle} from '../fixtures/gpu-observation.js';
import {frame,distance,cameraWheel,preferences,expectPan} from '../fixtures/camera-browser.js';

test('native sliced Preview retains exact path identity while shared camera controls change and remount',async({page,request})=>{
 expect((await(await request.get('/api/health')).json()).engine.version).toMatch(/^OrcaSlicer-2\.4\.2/);await observeGpu(page);
 let slices=0,processed=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/jobs/project'))slices++;if(r.url().endsWith('/native-preview'))processed++;});
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Open Orca Web project').setInputFiles(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url).pathname);await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
 await preferences(page,dialog=>dialog.getByLabel('Reverse mouse zoom').check());await page.getByRole('button',{name:'Slice model',exact:true}).click();await expect(page.getByText('Ready to print')).toBeVisible({timeout:90000});
 const canvas=page.getByRole('img',{name:'3D G-code toolpaths'});await expect(canvas).toHaveAttribute('data-processor','native');await gpuIdle(page,canvas);const range=await canvas.getAttribute('data-native-range'),count=await canvas.getAttribute('data-visible-volumes');expect(Number(count)).toBeGreaterThan(100);
 await expectPan(page,canvas);const before=await frame(canvas);await cameraWheel(page,canvas);expect(distance(await frame(canvas))).toBeLessThan(distance(before));
 await preferences(page,dialog=>dialog.getByLabel('Left Mouse Drag').selectOption('1'));await expectPan(page,canvas,'left');await expect(canvas).toHaveAttribute('data-native-range',range);await expect(canvas).toHaveAttribute('data-visible-volumes',count);expect(slices).toBe(1);expect(processed).toBe(1);
 await page.getByRole('button',{name:'Prepare',exact:true}).click();const prepare=page.getByRole('img',{name:'Interactive 3D model view'});await gpuIdle(page,prepare);await expectPan(page,prepare,'left');await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(canvas).toHaveAttribute('data-processor','native');await gpuIdle(page,canvas);await expectPan(page,canvas,'left');await expect(canvas).toHaveAttribute('data-native-range',range);expect(slices).toBe(1);
});
