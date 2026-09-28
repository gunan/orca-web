import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nativeManipulationDisplay,nativeManipulationInput} from '../../shared/native-manipulation-units.js';
const reference=JSON.parse(readFileSync(new URL('../fixtures/native-manipulation-units-reference.json',import.meta.url)));
for(const sample of reference.cases.filter(sample=>sample.input.valid))test(`native manipulation conversion: ${sample.name}`,()=>{
 for(const key of ['position','size','rotation','absolute_rotation','scale'])assert.deepEqual(sample.input[key].map(value=>nativeManipulationDisplay(key,value,sample.input.imperial)),sample.expected[key]);
 for(const edit of sample.expected.edits){const input=sample.input.edits.find(value=>value.key===edit.key&&value.axis===edit.axis);assert.equal(nativeManipulationInput(edit.key,input.value,sample.input.imperial),edit.value);}
});
test('conversion reference records pinned unchanged methods and generator provenance',()=>{
 assert.equal(reference.commit,'8500fcdccaa10b5099ac20d252af3a7c560046f1');
 for(const [file,key] of [['../fixtures/native-manipulation-units-reference.cpp','referenceSha256'],['../../scripts/reference/build-manipulation-units-reference.py','generatorSha256']])assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),reference[key]);
 assert.match(reference.sourceSha256,/^[a-f0-9]{64}$/);assert.match(reference.binarySha256,/^[a-f0-9]{64}$/);
});
test('unit conversions reject invalid numeric values and unknown manipulation fields',()=>{
 for(const operation of [nativeManipulationDisplay,nativeManipulationInput]){
  for(const value of [NaN,Infinity,-Infinity,null,undefined,'1'])assert.throws(()=>operation('position',value,true),/Invalid manipulation/);
  assert.throws(()=>operation('filament',1,true),/Invalid manipulation/);
 }
 assert.notEqual(nativeManipulationDisplay('position',25.4,true),1);
 assert.equal(nativeManipulationInput('position',1,true),25.4);
});
