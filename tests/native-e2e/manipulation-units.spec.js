import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';
import {meshBounds} from '../../shared/geometry.js';
import {parseGcode} from '../../shared/gcode.js';

test('inch position edits export millimeter native geometry and slice it at the requested physical coordinates',async({page,request},info)=>{
 expect((await(await request.get('/api/health')).json()).engine.version).toMatch(/^OrcaSlicer-2\.4\.2/);
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 await page.getByLabel('Open Orca Web project').setInputFiles(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url).pathname);
 await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'});await dialog.getByLabel('Units').selectOption('1');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByLabel('position X',{exact:true}).fill('1');await page.getByLabel('position Y',{exact:true}).fill('2');
 await expect(page.getByTestId('object-dimensions')).toHaveText('Size: 0.787 × 0.787 × 0.787 in');
 await page.screenshot({path:info.outputPath('native-inch-manipulation.png')});
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('position Y',{exact:true})).toHaveValue('0');await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Project',exact:true}).click();const pendingDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export native project',exact:true}).click();
 const project=importNative3MF(await readFile(await(await pendingDownload).path())),bounds=meshBounds(project.objects[0]);
 for(let i=0;i<3;i++){expect(bounds.min[i]).toBe(Math.fround([25.4,50.8,0][i]));expect(bounds.max[i]).toBe(Math.fround([45.4,70.8,20][i]));}
 await page.getByRole('button',{name:'Prepare',exact:true}).click();
 const submitting=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/jobs/project'));await page.getByRole('button',{name:'Slice model',exact:true}).click();const response=await submitting;expect(response.status(),await response.text()).toBe(202);const job=await response.json();
 await expect(page.getByText('Ready to print')).toBeVisible({timeout:90000});const gcode=await request.get(`/api/jobs/${job.id}/download`);expect(gcode.ok()).toBe(true);
 const code=await gcode.text(),walls=parseGcode(code).segments.filter(s=>s.kind==='extrusion'&&/wall/i.test(s.feature));expect(walls.length).toBeGreaterThan(100);
 for(let axis=0;axis<2;axis++){const values=walls.flatMap(s=>[s.start[axis],s.end[axis]]),min=Math.min(...values),max=Math.max(...values),start=[25.4,50.8][axis];expect(min).toBeGreaterThan(start-.1);expect(min).toBeLessThan(start+1);expect(max).toBeGreaterThan(start+19);expect(max).toBeLessThan(start+20.1);}
 const layerHeights=text=>[...text.matchAll(/^;Z:([\d.]+)/gm)].map(m=>Number(m[1]));
 const nativeReference=await readFile(new URL('../fixtures/native-gui-cube-2.4.2.gcode',import.meta.url),'utf8');expect(layerHeights(code)).toEqual(layerHeights(nativeReference));
});
