import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {expectSceneInCamera} from '../fixtures/camera-frustum-assertions.js';
import {towerProject,towerSettings} from '../fixtures/native-prime-tower-input.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-prime-tower-reference.json',import.meta.url)));
const canvas=page=>page.getByRole('img',{name:'Interactive 3D model view',exact:true});
const preview=page=>canvas(page).evaluate(el=>JSON.parse(el.dataset.primeTower));
const target=async page=>JSON.parse(await canvas(page).getAttribute('data-camera-target'));
async function start(page,{secondPlate=false,initialDelay=false}={}){
 const pending=[];let defer=initialDelay;
 await page.route('**/api/geometry/prime-tower',async route=>{
  const project=route.request().postDataJSON().projectRequest.project,s=project.nativeSettings;
  const result={...structuredClone(ref.cases[0].expected),format:'orca-native-prime-tower',version:1,plateId:project.activePlateId,position:[Number(s.wipe_tower_x[0]),Number(s.wipe_tower_y[0])],rotation:Number(s.wipe_tower_rotation_angle)*Math.PI/180};
  const reply=options=>route.fulfill(options||{json:{result,warnings:[]}}).catch(()=>{});
  if(defer)await new Promise(resolve=>pending.push(async options=>{await reply(options);resolve();}));else await reply();
 });
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 const project={...towerProject(),useEmbeddedSettings:true,nativeWorkflow:true,nativeSettings:{...towerSettings,printer_settings_id:'Tower fixture',print_settings_id:'Tower process',filament_settings_id:['PLA','PLA','PLA']}};
 if(secondPlate){project.plates.push({id:'plate-2',name:'Plate 2'});project.objects.push(...project.objects.map(o=>({...structuredClone(o),id:o.id+'-second',plateId:'plate-2'})));}
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'Camera.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect.poll(()=>preview(page)).toMatchObject(initialDelay?{status:'loading',visible:false}:{status:'ready',visible:true});
 return{project,pending,defer(){defer=true;},async next(options){await expect.poll(()=>pending.length).toBeGreaterThan(0);await pending.shift()(options);}};
}
async function edit(page,x='125',y='160'){
 await page.getByRole('button',{name:'Prime tower',exact:true}).click();const d=page.getByRole('dialog',{name:'Prime tower placement'});
 await d.getByLabel('Prime tower X',{exact:true}).fill(x);await d.getByLabel('Prime tower Y',{exact:true}).fill(y);await d.getByRole('button',{name:'Apply prime tower'}).click();await expect.poll(()=>preview(page)).toMatchObject({status:'loading',visible:false});
}
async function assertFits(page,project){expectSceneInCamera(project.objects.filter(o=>o.plateId===project.activePlateId),await preview(page),await frame(page));}
for(const projection of ['Perspective','Orthographic'])test(`Fit waits for replacement tower bounds in ${projection} and retains the chosen view`,async({page},info)=>{
 const control=await start(page);if(projection==='Orthographic')await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();control.defer();await edit(page);
 await page.locator('.scene-views').getByRole('button',{name:'Front',exact:true}).click();expect((await target(page))[0]).toBeLessThan(100);
 await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',position:[125,160]});await expect.poll(async()=>(await target(page))[0]).toBeGreaterThan(100);
 await expect(canvas(page)).toHaveAttribute('data-camera-view','Front');await assertFits(page,control.project);await page.screenshot({path:info.outputPath(`tower-fit-${projection}.png`)});
});
async function frame(page){return canvas(page).evaluate(el=>JSON.parse(el.dataset.cameraFrame));}
// OrbitControls suppresses change events below its 1e-6 squared-distance threshold.
// Compare settled gestures within 0.005 mm; the observed late-fit regression moves tens of mm.
async function settled(page){let previous,stable=0;await expect.poll(async()=>{const value=JSON.stringify((await frame(page)).position.map(n=>Math.round(n*1e5)));stable=value===previous?stable+1:0;previous=value;return stable;},{timeout:10000,intervals:[100]}).toBeGreaterThanOrEqual(3);return frame(page);}
for(const gesture of ['orbit','pan','zoom'])test(`a user ${gesture} supersedes a pending Fit without a late camera jump`,async({page})=>{
 const control=await start(page);control.defer();await edit(page);await page.locator('.scene-views').getByRole('button',{name:'Fit',exact:true}).click();const before=await frame(page),box=await canvas(page).boundingBox(),x=box.x+box.width*.2,y=box.y+box.height*.6;
 await page.mouse.move(x,y);if(gesture==='zoom')await page.mouse.wheel(0,-160);else{await page.mouse.down({button:gesture==='pan'?'right':'left'});await page.mouse.move(x+80,y+40,{steps:8});await page.mouse.up({button:gesture==='pan'?'right':'left'});}
 const moved=await settled(page);expect(moved.position).not.toEqual(before.position);await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});const after=await settled(page);for(const key of ['position','target'])for(let i=0;i<3;i++)expect(after[key][i]).toBeCloseTo(moved[key][i],2);
});
test('Zoom to bed supersedes a pending object Fit',async({page})=>{
 const control=await start(page);control.defer();await edit(page);await page.locator('.scene-views').getByRole('button',{name:'Fit',exact:true}).click();await canvas(page).focus();await page.keyboard.press('ControlOrMeta+0');await expect.poll(()=>target(page)).toEqual([100,100,0]);const before=await frame(page);await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});expect(await frame(page)).toEqual(before);
});
test('failed preview clears the pending Fit before a later successful refresh',async({page})=>{
 const control=await start(page);control.defer();await edit(page);await page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click();await control.next({status:503,json:{error:'Camera test helper unavailable'}});await expect.poll(()=>preview(page)).toMatchObject({status:'error',visible:false});const before=await frame(page);await edit(page,'120','150');await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});expect(await frame(page)).toEqual(before);
});
test('disabling the tower cancels a pending Fit and its delayed response',async({page})=>{
 const control=await start(page);control.defer();await edit(page);await expect.poll(()=>control.pending.length).toBe(1);await page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click();
 await page.getByRole('button',{name:'Prime tower',exact:true}).click();const d=page.getByRole('dialog',{name:'Prime tower placement'});await d.getByLabel('Enable prime tower',{exact:true}).uncheck();await d.getByRole('button',{name:'Apply prime tower'}).click();await expect.poll(()=>preview(page)).toMatchObject({status:'idle',visible:false});const before=await frame(page);await control.next();await page.getByRole('button',{name:'Undo',exact:true}).click();await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});expect(await frame(page)).toEqual(before);
});
test('superseded geometry cannot satisfy Fit; the newest valid preview does',async({page})=>{
 const control=await start(page);control.defer();await edit(page);await expect.poll(()=>control.pending.length).toBe(1);await edit(page,'135','170');await expect.poll(()=>control.pending.length).toBe(2);await page.locator('.scene-views').getByRole('button',{name:'Right',exact:true}).click();const before=await frame(page);await control.next();expect((await preview(page)).status).toBe('loading');expect(await frame(page)).toEqual(before);await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',position:[135,170]});await expect.poll(async()=>(await target(page))[0]).toBeGreaterThan(100);await expect(canvas(page)).toHaveAttribute('data-camera-view','Right');await assertFits(page,control.project);
});
test('a fit queued for the previous plate cannot impose its view on the next plate',async({page})=>{
 const control=await start(page,{secondPlate:true});control.defer();await edit(page);await expect.poll(()=>control.pending.length).toBe(1);await page.locator('.scene-views').getByRole('button',{name:'Front',exact:true}).click();await page.locator('.plate-tabs').getByRole('button',{name:'Plate 2',exact:true}).click();await expect.poll(()=>control.pending.length).toBe(2);await control.next();expect((await preview(page)).status).toBe('loading');await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});await expect(canvas(page)).toHaveAttribute('data-camera-view','Isometric');
});
test('camera movement before the first tower response also cancels automatic fitting',async({page})=>{
 const control=await start(page,{initialDelay:true});await expect.poll(()=>control.pending.length).toBe(1);const box=await canvas(page).boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.6);await page.mouse.wheel(0,-160);const before=await settled(page);await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',visible:true});const after=await settled(page);for(const key of ['position','target'])for(let i=0;i<3;i++)expect(after[key][i]).toBeCloseTo(before[key][i],2);
});

for(const projection of ['Perspective','Orthographic'])test(`a pending manual Fit preserves custom ${projection} orientation after replacement tower geometry arrives`,async({page})=>{
 const control=await start(page);if(projection==='Orthographic')await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();const box=await canvas(page).boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.2+60,box.y+box.height*.6+20,{steps:5});await page.mouse.up();const rotated=await settled(page);
 control.defer();await edit(page);await page.locator('.scene-views').getByRole('button',{name:'Fit',exact:true}).click();await settled(page);await control.next();await expect.poll(()=>preview(page)).toMatchObject({status:'ready',position:[125,160]});const fitted=await settled(page);for(const i of [0,1,2,4,5,6,8,9,10])expect(fitted.matrixWorldInverse[i]).toBeCloseTo(rotated.matrixWorldInverse[i],8);await assertFits(page,control.project);
});
