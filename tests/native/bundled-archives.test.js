import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { importNative3MF } from '../../shared/native-project.js';
import { extractBoundedZip } from '../../shared/import-limits.js';

test('real native bundled ZIP64 flow-calibration archives retain named geometry within ordinary import limits',async()=>{
  const resources=process.env.ORCA_RESOURCES_DIR||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/Resources':null);
  assert.ok(resources,'Set ORCA_RESOURCES_DIR to the real native OrcaSlicer resources');
  for(const name of ['Orca-LinearFlow.3mf','Orca-LinearFlow_fine.3mf','flowrate-test-pass1.3mf','flowrate-test-pass2.3mf','pass1.3mf']){
    const bytes=await readFile(path.join(resources,'calib','filament_flow',name)),files=extractBoundedZip(bytes),project=importNative3MF(bytes,{filename:name});
    assert.ok(Object.keys(files).some(file=>file.endsWith('.model')),name);assert.ok(project.objects.length>=9,name);
    assert.ok(project.objects.every(object=>object.name&&object.positions.length>0),name);
  }
});
