import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createCalibrationSessions } from '../../server/calibration-sessions.js';
import { createPresetCatalog } from '../../server/presets.js';
import { prepareCalibrationModel } from '../../server/calibration.js';
import { runSlicer } from '../../server/slicer.js';
import { createCalibrationPlan, applyCalibrationOverrides, applyCalibrationGcode } from '../../shared/calibration.js';
import { analyzeMesh, meshBounds, exportSTL, dropToBed } from '../../shared/geometry.js';
const binary = process.env.ORCA_SLICER_BIN || '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const nativeResources = process.env.ORCA_RESOURCES_DIR || '/Applications/OrcaSlicer.app/Contents/Resources';
const motions = text => text.split(/\r?\n/).filter(line => /^G[0123]\s/.test(line));

for (const request of [{ mode:'temperature',start:230,end:225,step:5 }, {mode:'pressure-advance',start:0,end:0.004,step:0.002}, {mode:'input-shaping-frequency',testModel:'fast',shaperType:'auto',frequencyStartX:15,frequencyEndX:110,frequencyStartY:20,frequencyEndY:100,damping:.15}, {mode:'input-shaping-damping',testModel:'ringing',shaperType:'auto',frequencyX:30,frequencyY:40,start:0,end:.4}]) {
  test(`real OrcaSlicer 2.4.2 ${request.mode} resource becomes a sliced calibration with an effective layer schedule`, {timeout:120000}, async t=>{
    const directory=await mkdtemp(path.join(tmpdir(),'orca-calibration-native-'));
    t.after(()=>rm(directory,{recursive:true,force:true}));
    const catalog=await createPresetCatalog({binary});
    const ids=catalog.list().defaults;
    const selection=await catalog.resolveSelection(ids);
    const plan=createCalibrationPlan(request,selection);
    const sessions=createCalibrationSessions({binary,resourcesDir:nativeResources,catalog});
    const app=express();app.use('/api/calibrations',sessions.router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
    const server=app.listen(0,'127.0.0.1');
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
    t.after(async()=>{await sessions.shutdown();await new Promise(resolve=>server.close(resolve))});
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/calibrations/prepare`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...ids,...request})});
    const prepared=await response.json();assert.equal(response.status,200,JSON.stringify(prepared));
    assert.equal(prepared.objects.length,1);
    const mesh=prepared.objects[0], bounds=meshBounds(mesh), analysis=analyzeMesh(mesh);
    assert.equal(analysis.manifold,true,JSON.stringify(analysis));
    assert.ok(Math.abs(bounds.size[2]-plan.height)<0.003,JSON.stringify(bounds));
    const settings=applyCalibrationOverrides(selection,plan);
    for(const scope of ['printer','process','filament']) await writeFile(path.join(directory,`${scope}.json`),JSON.stringify(settings[scope]));
    const inputPath=path.join(directory,'calibration.stl');
    await writeFile(inputPath,new Uint8Array(exportSTL([dropToBed(mesh)])));
    const validated=await sessions.validateUpload({calibration:prepared.calibration,ids,inputPath,overrides:{}});
    assert.deepEqual(validated.plan.request,plan.request);
    await assert.rejects(sessions.validateUpload({calibration:prepared.calibration,ids:{...ids,printerId:'changed'},inputPath,overrides:{}}),/preset selection changed/);
    await mkdir(path.join(directory,'config'));await mkdir(path.join(directory,'output'));
    await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--outputdir',path.join(directory,'output'),'--datadir',path.join(directory,'config'),'--load-settings',`${path.join(directory,'printer.json')};${path.join(directory,'process.json')}`,'--load-filaments',path.join(directory,'filament.json'),path.join(directory,'calibration.stl')],{cwd:directory,timeoutMs:60000,signal:t.signal});
    const outputs=(await readdir(path.join(directory,'output'))).filter(name=>name.endsWith('.gcode'));
    assert.equal(outputs.length,1);
    const raw=await readFile(path.join(directory,'output',outputs[0]),'utf8');
    const result=applyCalibrationGcode(raw,plan);
    assert.equal(result.summary.layers,Number(raw.match(/^; total layer number: (\d+)/m)[1]));
    assert.deepEqual(motions(result.gcode),motions(raw),'Layer parameter changes must leave sliced geometry and extrusion untouched');
    const inserted=result.gcode.split('\n').filter(line=>line.includes('; Orca Web calibration '));
    assert.equal(inserted.length,result.summary.layers);
    if(request.mode==='temperature') {
      assert.match(inserted[0],/^M104 S230 /);assert.match(inserted.at(-1),/^M104 S225 /);
      assert.ok(inserted.some(line=>/^M104 S225 /.test(line)));
      assert.match(raw,/nozzle_temperature = 230/);
    } else if (request.mode === 'pressure-advance') {
      assert.match(inserted[0],/^M900 K0 /);
      assert.ok(inserted.some(line=>/^M900 K0\.002 /.test(line)));
      assert.ok(inserted.some(line=>/^M900 K0\.004 /.test(line)));
      assert.equal(settings.process.wall_loops,'2');assert.equal(settings.process.top_shell_layers,'0');
    }
    if (request.mode.startsWith('input-shaping-')) {
      assert.equal(result.summary.scheduleLayers,300);assert.equal(result.summary.closingLayer,true);
      assert.equal(settings.process.spiral_mode,'1');assert.equal(settings.printer.input_shaping_emit,'0');
      assert.match(raw,/; spiral_mode = 1/);assert.match(raw,/; outer_wall_speed = 200/);assert.match(raw,/; default_acceleration = 20000/);
      const commands=result.gcode.split('\n').filter(line=>line.startsWith('M593'));
      assert.equal(inserted.at(-2).split(' ;')[0],inserted.at(-1).split(' ;')[0],'Closing pass must duplicate the final native schedule value');
      if(request.mode==='input-shaping-frequency'){assert.ok(commands.some(line=>line.startsWith('M593 X F15.00')));assert.ok(commands.some(line=>line.startsWith('M593 Y F100.00')));assert.ok(commands.some(line=>line.startsWith('M593 D0.150')));}
      else {assert.ok(commands.some(line=>line.startsWith('M593 X F30.00')));assert.ok(commands.some(line=>line.startsWith('M593 Y F40.00')));assert.ok(commands.some(line=>line.startsWith('M593 D0.400')));}
    }
    t.diagnostic(`${request.mode}: ${analysis.triangles} closed triangles, ${bounds.size.map(n=>n.toFixed(3)).join(' × ')} mm, ${result.summary.layers} layers with actual calibration commands. No printer was contacted.`);
  });
}
