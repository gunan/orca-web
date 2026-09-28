import test from 'node:test';import assert from 'node:assert/strict';
import{decodePrintSequence,encodePrintSequence,normalizeFilamentSequence,readFilamentSequences,writeFilamentSequences,updatePlatePrintSequence,platePrintSequence}from'../../shared/filament-sequence.js';
test('native per-plate output sequence aliases and associations survive selected/reordered exports',()=>{
 const plates=[{id:'a',native:{number:3}},{id:'b',native:{number:1}}],data={plate_3:{filament_sequence:[2,1,2],nozzle_sequence:[0,1,0],optimal_assignment:[1,0]},plate_1:{sequence:[],nozzle_sequence:[]}};
 readFilamentSequences(JSON.stringify(data),plates,{filamentCount:2,nozzleCount:2});assert.deepEqual(plates[0].native.filamentSequence,{sequence:[2,1,2],nozzle_sequence:[0,1,0],optimal_assignment:[1,0]});
 assert.deepEqual(JSON.parse(writeFilamentSequences([plates[0]])),{plate_1:plates[0].native.filamentSequence});assert.equal(JSON.parse(writeFilamentSequences(plates)).plate_2.sequence.length,0);
});
test('native output metadata rejects missing plate, invalid indices and oversized arrays',()=>{
 assert.throws(()=>readFilamentSequences('{"plate_2":{"sequence":[],"nozzle_sequence":[]}}',[{id:'a'}]),/missing plate/);
 for(const sequence of [[0],[3],[-1],[1.5],['bad']])assert.throws(()=>normalizeFilamentSequence({sequence,nozzle_sequence:[]},{filamentCount:2}),/Sequence filament/);
 assert.throws(()=>normalizeFilamentSequence({sequence:[1],nozzle_sequence:[1]},{nozzleCount:1}),/Sequence nozzle/);
 assert.throws(()=>readFilamentSequences('{"__proto__":{}}',[]),/plate key/);
 assert.throws(()=>normalizeFilamentSequence({sequence:new Array(1000001),nozzle_sequence:[]}),/bounded/);
});
test('layer orders use native equal-width interval encoding beyond the misleading scalar max of sixteen',()=>{
 const value={firstLayer:[2,1],ranges:[{start:2,end:100,order:[1,2]},{start:50,end:80,order:[2,1]}]},encoded=encodePrintSequence(value,2);
 assert.deepEqual(encoded.other_layers_print_sequence,['2','100','1','2','50','80','2','1']);assert.equal(encoded.other_layers_print_sequence_nums,'2');assert.deepEqual(decodePrintSequence(encoded,2),value);
 const plate={id:'p',native:{metadata:{locked:'false'},filamentSequence:{sequence:[1],nozzle_sequence:[0]}}};const edited=updatePlatePrintSequence(plate,value,2);assert.deepEqual(platePrintSequence(edited,{},2),value);assert.equal(edited.native.filamentSequence,undefined);assert.ok(plate.native.filamentSequence);assert.equal(edited.native.metadata.locked,'false');
 const reset=updatePlatePrintSequence(edited,{firstLayer:null,ranges:[]},2);assert.deepEqual(platePrintSequence(reset,encoded,2),{firstLayer:null,ranges:[]});
});
test('orders reject duplicate/missing slots, malformed ranges and mismatched native record widths',()=>{
 assert.throws(()=>encodePrintSequence({firstLayer:[1,1],ranges:[]},2),/distinct/);
 assert.throws(()=>encodePrintSequence({firstLayer:[3],ranges:[]},2),/integer/);
 assert.throws(()=>encodePrintSequence({firstLayer:null,ranges:[{start:4,end:2,order:[1]}]},2),/Layer end/);
 assert.throws(()=>encodePrintSequence({firstLayer:null,ranges:[{start:2,end:4,order:[1]},{start:5,end:10,order:[1,2]}]},2),/same number/);
 assert.throws(()=>decodePrintSequence({other_layers_print_sequence_nums:2,other_layers_print_sequence:[2,10,1]},2),/equal width/);
 assert.throws(()=>decodePrintSequence({other_layers_print_sequence_nums:0,other_layers_print_sequence:[2,10,1]},2),/positive range count/);
 assert.throws(()=>decodePrintSequence({other_layers_print_sequence_nums:-1},2),/count/);
 for(const invalid of[null,false,'','0x0'])assert.throws(()=>decodePrintSequence({first_layer_print_sequence:[invalid]},2));
});

test('native project service preserves sequence metadata per plate and rejects malformed order before export',async()=>{
 const{readFile}=await import('node:fs/promises'),{importNative3MF,exportNative3MF}=await import('../../shared/native-project.js'),{createNativeProjectService}=await import('../../server/native-projects.js'),{fixtureCatalog}=await import('../fixtures/native-project-catalog.js'),{assertNativeProjectConfiguration}=await import('../../server/native-preflight.js');
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),service=createNativeProjectService({catalog:fixtureCatalog(project)});
 project.plates[0]=updatePlatePrintSequence(project.plates[0],{firstLayer:[1],ranges:[{start:2,end:100,order:[1]}]},1);project.plates[0].native.filamentSequence={sequence:[1,1],nozzle_sequence:[0,0],optimal_assignment:[0]};
 const ready=await service.prepare({project,useEmbeddedSettings:true}),loaded=importNative3MF(ready.bytes);assert.equal(loaded.plates[0].native.metadata.other_layers_print_sequence,'2 100 1');assert.deepEqual(loaded.plates[0].native.filamentSequence,project.plates[0].native.filamentSequence);assertNativeProjectConfiguration(ready);
 const floating=structuredClone(ready);floating.project.objects[0].position[2]+=10;assert.throws(()=>assertNativeProjectConfiguration(floating),/first layer/);
 const malformed=structuredClone(project);malformed.plates[0].native.metadata.other_layers_print_sequence_nums='2';await assert.rejects(service.prepare({project:malformed,useEmbeddedSettings:true}),/equal width/);
 const bad=structuredClone(project);bad.plates[0].native.filamentSequence.sequence=[2];await assert.rejects(service.prepare({project:bad,useEmbeddedSettings:true}),/Sequence filament/);
});
