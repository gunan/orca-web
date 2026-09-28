import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {prepareNativeTextCreation,applyNativeTextCreation} from '../../shared/native-text-creation.js';
import {prepareNativeSvgCreation,applyNativeSvgCreation} from '../../shared/native-svg.js';
import {addTextToScene,textSurfaceAnchor} from '../../shared/text-geometry.js';
import {reconcileNativeInstanceEdits} from '../../shared/native-instance-edits.js';
import {assertInstanceFamilies} from '../../shared/native-instances.js';
import {fixture} from '../fixtures/native-instance-project.js';
import {testFont} from '../fixtures/text-font.js';
const mesh={vertices:[[0,0,-.015],[2,0,-.015],[0,2,-.015],[0,0,.985]],triangles:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],scale:1e-6,healed:true};
const svg={name:'shape.svg',source:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H2V2H0Z"/></svg>'};
for(const kind of ['text','svg','legacy'])for(const linked of [false,true])test(`${kind} attachment preserves ${linked?'multiple linked':'one imported'} native object identity through edit and native export`,async()=>{
 const p=linked?fixture({parts:1}):importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
 const original=structuredClone(p),selectedId=p.objects[0].id,family=p.objects[0].native.instanceFamily;
 assert.ok(family);
 for(const mode of kind==='legacy'?['emboss','engrave']:['emboss','engrave','modifier']){
  const request={objects:p.objects,selectedId,mode,svg};
  const created=kind==='text'?applyNativeTextCreation(p.objects,prepareNativeTextCreation(request),mesh):kind==='svg'?applyNativeSvgCreation(p.objects,prepareNativeSvgCreation(request),mesh):addTextToScene({objects:p.objects,selectedId,font:testFont(),options:{mode,text:'O',size:3,depth:1,...textSurfaceAnchor(p.objects,selectedId)}});
  assert.equal(created.text.native.instanceFamily,family,'new attached volume must explicitly inherit object identity');
  const result=reconcileNativeInstanceEdits(p,{...p,objects:created.objects});
  assertInstanceFamilies(result.objects);
  assert.equal(result.objects.length,p.objects.length*2);
  assert.ok(result.objects.every(o=>o.native.instanceFamily===family));
  const restored=importNative3MF(exportNative3MF(result));
  assert.equal(restored.objects.length,result.objects.length);
  assert.equal(new Set(restored.objects.map(o=>o.native.instanceFamily)).size,1);
  assert.deepEqual(p,original,'creation and propagation cannot mutate prior history');
 }
});
test('standalone native creations stay independent of the selected native family',()=>{
 const p=fixture({parts:1}),selectedId=p.objects[0].id;
 for(const kind of ['text','svg']){
  const request={objects:p.objects,selectedId,mode:'standalone',svg};
  const created=kind==='text'?applyNativeTextCreation(p.objects,prepareNativeTextCreation(request),mesh):applyNativeSvgCreation(p.objects,prepareNativeSvgCreation(request),mesh);
  assert.equal(created.text.native.instanceFamily,undefined);
  const result=reconcileNativeInstanceEdits(p,{...p,objects:created.objects});
  assert.equal(result.objects.length,3);assert.equal(result.objects.filter(o=>o.native.instanceFamily==='family').length,2);
 }
});
