import { test, expect } from '@playwright/test';
async function open(page){
  await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Calibration',exact:true}).click();
  await page.getByRole('menuitem',{name:'Generate calibration…',exact:true}).click();
}
test('retraction is available and rejected calibration requests leave the scene intact',async({page})=>{
  let submitted=0;await page.route('**/api/calibrations/prepare',route=>{submitted++;return route.fulfill({status:400,json:{error:'Calibration needs a compatible native printer'}});});
  await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('retraction');
  await expect(page.getByRole('button',{name:'Generate calibration',exact:true})).toBeEnabled();
  expect(submitted).toBe(0);
  await page.getByLabel('Calibration test',{exact:true}).selectOption('temperature');
  await page.getByRole('button',{name:'Generate calibration',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('compatible native printer');
  expect(submitted).toBe(1);
  await page.getByRole('button',{name:'Close calibration',exact:true}).click();
  await expect(page.getByText('Triangles: 0',{exact:true})).toBeVisible();
});
