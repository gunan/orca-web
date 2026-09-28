import {expect} from '@playwright/test';

// Observe actual GPU submissions, independently of application render counters.
export async function observeGpu(page){
 await page.addInitScript(()=>{
  for(const type of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean))for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const original=type.prototype[name];if(!original)continue;
   type.prototype[name]=function(...args){if(this.canvas?.dataset)this.canvas.dataset.testGpuDraws=String(Number(this.canvas.dataset.testGpuDraws||0)+1);return original.apply(this,args);};
  }
 });
}
export const gpuDraws=canvas=>canvas.evaluate(c=>Number(c.dataset.testGpuDraws||0));
export async function gpuIdle(page,canvas){
 await expect.poll(async()=>{const before=await gpuDraws(canvas);await page.waitForTimeout(100);return before>0&&await gpuDraws(canvas)===before;},{timeout:8000}).toBe(true);
 const before=await gpuDraws(canvas);await page.waitForTimeout(200);expect(await gpuDraws(canvas)).toBe(before);return before;
}
export async function gpuRedraw(page,canvas,action){const before=await gpuIdle(page,canvas);await action();await expect.poll(()=>gpuDraws(canvas)).toBeGreaterThan(before);return gpuIdle(page,canvas);}
