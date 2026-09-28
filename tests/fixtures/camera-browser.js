import {expect} from '@playwright/test';
import {gpuIdle} from './gpu-observation.js';
export const frame=async canvas=>JSON.parse(await canvas.getAttribute('data-camera-frame'));
export const distance=state=>Math.hypot(...state.position.map((v,i)=>v-state.target[i]));
export const vectorDistance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export async function cameraDrag(page,canvas,button='middle',modifiers=[]){const b=await canvas.boundingBox();for(const key of modifiers)await page.keyboard.down(key);await page.mouse.move(b.x+b.width*.2,b.y+b.height*.65);await page.mouse.down({button});await page.mouse.move(b.x+b.width*.2+40,b.y+b.height*.65+20,{steps:3});await page.mouse.up({button});for(const key of modifiers.toReversed())await page.keyboard.up(key);await gpuIdle(page,canvas);}
export async function cameraWheel(page,canvas,delta=100){const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.65);await page.mouse.wheel(0,delta);await gpuIdle(page,canvas);}
export async function preferences(page,change){await page.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Preferences'});await change(dialog);await dialog.getByRole('button',{name:'Close',exact:true}).click();}
export async function expectPan(page,canvas,button='middle',modifiers=[]){await gpuIdle(page,canvas);const before=await frame(canvas);await cameraDrag(page,canvas,button,modifiers);const after=await frame(canvas);expect(vectorDistance(after.target,before.target)).toBeGreaterThan(.1);expect(distance(after)).toBeCloseTo(distance(before),7);for(let i=0;i<3;i++)expect(after.position[i]-after.target[i]).toBeCloseTo(before.position[i]-before.target[i],7);}
