import {test,expect} from '@playwright/test';
const key='orca-web:native-display-preferences-v1';
const shortcut=process.platform==='darwin'?'Meta+,':'Control+p';
test('native Units labels apply immediately, persist after reload, and leave project settings intact',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');const height=page.getByLabel('Layer height',{exact:true});await expect(height).toBeEnabled();const before=await height.inputValue();
 await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'}),units=dialog.getByLabel('Units');
 await expect(units.locator('option')).toHaveText(['Metric (mm, g)','Imperial (in, oz)']);await expect(units).toHaveValue('0');
 await units.selectOption('1');expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).toEqual({version:1,use_inches:'1'});
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(height).toHaveValue(before);
 await page.reload();await expect(height).toBeEnabled();await page.getByRole('button',{name:'Preferences',exact:true}).focus();await page.keyboard.press(shortcut);await expect(units).toHaveValue('1');await units.selectOption('0');await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeFocused();expect(errors).toEqual([]);
});
test('invalid stored Units fall back to metric and storage failures retain a visible session-only change',async({page})=>{
 await page.addInitScript(k=>{localStorage.setItem(k,'{"version":9,"use_inches":"1"}');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===k)throw new DOMException('Storage disabled','QuotaExceededError');return original.call(this,name,value);};},key);
 await page.goto('/');await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'}),units=dialog.getByLabel('Units');await expect(units).toHaveValue('0');await units.selectOption('1');await expect(units).toHaveValue('1');await expect(dialog.getByRole('alert')).toHaveText('Units changed for this session, but browser storage could not save them.');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Preferences',exact:true}).click();await expect(units).toHaveValue('1');
});
test('Preferences shortcut respects focused text inputs and an already open dialog',async({page})=>{
 await page.goto('/');const height=page.getByLabel('Layer height',{exact:true});await expect(height).toBeEnabled();await height.focus();await page.keyboard.press(shortcut);await expect(page.getByRole('dialog',{name:'Preferences'})).toHaveCount(0);await page.getByRole('button',{name:'Preferences',exact:true}).click();await page.keyboard.press(shortcut);await expect(page.getByRole('dialog',{name:'Preferences'})).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Preferences'})).toHaveCount(0);
});
