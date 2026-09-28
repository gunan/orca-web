import {isNativeLayerChange,nativeLayerZ} from './native-gcode-tags.js';
import { PA_PATTERN_MODE, createPAPatternPlan } from './pa-pattern-calibration.js';
import { verifyPAPatternGcode } from './pa-pattern-gcode.js';
import { PA_LINE_MODE, createPALinePlan } from './pa-line-calibration.js';
import { applyPALineGcode } from './pa-line-gcode.js';
import { MEASURED_CALIBRATION_MODES } from './calibration-results.js';
import { RETRACTION_MODE, createRetractionPlan, applyRetractionSchedule } from './retraction-calibration.js';
import { MAX_FLOW_MODE, createMaxFlowPlan, applyMaxFlowSchedule } from './max-flow-calibration.js';
import { VFA_MODE, createVfaPlan, applyVfaSchedule } from './vfa-calibration.js';
import { FLOW_RATIO_MODE, createFlowRatioPlan, verifyFlowRatioGcode } from './flow-ratio-calibration.js';
import { CORNERING_MODE, createCorneringPlan, corneringLayerCommand, assertCorneringScheduleUnopposed, removeCorneringTimeEstimate } from './cornering-calibration.js';
import { INPUT_SHAPING_MODES, createInputShapingPlan, inputShapingLayerCommand } from './input-shaping-calibration.js';
// Algorithms and native settings are traced to the pinned AGPL-3.0 OrcaSlicer
// source listed in docs/parity/CALIBRATION.md. This is a scoped web implementation.
export const CALIBRATION_SOURCE = Object.freeze({ version: '2.4.2', revision: '8500fcdccaa10b5099ac20d252af3a7c560046f1',
  url: 'https://github.com/OrcaSlicer/OrcaSlicer/tree/8500fcdccaa10b5099ac20d252af3a7c560046f1' });
export const CALIBRATION_MODES = Object.freeze([
  { id: 'temperature', label: 'Temperature tower', supported: true, defaults: { start: 230, end: 190, step: 5 }, unit: '°C' },
  { id: 'pressure-advance', label: 'Pressure advance tower', supported: true, defaults: { start: 0, end: 0.1, step: 0.002 }, unit: '' },
  PA_LINE_MODE,
  PA_PATTERN_MODE,
  FLOW_RATIO_MODE,
  MAX_FLOW_MODE,
  RETRACTION_MODE,
  CORNERING_MODE,
  ...INPUT_SHAPING_MODES,
  VFA_MODE
]);
export const CALIBRATION_REQUEST_KEYS = Object.freeze([...new Set(['mode', 'start', 'end', 'step', 'method', 'pattern', 'printNumbers', 'speeds', 'accelerations', ...INPUT_SHAPING_MODES.flatMap(item => Object.keys(item.defaults))])]);
const first = value => Array.isArray(value) ? value[0] : value;
const number = (value, label) => {
  if (value == null || value === '' || !['string', 'number'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number`);
  return Number(value);
};
const nativeValue = (object, key, fallback) => first(object?.[key]) ?? fallback;
const format = value => String(Number(value.toFixed(6)));
const forbidden = ['post_process', 'filament_start_gcode', 'filament_end_gcode'];

/** User input contains only numeric calibration parameters, never paths/G-code.
 * Resolved native selection is supplied by the server, not by the browser. */
export function createCalibrationPlan(input, selection) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Calibration parameters are required');
  const shaping = input.mode?.startsWith('input-shaping-'), cornering = input.mode === 'cornering', flowRatio = input.mode === 'flow-ratio', paLine = input.mode === 'pressure-advance-line', paPattern = input.mode === 'pressure-advance-pattern';
  const allowed = new Set(shaping || cornering || flowRatio || paLine || paPattern ? CALIBRATION_REQUEST_KEYS : ['mode', 'start', 'end', 'step']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unknown calibration parameter');
  const definition = CALIBRATION_MODES.find(item => item.id === input.mode);
  if (!definition?.supported) throw new Error('This calibration mode is not implemented');
  if (!selection?.printer || !selection?.process || !selection?.filament) throw new Error('Resolved printer, process and filament presets are required');
  const nozzle = number(nativeValue(selection.printer, 'nozzle_diameter'), 'Nozzle diameter');
  if (nozzle < 0.1 || nozzle > 1.2) throw new Error('Calibration supports nozzle diameters from 0.1 to 1.2 mm');
  if (Array.isArray(selection.printer.nozzle_diameter) && selection.printer.nozzle_diameter.length !== 1) throw new Error('Calibration currently requires one extruder');
  const flavor = String(nativeValue(selection.printer, 'gcode_flavor', ''));
  if (!['marlin', 'marlin2', 'klipper', 'reprapfirmware', 'repetier'].includes(flavor)) throw new Error('This calibration does not support the selected G-code flavor');
  if (nativeValue(selection.printer, 'printer_technology', 'FFF') !== 'FFF') throw new Error('Calibration requires an FFF printer');
  let params = shaping || cornering || flowRatio || paLine || paPattern ? null : { mode: input.mode, start: number(input.start, 'Start'), end: number(input.end, 'End'), step: number(input.step ?? definition.defaults.step, 'Step') };
  let model, corneringKind, flowData, process = { enable_wrapping_detection: '0', alternate_extra_wall: '0', seam_slope_type: 'none', precise_z_height: '0' };
  const printer = { resonance_avoidance: '0' }, filament = {};
  const limitations = ['One unmodified calibration object on one plate and one extruder are supported.', 'This generates an offline calibration file; selecting a measured result and saving a calibrated native preset are not implemented.'];
  if (paPattern) {
    const settings=createPAPatternPlan(input,selection,nozzle);params=settings.params;model=settings.model;flowData={paPatterns:settings.patterns,patternPlates:settings.plates,patternBed:settings.bed,patternActualEnd:settings.actualEnd,inputFormat:'3mf'};
    Object.assign(process,settings.process);Object.assign(printer,settings.printer);Object.assign(filament,settings.filament);limitations.splice(0,limitations.length,...settings.limitations);
  } else if (paLine) {
    const settings=createPALinePlan(input,selection,nozzle);params=settings.params;model=settings.model;flowData={paLine:settings.paLine};
    Object.assign(process,settings.process);Object.assign(printer,settings.printer);Object.assign(filament,settings.filament);limitations.push(...settings.limitations);
  } else if (input.mode === 'retraction') {
    const settings = createRetractionPlan(input, selection, nozzle); params = settings.params; model = settings.model; flowData = { retraction: settings.retraction };
    Object.assign(process, settings.process); Object.assign(printer, settings.printer); Object.assign(filament, settings.filament); limitations.push(...settings.limitations);
  } else if (input.mode === 'max-volumetric-speed') {
    const settings = createMaxFlowPlan(input, selection, nozzle); params = settings.params; model = settings.model; flowData = { speedCalibration: settings.speedCalibration, flowRate: settings.flowRate };
    Object.assign(process, settings.process); Object.assign(printer, settings.printer); Object.assign(filament, settings.filament); limitations.push(...settings.limitations);
  } else if (input.mode === 'vfa') {
    const settings = createVfaPlan(input, selection); params = settings.params; model = settings.model; flowData = { speedCalibration: settings.speedCalibration };
    Object.assign(process, settings.process); Object.assign(printer, settings.printer); Object.assign(filament, settings.filament); limitations.push(...settings.limitations);
  } else if (flowRatio) {
    const settings = createFlowRatioPlan(input, selection, nozzle);
    params = settings.params; model = settings.model; flowData = { flow: settings.flow, objectSettings: settings.objectSettings, inputFormat: '3mf' };
    Object.assign(process, settings.process); Object.assign(printer, settings.printer); Object.assign(filament, settings.filament);
    limitations.splice(0, limitations.length, ...settings.limitations);
  } else if (shaping || cornering) {
    const settings = cornering ? createCorneringPlan(input, selection, flavor) : createInputShapingPlan(input, selection, flavor);
    corneringKind = settings.corneringKind;
    params = settings.params; model = settings.model;
    Object.assign(process, settings.process); Object.assign(printer, settings.printer); Object.assign(filament, settings.filament);
    limitations.push(...settings.limitations);
  } else if (params.mode === 'temperature') {
    if (params.start > 500 || params.end < 155 || params.start < params.end + 5 || params.step !== 5 || params.start % 5 || params.end % 5) throw new Error('Temperature requires 5 °C steps, Start ≤ 500 °C, End ≥ 155 °C and Start ≥ End + 5 °C');
    const minZ = (500 - params.start) / 5 * 10, maxZ = ((500 - params.end) / 5 + 1) * 10;
    model = { resource: 'temperature_tower/temperature_tower.drc', minZ, maxZ, scale: nozzle / 0.4 };
    Object.assign(process, { layer_height: format(nozzle / 2), initial_layer_print_height: format(nozzle / 2), brim_type: 'outer_only', brim_width: '5', brim_object_gap: '0', overhang_reverse: '0' });
    Object.assign(filament, { nozzle_temperature_initial_layer: [format(params.start)], nozzle_temperature: [format(params.start)] });
    limitations.push('As in the native source, temperatures are interpolated over the actual sliced layer count in 5 °C steps.');
  } else {
    if (params.start < 0 || params.end > 2 || params.step <= 0 || params.end < params.start + params.step) throw new Error('Pressure advance requires 0 ≤ Start < End ≤ 2, Step > 0 and End ≥ Start + Step');
    if (Number(params.start.toPrecision(4)) === Number(params.end.toPrecision(4))) throw new Error('Pressure advance range is smaller than the native four-significant-digit command precision');
    const height = Math.ceil((params.end - params.start) / params.step - 1e-10) + 1;
    if (height > 60) throw new Error('Pressure advance range exceeds the native 60 mm tower; increase the step');
    const layerHeight = number(nativeValue(selection.process, 'layer_height'), 'Preset layer height');
    let width = nativeValue(selection.process, 'line_width', '0');
    width = String(width).endsWith('%') ? number(String(width).slice(0, -1), 'Line width') / 100 * nozzle : number(width, 'Line width');
    // Flow::auto_extrusion_width(frPerimeter, nozzle) uses 1.125 × nozzle.
    if (width <= 0) width = nozzle * 1.125;
    if (layerHeight <= 0 || width <= layerHeight) throw new Error('Pressure advance requires valid resolved layer height and line width');
    const flowArea = layerHeight * (width - layerHeight * (1 - Math.PI / 4));
    const volumetric = number(nativeValue(selection.filament, 'filament_max_volumetric_speed'), 'Filament volumetric limit');
    const outerSpeed = number(nativeValue(selection.process, 'outer_wall_speed'), 'Outer wall speed');
    const speed = Math.floor(Math.min(Math.max(100, outerSpeed), volumetric / flowArea));
    if (speed <= 0) throw new Error('The selected filament needs a positive volumetric limit for pressure advance calibration');
    model = { resource: 'pressure_advance/tower_with_seam.drc', minZ: 0, maxZ: height, scale: 1 };
    Object.assign(process, { outer_wall_speed: format(speed), inner_wall_speed: format(speed), seam_position: 'back', wall_loops: '2', top_shell_layers: '0', bottom_shell_layers: '0', sparse_infill_density: '0%', brim_type: 'brim_ears', brim_object_gap: '0', brim_ears_max_angle: '135', brim_width: '6', max_volumetric_extrusion_rate_slope: '0' });
    Object.assign(filament, { slow_down_layer_time: ['1'], enable_pressure_advance: ['0'], adaptive_pressure_advance: ['0'] });
    limitations.push('PA follows native start + floor(layer Z) × step; final boundary values can exceed the nominal end. Automatic PA calibration is not implemented.');
  }
  const height = (model.maxZ - model.minZ) * model.scale;
  const bedHeight = number(nativeValue(selection.printer, 'printable_height', 0), 'Printable height');
  if (height > bedHeight) throw new Error(`Calibration model height ${format(height)} mm exceeds the selected printer height`);
  const isBambu = String(nativeValue(selection.printer, 'printer_model', '')).startsWith('Bambu') || String(nativeValue(selection.printer, 'printer_structure', '')).toLowerCase() === 'bambu';
  if (paPattern) limitations.push('After inspecting the print, explicitly enter a measured PA value to save a new compatible fixed-PA filament preset. No measurement is inferred.');
  else if (MEASURED_CALIBRATION_MODES.includes(input.mode)) limitations[1] = 'After inspecting a physical print, explicitly enter a measured result to save a new compatible filament preset. The application does not infer or physically verify that result.';
  return { version: 1, source: CALIBRATION_SOURCE, request: params, label: definition.label, model, height, nozzle, flavor, isBambu,
    overrides: { printer, process, filament }, limitations, ...flowData, ...(cornering ? { corneringKind, corneringMachineLimits: { z: number(nativeValue(selection.printer, 'machine_max_jerk_z', 0), 'Z jerk'), e: number(nativeValue(selection.printer, 'machine_max_jerk_e', 0), 'Extruder jerk') } } : {}),
    context: { printer: String(selection.printer.name || ''), process: String(selection.process.name || ''), filament: String(selection.filament.name || '') } };
}

/** Apply generated settings directly to already-resolved native presets. These
 * keys must not be accepted as arbitrary client-supplied configuration. */
export function applyCalibrationOverrides(selection, plan) {
  const verified = createCalibrationPlan(plan.request, selection);
  const result = structuredClone(selection);
  for (const scope of ['printer', 'process', 'filament']) for (const [key, value] of Object.entries(verified.overrides[scope])) {
    if (forbidden.includes(key)) throw new Error('Invalid generated calibration setting');
    result[scope][key] = Array.isArray(result[scope][key]) && !Array.isArray(value) ? result[scope][key].map(() => value) : structuredClone(value);
  }
  return result;
}

// GCode::interpolate_value_across_layers at the pinned source. The engine's
// layer index is zero based; the first two layers return the start value.
export function interpolateCalibrationValue(start, end, index, count, step = 0) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 2 || index < 0 || index >= count) throw new Error('Invalid calibration layer index/count');
  start = Math.fround(start); end = Math.fround(end); step = Math.fround(step);
  if (index <= 1) return start;
  if (step > 0) { if (start > end) start = Math.fround(start + step); else end = Math.fround(end + step); }
  // The source uses float arithmetic, including the division; preserve its
  // boundary rounding instead of silently substituting JS double arithmetic.
  const ratio = Math.fround(index / Math.fround(count - 1));
  const value = Math.fround(start + Math.fround(ratio * Math.fround(end - start)));
  return step > 0 ? Math.trunc(Math.fround(value / step)) * step : value;
}

export function calibrationLayerCommand(plan, { index, count, z }) {
  if (!Number.isFinite(z) || z < 0) throw new Error('Invalid calibration layer Z');
  const { start, end, step, mode } = plan.request;
  if (mode === 'cornering') return corneringLayerCommand(plan, { index, count }, interpolateCalibrationValue);
  if (mode.startsWith('input-shaping-')) return inputShapingLayerCommand(plan, { index, count }, interpolateCalibrationValue);
  if (mode === 'temperature') return `M104 S${format(interpolateCalibrationValue(start, end, index, count, 5))}`;
  if (mode !== 'pressure-advance') throw new Error('Unsupported calibration output mode');
  const value = String(Number((start + Math.floor(z) * step).toPrecision(4)));
  if (plan.isBambu) return `M900 K${value} L1000 M10`;
  if (plan.flavor === 'klipper') return `SET_PRESSURE_ADVANCE ADVANCE=${value}`;
  if (plan.flavor === 'reprapfirmware') return `M572 D0 S${value}`;
  if (plan.flavor === 'repetier') return `M233 X${value} Y${value}`;
  return `M900 K${value}`;
}

/** Insert only after native layer-change code, in the same location used by
 * GCode.cpp's calibration switch. Reject incompatible output instead of
 * exporting an ordinary slice disguised as a calibration. */
export function applyCalibrationGcode(gcode, plan) {
  if (typeof gcode !== 'string' || gcode.length > 200 * 1024 * 1024) throw new Error('Invalid calibration G-code input');
  if (!/^;.*generated by OrcaSlicer 2\.4\.2\b/m.test(gcode)) throw new Error('Calibration postprocessing requires OrcaSlicer 2.4.2 G-code');
  if (gcode.includes('; ORCA_WEB_CALIBRATION ')) throw new Error('Calibration was already applied');
  if (plan.request.mode === 'pressure-advance-line') return applyPALineGcode(gcode,plan);
  if (plan.request.mode === 'pressure-advance-pattern') return {gcode:`; ORCA_WEB_CALIBRATION ${JSON.stringify({...plan.request,nativeVersion:plan.source.version,sourceRevision:plan.source.revision})}\n${gcode}`,summary:verifyPAPatternGcode(gcode,plan)};
  if (plan.request.mode === 'flow-ratio') {
    const summary = verifyFlowRatioGcode(gcode, plan);
    return { gcode: `; ORCA_WEB_CALIBRATION ${JSON.stringify({ ...plan.request, nativeVersion: CALIBRATION_SOURCE.version, sourceRevision: CALIBRATION_SOURCE.revision })}\n${gcode}`, summary };
  }
  const lines = gcode.split(/\r?\n/), layers = [];
  for (let index = 0; index < lines.length; index++) if (isNativeLayerChange(lines[index])) layers.push({ start: index });
  if (layers.length < 2 || layers.length > 5000) throw new Error('Calibration needs between 2 and 5000 native layers');
  const reported = gcode.match(/^; total layer number:\s*(\d+)/m);
  if (!reported || Number(reported[1]) !== layers.length) throw new Error('Calibration layer count does not match the native header');
  const inserts = new Map();
  for (let index = 0; index < layers.length; index++) {
    const start = layers[index].start, end = layers[index + 1]?.start ?? lines.length;
    let z, anchor = -1;
    for (let row = start + 1; row < Math.min(end, start + 1000); row++) {
      const layerZ = nativeLayerZ(lines[row]); if (layerZ !== undefined) z = layerZ;
      if (lines[row].trim() === ';_SET_FAN_SPEED_CHANGING_LAYER') { anchor = row; break; }
    }
    if (anchor < 0 || !Number.isFinite(z)) throw new Error(`Native calibration insertion anchor is missing on layer ${index + 1}`);
    // Native spiral towers emit one terminal closing layer with a repeated Z
    // tag. It is still counted in the native header and calibration schedule.
    const spiralClosure = plan.overrides.process.spiral_mode === '1' && /^; spiral_mode = 1$/m.test(gcode) && index === layers.length - 1 && z === layers[index - 1]?.z;
    if (index && (z < layers[index - 1].z || (z === layers[index - 1].z && !spiralClosure))) throw new Error('Calibration requires monotonically increasing layer heights on one object/plate');
    if (plan.request.mode === 'cornering') assertCorneringScheduleUnopposed(lines, anchor + 1, end, plan.corneringKind);
    layers[index].z = z; layers[index].anchor = anchor; layers[index].spiralClosure = spiralClosure;
  }
  // SpiralVase::process_layer duplicates the last layer's commands for its
  // closing extrusion pass. Native interpolation uses the original count
  // written in the footer, not the analyzer's expanded header count.
  const closingLayer = layers.at(-1).spiralClosure, scheduleLayers = layers.length - (closingLayer ? 1 : 0);
  if (plan.overrides.process.spiral_mode === '1') {
    const nativeCount = gcode.match(/^; total layers count = (\d+)$/m);
    if (!nativeCount || Number(nativeCount[1]) !== scheduleLayers) throw new Error('Spiral native schedule layer count is inconsistent');
  }
  if (plan.request.mode === 'retraction') {
    const scheduled = applyRetractionSchedule(lines, layers, plan);
    return { gcode: [`; ORCA_WEB_CALIBRATION ${JSON.stringify({ ...plan.request, nativeVersion: CALIBRATION_SOURCE.version, sourceRevision: CALIBRATION_SOURCE.revision })}`, '; Calibration time estimate unavailable: retraction changes extrusion after native slicing.', ...scheduled.lines].join('\n'), summary: { ...scheduled.summary, layers: layers.length, source: CALIBRATION_SOURCE } };
  }
  if (['vfa', 'max-volumetric-speed'].includes(plan.request.mode)) {
    const scheduled = plan.request.mode === 'vfa' ? applyVfaSchedule(lines, layers, plan) : applyMaxFlowSchedule(lines, layers, plan);
    return { gcode: [`; ORCA_WEB_CALIBRATION ${JSON.stringify({ ...plan.request, nativeVersion: CALIBRATION_SOURCE.version, sourceRevision: CALIBRATION_SOURCE.revision })}`, `; Calibration time estimate unavailable: ${plan.label} changes feedrates after native slicing.`, ...scheduled.lines].join('\n'), summary: { ...scheduled.summary, layers: layers.length, scheduleLayers, closingLayer: Boolean(closingLayer), source: CALIBRATION_SOURCE } };
  }
  for (let index = 0; index < layers.length; index++) {
    const { z, anchor } = layers[index];
    inserts.set(anchor, `${calibrationLayerCommand(plan, { index: Math.min(index, scheduleLayers - 1), count: scheduleLayers, z })} ; Orca Web calibration ${plan.request.mode}, layer ${index + 1}`);
  }
  const output = [`; ORCA_WEB_CALIBRATION ${JSON.stringify({ ...plan.request, nativeVersion: CALIBRATION_SOURCE.version, sourceRevision: CALIBRATION_SOURCE.revision })}`];
  if (plan.request.mode === 'cornering') output.push('; Calibration time estimate unavailable: cornering varies after native slicing.');
  for (let index = 0; index < lines.length; index++) {
    const line = plan.request.mode === 'cornering' ? removeCorneringTimeEstimate(lines[index]) : lines[index];
    if (line !== null) output.push(line); if (inserts.has(index)) output.push(inserts.get(index));
  }
  return { gcode: output.join('\n'), summary: { mode: plan.request.mode, layers: layers.length, scheduleLayers, closingLayer: Boolean(closingLayer), ...(plan.request.mode === 'cornering' ? { timeEstimate: 'unavailable-after-cornering-calibration' } : {}), firstCommand: inserts.values().next().value, lastCommand: [...inserts.values()].at(-1), source: CALIBRATION_SOURCE } };
}
