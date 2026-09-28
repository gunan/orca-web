import {test,expect} from '@playwright/test';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';

async function assertNativePixels(page,button,theme,state,scale){
 const icon=button.locator('.native-icon');await expect.poll(()=>icon.locator(`img.native-icon-${theme}`).evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 // Align the icon box to device pixels so this tests state pixels rather than clip rounding.
 await icon.evaluate(el=>{el.style.transform='';el.style.position='relative';el.style.left='0';el.style.top='0';const b=el.getBoundingClientRect();el.style.left=`${Math.round(b.x)-b.x}px`;el.style.top=`${Math.round(b.y)-b.y}px`;});
 const box=await icon.boundingBox();const actual=(await page.screenshot({clip:{x:Math.round(box.x),y:Math.round(box.y),width:36,height:36}})).toString('base64');
 const result=await page.evaluate(async({actual,theme,state,scale})=>{
  const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+actual)).blob()),reference=await createImageBitmap(await(await fetch(`/native-toolbar-icons/${'toolbar_move'}-${theme}-${36*scale}.png`)).blob());
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const observed=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=getComputedStyle(document.querySelector('.toolbar')).backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=getComputedStyle(document.querySelector('button[aria-label=Move]')).backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(reference,state*36*scale,0,36*scale,36*scale,0,0,canvas.width,canvas.height);const expected=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let different=0,maxError=0;for(let i=0;i<observed.length;i+=4){const error=Math.max(...[0,1,2].map(c=>Math.abs(observed[i+c]-expected[i+c])));if(error>3)different++;maxError=Math.max(maxError,error);}
  return{different,maxError,width:bitmap.width,height:bitmap.height,expected:canvas.toDataURL(),source:[...document.querySelectorAll('button[aria-label=Move] img')].map(el=>({src:el.currentSrc,box:el.getBoundingClientRect().toJSON(),transform:getComputedStyle(el).transform,natural:[el.naturalWidth,el.naturalHeight],iconBox:el.closest('.native-icon').getBoundingClientRect().toJSON(),iconTransform:getComputedStyle(el.closest('.native-icon')).transform,filter:getComputedStyle(el).filter,opacity:getComputedStyle(el.closest('button')).opacity,background:getComputedStyle(el.closest('button')).backgroundColor}))};
 },{actual,theme,state,scale});
 if(result.different){await writeFile(test.info().outputPath('actual.png'),Buffer.from(actual,'base64'));await writeFile(test.info().outputPath('expected.png'),Buffer.from(result.expected.split(',')[1],'base64'));}delete result.expected;expect(result.width).toBe(36*scale);expect(result.height).toBe(36*scale);expect(result.different,JSON.stringify(result)).toBe(0);
}
for(const theme of ['light','dark'])for(const scale of [1,2])test(`native Move states remain visible and match source pixels in ${theme} at ${scale}x`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:scale});const page=await context.newPage();
 try{
  await page.goto('/');await page.getByRole('button',{name:'Prepare',exact:true}).click();await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  if(theme==='dark'){await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('menuitem',{name:'Dark theme',exact:true}).click();}
  const move=page.getByRole('button',{name:'Move',exact:true});await expect(move).toBeDisabled();await page.mouse.move(3,3);await assertNativePixels(page,move,theme,3,scale);
  await move.hover({force:true});await assertNativePixels(page,move,theme,3,scale);
  await page.getByLabel('Choose a 3D model').setInputFiles(path.resolve('tests/fixtures/cube.stl'));await expect(move).toBeEnabled();await page.mouse.move(3,3);await assertNativePixels(page,move,theme,0,scale);
  await move.hover();await assertNativePixels(page,move,theme,1,scale);
  await move.click();await page.mouse.move(3,3);await assertNativePixels(page,move,theme,2,scale);
  await move.hover();await assertNativePixels(page,move,theme,2,scale);
  await page.screenshot({path:info.outputPath(`native-toolbar-${theme}-${scale}x.png`)});
  await page.getByRole('button',{name:'Select',exact:true}).click();await page.mouse.move(3,3);await assertNativePixels(page,move,theme,0,scale);
  await page.getByRole('button',{name:'Deselect all',exact:true}).click();await assertNativePixels(page,move,theme,3,scale);
 }finally{await context.close();}
});
