import test from 'node:test';import assert from 'node:assert/strict';
import {validateProject} from '../../shared/project.js';
import {prepareNativePrimeTower} from '../../shared/native-prime-tower.js';
import {towerIdentityCases} from '../fixtures/native-tower-identity-input.js';
for(const c of towerIdentityCases())test(`tower request keeps distinct native models: ${c.name}`,()=>{
 validateProject(c.project);const before=structuredClone(c.project),request=prepareNativePrimeTower(c.project,c.settings);assert.deepEqual(c.project,before);assert.equal(request.objects.length,2);assert.deepEqual(request.objects.map(o=>o.parts[0].settings.extruder),c.project.objects.map(o=>String(o.filamentSlot)));assert.deepEqual(request.objects.map(o=>o.instances.length),[1,1]);assert.equal(new Set(request.objects.map(o=>o.id)).size,2);
 for(const id of request.objects.flatMap(o=>[o.id,...o.instances.map(i=>i.id)])){assert.ok(id.length>0);assert.ok(Buffer.byteLength(id)<=256);assert.equal(id.includes('\0'),false);}
 assert.deepEqual(request,prepareNativePrimeTower(c.project,c.settings));
});
