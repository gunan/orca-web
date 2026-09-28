import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { createPresetCatalog } from '../../server/presets.js';
import { inspectSlicer, runSlicer } from '../../server/slicer.js';

const vertices = [[0,0,0], [20,0,0], [20,20,0], [0,20,0], [0,0,20], [20,0,20], [20,20,20], [0,20,20]];
const faces = [[0,2,1], [0,3,2], [4,5,6], [4,6,7], [0,1,5], [0,5,4], [1,2,6], [1,6,5], [2,3,7], [2,7,6], [3,0,4], [3,4,7]];
function cubeAMF(unit = 'millimeter') {
  return `<?xml version="1.0"?><amf unit="${unit}"><object id="0"><metadata type="name">Acceptance cube</metadata><mesh><vertices>${vertices.map(point => `<vertex><coordinates><x>${point[0]}</x><y>${point[1]}</y><z>${point[2]}</z></coordinates></vertex>`).join('')}</vertices><volume>${faces.map(face => `<triangle><v1>${face[0]}</v1><v2>${face[1]}</v2><v3>${face[2]}</v3></triangle>`).join('')}</volume></mesh></object></amf>`;
}
const motions = gcode => gcode.split(/\r?\n/).map(line => line.split(';', 1)[0].trim().replace(/\s+/g, ' ')).filter(line => /^G(?:0?[0123])(?:\s|$)/.test(line));

test('real browser AMF, SVG extrusion and STEP worker generate surfaces accepted by OrcaSlicer 2.4.2', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-importer-native-'));
  let vite, browser;
  t.after(async () => { try { await browser?.close(); await vite?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const binary = process.env.ORCA_SLICER_BIN || (process.platform === 'darwin' ? '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer' : 'orca-slicer');
  const engine = await inspectSlicer(binary);
  assert.equal(engine.available, true, engine.error);
  assert.match(engine.version, /^OrcaSlicer-2\.4\.2(?:\b|$)/);
  const catalog = await createPresetCatalog({ binary });
  const selected = catalog.resolveSelection(catalog.list().defaults);
  for (const [type, config] of Object.entries(selected)) await writeFile(path.join(directory, `${type}.json`), JSON.stringify(config));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  vite = await createServer({ configFile: false, root, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'isolated-import-test', configureServer(server) { server.middlewares.use('/__import_probe__.html', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script type="module">import {parseModel} from "/src/model-loader.js";import {sceneBounds,triangleCount,analyzeMesh,exportSTL,placeObjectsOnBed} from "/shared/geometry.js";window.importProbe={parseModel,sceneBounds,triangleCount,analyzeMesh,exportSTL,placeObjectsOnBed};</script>'); }); } }] });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__import_probe__.html`);
  await page.waitForFunction(() => Boolean(window.importProbe));
  async function importFile(bytes, name, options = {}, stepToBed = false) {
    return page.evaluate(async ({ bytes, name, options, stepToBed }) => {
      const api = window.importProbe;
      let objects = await api.parseModel(new Uint8Array(bytes).buffer, name, options);
      const original = api.sceneBounds(objects);
      if (stepToBed) objects = api.placeObjectsOnBed(objects.map(mesh => ({ ...mesh, scale: [1/15,1/15,1/15] })), { width: 250, depth: 210, height: 220 });
      return { original, bounds: api.sceneBounds(objects), triangles: api.triangleCount(objects), analysis: api.analyzeMesh(objects[0]), stl: [...new Uint8Array(api.exportSTL(objects))], warnings: objects[0].importWarnings };
    }, { bytes: [...bytes], name, options, stepToBed });
  }
  async function slice(bytes, label, extension = 'stl') {
    const work = path.join(directory, label); await mkdir(work); await mkdir(path.join(work, 'config')); await mkdir(path.join(work, 'out'));
    const input = path.join(work, `model.${extension}`); await writeFile(input, new Uint8Array(bytes));
    await runSlicer(binary, ['--slice', '0', '--arrange', '0', '--orient', '0', '--outputdir', path.join(work, 'out'), '--datadir', path.join(work, 'config'), '--load-settings', `${path.join(directory, 'printer.json')};${path.join(directory, 'process.json')}`, '--load-filaments', path.join(directory, 'filament.json'), input], { cwd: work, timeoutMs: 60000, signal: t.signal });
    return readFile(path.join(work, 'out', 'plate_1.gcode'), 'utf8');
  }

  await t.test('AMF browser surfaces match native AMF toolpaths and compressed AMF retains units', async () => {
    const source = strToU8(cubeAMF());
    const amf = await importFile(source, 'cube.amf', { place: false });
    assert.equal(amf.triangles, 12); assert.deepEqual(amf.bounds.size, [20,20,20]); assert.equal(amf.analysis.manifold, true);
    const direct = motions(await slice(source, 'amf-reference', 'amf'));
    const imported = motions(await slice(amf.stl, 'amf-browser'));
    assert.ok(direct.length > 2000); assert.equal(imported.length, direct.length);
    assert.equal(direct.findIndex((line, index) => line !== imported[index]), -1, 'AMF tessellation must preserve native motion for the cube fixture');
    const zipped = await importFile(zipSync({ 'cube.amf': strToU8(cubeAMF('inch')) }), 'inch.amf', { place: false });
    zipped.bounds.size.forEach(size => assert.ok(Math.abs(size - 508) < 0.001));
    t.diagnostic(`AMF import matches ${direct.length} direct native motion commands.`);
  });

  await t.test('SVG dimensions, holes, physical units and extrusion depth survive native slicing', async () => {
    const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 200 100"><path id="plate" fill-rule="evenodd" d="M0 0H200V100H0Z M50 30H150V70H50Z"/></svg>');
    const shape = await importFile(svg, 'plate.svg', { svgDepth: 3, bed: { width: 250, depth: 210, height: 220 } });
    assert.deepEqual(shape.bounds.size, [20,10,3]); assert.equal(shape.analysis.manifold, true);
    assert.ok(Math.abs(shape.analysis.volume - 480) < 0.001, 'The inner hole must remain open');
    const gcode = await slice(shape.stl, 'svg-extrusion');
    assert.ok(/^; max_z_height: 3\.00$/m.test(gcode)); assert.ok(/^;Z:3$/m.test(gcode));
    const scaled = await importFile(svg, 'scaled.svg', { place: false, svgScale: 2, svgDepth: 4 });
    assert.deepEqual(scaled.bounds.size, [40,20,4]);
    const inch = await importFile(strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in"><rect width="96" height="96"/></svg>'), 'inch.svg', { place: false, svgDepth: 2 });
    assert.ok(Math.abs(inch.bounds.size[0] - 25.4) < 0.0001); assert.equal(inch.bounds.size[2], 2);
  });

  await t.test('official STEP browser worker loads local WASM, preserves mm units and yields printable geometry', async () => {
    const bytes = await readFile(new URL('../fixtures/occt-cube.step', import.meta.url));
    const step = await importFile(bytes, 'cube.step', { place: false, stepLinearDeflection: 0.1 }, true);
    assert.deepEqual(step.original.size, [300,300,300]); assert.equal(step.triangles, 12); assert.equal(step.analysis.manifold, true);
    step.bounds.size.forEach(size => assert.ok(Math.abs(size - 20) < 0.0001));
    const gcode = await slice(step.stl, 'step-tessellation');
    assert.ok(/^; max_z_height: 20\.00$/m.test(gcode)); assert.ok(motions(gcode).length > 2000);
  });
});
