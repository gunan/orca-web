import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {addFilamentSlot} from '../../shared/filament-slots.js';
async function openDual(page){
  let project=importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf'));
  project=addFilamentSlot({...project,useEmbeddedSettings:true});
  project.nativeSettings.nozzle_diameter=['0.4','0.4'];
  project.nativeSettings.flush_volumes_matrix=['0','400','200','0','0','500','300','0'];
  project.nativeSettings.flush_multiplier=['.5','.8'];
  project.nativeSettings.flush_volumes_vector=['120','80','90','110'];
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByLabel('Open Orca Web project').setInputFiles({name:'two-nozzle.3mf',mimeType:'model/3mf',buffer:Buffer.from(exportNative3MF(project))});
  await expect(page.getByText('Embedded native presets',{exact:true})).toBeVisible();
}
async function exported(page){await page.getByRole('button',{name:'Project',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export native project',exact:true}).click();return importNative3MF(await readFile(await(await pending).path()));}
test('physical nozzle tabs retain independent raw tables and multipliers through native export',async({page})=>{
 await openDual(page);await page.getByRole('button',{name:'Flush volumes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Flushing volumes',exact:true}),cell=dialog.getByLabel('Flush from filament 1 to 2');
 await expect(cell).toHaveValue('200');await expect(dialog.getByLabel('Flush multiplier')).toHaveValue('0.5');
 await dialog.getByLabel('Purging physical nozzle').selectOption('1');await expect(cell).toHaveValue('400');await expect(dialog.getByLabel('Flush multiplier')).toHaveValue('0.8');
 await dialog.getByLabel('Flush multiplier').fill('1.2');await expect(cell).toHaveValue('600');await cell.fill('480');
 await dialog.getByLabel('Purging physical nozzle').selectOption('0');await expect(cell).toHaveValue('200');
 await dialog.getByRole('button',{name:'Apply flushing volumes'}).click();const project=await exported(page);
 expect(project.nativeSettings.flush_volumes_matrix).toEqual(['0','400','200','0','0','400','300','0']);expect(project.nativeSettings.flush_multiplier).toEqual(['0.5','1.2']);
});
test('adding and removing an unused material preserves both physical nozzle tables',async({page})=>{
 await openDual(page);await page.getByRole('button',{name:'Add filament slot',exact:true}).click();await expect(page.getByLabel('Filament 3 color')).toBeVisible();
 await page.getByRole('button',{name:'Flush volumes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Flushing volumes',exact:true});await dialog.getByLabel('Purging physical nozzle').selectOption('1');
 await expect(dialog.getByLabel('Flush from filament 1 to 2')).toHaveValue('400');await expect(dialog.getByLabel('Flush from filament 1 to 3')).toHaveValue('160');await dialog.getByRole('button',{name:'Cancel changes'}).click();
 await page.getByRole('button',{name:'Remove filament slot 3',exact:true}).click();const project=await exported(page);expect(project.nativeSettings.flush_volumes_matrix).toEqual(['0','400','200','0','0','500','300','0']);expect(project.nativeSettings.flush_multiplier).toEqual(['0.5','0.8']);expect(project.nativeSettings.flush_volumes_vector).toEqual(['120','80','90','110']);
});
