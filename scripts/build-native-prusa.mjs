#!/usr/bin/env node
// Uses the verified source/dependency cache populated by the emboss worker build.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const cache=path.resolve(process.env.ORCA_NATIVE_CACHE_DIR||path.join(root,'.native-cache'));
const target=path.join(root,'native','build','prusa'),cmake=process.env.CMAKE_BIN||'cmake';
const run=(command,args,{capture=false}={})=>new Promise((resolve,reject)=>{let output='';const child=spawn(command,args,{stdio:capture?['ignore','pipe','inherit']:'inherit'});child.stdout?.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(`${command} exited ${code}`)));});
await run(cmake,['-S',path.join(root,'native','prusa-worker'),'-B',target,'-G',process.env.CMAKE_GENERATOR||'Ninja','-DCMAKE_BUILD_TYPE=Release',`-DORCA_NATIVE_CACHE=${cache}`]);
await run(cmake,['--build',target,'--parallel',String(Math.min(4,os.availableParallelism()))]);
const binary=path.join(target,`orca-prusa-import${process.platform==='win32'?'.exe':''}`),identity=await run(binary,['--version'],{capture:true});
const cmakeCache=await readFile(path.join(target,'CMakeCache.txt'),'utf8'),compiler=cmakeCache.match(/^CMAKE_CXX_COMPILER:FILEPATH=(.+)$/m)?.[1];
if(!compiler)throw new Error('Could not identify the configured native compiler');
const adapterSources={};for(const file of ['native/prusa-worker/worker/main.cpp','native/prusa-worker/worker/backup-guards.cpp','native/prusa-worker/worker/unsupported-step.hpp','native/prusa-worker/CMakeLists.txt','native/prusa-worker/generated/libslic3r_version.h','native/prusa-worker/scripts/prepare-sources.py','scripts/build-native-prusa.mjs'])adapterSources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const manifest={adapterSources,format:'orca-native-prusa-build',version:1,binary:path.basename(binary),binarySha256:createHash('sha256').update(await readFile(binary)).digest('hex'),identity,sourceManifest:JSON.parse(await readFile(path.join(root,'native/prusa-worker/source-manifest.json'),'utf8')),dependencyManifest:JSON.parse(await readFile(path.join(root,'native/prusa-worker/dependency-manifest.json'),'utf8')),platform:process.platform,architecture:os.arch(),compiler:await run(compiler,['--version'],{capture:true}),cmake:await run(cmake,['--version'],{capture:true}),buildType:'Release',buildRecipe:'scripts/build-native-prusa.mjs',builtAt:new Date().toISOString()};
await writeFile(path.join(target,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`${identity} built with paired build-manifest.json`);
