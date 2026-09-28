import {preparePAPatternProject} from './pa-pattern-calibration.js';
import { cutMesh } from '../shared/geometry-cut.js';
import { createMesh } from '../shared/geometry.js';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { inspectSlicer, runSlicer } from './slicer.js';
import { prepareFlowRatioProject } from './flow-ratio-calibration.js';
import { FLOW_RATIO_METHODS } from '../shared/flow-ratio-calibration.js';
import { CALIBRATION_SOURCE, createCalibrationPlan, applyCalibrationOverrides } from '../shared/calibration.js';
import { prepareCalibrationMesh } from '../shared/calibration-geometry.js';

const RESOURCES = new Set(['temperature_tower/temperature_tower.drc', 'pressure_advance/tower_with_seam.drc', 'pressure_advance/pressure_advance_test.drc', 'pressure_advance/generated-pattern-handle', 'input_shaping/ringing_tower.drc', 'input_shaping/fast_tower_test.drc', 'cornering/SCV-V2.drc', 'vfa/vfa.drc', 'volumetric_speed/SpeedTestStructure.drc', 'retraction/retraction_tower.drc', ...Object.values(FLOW_RATIO_METHODS).map(method => `filament_flow/${method.resource}`)]);

export function calibrationBed(selection) {
  const area = selection.printer.printable_area;
  if (!Array.isArray(area) || area.length < 3) throw new Error('Calibration requires the selected printer bed polygon');
  const points = area.map(point => Array.isArray(point) ? point.map(Number) : String(point).split('x').map(Number));
  if (points.some(point => point.length !== 2 || !point.every(Number.isFinite))) throw new Error('Invalid printer bed polygon');
  const min = [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])), 0];
  const max = [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])), Number(selection.printer.printable_height)];
  // Current placement only certifies a rectangular bed. Irregular/circular
  // beds need polygon containment instead of a bounding-box-only acceptance.
  if (points.length !== 4 || points.some(([x, y]) => ![min[0], max[0]].includes(x) || ![min[1], max[1]].includes(y))) throw new Error('Calibration currently requires a rectangular printer bed');
  return { min, max };
}

/** Native conversion uses only a whitelisted bundled resource and isolated
 * directories; user-supplied paths or command fragments are never accepted. */
export async function prepareCalibrationModel({ binary, resourcesDir, plan, selection, signal }) {
  const verified = createCalibrationPlan(plan.request, selection);
  if (!RESOURCES.has(verified.model.resource)) throw new Error('Unknown native calibration resource');
  const engine = await inspectSlicer(binary);
  if (!engine.available || !/^OrcaSlicer-2\.4\.2(?:\b|$)/.test(engine.version)) throw new Error('Calibration model preparation requires the installed OrcaSlicer 2.4.2 engine');
  if (verified.request.mode === 'pressure-advance-pattern') return preparePAPatternProject({plan:verified,selection:applyCalibrationOverrides(selection,verified),signal});
  if (verified.inputFormat === '3mf') return prepareFlowRatioProject({ resourcesDir, plan: verified, selection: applyCalibrationOverrides(selection, verified), bed: calibrationBed(selection), signal });
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-web-calibration-'));
  try {
    const dataDirectory = path.join(directory, 'config'); await mkdir(dataDirectory);
    await runSlicer(binary, ['--export-stl', '--outputdir', directory, '--datadir', dataDirectory, path.join(resourcesDir, 'calib', verified.model.resource)], { cwd: directory, timeoutMs: 30000, signal });
    const folder = path.join(directory, 'stl');
    const files = (await readdir(folder)).filter(name => name.toLowerCase().endsWith('.stl'));
    if (files.length !== 1) throw new Error('Native calibration conversion did not produce exactly one mesh');
    const bytes = await readFile(path.join(folder, files[0]));
    if (bytes.length > 50 * 1024 * 1024) throw new Error('Native calibration model is too large');
    const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    try {
      const positions = geometry.getAttribute('position')?.array;
      if (!positions?.length) throw new Error('Native calibration resource contains no triangles');
      let sourcePositions = positions;
      // Dense curved calibration boundaries need the manifold plane cutter.
      // Keep its labelled native surface; do not substitute a generic tower.
      if (['vfa', 'max-volumetric-speed', 'retraction'].includes(verified.request.mode)) {
        let maxZ = -Infinity; for (let i = 2; i < positions.length; i += 3) maxZ = Math.max(maxZ, positions[i]);
        if (verified.model.maxZ < maxZ) sourcePositions = cutMesh(createMesh({ name: verified.label, positions }), { normal: [0,0,1], offset: verified.model.maxZ, keep: 'lower' }).lower.positions;
      }
      const bed = calibrationBed(selection);
      let scaleX = 1;
      if (verified.request.mode === 'max-volumetric-speed') {
        let minX = Infinity, maxX = -Infinity; for (let i = 0; i < sourcePositions.length; i += 3) { minX = Math.min(minX, sourcePositions[i]); maxX = Math.max(maxX, sourcePositions[i]); }
        scaleX = Math.min(1, (bed.max[0] - bed.min[0] - 10) / (maxX - minX));
        if (!(scaleX > 0)) throw new Error('The selected bed is too narrow for the native volumetric structure');
        sourcePositions = Array.from(sourcePositions); for (let i = 0; i < sourcePositions.length; i += 3) sourcePositions[i] *= scaleX;
      }
      const mesh = prepareCalibrationMesh(sourcePositions, verified, bed);
      return { calibration: verified.request, plan: scaleX === 1 ? verified : { ...verified, model: { ...verified.model, scaleX } }, objects: [mesh], nativeBaseline: CALIBRATION_SOURCE };
    } finally { geometry.dispose(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
