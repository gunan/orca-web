import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {nativePreviewFixture} from '../fixtures/native-preview-result.js';

const code='G90\nM83\nG1 X0 Y0 Z0.2\n;TYPE:Outer wall\nG1 X10 E1 F1200\n';
const native={...nativePreviewFixture(),sourceSha256:createHash('sha256').update(code).digest('hex'),sourceBytes:Buffer.byteLength(code)};
let script,css;
test.beforeAll(async()=>{
 const source=path.resolve(process.env.ORCA_PREVIEW_COMPONENT||'src/ToolpathPreview.jsx');
 const output=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import ToolpathPreview from ${JSON.stringify(source)};function Harness(){const[job,setJob]=React.useState({id:'first',status:'ready',filename:'First.gcode'});return <><nav><button onClick={()=>setJob(null)}>Clear result</button><button onClick={()=>setJob({id:'second',status:'ready',filename:'Second.gcode'})}>Select second</button>{['running','failed','cancelled'].map(status=><button key={status} onClick={()=>setJob({id:'first',status,filename:'First.gcode'})}>{status}</button>)}</nav><ToolpathPreview job={job}/></>}createRoot(document.getElementById('root')).render(<Harness/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'unused-preview-lifecycle',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css')).text;
});
async function open(page,{hotend='pending',holdSecond=false}={}) {
 const errors=[],hotendJobs=[];let releaseHotend,releaseSecond;
 const hotendGate=new Promise(resolve=>releaseHotend=resolve),secondGate=new Promise(resolve=>releaseSecond=resolve);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/preview-lifecycle',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/lifecycle.css"><div id="root"></div><script src="/lifecycle.js"></script>'}));
 await page.route('**/lifecycle.js',route=>route.fulfill({contentType:'text/javascript',body:script}));
 await page.route('**/lifecycle.css',route=>route.fulfill({contentType:'text/css',body:css}));
 await page.route('**/api/jobs/*/download',async route=>{if(holdSecond&&route.request().url().includes('/second/'))await secondGate;await route.fulfill({contentType:'text/plain',body:code}).catch(()=>{});});
 await page.route('**/api/jobs/native-preview/capabilities',route=>route.fulfill({json:{available:true,engine:native.engine}}));
 await page.route('**/api/jobs/*/native-preview',route=>route.fulfill({json:native}));
 await page.route('**/api/jobs/*/hotend',async route=>{
  const id=route.request().url().split('/jobs/')[1].split('/')[0];hotendJobs.push(id);
  if(id==='first'&&hotend==='pending')await hotendGate;
  await route.fulfill(hotend==='loaded'?{status:404,json:{error:'Older server'}}:{json:{version:1,available:false,error:`Unavailable hotend ${id}`}}).catch(()=>{});
 });
 await page.goto('/preview-lifecycle');
 await expect(page.getByRole('img',{name:'3D G-code toolpaths'})).toHaveAttribute('data-processor','native');
 await expect.poll(()=>hotendJobs).toEqual(['first']);
 if(hotend==='missing')await expect(page.getByRole('status').filter({hasText:'Unavailable hotend first'})).toBeVisible();
 if(hotend==='loaded')await expect(page.getByRole('img',{name:'3D G-code toolpaths'})).toHaveAttribute('data-tool-marker-triangles','560');
 return {errors,hotendJobs,releaseHotend,releaseSecond};
}
for(const hotend of ['pending','missing','loaded'])test(`clearing a native Preview with ${hotend} hotend keeps the application usable`,async({page})=>{
 const state=await open(page,{hotend});
 try {
  await page.getByRole('button',{name:'Clear result',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No slicing result'})).toBeVisible();
  state.releaseHotend();
  await page.getByRole('button',{name:'Select second',exact:true}).click();
  await expect(page.getByRole('region',{name:'G-code toolpath preview'})).toContainText('Second.gcode');
  await expect.poll(()=>state.hotendJobs).toEqual(['first','second']);
  if(hotend!=='loaded')await expect(page.getByRole('status').filter({hasText:'Unavailable hotend second'})).toBeVisible();
  await expect(page.getByText('Unavailable hotend first',{exact:false})).toHaveCount(0);
  expect(state.errors).toEqual([]);
 }finally{state.releaseHotend();state.releaseSecond();}
});
for(const [status,heading]of [['running','Slicing in progress'],['failed','Slicing failed'],['cancelled','Slicing cancelled']])test(`ready to ${status} discards old native Preview and its pending asset`,async({page})=>{
 const state=await open(page);
 try {
  await page.getByRole('button',{name:status,exact:true}).click();
  await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();state.releaseHotend();
  await expect(page.getByRole('img',{name:'3D G-code toolpaths'})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear result',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No slicing result'})).toBeVisible();
  expect(state.hotendJobs).toEqual(['first']);expect(state.errors).toEqual([]);
 }finally{state.releaseHotend();state.releaseSecond();}
});
test('switching ready jobs never loads a new hotend from the previous job data',async({page})=>{
 const state=await open(page,{holdSecond:true});
 try {
  await page.getByRole('button',{name:'Select second',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Loading toolpath preview'})).toBeVisible();
  expect(state.hotendJobs).toEqual(['first']);state.releaseHotend();state.releaseSecond();
  await expect(page.getByRole('region',{name:'G-code toolpath preview'})).toContainText('Second.gcode');
  await expect(page.getByRole('status').filter({hasText:'Unavailable hotend second'})).toBeVisible();
  expect(state.hotendJobs).toEqual(['first','second']);expect(state.errors).toEqual([]);
 }finally{state.releaseHotend();state.releaseSecond();}
});
