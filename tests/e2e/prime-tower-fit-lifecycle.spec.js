import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {towerProject} from '../fixtures/native-prime-tower-input.js';
import {expectSceneInCamera} from '../fixtures/camera-frustum-assertions.js';
const project=towerProject(),ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url))).cases[0].expected;
const result={...ref,plateId:project.activePlateId},replacement={...result,position:[360,-160],rotation:Math.PI/5,size:[80,40,90]};
let script;
test.beforeAll(async()=>{
 const source=path.resolve(process.env.ORCA_SCENE_COMPONENT||'src/SceneViewport.jsx');
 const output=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Scene from ${JSON.stringify(source)};const objects=${JSON.stringify(project.objects)},first=${JSON.stringify(result)},second=${JSON.stringify(replacement)};function Harness(){const[phase,setPhase]=React.useState('first');React.useLayoutEffect(()=>{if(phase==='second')document.querySelector('.scene-views button:nth-last-child(2)').click();},[phase]);return <><button onClick={()=>setPhase('loading')}>Remove old preview</button><button onClick={()=>setPhase('second')}>Replace and Fit during commit</button><Scene objects={objects} mode="Select" primeTowerPreview={{plateId:'plate-1',status:phase==='loading'?'loading':'ready',result:phase==='loading'?null:phase==='first'?first:second}} filamentColors={['#0080FF','#FF4000']} onSelect={()=>{}} onTransform={()=>{}} onPlaceFace={()=>{}}/></>;}createRoot(document.getElementById('root')).render(<Harness/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});script=output.outputFiles[0].text;
});
for(const previous of ['ready','loading'])test(`Fit uses newly committed tower geometry before passive effects replace the ${previous} scene`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/tower-fit-lifecycle',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>.scene-viewport{position:relative;width:900px;height:600px}.scene-renderer{position:absolute;inset:0}.scene-views{position:absolute;right:0;top:0}.scene-axis{position:absolute;bottom:0}</style><div id="root"></div><script src="/tower-fit-lifecycle.js"></script>'}));
 await page.route('**/tower-fit-lifecycle.js',route=>route.fulfill({contentType:'text/javascript',body:script}));await page.goto('/tower-fit-lifecycle');
 const canvas=page.getByRole('img',{name:'Interactive 3D model view'}),data=()=>canvas.evaluate(el=>({tower:JSON.parse(el.dataset.primeTower),frame:JSON.parse(el.dataset.cameraFrame)}));
 await expect.poll(async()=>(await data()).tower).toMatchObject({status:'ready',position:result.position});
 if(previous==='loading'){await page.getByRole('button',{name:'Remove old preview'}).click();await expect.poll(async()=>(await data()).tower).toMatchObject({status:'loading'});}
 await page.getByRole('button',{name:'Replace and Fit during commit'}).click();await expect.poll(async()=>(await data()).tower).toMatchObject({status:'ready',position:replacement.position});const actual=await data();expectSceneInCamera(project.objects,actual.tower,actual.frame);expect(errors).toEqual([]);
});
