import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{importNative3MF}from'../../shared/native-project.js';import{layerProfileContext}from'../../shared/variable-layers.js';import{generateObjectLayers}from'../../shared/layer-height-texture.js';
test('source-derived positive shrinkage schedule matches every captured OrcaSlicer 2.4.2 GUI layer',async()=>{
 const bytes=await readFile(new URL('../fixtures/native-gui-shrink98-2.4.2.gcode',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),'79399a156dc3cc43279242e832db5a74dd5426228303ed3a6eeef8bcc220337e');
 const project=importNative3MF(await readFile(new URL('../fixtures/native-gui-shrink98-2.4.2.3mf',import.meta.url))),code=bytes.toString(),zs=[...code.matchAll(/^;Z:([\d.]+)/gm)].map(match=>Number(match[1]));
 const context=layerProfileContext(project.objects,project.objects[0].id,project.nativeSettings,{filamentCount:1}),reference=generateObjectLayers([],context).filter((_,index)=>index%2===1);
 assert.equal(context.shrinkageCompensationZ,100/98);assert.equal(reference.length,102);assert.equal(zs.length,102);assert.equal(zs.at(-1),20.4);zs.forEach((z,index)=>assert.ok(Math.abs(z-reference[index])<1e-5,`Layer ${index}: GUI ${z}, preview ${reference[index]}`));assert.match(code,/filament_shrinkage_compensation_z = 98%/);
});
