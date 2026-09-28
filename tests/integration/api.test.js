import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';

const binary = path.resolve('tests/fixtures/fake-slicer.sh');
const profilesDir = path.resolve('tests/fixtures/presets');
const cube = await readFile('tests/fixtures/cube.stl');
async function setup(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'orca-api-'));
  const app = await createApp({ dataDir, binary, profilesDir, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.shutdown(); await new Promise(resolve=>server.close(resolve)); await rm(dataDir,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const list = await (await fetch(`${base}/api/presets`)).json();
  return {base,dataDir,app,list};
}
async function submit(base, selection, {content=cube,filename='cube.stl',settings={},...fields}={}) {
  const form=new FormData();
  for(const [key,value] of Object.entries({...selection,...fields})) if(value!==null) form.set(key,value);
  form.set('settings', typeof settings==='string'?settings:JSON.stringify(settings));
  form.set('model',new Blob([content]),filename);
  const response=await fetch(`${base}/api/jobs`,{method:'POST',body:form});
  return {status:response.status,job:await response.json()};
}
async function finish(base,id) {
  for(let attempt=0;attempt<200;attempt++) {
    const job=await(await fetch(`${base}/api/jobs/${id}`)).json();
    if(['ready','failed'].includes(job.status))return job;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('Job did not finish');
}

test('native selection flows through upload, typed overrides, status, and G-code download',async t=>{
  const {base,list,dataDir}=await setup(t);
  const selected=await(await fetch(`${base}/api/presets/selection?${new URLSearchParams(list.defaults)}`)).json();
  assert.equal(selected.settings.layer_height,'0.2');
  const {status,job}=await submit(base,list.defaults,{filename:'UPPER.STL',settings:{layer_height:0.12,enable_support:true,sparse_infill_density:25}});
  assert.equal(status,202,job.error);
  const result=await finish(base,job.id);
  assert.equal(result.status,'ready',result.error);
  assert.equal(result.settings.layer_height,'0.12');
  const response=await fetch(`${base}/api/jobs/${job.id}/download`);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/UPPER\.gcode/);
  const gcode=await response.text();
  assert.match(gcode,/machine = Test Printer A/);
  assert.match(gcode,/filament = Test PLA A/);
  assert.match(gcode,/layer_height = 0.12/);
  assert.match(gcode,/enable_support = 1/);
  assert.match(gcode,/sparse_infill_density = 25%/);
  assert.match(gcode,/G1 X20 Y20 Z0.2 E1/);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);
  assert.deepEqual(await readdir(path.join(dataDir,'work')),[]);
});

test('rejects bad file types, empty files, malformed settings, invalid IDs and incompatible presets without leaving uploads',async t=>{
  const {base,list,dataDir}=await setup(t);
  const other=list.printers.find(p=>p.name==='Test Printer B');
  const choices=await(await fetch(`${base}/api/presets?printerId=${other.id}`)).json();
  const invalid=[{filename:'notes.txt'},{content:''},{settings:'{'},{settings:[]},{settings:{ironing:true}},{settings:{layer_height:-1}},{settings:{seam_position:'Aligned'}},{printerId:'../../etc/passwd'},{processId:choices.defaults.processId},{filamentId:null}];
  for(const item of invalid){const result=await submit(base,list.defaults,item);assert.equal(result.status,400,JSON.stringify(item));}
  assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);
  assert.equal((await(await fetch(`${base}/api/jobs`)).json()).length,0);
});

test('preset defaults remain intact when an unrelated setting is overridden',async t=>{
  const {base,list}=await setup(t);
  const fine=list.processes.find(p=>p.name==='Test Fine A');
  const {job,status}=await submit(base,{...list.defaults,processId:fine.id},{settings:{brim_width:7}});
  assert.equal(status,202,job.error);
  const result=await finish(base,job.id);
  assert.equal(result.status,'ready',result.error);
  const gcode=await(await fetch(`${base}/api/jobs/${job.id}/download`)).text();
  assert.match(gcode,/layer_height = 0.12/);
  assert.match(gcode,/initial_layer_print_height = 0.16/);
  assert.match(gcode,/brim_width = 7/);
});

test('simultaneous queued requests retain distinct geometry markers and preset choices',async t=>{
  const {base,list}=await setup(t);
  const other=list.printers.find(p=>p.name==='Test Printer B');
  const b=await(await fetch(`${base}/api/presets?printerId=${other.id}`)).json();
  const created=await Promise.all([submit(base,list.defaults,{content:'solid first\nSLOW_TEST\n'+cube}),submit(base,b.defaults,{content:'solid second\n'+cube})]);
  for(const item of created)assert.equal(item.status,202,item.job.error);
  const results=await Promise.all(created.map(({job})=>finish(base,job.id)));
  for(const job of results)assert.equal(job.status,'ready',job.error);
  const [first,second]=await Promise.all(results.map(async job=>(await fetch(`${base}/api/jobs/${job.id}/download`)).text()));
  assert.match(first,/source = solid first/);assert.match(first,/machine = Test Printer A/);
  assert.match(second,/source = solid second/);assert.match(second,/machine = Test Printer B/);
});

test('surfaces slicer errors and blocks failed-job downloads',async t=>{
  const {base,list}=await setup(t);
  const {job}=await submit(base,list.defaults,{content:'FAIL_TEST\n'+cube});
  const result=await finish(base,job.id);
  assert.equal(result.status,'failed');
  assert.match(result.error,/Intentional fixture slicing failure/);
  assert.equal((await fetch(`${base}/api/jobs/${job.id}/download`)).status,404);
});

test('active jobs cannot be deleted; completed history and output can be deleted',async t=>{
  const {base,list}=await setup(t);
  const {job}=await submit(base,list.defaults,{content:'SLOW_TEST\n'+cube});
  assert.equal((await fetch(`${base}/api/jobs/${job.id}`,{method:'DELETE'})).status,409);
  assert.equal((await finish(base,job.id)).status,'ready');
  assert.equal((await fetch(`${base}/api/jobs/${job.id}`,{method:'DELETE'})).status,204);
  assert.equal((await fetch(`${base}/api/jobs/${job.id}`)).status,404);
  assert.equal((await fetch(`${base}/api/jobs/${job.id}/download`)).status,404);
});

test('health reports missing executable and requests fail before entering queue',async t=>{
  const {base,list}=await setup(t,{binary:'/missing/orca-slicer'});
  const health=await fetch(`${base}/api/health`);
  assert.equal(health.status,503);assert.equal((await health.json()).engine.available,false);
  assert.equal((await submit(base,list.defaults)).status,503);
});

test('missing preset resources report degraded service; unknown API routes return JSON',async t=>{
  const {base}=await setup(t,{profilesDir:'/missing/profiles'});
  const health=await(await fetch(`${base}/api/health`)).json();
  assert.equal(health.presets.available,false);
  const response=await fetch(`${base}/api/no-such-endpoint`);
  assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/json/);
});

test('upload limit rejects oversized data and cleans partial files',async t=>{
  const {base,list,dataDir}=await setup(t,{uploadLimit:100});
  const result=await submit(base,list.defaults);
  assert.equal(result.status,400);assert.match(result.job.error,/size limit/);
  assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);
});


test('embedded 3MF host scripts are rejected before creating a native job',async t=>{
  const {base,list,dataDir}=await setup(t);
  for(const [name,body] of [['Metadata/project_settings.config',JSON.stringify({post_process:['/tmp/never-execute.sh']})],['Metadata/model_settings.config','<config><object id="1"><metadata key="post_process" value="/tmp/never-execute.sh"/></object></config>']]) {
    const archive=zipSync({[name]:strToU8(body)});
    const result=await submit(base,list.defaults,{filename:'project.3mf',content:archive});
    assert.equal(result.status,400);assert.match(result.job.error,/post_process commands are prohibited/);
  }
  assert.deepEqual(await(await fetch(`${base}/api/jobs`)).json(),[]);
  assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);
});
