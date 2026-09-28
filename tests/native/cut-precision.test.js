import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {createMesh,analyzeMesh,dropToBed,meshBounds} from '../../shared/geometry.js';
import {cutMesh} from '../../shared/geometry-cut.js';
import {exportNative3MF,importNative3MF} from '../../shared/native-project.js';

const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer');
test('native retraction tower cuts at exact source heights produce closed retained meshes and slice successfully',{timeout:120000},async t=>{
  const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);const directory=await mkdtemp(path.join(tmpdir(),'orca-precision-cut-'));t.after(()=>rm(directory,{recursive:true,force:true}));await mkdir(path.join(directory,'config'));
  const resources=process.env.ORCA_RESOURCES_DIR||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/Resources':'/usr/share/OrcaSlicer');await runSlicer(binary,['--export-stl','--outputdir',directory,'--datadir',path.join(directory,'config'),path.join(resources,'calib/retraction/retraction_tower.drc')],{cwd:directory,timeoutMs:30000,signal:t.signal});
  const outputs=(await readdir(path.join(directory,'stl'))).filter(name=>name.endsWith('.stl'));assert.equal(outputs.length,1);const data=await readFile(path.join(directory,'stl',outputs[0])),geometry=new STLLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),source=createMesh({id:'tower',name:'Retraction precision',plateId:'plate-1',positions:geometry.attributes.position.array});geometry.dispose();assert.equal(analyzeMesh(source).manifold,true);
  const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));
  for(const offset of[3.3999,21.3999]){const result=cutMesh(source,{offset});assert.equal(result.report.offset,offset);assert.ok(Math.abs(result.report.volumeAfter-result.report.volumeBefore)<.0001);for(const half of result.objects){const report=analyzeMesh(half);assert.equal(report.manifold,true);assert.equal(report.degenerateTriangles,0);assert.equal(report.boundaryEdges,0);}assert.equal(meshBounds(result.lower).max[2],Math.fround(offset));assert.equal(meshBounds(result.upper).min[2],Math.fround(offset));
    const root=path.join(directory,String(offset));await mkdir(path.join(root,'config'),{recursive:true});await mkdir(path.join(root,'output'));const mesh=dropToBed(result.lower,{width:250,depth:210,height:220}),input=path.join(root,'model.3mf');await writeFile(input,exportNative3MF({...project,objects:[mesh]}));await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(root,'config'),'--outputdir',path.join(root,'output'),input],{cwd:root,timeoutMs:30000,signal:t.signal});const code=await readFile(path.join(root,'output','plate_1.gcode'),'utf8');assert.ok(code.split(/\r?\n/).filter(line=>/^G[01]\s/.test(line)&&/\bE/.test(line)).length>100);const height=Number(code.match(/^; max_z_height: (.+)$/m)?.[1]);assert.ok(Math.abs(height-meshBounds(mesh).size[2])<.2);t.diagnostic(`Exact ${offset} mm cut: both halves closed, volume drift ${(result.report.volumeAfter-result.report.volumeBefore).toExponential(3)} mm³, native final layer ${height} mm.`);
  }
});
