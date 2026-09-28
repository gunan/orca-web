import{test,expect}from'@playwright/test';
import { readFile } from 'node:fs/promises';
import { importNative3MF } from '../../shared/native-project.js';
import { serializeProject } from '../../shared/project.js';
test('process selection and Undo each refresh the native material compatibility context',async({page})=>{
 await page.goto('/');const select=page.getByLabel('Process preset',{exact:true});await expect(select).toBeEnabled();const original=await select.inputValue(),options=await select.locator('option').evaluateAll(items=>items.map(item=>({value:item.value,name:item.textContent}))),next=options.find(item=>item.value&&item.value!==original);expect(next).toBeTruthy();
 const catalogFor=id=>page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/presets'&&new URL(response.url()).searchParams.get('processId')===id);
 let refreshed=catalogFor(next.value);await select.selectOption(next.value);expect((await(await refreshed).json()).compatibility.processId).toBe(next.value);await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 refreshed=catalogFor(original);await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await(await refreshed).json()).compatibility.processId).toBe(original);await expect(select).toHaveValue(original);await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
});

test('opening an embedded native project keeps ownership of its pending catalog load', async ({ page }) => {
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
 project.name='Imported native project';project.useEmbeddedSettings=true;project.nativeWorkflow=true;
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 let release, requested;
 const incoming = new Promise(resolve=>requested=resolve), gate=new Promise(resolve=>release=resolve);
 const catalogs=[];
 await page.route('**/api/presets?**',async route=>{
   catalogs.push(new URL(route.request().url()).searchParams.get('printerId')||'');
   requested();await gate;await route.continue().catch(()=>{});
 });
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'embedded-native.json',mimeType:'application/json',buffer:Buffer.from(serializeProject(project))});
 await incoming;
 await expect(page.getByRole('combobox',{name:'Printer',exact:true})).toBeDisabled();
 // Let the pending-selection effect run before delivering the incoming catalog.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 release();
 await expect(page.locator('.scene-object-row')).toHaveCount(1);
 expect(catalogs).toEqual(['']);
 await page.getByRole('button',{name:'Project',exact:true}).click();
 const waiting=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();
 const saved=JSON.parse(await readFile(await(await waiting).path(),'utf8'));
 expect(saved.name).toBe(project.name);expect(saved.objects).toEqual(project.objects);expect(saved.nativeSettings).toEqual(project.nativeSettings);expect(saved.ids).toEqual(project.ids);
});
