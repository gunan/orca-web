import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
let script,css;
test.beforeAll(async()=>{
  const output=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import CalibrationDialog from ${JSON.stringify(path.resolve('src/CalibrationDialog.jsx'))};function Harness(){const[open,setOpen]=React.useState(true);return <><button onClick={()=>setOpen(true)}>Open calibration</button><CalibrationDialog open={open} onClose={()=>setOpen(false)} selection={{printerId:'p',processId:'s',filamentId:'f'}} printerConfig={{gcode_flavor:new URLSearchParams(location.search).get('flavor'),machine_max_junction_deviation:[new URLSearchParams(location.search).get('jd')]}} onCreate={result=>{window.createdCalibration=result}}/></>}createRoot(document.getElementById('root')).render(<Harness/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'unused-calibration-test-build',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
  script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css')).text;
});
async function open(page, flavor, junctionDeviation){
  await page.route('**/calibration-harness*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/calibration-harness.css"></head><body><div id="root"></div><script src="/calibration-harness.js"></script></body></html>'}));
  await page.route('**/calibration-harness.js',route=>route.fulfill({contentType:'text/javascript',body:script}));
  await page.route('**/calibration-harness.css',route=>route.fulfill({contentType:'text/css',body:css}));
  await page.goto('/calibration-harness'+(flavor?'?flavor='+flavor+(junctionDeviation?'&jd='+junctionDeviation:''):''));await expect(page.getByRole('dialog',{name:'Calibration',exact:true})).toBeVisible();
}
test('calibration dialog submits numeric user parameters and passes the prepared scene to its callback',async({page})=>{
  let posted;
  await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:{mode:'temperature',start:230,end:225,step:5},plan:{label:'Temperature tower'},objects:[{id:'native-model'}]}})});
  await open(page);await page.getByLabel('Calibration end',{exact:true}).fill('225');
  await page.getByRole('button',{name:'Generate calibration'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted).toEqual({printerId:'p',processId:'s',filamentId:'f',mode:'temperature',start:230,end:'225',step:5});
  await expect.poll(()=>page.evaluate(()=>window.createdCalibration?.objects[0].id)).toBe('native-model');
});
test('unsupported retraction preset combinations fail visibly without committing a scene',async({page})=>{
 await page.route('**/api/calibrations/prepare',route=>route.fulfill({status:400,json:{error:'Zero-length retraction with active Z hop is not supported yet; disable Z hop or use a positive start and native initial length'}}));
 await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('retraction');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('alert')).toContainText('Zero-length retraction with active Z hop');expect(await page.evaluate(()=>window.createdCalibration)).toBeUndefined();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('native preparation errors remain visible without committing a calibration',async({page})=>{
  await page.route('**/api/calibrations/prepare',route=>route.fulfill({status:400,json:{error:'Calibration model does not fit the selected bed'}}));
  await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('pressure-advance');
  await expect(page.getByLabel('Calibration step',{exact:true})).toHaveValue('0.002');await page.getByRole('button',{name:'Generate calibration'}).click();
  await expect(page.getByRole('alert')).toContainText('does not fit');await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>window.createdCalibration)).toBeUndefined();
});

test('input shaping exposes native model selection and sends axis ranges without unused tower step fields',async({page})=>{
  let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,objects:[{id:'shaping-model'}]}})});
  await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('input-shaping-frequency');
  await page.getByLabel('Calibration test model',{exact:true}).selectOption('fast');await page.getByLabel('Calibration frequencyEndY',{exact:true}).fill('95');
  await expect(page.getByLabel('Calibration step',{exact:true})).toHaveCount(0);await expect(page.getByText('Zero frequency or damping retains the firmware value.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted).toMatchObject({mode:'input-shaping-frequency',testModel:'fast',shaperType:'auto',frequencyStartX:15,frequencyEndX:110,frequencyStartY:15,frequencyEndY:'95',damping:.15});expect(posted.step).toBeUndefined();
});
test('damping mode supplies measured frequencies and native default range',async({page})=>{
  let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,objects:[{id:'damping-model'}]}})});
  await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('input-shaping-damping');
  await page.getByLabel('Calibration frequencyX',{exact:true}).fill('38');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('0');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('0.4');
  await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted).toMatchObject({mode:'input-shaping-damping',frequencyX:'38',frequencyY:30,start:0,end:.4});expect(posted.damping).toBeUndefined();
});
test('input shaper choices follow the printer firmware and RepRap uses shared axes',async({page})=>{
  await open(page,'reprapfirmware');await page.getByLabel('Calibration test',{exact:true}).selectOption('input-shaping-frequency');
  await expect(page.getByLabel('Calibration frequencyStartY',{exact:true})).toHaveCount(0);
  await page.getByLabel('Calibration shaper type',{exact:true}).selectOption('EI2');await expect(page.getByLabel('Calibration shaper type').locator('option[value="2HUMP_EI"]')).toHaveCount(0);
  let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{objects:[{id:'rrf'}]}})});
  await page.getByLabel('Calibration frequencyEndX',{exact:true}).fill('90');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted.frequencyEndY).toBe('90');expect(posted.shaperType).toBe('EI2');
});
test('unsupported legacy firmware is visible and cannot generate input shaping',async({page})=>{
  await open(page,'marlin');await page.getByLabel('Calibration test',{exact:true}).selectOption('input-shaping-damping');
  await expect(page.getByRole('alert')).toContainText('Select a compatible printer preset');await expect(page.getByRole('button',{name:'Generate calibration'})).toBeDisabled();
});
test('cornering selects native SCV geometry and submits a continuous jerk range without a step',async({page})=>{
  let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{objects:[{id:'cornering-scv'}]}})});
  await open(page,'marlin2');await page.getByLabel('Calibration test',{exact:true}).selectOption('cornering');
  await page.getByLabel('Calibration test model',{exact:true}).selectOption('scv');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('1');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('15');
  await expect(page.getByLabel('Calibration step',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Calibration shaper type',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Printing-time estimates are unavailable',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted).toMatchObject({mode:'cornering',testModel:'scv',start:1,end:15});expect(posted.step).toBeUndefined();
});
test('positive Marlin junction deviation changes cornering defaults and visible units',async({page})=>{
  await open(page,'marlin2','.02');await page.getByLabel('Calibration test',{exact:true}).selectOption('cornering');
  await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('0');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('0.25');
  await expect(page.getByText('Start (mm junction deviation)',{exact:true})).toBeVisible();
});
test('flow generation submits a native method and top pattern without tower parameters',async({page})=>{
  let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{plan:{inputFormat:'3mf'},objects:[{id:'native-flow-specimen'}]}})});
  await open(page,'marlin2');await page.getByLabel('Calibration test',{exact:true}).selectOption('flow-ratio');
  await page.getByLabel('Calibration flow method',{exact:true}).selectOption('yolo-fine');await page.getByLabel('Calibration top pattern',{exact:true}).selectOption('monotonic');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(posted).toEqual({printerId:'p',processId:'s',filamentId:'f',mode:'flow-ratio',method:'yolo-fine',pattern:'monotonic'});
});
test('VFA exposes native band defaults, flow-limit and timing information, and submits a prepared tower',async({page})=>{
 let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,plan:{label:'VFA'},objects:[{id:'vfa-native'}]}})});
 await open(page,'marlin2');await page.getByLabel('Calibration test',{exact:true}).selectOption('vfa');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('40');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('200');await expect(page.getByLabel('Calibration step',{exact:true})).toHaveValue('10');await expect(page.getByText('Requested outer-wall speed changes every 5 mm',{exact:false})).toBeVisible();await expect(page.getByText('Printing-time estimates are unavailable',{exact:false})).toBeVisible();
 await page.getByLabel('Calibration end',{exact:true}).fill('80');await page.getByLabel('Calibration step',{exact:true}).fill('20');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(posted).toMatchObject({mode:'vfa',start:40,end:'80',step:'20'});await expect.poll(()=>page.evaluate(()=>window.createdCalibration?.objects[0].id)).toBe('vfa-native');
});
test('maximum volumetric dialog sends native flow units/defaults and explains generated limits',async({page})=>{
 let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,plan:{label:'Max volumetric speed'},objects:[{id:'max-flow-native'}]}})});
 await open(page,'marlin2');await page.getByLabel('Calibration test',{exact:true}).selectOption('max-volumetric-speed');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('5');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('20');await expect(page.getByLabel('Calibration step',{exact:true})).toHaveValue('0.5');await expect(page.getByText('Requested flow increases with height',{exact:false})).toBeVisible();await expect(page.getByText('raises the filament allowance to 200 mm³/s',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(posted).toMatchObject({mode:'max-volumetric-speed',start:5,end:20,step:.5});await expect.poll(()=>page.evaluate(()=>window.createdCalibration?.objects[0].id)).toBe('max-flow-native');
});

test('retraction dialog submits source defaults and exposes actual E and timing limitations',async({page})=>{
 let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,plan:{label:'Retraction'},objects:[{id:'retraction-native'}]}})});
 await open(page,'marlin2');await page.getByLabel('Calibration test',{exact:true}).selectOption('retraction');await expect(page.getByLabel('Calibration start',{exact:true})).toHaveValue('0');await expect(page.getByLabel('Calibration end',{exact:true})).toHaveValue('2');await expect(page.getByLabel('Calibration step',{exact:true})).toHaveValue('0.1');await expect(page.getByText('Actual retraction and wipe extrusion change',{exact:false})).toBeVisible();await expect(page.getByText('zero extra restart length',{exact:false})).toBeVisible();
 await page.getByLabel('Calibration start',{exact:true}).fill('0.2');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(posted).toMatchObject({mode:'retraction',start:'0.2',end:2,step:.1});await expect.poll(()=>page.evaluate(()=>window.createdCalibration?.objects[0].id)).toBe('retraction-native');
});

test('PA line mode submits the native numbered-tab choice and explains the preview asset',async({page})=>{
 let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,objects:[{id:'native-pa-preview'}]}})});
 await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('pressure-advance-line');await expect(page.getByLabel('Print PA numbers')).toBeChecked();await expect(page.getByText('Prepare shows the native preview asset',{exact:false})).toBeVisible();await page.getByLabel('Print PA numbers').uncheck();await page.getByLabel('Calibration end',{exact:true}).fill('0.02');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(posted).toMatchObject({mode:'pressure-advance-line',start:0,end:'0.02',step:.002,printNumbers:false});expect(await page.evaluate(()=>window.createdCalibration.objects[0].id)).toBe('native-pa-preview');
});
test('PA lines surface native template incompatibility without presenting ordinary geometry as a calibration',async({page})=>{
 await page.route('**/api/calibrations/prepare',route=>route.fulfill({status:400,json:{error:'PA lines do not yet support context-dependent filament start/end templates'}}));await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('pressure-advance-line');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('alert')).toContainText('context-dependent');expect(await page.evaluate(()=>window.createdCalibration)).toBeUndefined();
});

test('PA pattern batch fields preserve typed separators and submit numeric-list inputs with native defaults',async({page})=>{
 let posted;await page.route('**/api/calibrations/prepare',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{calibration:posted,plan:{inputFormat:'3mf'},objects:[{id:'native-pattern-handle'}]}})});
 await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('pressure-advance-pattern');await expect(page.getByLabel('Calibration speeds',{exact:true})).toHaveValue('');await expect(page.getByLabel('Calibration accelerations',{exact:true})).toHaveValue('');await page.getByLabel('Calibration speeds',{exact:true}).pressSequentially('80,120');await expect(page.getByLabel('Calibration speeds',{exact:true})).toHaveValue('80,120');await page.getByLabel('Calibration accelerations',{exact:true}).fill('1000, 2000');await expect(page.getByText('Complete patterns are placed on additional rectangular plates when needed.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(posted).toMatchObject({mode:'pressure-advance-pattern',start:0,end:.08,step:.005,speeds:['80','120'],accelerations:['1000','2000']});expect(await page.evaluate(()=>window.createdCalibration.plan.inputFormat)).toBe('3mf');
});
test('an individual oversized PA pattern shows its bed constraint without replacing the scene',async({page})=>{
 await page.route('**/api/calibrations/prepare',route=>route.fulfill({status:400,json:{error:'A complete PA pattern does not fit this plate; reduce the PA range or use a larger rectangular bed'}}));await open(page);await page.getByLabel('Calibration test',{exact:true}).selectOption('pressure-advance-pattern');await page.getByRole('button',{name:'Generate calibration'}).click();await expect(page.getByRole('alert')).toContainText('does not fit this plate');expect(await page.evaluate(()=>window.createdCalibration)).toBeUndefined();
});
