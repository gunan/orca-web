import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { importNative3MF } from '../../shared/native-project.js';

async function setup(t) {
  const dataDir=await mkdtemp(path.join(tmpdir(),'orca-preflight-'));
  const app=await createApp({dataDir,binary:path.resolve('tests/fixtures/fake-slicer.sh'),profilesDir:path.resolve('tests/fixtures/presets')});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await app.locals.shutdown();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`,catalog=await(await fetch(base+'/api/presets')).json();
  return{base,dataDir,ids:catalog.defaults};
}
test('cross-setting preflight rejects native structural errors before queuing or retaining uploads',async t=>{
  const {base,dataDir,ids}=await setup(t),cube=await readFile('tests/fixtures/cube.stl');
  for(const [settings,printerSettings,key] of [[{outer_wall_line_width:3},{},'outer_wall_line_width'],[{spiral_mode:true,wall_loops:2},{},'wall_loops'],[{}, {use_firmware_retraction:true,wipe:[true]},'use_firmware_retraction']]){
    const form=new FormData();for(const[key,value]of Object.entries(ids))form.set(key,value);form.set('settings',JSON.stringify(settings));form.set('printerSettings',JSON.stringify(printerSettings));form.set('model',new Blob([cube]),'cube.stl');
    const response=await fetch(base+'/api/jobs',{method:'POST',body:form});assert.equal(response.status,400);assert.match((await response.json()).error,new RegExp(key));
  }
  assert.deepEqual(await(await fetch(base+'/api/jobs')).json(),[]);assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);assert.deepEqual(await readdir(path.join(dataDir,'work')),[]);
});
test('native project preflight checks global settings, printable part overrides and native plate vase state',async t=>{
  const {base,dataDir}=await setup(t),original=importNative3MF(await readFile('tests/fixtures/orca-2.4.2-cube.3mf'));
  for(const change of [project=>project.nativeSettings.outer_wall_line_width='3',project=>project.objects[0].native.partSettings.outer_wall_line_width='3',project=>project.plates[0].native.metadata.spiral_mode='true']){
    const project=structuredClone(original);change(project);
    const response=await fetch(base+'/api/jobs/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,useEmbeddedSettings:true})});assert.equal(response.status,400);assert.match((await response.json()).error,/Slicing settings|slicing settings/);
  }
  assert.deepEqual(await(await fetch(base+'/api/jobs')).json(),[]);assert.deepEqual(await readdir(path.join(dataDir,'work')),[]);
});
