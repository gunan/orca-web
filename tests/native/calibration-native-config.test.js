import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, defaultBinary } from '../../server/app.js';
import { createPresetCatalog } from '../../server/presets.js';
import { exportSTL } from '../../shared/geometry.js';
import { importNative3MF } from '../../shared/native-project.js';

const binary = process.env.ORCA_SLICER_BIN || defaultBinary;
const resourcesDir = process.env.ORCA_RESOURCES_DIR || '/Applications/OrcaSlicer.app/Contents/Resources';
async function api(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-calibration-native-config-'));
  const catalog = await createPresetCatalog({binary, resourcesDir});
  const printer = catalog.list().printers.find(item => item.name === 'Bambu Lab X1 Carbon 0.4 nozzle');
  assert.ok(printer, 'Installed Bambu X1C preset is required');
  const choices = catalog.list({printerId:printer.id});
  const process = choices.processes.find(item => item.name === '0.12mm High Quality @BBL X1C');
  assert.ok(process, 'Installed X1C process fixture is required');
  const ids = {...choices.defaults, processId:process.id};
  assert.deepEqual(catalog.resolveSelection(ids).process.bridge_speed, ['50','50'], 'The actual bundled process must retain its array-shaped scalar input');
  const app = await createApp({catalog, binary, resourcesDir, dataDir:directory});
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject) => {server.once('listening',resolve);server.once('error',reject);});
  t.after(async () => {await app.locals.shutdown();await new Promise(resolve => server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body) {
    const response = await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const data = await response.json();assert.ok(response.ok, JSON.stringify(data));return data;
  }
  return {app, ids, post, base};
}
for (const request of [{mode:'temperature',start:230,end:225,step:5},{mode:'pressure-advance',start:0,end:.004,step:.002},{mode:'flow-ratio',method:'coarse',pattern:'monotonic'}]) {
  test(`native-normalized X1C ${request.mode} calibration preserves source scalar meaning through preparation, validation and actual output`, {timeout:120000}, async t => {
    const context = await api(t);
    const selected = await (await fetch(`${context.base}/api/presets/selection?${new URLSearchParams(context.ids)}`)).json();
    assert.equal(selected.nativeProcessSettings.bridge_speed, '50');
    assert.equal(selected.nativeProcessSettings.gcode_comments,'0','Source preset uses native Bambu reserved tags independently of ordinary comments');
    const prepared = await context.post('/api/calibrations/prepare', {...context.ids,...request});
    let job;
    if (request.mode !== 'flow-ratio') {
      const form = new FormData();
      for (const [key,value] of Object.entries(context.ids)) form.set(key,value);
      form.set('model',new Blob([exportSTL(prepared.objects)]),'calibration.stl');
      form.set('calibration',JSON.stringify(prepared.calibration));form.set('settings','{}');form.set('preservePosition','true');
      const response = await fetch(`${context.base}/api/jobs`,{method:'POST',body:form});job = await response.json();assert.equal(response.status,202,JSON.stringify(job));
    } else {
      const body = {calibration:prepared.calibration,ids:context.ids,objects:prepared.objects};
      const response = await fetch(`${context.base}/api/calibrations/project`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      assert.equal(response.status,200,await response.clone().text());
      const archive = importNative3MF(new Uint8Array(await response.arrayBuffer()));
      assert.equal(archive.nativeSettings.bridge_speed,'50');
      assert.equal(archive.objects.length,9);
      for (const specimen of prepared.plan.specimens) assert.equal(archive.objects.find(object=>object.name===specimen.name).native.objectSettings.print_flow_ratio,String(specimen.multiplier));
      job = await context.post('/api/jobs/calibration',body);
    }
    await context.app.locals.waitForIdle();
    const completed = await (await fetch(`${context.base}/api/jobs/${job.id}`)).json();assert.equal(completed.status,'ready',completed.error);
    const code = await (await fetch(`${context.base}/api/jobs/${job.id}/download`)).text();
    assert.match(code,/^; CHANGE_LAYER$/m);assert.match(code,/^; Z_HEIGHT: /m);assert.match(code,/^; FEATURE: /m);
    assert.match(code,/^; bridge_speed = 50\r?$/m);
    assert.match(code,/^; printer_settings_id = Bambu Lab X1 Carbon 0\.4 nozzle\r?$/m);
    assert.ok(code.split('\n').filter(line=>/^G[0123]\s/.test(line)).length>(request.mode==='pressure-advance'?200:1000));
    if (request.mode === 'temperature') {
      const commands=code.split('\n').filter(line=>line.includes('; Orca Web calibration temperature, layer '));
      assert.equal(commands.length,completed.calibrationSummary.layers);assert.match(commands[0],/^M104 S230 /);assert.match(commands.at(-1),/^M104 S225 /);
    } else if(request.mode==='pressure-advance') {
      const commands=code.split('\n').filter(line=>line.includes('; Orca Web calibration pressure-advance, layer '));
      assert.equal(commands.length,completed.calibrationSummary.layers);assert.match(commands[0],/^M900 K0 L1000 M10 /);assert.ok(commands.some(line=>line.startsWith('M900 K0.002 L1000 M10 ')));
    } else {
      assert.equal(completed.calibrationSummary.specimenCount,9);
      for (const specimen of prepared.plan.specimens) assert.ok(code.includes(`; printing object ${specimen.name} id:`),specimen.name);
    }
    t.diagnostic(`${request.mode}: actual bundled scalar array ['50','50'] becomes native scalar50; generated calibration output and bound project/token validation pass. No printer contacted.`);
  });
}
