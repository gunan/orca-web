import { test, expect } from '@playwright/test';
// Browser API fakes only; this suite never connects to a printer.
async function fakeDevices(page, { existing = true, type = 'moonraker' } = {}) {
  const calls = [], device = { id:'fake-device', name:'Test printer', type, url:'http://printer.invalid/', cameraUrl:'', hasApiKey:true };
  const state = { connected:true, ready:true, busy:false, printing:false, paused:false, state:'standby', filename:null, progress:null, capabilities:['upload','print','pause','resume','cancel','home','jog','hotend','bed',...(type==='moonraker'?['fan']:[])], temperature:{hotend:{actual:24.5,target:0},bed:{actual:23,target:0}},fan:0 };
  let devices = existing ? [device] : [];
  await page.route('**/api/jobs', route => route.fulfill({json:[{id:'job-ready',status:'ready',filename:'cube.stl',createdAt:'2026-09-26T00:00:00Z',printer:'Reference MK4',profile:'Standard',filament:'PLA'}]}));
  await page.route('**/api/devices**', async route => {
    const request=route.request(), method=request.method(), url=new URL(request.url());
    if(method==='GET' && url.pathname.endsWith('/status')) return route.fulfill({json:state});
    if(method==='GET') return route.fulfill({json:devices});
    const body=method==='DELETE'?null:request.postDataJSON(); calls.push({method,path:url.pathname,body});
    if(method==='DELETE') {devices=[];return route.fulfill({status:204});}
    if(url.pathname.endsWith('/upload')) return route.fulfill({json:{filename:'cube.gcode',printRequested:body.print===true,result:{}}});
    if(url.pathname.endsWith('/command')) return route.fulfill({json:{}});
    const saved={...device,...body,hasApiKey:Boolean(body.apiKey ?? device.hasApiKey)};delete saved.apiKey;devices=[saved];return route.fulfill({status:method==='POST'?201:200,json:saved});
  });
  await page.goto('/'); await expect(page.getByLabel('Layer height',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Device',exact:true}).click();
  if(existing) await expect(page.getByTestId('printer-state')).toHaveText('standby');
  return {calls,state};
}

test('connection form saves typed configuration and preserves a stored API key when editing',async({page})=>{
  const {calls}=await fakeDevices(page,{existing:false});
  await page.getByRole('button',{name:'Add printer',exact:true}).click();
  await page.getByLabel('Printer connection name').fill('New printer');
  await page.getByLabel('Printer connector').selectOption('octoprint');
  await page.getByLabel('Printer URL',{exact:true}).fill('http://printer.invalid');
  await page.getByLabel('Printer API key').fill('fixture-key');
  await page.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(page.getByTestId('printer-state')).toHaveText('standby');
  expect(calls[0].body).toMatchObject({name:'New printer',type:'octoprint',apiKey:'fixture-key'});
  await page.getByRole('button',{name:'Edit connection',exact:true}).click();
  await expect(page.getByLabel('Printer API key')).toHaveValue('');
  await page.getByLabel('Printer connection name').fill('Renamed printer');
  await page.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Renamed printer',exact:true})).toBeVisible();
  expect(calls[1].body.apiKey).toBeUndefined();
});

test('uploads and print starts show target and job details and require the chosen confirmation',async({page})=>{
  const {calls}=await fakeDevices(page);
  await page.getByLabel('Sliced job to upload').selectOption('job-ready');
  await page.getByRole('button',{name:'Upload only',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Confirm printer action'});
  await expect(dialog).toContainText('Reference MK4');
  expect(calls).toHaveLength(0);
  await dialog.getByRole('button',{name:'Upload file',exact:true}).click();
  await expect(page.getByText('cube.gcode uploaded to Test printer.',{exact:true})).toBeVisible();
  expect(calls[0].body).toEqual({jobId:'job-ready',print:false,confirmed:true});
  await expect(page.getByRole('button',{name:'Upload and print',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Upload and print',exact:true}).click();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(calls).toHaveLength(1);
  await page.getByRole('button',{name:'Upload and print',exact:true}).click();
  await dialog.getByRole('button',{name:'Start print',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  expect(calls[1].body).toEqual({jobId:'job-ready',print:true,confirmed:true});
});

test('status capabilities and active print state gate motion, heaters, pause and resume',async({page})=>{
  const {calls,state}=await fakeDevices(page,{type:'octoprint'});
  await expect(page.getByTestId('hotend-temperature')).toHaveText('24.5 °C');
  await expect(page.getByRole('button',{name:'Set fan',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Home X',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm action'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(calls[0].body).toEqual({action:'home',axes:['x'],confirmed:true});
  state.busy=true;state.printing=true;state.state='printing';state.progress=.25;
  await page.getByRole('button',{name:'Refresh status',exact:true}).click();
  await expect(page.getByTestId('printer-state')).toHaveText('printing');
  await expect(page.getByRole('button',{name:'Home X',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeDisabled();
  await expect(page.getByRole('progressbar',{name:'Print progress'})).toHaveAttribute('value','0.25');
});

test('failed status disables commands and deleting a connection needs confirmation',async({page})=>{
  const {calls}=await fakeDevices(page);
  await page.route('**/api/devices/fake-device/status',route=>route.fulfill({status:502,json:{error:'Printer request timed out.'}}));
  await page.getByRole('button',{name:'Refresh status',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Printer request timed out.');
  await expect(page.getByRole('button',{name:'Home X',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Remove connection',exact:true}).click();
  expect(calls).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button',{name:'Remove connection',exact:true}).click();
  await expect(page.getByText('Printer connection removed.',{exact:true})).toBeVisible();
  expect(calls[0].method).toBe('DELETE');
});
