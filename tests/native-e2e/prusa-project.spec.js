import {test,expect} from '@playwright/test';
import {prusaFixture} from '../fixtures/prusa-project.js';
import {parseProject} from '../../shared/project.js';
import {importNative3MF} from '../../shared/native-project.js';
import {readFile} from 'node:fs/promises';
async function download(page,name){const event=page.waitForEvent('download');if(name==='Export 3MF'){await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name,exact:true}).click();}else await page.getByRole('button',{name,exact:true}).click();const file=await event;return readFile(await file.path());}
test('Open project routes Prusa through the pinned importer and retains selected and embedded contexts',async({page,request},testInfo)=>{
 const health=await(await request.get('/api/health')).json();expect(health.engine.version).toBe('OrcaSlicer-2.4.2');await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();await page.getByLabel('Layer height',{exact:true}).fill('0.18');
 const input=page.getByLabel('Open Orca Web project'),posted=page.waitForResponse(response=>response.url().endsWith('/api/projects/import')&&response.request().method()==='POST');await input.setInputFiles({name:'Prusa assembly.3mf',mimeType:'model/3mf',buffer:Buffer.from(prusaFixture())});
 const discard=page.getByRole('button',{name:'Discard changes',exact:true});await expect(discard).toBeVisible();await discard.click();
 const response=await posted;const imported=await response.json();expect(response.status(),JSON.stringify(imported)).toBe(200);expect(imported.nativeImport.importer).toBe('OrcaPrusaImporter-2.4.2');
 await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.18');await expect(page.getByText(/original bytes are preserved as inactive provenance/)).toBeVisible();
 const saved=parseProject((await download(page,'Save project')).toString());expect(saved.objects.map(o=>o.native.partType)).toEqual(['normal_part','negative_part','normal_part']);expect(saved.objects.map(o=>o.filamentSlot)).toEqual([1,1,2]);expect(saved.nativeLegacySource.report.filteredModelSettings).toHaveLength(4);expect(saved.objects[0].painting.color).toEqual({4:'8'});
 await page.getByLabel('Layer height',{exact:true}).fill('0.19');const second=page.waitForResponse(value=>value.url().endsWith('/api/projects/import')&&value.request().method()==='POST');await input.setInputFiles({name:'Prusa embedded.3mf',mimeType:'model/3mf',buffer:Buffer.from(prusaFixture())});await expect(discard).toBeVisible();await discard.click();expect((await second).status()).toBe(200);await expect(page.getByLabel('Layer height',{exact:true})).toHaveValue('0.19');
 await page.screenshot({path:testInfo.outputPath('prusa-preserved-parts.png'),fullPage:true});
 const nativeBytes=await download(page,'Export 3MF');const roundtrip=importNative3MF(new Uint8Array(nativeBytes));expect(roundtrip.nativeSettings.layer_height).toBe('0.19');expect(roundtrip.nativeLegacySource).toEqual(saved.nativeLegacySource);expect(roundtrip.objects).toHaveLength(3);
});
