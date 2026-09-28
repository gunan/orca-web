import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { zipSync,strToU8 } from 'fflate';
import { createNativeProjectService } from '../../server/native-projects.js';
import { importNative3MF } from '../../shared/native-project.js';
import { extractBoundedZip } from '../../shared/import-limits.js';
import { fixtureCatalog } from '../fixtures/native-project-catalog.js';
const fixture=await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url));

async function start(t){
  const service=createNativeProjectService({catalog:fixtureCatalog(importNative3MF(fixture))}),app=express();
  app.use('/api/projects',service.router);app.use(express.json({limit:'1mb'}));app.use((error,_req,res,_next)=>res.status(error.status||400).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  return`http://127.0.0.1:${server.address().port}`;
}
function form(bytes,name='native.3mf'){const data=new FormData();data.append('model',new Blob([bytes]),name);return data;}

test('native project routes import matching settings and export a project larger than the generic JSON limit',async t=>{
  const url=await start(t),response=await fetch(url+'/api/projects/import',{method:'POST',body:form(fixture)});assert.equal(response.status,200);const imported=await response.json();assert.equal(imported.matches.printer.status,'matched');
  imported.project.metadata.description='Project description. '.repeat(60000);
  const exported=await fetch(url+'/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:imported.project,useEmbeddedSettings:true,allPlates:false})});assert.equal(exported.status,200,await(exported.status!==200?exported.text():Promise.resolve('')));assert.match(exported.headers.get('content-disposition'),/attachment/);
  const project=importNative3MF(new Uint8Array(await exported.arrayBuffer()));assert.equal(project.nativeSettings.layer_height,'0.16');assert.equal(project.metadata.description.length,imported.project.metadata.description.length);assert.equal(project.objects.length,1);
});

test('native project routes reject unsafe embedded commands, wrong formats and invalid process overrides',async t=>{
  const url=await start(t),files=extractBoundedZip(fixture);files['Metadata/project_settings.config']=strToU8(JSON.stringify({post_process:['/tmp/never-execute.sh']}));
  const rejected=await fetch(url+'/api/projects/import',{method:'POST',body:form(zipSync(files))});assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/post_process/);
  const wrong=await fetch(url+'/api/projects/import',{method:'POST',body:form(fixture,'model.stl')});assert.equal(wrong.status,400);
  const project=importNative3MF(fixture);project.objects[0].native.partSettings={post_process:['/tmp/never-execute.sh']};
  const exported=await fetch(url+'/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,useEmbeddedSettings:true})});assert.equal(exported.status,400);assert.match((await exported.json()).error,/Unsupported part process setting/);
});


test('fresh native GUI archive imports and exports through strict HTTP project validation',async t=>{
 const url=await start(t),bytes=await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url));
 const response=await fetch(url+'/api/projects/import',{method:'POST',body:form(bytes)});
 assert.equal(response.status,200);const imported=await response.json();
 const exported=await fetch(url+'/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:imported.project,useEmbeddedSettings:true,allPlates:false})});
 assert.equal(exported.status,200,await(exported.status!==200?exported.text():Promise.resolve('')));
 const project=importNative3MF(new Uint8Array(await exported.arrayBuffer()));
 assert.deepEqual(project.nativeSettings.filament_colour_type,['1']);assert.deepEqual(project.nativeSettings.filament_multi_colour,['#F2754E']);
 assert.equal(project.objects.length,1);assert.equal(project.nativeSettings.layer_height,'0.16');
});

// Native ObjectList Paste can store an object option as part compensation. The
// strict archive API preserves that native data; executable options stay invalid.
test('native part compensation options survive strict HTTP export without allowing host commands',async t=>{
 const url=await start(t),project=importNative3MF(fixture);project.objects[0].native.partSettings={layer_height:'.1',wall_loops:'5'};
 const response=await fetch(url+'/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,useEmbeddedSettings:true})});assert.equal(response.status,200);
 const restored=importNative3MF(new Uint8Array(await response.arrayBuffer()));assert.equal(restored.objects[0].native.partSettings.layer_height,'0.1');assert.equal(restored.objects[0].native.partSettings.wall_loops,'5');
});
