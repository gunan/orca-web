import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {importNative3MF} from '../../shared/native-project.js';
import {exportSTL} from '../../shared/geometry.js';

const motions=code=>code.split(/\r?\n/).map(line=>line.split(';',1)[0].trim()).filter(line=>/^G[0123]\b/.test(line));
test('a user-selected custom shrinkage filament slices an ordinary STL exactly like the captured native GUI',async({page,request},info)=>{
  const health=await(await request.get('/api/health')).json();expect(health.engine.version).toBe('OrcaSlicer-2.4.2');
  const {defaults}=await(await request.get('/api/presets')).json(),created=[];
  async function custom(type,baseId,settings){const response=await request.post('/api/presets/custom',{data:{type,name:`GUI shrinkage ${type} ${Date.now()}`,baseId,compatiblePrinterIds:[defaults.printerId],settings}});expect(response.status(),await response.text()).toBe(201);const record=await response.json();created.push(record.id);return record;}
  try{
    const filament=await custom('filament',defaults.filamentId,{filament_shrink:[98],filament_shrinkage_compensation_z:[98]}),process=await custom('process',defaults.processId,{layer_height:.2,initial_layer_print_height:.2,outer_wall_speed:70,enable_prime_tower:false});
    await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
    await page.getByLabel('Filament',{exact:true}).selectOption(filament.id);await expect(page.getByLabel('Filament',{exact:true})).toHaveValue(filament.id);
    await page.getByLabel('Process preset',{exact:true}).selectOption(process.id);await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.2');
    const fixture=importNative3MF(await readFile(new URL('../fixtures/native-gui-shrink98-2.4.2.3mf',import.meta.url)));
    await page.getByLabel('Choose a 3D model').setInputFiles({name:'GUI shrinkage cube.stl',mimeType:'model/stl',buffer:Buffer.from(exportSTL(fixture.objects))});
    await expect(page.getByLabel('position X',{exact:true})).toBeVisible();
    for(const axis of ['X','Y','Z'])await page.getByLabel(`position ${axis}`,{exact:true}).fill('0');
    expect(health.capabilities?.nativeShrinkageInitialization).toBe(true);
    await page.getByRole('button',{name:'Variable layers',exact:true}).click();const layerDialog=page.getByRole('dialog',{name:'Variable layer heights'});await expect(layerDialog.getByLabel('Layer material compensation')).toContainText('Z compensation: 1.020408×');await expect(layerDialog.getByRole('img',{name:'Layer height brush bar'})).toHaveAttribute('data-layer-count','102');await expect(layerDialog.getByText(/known shrinkage discrepancy/)).toHaveCount(0);await layerDialog.getByRole('button',{name:'Cancel changes'}).click();
    await page.screenshot({path:info.outputPath('shrinkage-selected-material.png'),fullPage:true});
    const submitting=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/jobs'));
    await page.getByRole('button',{name:'Slice model',exact:true}).click();const response=await submitting;expect(response.status(),await response.text()).toBe(202);const job=await response.json();
    expect(job.filamentId).toBe(filament.id);expect(job.processId).toBe(process.id);expect(job.preservePosition).toBe(true);expect(job.filename).toMatch(/\.stl$/);
    await expect(page.getByText('Ready to print')).toBeVisible({timeout:90000});
    const ready=await(await request.get(`/api/jobs/${job.id}`)).json();expect(ready.status,ready.error).toBe('ready');expect(ready.shrinkageInitialization.method).toBe('native-two-apply');
    const code=await(await request.get(`/api/jobs/${job.id}/download`)).text(),reference=await readFile(new URL('../fixtures/native-gui-shrink98-2.4.2.gcode',import.meta.url),'utf8');
    const zs=[...code.matchAll(/^;Z:([\d.]+)/gm)].map(match=>Number(match[1]));expect(zs).toHaveLength(102);expect(zs.at(-1)).toBe(20.4);expect(motions(code)).toHaveLength(9217);expect(motions(code)).toEqual(motions(reference));
    await page.screenshot({path:info.outputPath('shrinkage-native-preview.png'),fullPage:true});await info.attach('native-shrinkage-gcode',{body:Buffer.from(code),contentType:'text/plain'});
  }finally{for(const id of created.reverse())await request.delete(`/api/presets/custom/${id}`);}
});
