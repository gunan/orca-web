import{test,expect}from'@playwright/test';
test('Prepare presents one material selector, native icon controls and a settings panel that uses available height',async({page},testInfo)=>{
 await page.setViewportSize({width:1759,height:1002});await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 await expect(page.getByLabel('Filament',{exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'Edit filament preset',exact:true})).toHaveCount(1);
 const move=page.getByRole('button',{name:'Move',exact:true});await expect(move).toBeDisabled();const icon=move.locator('img.native-icon-light');await expect.poll(()=>icon.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 const settings=await page.locator('.setting-list').boundingBox(),sidebar=await page.locator('.native-sidebar').boundingBox();expect(settings.height).toBeGreaterThan(450);expect(sidebar.width).toBeGreaterThan(380);expect(sidebar.width).toBeLessThan(400);
 await expect(page.locator('.scene-object-list')).not.toBeVisible();
 await expect.poll(()=>page.locator('.native-icon img').evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.getAttribute('src')))).toEqual([]);await page.screenshot({path:testInfo.outputPath('native-layout-prepare.png')});
 await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('menuitem',{name:'Dark theme',exact:true}).click();await expect(move.locator('img.native-icon-dark')).toBeVisible();await expect.poll(()=>move.locator('img.native-icon-dark').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
});
