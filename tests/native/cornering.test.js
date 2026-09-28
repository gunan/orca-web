import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createCalibrationSessions } from '../../server/calibration-sessions.js';
import { createPresetCatalog } from '../../server/presets.js';
import { runSlicer } from '../../server/slicer.js';
import { applyCalibrationOverrides, applyCalibrationGcode } from '../../shared/calibration.js';
import { analyzeMesh, meshBounds, exportSTL } from '../../shared/geometry.js';
const binary = process.env.ORCA_SLICER_BIN || '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer';
const resourcesDir = process.env.ORCA_RESOURCES_DIR || '/Applications/OrcaSlicer.app/Contents/Resources';
for (const kind of ['junction-deviation', 'jerk']) test(`real native cornering tower has effective ${kind} commands without competing role overrides`, { timeout: 120000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-cornering-native-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const base = await createPresetCatalog({ binary }), ids = base.list().defaults;
  // Explicit native fixture configuration selects the two Marlin 2 modes.
  const catalog = { resolveSelection: async values => { const selected = await base.resolveSelection(values); selected.printer.gcode_flavor = 'marlin2'; selected.printer.machine_max_junction_deviation = [kind === 'jerk' ? '0' : '0.02']; return selected; } };
  const sessions = createCalibrationSessions({ binary, resourcesDir, catalog }), app = express();
  app.use('/api/calibrations', sessions.router); app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(async () => { await sessions.shutdown(); await new Promise(resolve => server.close(resolve)); });
  const parameters = { mode: 'cornering', testModel: kind === 'jerk' ? 'scv' : 'fast', start: kind === 'jerk' ? 1 : 0, end: kind === 'jerk' ? 15 : 0.25 };
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/calibrations/prepare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ids, ...parameters }) });
  const prepared = await response.json(); assert.equal(response.status, 200, JSON.stringify(prepared)); assert.equal(prepared.plan.corneringKind, kind);
  const mesh = prepared.objects[0], analysis = analyzeMesh(mesh), bounds = meshBounds(mesh); assert.equal(analysis.manifold, true, JSON.stringify(analysis));
  assert.ok(Math.abs(bounds.size[2] - (kind === 'jerk' ? 100 : 60)) < .002);
  const inputPath = path.join(directory, 'calibration.stl'); await writeFile(inputPath, new Uint8Array(exportSTL(prepared.objects)));
  const verified = await sessions.validateUpload({ calibration: prepared.calibration, ids, inputPath, overrides: {} });
  const settings = applyCalibrationOverrides(verified.selection, verified.plan);
  for (const scope of ['printer', 'process', 'filament']) await writeFile(path.join(directory, `${scope}.json`), JSON.stringify(settings[scope]));
  await mkdir(path.join(directory, 'output')); await mkdir(path.join(directory, 'config'));
  await runSlicer(binary, ['--slice', '0', '--arrange', '0', '--orient', '0', '--outputdir', path.join(directory, 'output'), '--datadir', path.join(directory, 'config'), '--load-settings', `${path.join(directory, 'printer.json')};${path.join(directory, 'process.json')}`, '--load-filaments', path.join(directory, 'filament.json'), inputPath], { cwd: directory, timeoutMs: 60000, signal: t.signal });
  const files = (await readdir(path.join(directory, 'output'))).filter(file => file.endsWith('.gcode')); assert.equal(files.length, 1);
  const raw = await readFile(path.join(directory, 'output', files[0]), 'utf8');
  const output = applyCalibrationGcode(raw, verified.plan);
  const motions = text => text.split('\n').filter(line => /^G[0123]\s/.test(line)); assert.deepEqual(motions(output.gcode), motions(raw));
  assert.match(raw, /; default_acceleration = 2000/); assert.match(raw, /; filament_max_volumetric_speed = 200/); assert.match(raw, /^M593 F0\.00 D0\.000/m);
  const inserted = output.gcode.split('\n').filter(line => line.includes('; Orca Web calibration cornering'));
  if (kind === 'jerk') { assert.match(inserted[0], /^M205 X1 Y1 /); assert.match(inserted.at(-1), /^M205 X15 Y15 /); assert.ok(inserted.some(line => /^M205 X8\./.test(line))); }
  else { assert.match(inserted[0], /^ ; Orca Web/); assert.match(inserted.at(-1), /^M205 J0\.250 /); assert.ok(inserted.some(line => /^M205 J0\.12\d /.test(line))); }
  assert.equal(inserted.at(-2).split(' ;')[0], inserted.at(-1).split(' ;')[0]);
  assert.equal(output.summary.timeEstimate,'unavailable-after-cornering-calibration');assert.doesNotMatch(output.gcode,/^M73\b/m);assert.doesNotMatch(output.gcode,/^; estimated printing time/m);assert.match(output.gcode,/^; filament used \[g\]/m);
  assert.equal(output.summary.scheduleLayers, kind === 'jerk' ? 500 : 300); assert.equal(output.summary.closingLayer, true);
  t.diagnostic(`${kind}: ${analysis.triangles} closed triangles, ${bounds.size.map(n => n.toFixed(3)).join(' × ')} mm, ${output.summary.scheduleLayers} native schedule layers plus closing pass. No printer contacted.`);
});
