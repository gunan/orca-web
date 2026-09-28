#!/usr/bin/env node
import{readFile,writeFile}from'node:fs/promises';
import{nativeFixtureEngine as engine,nativePreviewFixture}from'./native-preview-result.js';
if(process.argv[2]==='--version'){process.stdout.write(JSON.stringify(engine));process.exit(0);}
const text=await readFile(process.argv[2],'utf8');
if(text.includes('WAIT'))await new Promise(resolve=>setTimeout(resolve,10000));
if(text.includes('FAIL')){console.error('Fixture processor failure');process.exit(5);}
if(text.includes('NOISY')){process.stdout.write('x'.repeat(100000));await new Promise(resolve=>setTimeout(resolve,10000));}
if(text.includes('LARGE')){await writeFile(process.argv[3],'x'.repeat(2000));process.exit(0);}
const value=nativePreviewFixture();
if(text.includes('INVALID'))value.vertices[0][2]='nan';
await writeFile(process.argv[3],JSON.stringify(value));
