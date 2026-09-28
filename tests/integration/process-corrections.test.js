import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../../server/app.js';
import {createPresetCatalog} from '../../server/presets.js';
import {processSettingsState,acceptProcessCorrectionChoices} from '../../shared/process-settings-state.js';
import {embeddedProjectSelection,nativeProjectRequest} from '../../shared/native-project-client.js';
import {importNative3MF} from '../../shared/native-project.js';

const binary=path.resolve('tests/fixtures/fake-slicer.sh'),profilesDir=path.resolve('tests/fixtures/presets');
const cube=await readFile('tests/fixtures/cube.stl'),nativeCube=await readFile('tests/fixtures/orca-2.4.2-cube.3mf');
async function setup(t){
 const dataDir=await mkdtemp(path.join(tmpdir(),'orca-process-decisions-')),base=await createPresetCatalog({profilesDir});
 const catalog={...base,getPreset(id,type){const preset=base.getPreset(id,type);if(type==='process'){preset.enforce_support_layers='7';for(const key of ['outer_wall_speed','inner_wall_speed','sparse_infill_speed'])if(Array.isArray(preset[key]))preset[key]=preset[key][0];}return preset}};
 const app=await createApp({binary,profilesDir,dataDir,catalog}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await app.locals.shutdown();await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true})});
 const url=`http://127.0.0.1:${server.address().port}`,list=await(await fetch(url+'/api/presets')).json();
 return{url,list,dataDir,app};
}
function chooseVase(resolved){
 const overrides={spiral_mode:true},group=processSettingsState(resolved,overrides).correctionPlan.groups.find(item=>item.id==='process:spiral-mode');
 assert.ok(group.changes.some(item=>item.key==='enforce_support_layers'));
 return acceptProcessCorrectionChoices(resolved,overrides,[{id:group.id,signature:group.signature,choice:'apply'}]);
}
async function upload(url,ids,settings,decisions){
 const form=new FormData();for(const [key,value]of Object.entries(ids))form.set(key,value);
 form.set('settings',JSON.stringify(settings));form.set('processCorrectionDecisions',JSON.stringify(decisions));form.set('model',new Blob([cube]),'cube.stl');
 const response=await fetch(url+'/api/jobs',{method:'POST',body:form});return{status:response.status,body:await response.json()};
}
async function result(app,url,id){await app.locals.waitForIdle();const job=await(await fetch(`${url}/api/jobs/${id}`)).json();assert.equal(job.status,'ready',job.error);return(await fetch(`${url}/api/jobs/${id}/download`)).text();}

test('multipart slicing validates hidden native decisions and writes only the accepted source-derived value',async t=>{
 const {url,list,app,dataDir}=await setup(t),resolved=await(await fetch(`${url}/api/presets/selection?${new URLSearchParams(list.defaults)}`)).json();
 assert.equal(resolved.nativeProcessSettings.enforce_support_layers,'7');assert.equal(resolved.settings.enforce_support_layers,undefined);
 const accepted=chooseVase(resolved);assert.equal(accepted.overrides.enforce_support_layers,undefined);
 const response=await upload(url,list.defaults,accepted.overrides,accepted.processCorrectionDecisions);assert.equal(response.status,202,response.body.error);
 assert.deepEqual(response.body.processCorrectionDecisions,accepted.processCorrectionDecisions);assert.match(await result(app,url,response.body.id),/enforce_support_layers = 0/);
 assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);assert.deepEqual(await readdir(path.join(dataDir,'work')),[]);
});

test('missing, stale, malformed and injected process decisions fail without jobs or abandoned uploads',async t=>{
 const {url,list,dataDir}=await setup(t),resolved=await(await fetch(`${url}/api/presets/selection?${new URLSearchParams(list.defaults)}`)).json(),accepted=chooseVase(resolved),decision=accepted.processCorrectionDecisions[0];
 for(const decisions of [[],null,{},[{...decision,signature:'old'}],[{...decision,value:999}],[{...decision,id:'machine:spiral-mode'}]]){
  const response=await upload(url,list.defaults,accepted.overrides,decisions);assert.equal(response.status,400,JSON.stringify(decisions));
 }
 const arbitrary=await upload(url,list.defaults,{...accepted.overrides,enforce_support_layers:0},[]);assert.equal(arbitrary.status,400);assert.match(arbitrary.body.error,/Unsupported process setting: enforce_support_layers/);
 assert.deepEqual(await(await fetch(url+'/api/jobs')).json(),[]);assert.deepEqual(await readdir(path.join(dataDir,'uploads')),[]);assert.deepEqual(await readdir(path.join(dataDir,'work')),[]);
});

test('catalog-native projects preserve the decision after canonical preset flattening',async t=>{
 const {url,list,app}=await setup(t),resolved=await(await fetch(`${url}/api/presets/selection?${new URLSearchParams(list.defaults)}`)).json(),accepted=chooseVase(resolved);
 const project=importNative3MF(nativeCube);project.useEmbeddedSettings=false;project.ids=list.defaults;project.filamentIds=[list.defaults.filamentId];project.overrides=accepted.overrides;project.processCorrectionDecisions=accepted.processCorrectionDecisions;
 const response=await fetch(url+'/api/jobs/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(nativeProjectRequest(project))}),job=await response.json();
 assert.equal(response.status,202,job.error);assert.match(await result(app,url,job.id),/enforce_support_layers = 0/);
});

test('embedded native projects replay the same hidden decision before producing slicing and export bytes',async t=>{
 const {url,app}=await setup(t),project=importNative3MF(nativeCube);project.useEmbeddedSettings=true;project.nativeSettings.enforce_support_layers='7';
 const accepted=chooseVase(embeddedProjectSelection(project));project.overrides=accepted.overrides;project.processCorrectionDecisions=accepted.processCorrectionDecisions;
 const request=nativeProjectRequest(project),send=endpoint=>fetch(url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
 const exported=await send('/api/projects/export');assert.equal(exported.status,200,exported.status===200?'':await exported.text());const reimported=importNative3MF(new Uint8Array(await exported.arrayBuffer()));
 assert.equal(reimported.nativeSettings.enforce_support_layers,'0');assert.equal(reimported.nativeSettings.wall_loops,'1');assert.equal(project.nativeSettings.enforce_support_layers,'7');
 const response=await send('/api/jobs/project'),job=await response.json();assert.equal(response.status,202,job.error);assert.match(await result(app,url,job.id),/enforce_support_layers = 0/);
 request.processCorrectionDecisions=[{...accepted.processCorrectionDecisions[0],signature:'stale'}];
 for(const endpoint of ['/api/projects/export','/api/jobs/project']){const invalid=await send(endpoint);assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/changed/)}
});
