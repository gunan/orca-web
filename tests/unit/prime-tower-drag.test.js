import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import {constrainPrimeTowerDrag} from '../../shared/prime-tower-drag.js';
import {prepareNativePrimeTower,validateNativePrimeTowerResult} from '../../shared/native-prime-tower.js';
import {towerProject,towerSettings} from '../fixtures/native-prime-tower-input.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/native-tower-drag-reference.json',import.meta.url)));
for(const c of ref.cases)test(`original native tower drag arithmetic: ${c.name}`,()=>{
 const before=structuredClone(c.expected);c.request.displacements.forEach((v,i)=>assert.deepEqual(constrainPrimeTowerDrag(c.expected,v),c.expected.translations[i]));assert.deepEqual(c.expected,before);
});
test('drag needs native context and rejects invalid displacement',()=>{
 const r=ref.cases[0].expected;assert.throws(()=>constrainPrimeTowerDrag({...r,dragContext:null},[0,0]),/unavailable/);
 for(const delta of [null,[],[0],[NaN,0],[Infinity,0],[1000001,0]])assert.throws(()=>constrainPrimeTowerDrag(r,delta),/Invalid/);
});
test('the server opts into native drag context from effective settings and validates supplied context',()=>{
 const project=towerProject(),request=prepareNativePrimeTower(project,{...towerSettings,prime_tower_brim_width:'7.25'},{includeDragContext:true});assert.deepEqual(request.dragContext,{brimWidth:7.25});assert.equal(prepareNativePrimeTower(project,towerSettings).dragContext,undefined);
 const result={format:'orca-native-prime-tower',version:1,sourceRevision:ref.sourceCommit,plateId:project.activePlateId,...ref.cases[0].expected};assert.equal(validateNativePrimeTowerResult(result,request),result);
 for(const change of [{margin:-1},{scalingFactor:0},{plateBounds:[[10,20],[0,0]]},{origin:[Infinity,0]}])assert.throws(()=>validateNativePrimeTowerResult({...result,dragContext:{...result.dragContext,...change}},request),/Invalid/);
});
