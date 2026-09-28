import {observeGpu,gpuIdle,gpuRedraw} from '../fixtures/gpu-observation.js';
import {test,expect} from '@playwright/test';import {readFile} from 'node:fs/promises';import {dragTower,dragWorldPoint} from '../fixtures/tower-browser-drag.js';
import {towerProject,towerSettings} from '../fixtures/native-prime-tower-input.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-tower-drag-reference.json',import.meta.url))),base=ref.cases[0].expected;
const canvas=page=>page.getByRole('img',{name:'Interactive 3D model view',exact:true});
const interaction=page=>canvas(page).evaluate(el=>JSON.parse(el.dataset.primeTowerInteraction));
const tower=page=>canvas(page).evaluate(el=>JSON.parse(el.dataset.primeTower));
async function start(page,{legacy=false}={}){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/geometry/prime-tower',route=>{const p=route.request().postDataJSON().projectRequest.project,index=p.plates.findIndex(x=>x.id===p.activePlateId),s=p.nativeSettings,position=[Number(s.wipe_tower_x[index]??s.wipe_tower_x[0]),Number(s.wipe_tower_y[index]??s.wipe_tower_y[0])];const{bands,translations,...expected}=structuredClone(base);if(legacy)delete expected.dragContext;return route.fulfill({json:{result:{format:'orca-native-prime-tower',version:1,sourceRevision:ref.sourceCommit,...expected,plateId:p.activePlateId,position},warnings:[]}});});
 await page.goto('/');await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
 const p={...towerProject(),useEmbeddedSettings:true,nativeWorkflow:true,nativeSettings:{...towerSettings,wipe_tower_x:['100','80'],wipe_tower_y:['140','160'],printer_settings_id:'Tower fixture',print_settings_id:'Tower process',filament_settings_id:['PLA','PLA','PLA']}};
 p.plates.push({id:'plate-2',name:'Plate 2'});
 await page.getByLabel('Open Orca Web project').setInputFiles({name:'Tower.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect.poll(()=>tower(page)).toMatchObject({status:'ready',visible:true,position:[100,140]});
 await page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click();
 await expect(canvas(page)).toHaveAttribute('data-camera-view','Top');return{p,errors};
}
async function grab(page,delta=[20,15]){return dragTower(page,canvas(page),await tower(page),delta);}
async function saved(page){const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(await readFile(await(await download).path(),'utf8'));}

test('native tower drag commits one position edit, preserves other plates and geometry, and supports Undo/Redo',async({page})=>{
 const {p,errors}=await start(page);const initialBox=await canvas(page).boundingBox();const expected=await grab(page);expect(await canvas(page).boundingBox()).toEqual(initialBox);await expect.poll(()=>interaction(page)).toMatchObject({selected:true,dragging:true});await expect(page.getByRole("region",{name:"Selected prime tower"})).toBeVisible();await page.mouse.up();
 await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);await expect.poll(async()=>((await tower(page)).position?.[1]??NaN)).toBeCloseTo(expected[1],4);
 let data=await saved(page);expect(data.objects).toEqual(p.objects);expect(data.nativeSettings.wipe_tower_x[1]).toBe('80');expect(data.nativeSettings.wipe_tower_y[1]).toBe('160');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>tower(page)).toMatchObject({position:[100,140]});await page.getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);expect(errors).toEqual([]);
});
for(const cancellation of ['Escape','pointercancel'])test(`${cancellation} restores an in-flight tower drag without an undo edit`,async({page})=>{
 const {p,errors}=await start(page);await grab(page);await expect.poll(()=>interaction(page)).toMatchObject({dragging:true});
 if(cancellation==='Escape')await page.keyboard.press('Escape');else await canvas(page).dispatchEvent('pointercancel',{pointerId:1,button:0});await page.mouse.up();
 await expect.poll(()=>interaction(page)).toMatchObject({dragging:false,position:[100,140]});await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();const data=await saved(page);expect(data.nativeSettings.wipe_tower_x).toEqual(p.nativeSettings.wipe_tower_x);expect(data.objects).toEqual(p.objects);expect(errors).toEqual([]);
});
test('dragging beyond an edge uses the native brim inset and keeps the camera fixed',async({page})=>{
 const {errors}=await start(page);const before=JSON.parse(await canvas(page).getAttribute('data-camera-frame'));await grab(page,[-150,0]);await page.mouse.up();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeGreaterThan(3.4997);await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeLessThan(3.5002);
 const after=JSON.parse(await canvas(page).getAttribute('data-camera-frame'));for(const key of ["position","target"])for(let i=0;i<3;i++)expect(Math.abs(after[key][i]-before[key][i])).toBeLessThan(1e-8);expect(errors).toEqual([]);
});
test('a helper without native drag context keeps its tower visible and offers no drag mutation',async({page})=>{
 const {p,errors}=await start(page,{legacy:true});await expect.poll(()=>interaction(page)).toMatchObject({available:false});await grab(page);await page.mouse.up();const data=await saved(page);expect(data.nativeSettings.wipe_tower_x).toEqual(p.nativeSettings.wipe_tower_x);expect(data.nativeSettings.wipe_tower_y).toEqual(p.nativeSettings.wipe_tower_y);expect(errors).toEqual([]);
});

test('starting from no object selection preserves the viewport for the entire tower gesture',async({page})=>{
 const{errors}=await start(page);await page.getByRole('button',{name:'Deselect all',exact:true}).click();await expect(page.locator('.resizable-workspace')).toHaveClass(/empty-selection/);
 await page.locator('.scene-views').getByRole('button',{name:'Fit',exact:true}).click();const before=await canvas(page).boundingBox();const expected=await grab(page);expect(await canvas(page).boundingBox()).toEqual(before);await page.mouse.up();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);await expect(page.getByRole('region',{name:'Selected prime tower'})).toBeVisible();expect(errors).toEqual([]);
});

test('orthographic tower dragging preserves pointer geometry and selection',async({page})=>{
 const {errors}=await start(page);await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();await page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click();const expected=await grab(page,[10,-15]);await page.mouse.up();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);await expect.poll(async()=>((await tower(page)).position?.[1]??NaN)).toBeCloseTo(expected[1],4);expect(errors).toEqual([]);
});
test('native five-pixel threshold applies only before the tower is selected',async({page})=>{
 const{errors}=await start(page);await grab(page,[.4,.1]);await page.mouse.up();await expect.poll(()=>tower(page)).toMatchObject({position:[100,140]});await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();const expected=await grab(page,[.4,.1]);await page.mouse.up();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();expect(errors).toEqual([]);
});

for(const interruption of ['lost pointer capture','window blur','preview replacement'])test(`${interruption} cancels a tower drag and releases its temporary layout`,async({page})=>{
 const {p,errors}=await start(page);await page.getByRole('button',{name:'Deselect all',exact:true}).click();await page.locator('.scene-views').getByRole('button',{name:'Fit',exact:true}).click();await grab(page);await expect.poll(()=>interaction(page)).toMatchObject({dragging:true});
 if(interruption==='lost pointer capture'){
  await canvas(page).evaluate(el=>el.releasePointerCapture(1));const b=await canvas(page).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
 }else if(interruption==='window blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 else await page.getByLabel('Layer height',{exact:true}).fill('0.3');
 await expect.poll(()=>interaction(page)).toMatchObject({dragging:false});await page.mouse.up();
 await expect.poll(()=>tower(page)).toMatchObject({status:'ready',position:[100,140]});
 await expect(page.getByRole('region',{name:'Selected prime tower'})).toBeVisible();
 const data=await saved(page);expect(data.nativeSettings.wipe_tower_x).toEqual(p.nativeSettings.wipe_tower_x);expect(data.nativeSettings.wipe_tower_y).toEqual(p.nativeSettings.wipe_tower_y);expect(data.objects).toEqual(p.objects);
 if(interruption!=='preview replacement')await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
 const expected=await grab(page,[12,-8]);await page.mouse.up();await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBeCloseTo(expected[0],4);expect(errors).toEqual([]);
});

const gizmo=page=>canvas(page).evaluate(el=>JSON.parse(el.dataset.primeTowerGizmo));
async function selectTowerMove(page){await grab(page,[0,0]);await page.mouse.up();await expect(page.getByRole('button',{name:'Move',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Move',exact:true}).click();await page.locator('.scene-views').getByRole('button',{name:'Perspective',exact:true}).click();await page.locator('.scene-views').getByRole('button',{name:'Top',exact:true}).click();await expect.poll(()=>gizmo(page)).toMatchObject({visible:true,axes:[{axis:0},{axis:1}]});const box=await canvas(page).boundingBox(),before=await canvas(page).getAttribute('data-camera-frame');await page.mouse.move(box.x+40,box.y+box.height*.6);await page.mouse.wheel(0,600);await expect(canvas(page)).not.toHaveAttribute('data-camera-frame',before);}
for(const axis of [0,1])test(`native tower ${axis===0?'X':'Y'} handle projects one axis and commits one Undo`,async({page})=>{
 const{p,errors}=await start(page);await selectTowerMove(page);for(const name of ['Rotate','Scale','Place on face'])await expect(page.getByRole('button',{name,exact:true})).toBeDisabled();
 const handle=(await gizmo(page)).axes[axis].handle,delta=[12,-9],movement=await dragWorldPoint(page,canvas(page),handle,delta);await page.mouse.up();
 await expect.poll(async()=>((await tower(page)).position?.[axis]??NaN)).toBeCloseTo(p.nativeSettings[axis===0?'wipe_tower_x':'wipe_tower_y'][0]*1+movement[axis],4);await expect.poll(async()=>((await tower(page)).position?.[1-axis]??NaN)).toBe(axis===0?140:100);
 await page.screenshot({path:test.info().outputPath(`tower-${axis===0?'X':'Y'}-handle.png`)});const data=await saved(page);expect(data.objects).toEqual(p.objects);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>tower(page)).toMatchObject({position:[100,140]});await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();expect(errors).toEqual([]);
});
test('tower Move shortcut, Shift snapping, Escape and Deselect preserve native tool restrictions',async({page})=>{
 const{errors}=await start(page);await selectTowerMove(page);await page.getByRole('button',{name:'Select',exact:true}).click();await canvas(page).focus();await page.keyboard.press('m');await expect.poll(()=>gizmo(page)).toMatchObject({visible:true});
 const handle=(await gizmo(page)).axes[0].handle;await page.keyboard.down('Shift');const movement=await dragWorldPoint(page,canvas(page),handle,[6.4,2]);await page.mouse.up();await page.keyboard.up('Shift');await expect.poll(async()=>((await tower(page)).position?.[0]??NaN)).toBe(100+Math.round(movement[0]));
 const at=(await tower(page)).position;await dragWorldPoint(page,canvas(page),(await gizmo(page)).axes[1].handle,[0,-8]);await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(()=>interaction(page)).toMatchObject({dragging:false,position:at});
 await page.getByRole('button',{name:'Deselect all',exact:true}).click();await expect.poll(()=>gizmo(page)).toMatchObject({visible:false});await expect(page.getByRole('button',{name:'Move',exact:true})).toBeDisabled();await expect(page.getByRole('region',{name:'Selected prime tower'})).toHaveCount(0);expect(errors).toEqual([]);
});

test('tower selection, movement and capture loss redraw actual pixels and leave idle GPU work stopped',async({page})=>{
 await observeGpu(page);await start(page);const view=canvas(page);await gpuIdle(page,view);
 await gpuRedraw(page,view,async()=>{await grab(page,[0,0]);await page.mouse.up();});
 await gpuRedraw(page,view,()=>page.getByRole('button',{name:'Move',exact:true}).click());await expect.poll(()=>view.evaluate(el=>JSON.parse(el.dataset.primeTowerGizmo).visible)).toBe(true);
 await gpuRedraw(page,view,()=>grab(page,[20,15]));await expect.poll(()=>interaction(page)).toMatchObject({dragging:true});
 await gpuRedraw(page,view,()=>page.evaluate(()=>window.dispatchEvent(new Event('blur'))));await page.mouse.up();await expect.poll(()=>interaction(page)).toMatchObject({dragging:false,position:[100,140]});
 await gpuRedraw(page,view,()=>page.getByRole('button',{name:'Deselect all',exact:true}).click());await expect.poll(()=>view.evaluate(el=>JSON.parse(el.dataset.primeTowerGizmo).visible)).toBe(false);
});
