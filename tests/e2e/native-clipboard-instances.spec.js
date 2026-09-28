import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fixture} from '../fixtures/native-instance-project.js';

async function editMenu(page,name){await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('menuitem',{name,exact:true}).click();}
async function saved(page){await page.getByRole('button',{name:'Project',exact:true}).click();const waiting=page.waitForEvent('download');await page.locator('.project-actions').getByRole('button',{name:'Save project',exact:true}).click();const result=JSON.parse(await readFile(await(await waiting).path(),'utf8'));await page.getByRole('button',{name:'Prepare',exact:true}).click();return result;}

test('process clipboard updates all linked instances atomically while retaining their native geometry and Undo',async({page})=>{
 const p=fixture();
 for(const object of p.objects)object.native.objectSettings={extruder:'1',wall_loops:'2',sparse_infill_density:'30%'};
 const source=structuredClone(p.objects[0]);source.id='clipboard-source';source.name='Clipboard source';source.position[1]+=50;source.native.groupId='clipboard-source';source.native.objectName='Clipboard source';source.native.objectSettings={extruder:'1',wall_loops:'5'};delete source.native.instanceFamily;
 p.objects.unshift(source);p.selectedId=source.id;p.selectedIds=[source.id];p.selectionScope='object';
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();p.ids=(await(await page.request.get('/api/presets')).json()).defaults;p.filamentIds=[p.ids.filamentId,p.ids.filamentId];
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'linked-clipboard.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.locator('[data-tree-kind=object]')).toHaveCount(2);await expect(page.locator('[data-tree-kind=instance]')).toHaveCount(2);await expect(page.getByText('Objects: 5',{exact:true})).toBeVisible();
 const before=await saved(page);await editMenu(page,'Copy Process Settings');await page.locator('[data-tree-kind=object]').getByRole('button',{name:'Shared',exact:true}).click();await editMenu(page,'Paste Process Settings');await expect(page.locator('.editor-notice')).toContainText('Pasted native process settings');
 const after=await saved(page),peers=after.objects.filter(object=>object.native.instanceFamily==='family');expect(peers).toHaveLength(4);
 for(const object of peers){expect(object.native.objectSettings).toEqual({extruder:'1',wall_loops:'5'});const old=before.objects.find(item=>item.id===object.id);expect(object.native.meshSource).toEqual(old.native.meshSource);expect(object.positions).toEqual(old.positions);}
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).objects).toEqual(before.objects);
});
