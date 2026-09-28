import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSlicerArgs, sliceModel, runSlicer, inspectSlicer } from '../../server/slicer.js';

async function fixture(t, code) {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = path.join(root, 'slicer.mjs');
  await writeFile(binary, `#!/usr/bin/env node\nimport fs from 'node:fs/promises';import path from 'node:path'; const args=process.argv.slice(2); const outputdir=args[args.indexOf('--outputdir')+1];\n${code}`, { mode: 0o755 });
  return { root, binary };
}

test('passes explicit machine, process, filament and isolated data paths to native CLI', () => {
  assert.deepEqual(buildSlicerArgs('/in/cube.stl', '/out', '/process.json', {printerPath:'/machine.json',filamentPath:'/filament.json',dataDirectory:'/config'}), ['--slice','0','--outputdir','/out','--load-settings','/machine.json;/process.json','--load-filaments','/filament.json','--datadir','/config','/in/cube.stl']);
});

test('preservePosition opts out of automatic native arrangement and orientation without changing the default', () => {
  assert.deepEqual(buildSlicerArgs('/cube.stl', '/out'), ['--slice', '0', '--outputdir', '/out', '/cube.stl']);
  assert.deepEqual(buildSlicerArgs('/cube.stl', '/out', undefined, { preservePosition: true }), ['--slice', '0', '--outputdir', '/out', '--arrange', '0', '--orient', '0', '/cube.stl']);
});

test('cancelling a slicing operation removes native partial output and working directories', async t => {
  const { root, binary } = await fixture(t, `await fs.writeFile(path.join(outputdir,'plate_1.gcode'),'partial');console.log('started');setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const output = path.join(root, 'cancelled.gcode');
  const operation = sliceModel({ binary, input: path.join(root, 'cube.stl'), output, signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(operation, /cancelled/);
  const files = await readdir(root);
  assert.equal(files.includes('cancelled.gcode'), false);
  assert.equal(files.some(filename => filename.startsWith('.slice-')), false);
});

test('concurrent native adapters isolate identical output names and preserve each input result', async t => {
  const {root,binary}=await fixture(t, `await fs.writeFile(path.join(outputdir,'plate_1.gcode'), args.at(-1));`);
  await Promise.all(['one','two'].map(name => sliceModel({binary,input:path.join(root,`${name}.stl`),output:path.join(root,`${name}.gcode`)})));
  assert.equal(await readFile(path.join(root,'one.gcode'),'utf8'),path.join(root,'one.stl'));
  assert.equal(await readFile(path.join(root,'two.gcode'),'utf8'),path.join(root,'two.stl'));
  assert.equal((await readdir(root)).some(name=>name.startsWith('.slice-')),false);
});

test('drains large stdout while slicing instead of blocking on a full pipe', async t => {
  const {root,binary}=await fixture(t, `await new Promise(resolve=>process.stdout.write('x'.repeat(1024*1024),resolve));await fs.writeFile(path.join(outputdir,'plate_1.gcode'),'G28');`);
  await sliceModel({binary,input:path.join(root,'cube.stl'),output:path.join(root,'result.gcode'),timeoutMs:5000});
  assert.equal(await readFile(path.join(root,'result.gcode'),'utf8'),'G28');
});

test('reports child failures, missing output, and multiple plates without choosing arbitrary G-code', async t => {
  for (const [code,expected] of [[`console.error('Invalid mesh');process.exit(2);`,/Invalid mesh/],[`console.log('No output');`,/without producing/],[`await fs.writeFile(path.join(outputdir,'one.gcode'),'one');await fs.writeFile(path.join(outputdir,'two.gcode'),'two');`,/one plate per job/],[`await fs.writeFile(path.join(outputdir,'one.gcode'),'');`,/empty G-code/]]) {
    const {root,binary}=await fixture(t,code);
    await assert.rejects(sliceModel({binary,input:path.join(root,'cube.stl'),output:path.join(root,'result.gcode')}),expected);
    assert.equal((await readdir(root)).some(name=>name.startsWith('.slice-')),false);
  }
});

test('terminates timed-out and cancelled processes, including a process ignoring SIGTERM', async t => {
  const {binary}=await fixture(t,`process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  await assert.rejects(runSlicer(binary,[],{timeoutMs:150}),/timeout/);
  const controller=new AbortController();
  const running=runSlicer(binary,[],{signal:controller.signal});
  setTimeout(()=>controller.abort(),50);
  await assert.rejects(running,/cancelled/);
});

test('health detects missing binary and identifies the configured executable', async t => {
  assert.equal((await inspectSlicer('/missing/orca-slicer')).available,false);
  const {binary}=await fixture(t,`console.log('OrcaSlicer-2.4.2:');`);
  assert.deepEqual(await inspectSlicer(binary),{available:true,version:'OrcaSlicer-2.4.2'});
});

test('native path-conflict exit retains diagnostics, explains the failure and discards partial output', async t => {
  const {root,binary}=await fixture(t, `await fs.writeFile(path.join(outputdir,'plate_1.gcode'),'partial');console.error('run found error, exit');process.exit(155);`);
  await assert.rejects(sliceModel({binary,input:path.join(root,'cube.stl'),output:path.join(root,'result.gcode')}),/OrcaSlicer exited 155: Generated toolpaths intersect\..*run found error, exit/);
  const files=await readdir(root);assert.equal(files.includes('result.gcode'),false);assert.equal(files.some(name=>name.startsWith('.slice-')),false);
});
