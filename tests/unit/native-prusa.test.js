import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,truncate,access} from 'node:fs/promises';
import {zipSync,strToU8,strFromU8} from 'fflate';
import {inspectPrusaArchive,importPrusaArchive} from '../../server/native-prusa.js';
import {extractBoundedZip} from '../../shared/import-limits.js';
import {PRUSA_NATIVE_REVISION} from '../../shared/prusa-model.js';
import {prusaFixture} from '../fixtures/prusa-project.js';
const selection={printer:{},process:{},filament:{}};
const version=`OrcaPrusaImporter-2.4.2 revision${PRUSA_NATIVE_REVISION}`;
function editArchive(edit){const files=extractBoundedZip(prusaFixture());edit(files);return zipSync(files);}
test('Prusa inspector identifies exact importer route and reports only native-whitelisted model metadata',()=>{
 const result=inspectPrusaArchive(prusaFixture());assert.equal(result.nativeLegacySource.report.filteredModelSettings.length,4);assert.deepEqual(result.nativeLegacySource.report.ignoredCarriers,['Metadata/Slic3r_PE.config','Metadata/Slic3r_PE_layer_heights_profile.txt']);
 assert.equal(inspectPrusaArchive(editArchive(files=>files['3D/_rels/3dmodel.model.rels']=strToU8('<Relationships/>'))),null);
 assert.equal(inspectPrusaArchive(editArchive(files=>files['3D/3dmodel.model']=strToU8(strFromU8(files['3D/3dmodel.model']).replace('PrusaSlicer-2.8.1','Generic exporter')))),null);
});
test('Prusa inspector rejects malformed facets, XML entities, unsupported provenance paths and host scripts before executing native code',async()=>{
 for(const edit of[
  files=>files['3D/3dmodel.model']=strToU8(strFromU8(files['3D/3dmodel.model']).replace('mmu_segmentation="8"','mmu_segmentation="!"')),
  files=>files['3D/3dmodel.model']=strToU8('<!DOCTYPE x [<!ENTITY y "evil">]>'+strFromU8(files['3D/3dmodel.model'])),
  files=>files['3D/3dmodel.model']=strToU8(strFromU8(files['3D/3dmodel.model']).replace('v1="0"','v1="999999"')),
  files=>files['Metadata/sub/hidden.config']=strToU8('data'),
  files=>files['Metadata/Slic3r_PE.config']=strToU8('; post_process = /tmp/never-execute'),
 ]){let calls=0;await assert.rejects(importPrusaArchive(editArchive(edit),{selection,runNative:async()=>{calls++;return version;}}));assert.equal(calls,0);}
});
test('Prusa bridge requires pinned executable identity and cleans its private directory on failure',async()=>{
 let directory;await assert.rejects(importPrusaArchive(prusaFixture(),{selection,runNative:async(_b,_a,options)=>{directory=options.cwd;return'OrcaPrusaImporter-2.5';}}),/pinned/);await assert.rejects(access(directory));
});
test('Prusa bridge shares one deadline and abort signal, and rejects oversized or malformed output',async()=>{
 for(const output of['oversize','malformed','abort','deadline']){
  let directory,calls=0;const controller=new AbortController();
  await assert.rejects(importPrusaArchive(prusaFixture(),{selection,timeoutMs:output==='deadline'?25:2000,signal:controller.signal,runNative:async(_b,args,options)=>{
   directory=options.cwd;assert.equal(options.signal,controller.signal);calls++;
   if(args[0]==='--version'){if(output==='abort')controller.abort();if(output==='deadline')await new Promise(r=>setTimeout(r,35));return version;}
   await writeFile(args[1],'{');if(output==='oversize')await truncate(args[1],150*1024*1024+1);return'';
  }}),output==='oversize'?/150MB/:output==='deadline'?/timed out/:output==='abort'?/abort/i:/JSON/);
  assert.equal(calls,output==='abort'||output==='deadline'?1:2);await assert.rejects(access(directory));
 }
});
