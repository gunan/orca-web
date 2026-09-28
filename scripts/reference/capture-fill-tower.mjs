#!/usr/bin/env node
// Capture only independent original-source outputs. No production worker runs.
import {readFile,writeFile,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fillTowerCases} from '../../tests/fixtures/native-fill-tower-input.js';
const [primeDirectory,fillDirectory]=process.argv.slice(2);
if(!primeDirectory||!fillDirectory)throw new Error('Pass the independent prime and Fill reference build directories.');
const root=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const dir=await mkdtemp(path.join(tmpdir(),'capture-fill-tower-'));
try{
 const cases=fillTowerCases(),primeBinary=path.resolve(primeDirectory,'prime-tower-reference'),fillBinary=path.resolve(fillDirectory,'independent-fill');
 const primeSource=JSON.parse(await readFile(path.resolve(primeDirectory,'source.json')));
 if(sha(await readFile(primeBinary))!==primeSource.referenceBinarySha256)throw new Error('Prime reference binary provenance mismatch');
 await writeFile(path.join(dir,'prime-input.json'),JSON.stringify(cases.map(c=>({name:c.name,request:c.request.towerPreview}))));
 await exec(primeBinary,[path.join(dir,'prime-input.json'),path.join(dir,'prime-output.json')],{timeout:60000,maxBuffer:65536});
 const prime=JSON.parse(await readFile(path.join(dir,'prime-output.json'))),captured=[];
 for(let i=0;i<cases.length;i++){
  const fixture=cases[i];if(prime[i].name!==fixture.name)throw new Error('Reference case order changed');
  await writeFile(path.join(dir,'fill-input.json'),JSON.stringify({...fixture.request,referenceTower:prime[i].result}));
  await exec(fillBinary,[path.join(dir,'fill-input.json'),path.join(dir,'fill-output.json')],{timeout:60000,maxBuffer:65536});
  const expected=JSON.parse(await readFile(path.join(dir,'fill-output.json')));
  captured.push({...fixture,expected,independentTower:prime[i].result});
  console.log(`${fixture.name}: ${expected.added} additions; tower ${expected.tower?'visible':'hidden'}`);
 }
 const source=await readFile(path.resolve(fillDirectory,'independent-fill.cpp'));
 const provenance={sourceCommit:primeSource.sourceCommit,prime:primeSource,viewport:JSON.parse(await readFile(path.resolve(fillDirectory,'tower-source-hashes.json'))),fill:JSON.parse(await readFile(path.resolve(fillDirectory,'reference-source-hashes.json'))),referenceSourceSha256:sha(source),referenceBinarySha256:sha(await readFile(fillBinary)),generatorSha256:sha(await readFile(path.join(root,'native/arrange-worker/scripts/build-fill-reference.py'))),templateSha256:sha(await readFile(path.join(root,'native/arrange-worker/scripts/fill-tower-reference.cpp.in'))),captureSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
 await copyFile(path.resolve(fillDirectory,'independent-fill.cpp'),path.join(root,'tests/fixtures/native-fill-tower-reference.cpp'));
 await writeFile(path.join(root,'tests/fixtures/native-fill-tower-reference.json'),JSON.stringify({...provenance,cases:captured},null,2)+'\n');
}finally{await rm(dir,{recursive:true,force:true});}
