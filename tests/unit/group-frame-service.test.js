import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { strFromU8 } from 'fflate';
import { importNative3MF } from '../../shared/native-project.js';
import { extractBoundedZip } from '../../shared/import-limits.js';
import { createNativeProjectService } from '../../server/native-projects.js';
import { updateSceneTransform } from '../../shared/scene-object-operations.js';
import { fixtureCatalog } from '../fixtures/native-project-catalog.js';

test('server validates and preserves shared editing frames in web metadata while native geometry stays baked',async()=>{
  const base=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),service=createNativeProjectService({catalog:fixtureCatalog(base)}),imported=await service.importArchive(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
  const body=imported.project.objects[0],hole={...structuredClone(body),id:'hole',name:'Hole',scale:[.4,.4,1],native:{...body.native,partType:'negative_part'}};
  imported.project.objects=updateSceneTransform([body,hole],body.id,{position:[50,50,0],rotation:[0,0,30]});
  const prepared=await service.prepare({project:imported.project,useEmbeddedSettings:true}),web=JSON.parse(strFromU8(extractBoundedZip(prepared.bytes)['Metadata/orca-web.json']));
  assert.deepEqual(prepared.project.objects[0].native.groupTransform,imported.project.objects[0].native.groupTransform);assert.deepEqual(web.objects[1].native.groupTransform,web.objects[0].native.groupTransform);
  const native=importNative3MF(prepared.bytes);assert.equal(native.objects.length,2);assert.ok(native.objects.every(object=>object.native.groupTransform===undefined));
  imported.project.objects[0].native.groupTransform.scale=[0,1,1];await assert.rejects(service.prepare({project:imported.project,useEmbeddedSettings:true}),/object scale/);
});
