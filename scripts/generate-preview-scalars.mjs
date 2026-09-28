/** Reproduce the preview scalar oracle using pinned local native source files.
 * node scripts/generate-preview-scalars.mjs /path/to/flattened-source-cache > output.json
 * The source directory needs the seven files hashed by the fixture plus Utils.hpp.
 * Requires clang++; never downloads source, loads a printer, or runs G-code.
 */
import {readFile,writeFile,mkdir,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sourceDir=process.argv[2];if(!sourceDir||process.argv.length!==3)throw new Error('Expected a directory containing pinned native source files');
const root=fileURLToPath(new URL('..',import.meta.url)),fixtureDir=path.join(root,'tests/fixtures');
const pinned=JSON.parse(await readFile(path.join(fixtureDir,'native-preview-scalars.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const[name,digest]of Object.entries(pinned.sourceSha256))if(hash(await readFile(path.join(sourceDir,name)))!==digest)throw new Error(`Pinned source hash mismatch: ${name}`);
const gui=path.join(fixtureDir,pinned.gui.path);if(hash(await readFile(gui))!==pinned.gui.sha256)throw new Error('Native GUI G-code fixture hash mismatch');
const temporary=await mkdtemp(path.join(tmpdir(),'orca-preview-reference-'));
try{
 for(const folder of ['include','src'])await mkdir(path.join(temporary,folder));
 for(const name of ['ColorRange.hpp','Types.hpp'])await copyFile(path.join(sourceDir,name),path.join(temporary,'include',name));
 for(const name of ['ColorRange.cpp','Types.cpp','Utils.hpp'])await copyFile(path.join(sourceDir,name),path.join(temporary,'src',name));
 const scalars=path.join(temporary,'scalars'),attributes=path.join(temporary,'attributes');
 const compile=args=>execFileSync('clang++',['-std=c++17','-O2','-ffp-contract=off',...args],{maxBuffer:8000000});
 compile(['-I',path.join(temporary,'include'),path.join(fixtureDir,'native-preview-scalars-reference.cpp'),path.join(temporary,'src/ColorRange.cpp'),path.join(temporary,'src/Types.cpp'),'-o',scalars]);
 compile([path.join(fixtureDir,'native-preview-attributes-reference.cpp'),'-o',attributes]);
 const reference=JSON.parse(execFileSync(scalars,[],{maxBuffer:8000000}));
 const rows=JSON.parse(execFileSync(attributes,[gui],{maxBuffer:8000000})),binary=Buffer.alloc(rows.length*20);
 rows.forEach((row,index)=>{binary.writeUInt32LE(row[0],index*20);row.slice(1).forEach((value,j)=>binary.writeFloatLE(value,index*20+4+j*4));});
 const output={commit:pinned.commit,sourceSha256:pinned.sourceSha256,...reference,gui:{path:pinned.gui.path,sha256:pinned.gui.sha256,rowCount:rows.length,float32RowSha256:hash(binary),samples:rows.filter((_,index)=>index%137===0)}};
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
}finally{await rm(temporary,{recursive:true,force:true});}
