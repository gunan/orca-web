#!/usr/bin/env node
// Build the pinned image helper without reading native user preferences.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=path.resolve(process.env.ORCA_IMAGE_CACHE_DIR||path.join(process.env.ORCA_NATIVE_CACHE_DIR||path.join(root,'.native-cache'),'image'));
const revision='88f3483ca546fbf4ad732e1acd94cc930935077a',orcaRevision='8500fcdccaa10b5099ac20d252af3a7c560046f1',sourceHash='8e3540213c5ebab0c21d5392b2bf8b4e47b6c85b60c419f40a424c178de42648';
const source=path.join(cache,'upstream','wxwidgets'),prefix=path.join(cache,'prefix'),wxBuild=path.join(cache,'build','wx'),target=path.join(root,'native','build','image'),cmake=process.env.CMAKE_BIN||'cmake',parallel=String(Math.min(8,os.availableParallelism()));
function run(command,args,options={}){return new Promise((resolve,reject)=>{let output='';const child=spawn(command,args,{stdio:options.capture?['ignore','pipe','inherit']:'inherit',...options});child.stdout?.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(`${command} exited ${code}`)));});}
async function exists(filename){try{await access(filename);return true;}catch{return false;}}
await mkdir(path.dirname(source),{recursive:true});
if(!await exists(path.join(source,'.git')))await run('git',['clone','--no-checkout','https://github.com/SoftFever/Orca-deps-wxWidgets.git',source]);
const remote=await run('git',['-C',source,'remote','get-url','origin'],{capture:true});if(remote!=='https://github.com/SoftFever/Orca-deps-wxWidgets'&&remote!=='https://github.com/SoftFever/Orca-deps-wxWidgets.git')throw new Error('Unexpected wxWidgets cache origin');
if(await run('git',['-C',source,'status','--porcelain'],{capture:true}))throw new Error('Refusing to overwrite modified wxWidgets cache');
try{await run('git',['-C',source,'cat-file','-e',revision]);}catch{await run('git',['-C',source,'fetch','origin',revision]);}
await run('git',['-C',source,'checkout','--detach',revision]);
await run('git',['-C',source,'submodule','update','--init','--recursive']);
const guiPath=path.join(cache,'upstream','GUI_Utils.cpp');
if(!await exists(guiPath)){const response=await fetch(`https://raw.githubusercontent.com/OrcaSlicer/OrcaSlicer/${orcaRevision}/src/slic3r/GUI/GUI_Utils.cpp`);if(!response.ok)throw new Error(`Native image source download failed: ${response.status}`);await writeFile(guiPath,Buffer.from(await response.arrayBuffer()));}
const gui=await readFile(guiPath);if(createHash('sha256').update(gui).digest('hex')!==sourceHash)throw new Error('Native image source hash mismatch');
const text=gui.toString(),start=text.indexOf('bool generate_image('),end=text.indexOf('\n}',start)+2,header=await readFile(path.join(root,'native','image-worker','native-cover-functions.hpp'),'utf8');
if(start<0||end<start||header.slice(header.indexOf('bool generate_image(')).trim()!==text.slice(start,end).trim())throw new Error('Native cover kernel differs from pinned source');
const flags=['-DCMAKE_BUILD_TYPE=Release',`-DCMAKE_INSTALL_PREFIX=${prefix}`,'-DwxBUILD_SHARED=OFF','-DwxBUILD_SAMPLES=OFF','-DwxBUILD_TESTS=OFF','-DwxBUILD_DEBUG_LEVEL=0',...['WEBVIEW','STC','RIBBON','PROPGRID','MEDIACTRL','SVG','LIBWEBP','LIBTIFF','GLCANVAS','AUI','RICHTEXT','LIBICONV'].map(name=>`-DwxUSE_${name}=OFF`),...['LIBPNG','LIBJPEG','ZLIB'].map(name=>`-DwxUSE_${name}=builtin`)];
const generator=process.env.CMAKE_GENERATOR||'Ninja';
await run(cmake,['-S',source,'-B',wxBuild,'-G',generator,...flags]);
await run(cmake,['--build',wxBuild,'--parallel',parallel]);await run(cmake,['--install',wxBuild]);
await run(cmake,['-S',path.join(root,'native','image-worker'),'-B',target,'-G',generator,'-DCMAKE_BUILD_TYPE=Release',`-DCMAKE_PREFIX_PATH=${prefix}`]);await run(cmake,['--build',target,'--parallel',parallel]);
await run(path.join(target,`orca-image-worker${process.platform==='win32'?'.exe':''}`),['--version']);
console.log(`Native image worker built at ${target}`);
