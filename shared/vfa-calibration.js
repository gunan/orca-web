import {nativeFeature} from './native-gcode-tags.js';
import { displayedSettings } from './settings.js';
import { displayedProfileSettings } from './profile-settings.js';
import { removeCorneringTimeEstimate } from './cornering-calibration.js';

// OrcaSlicer 2.4.2 Plater::calib_VFA and GCode.cpp's Calib_VFA_Tower.
// A native maximum-speed slice retains native flow caps. Only its outer-wall
// feedrates are reduced to the per-height schedule; geometry/extrusion stay native.
export const VFA_MODE = Object.freeze({ id: 'vfa', label: 'VFA', supported: true, defaults: { start: 40, end: 200, step: 10 }, unit: 'mm/s' });
const first = value => Array.isArray(value) ? value[0] : value;
const finite = (value, name) => { if (value == null || value === '' || !['string','number'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error(`${name} must be a finite number`); return Number(value); };
const truth = value => value === true || value === '1';
export function speedCalibrationContext(selection, label) {
  const process = displayedSettings(selection.process, { includeDefaults: true }), filament = displayedProfileSettings('filament', selection.filament, { includeDefaults: true });
  if (Number(process.max_volumetric_extrusion_rate_slope) !== 0) throw new Error(`${label} currently requires pressure equalizer disabled; choose a process with zero maximum volumetric extrusion rate slope`);
  if (truth(first(filament.enable_pressure_advance)) && truth(first(filament.adaptive_pressure_advance))) throw new Error(`${label} currently requires adaptive pressure advance disabled`);
  if (Number(process.small_perimeter_threshold) !== 0) throw new Error(`${label} currently requires the small perimeter threshold set to zero`);
  if (Number(process.raft_layers) !== 0) throw new Error(`${label} requires a process without a raft`);
  const firstLayerSpeed = finite(process.initial_layer_speed, 'Native initial layer speed'), slowDownLayers = finite(process.slow_down_layers, 'Native slowdown layer count');
  if (firstLayerSpeed <= 0 || !Number.isInteger(slowDownLayers) || slowDownLayers < 0 || slowDownLayers > 1000) throw new Error(`${label} requires a positive initial speed and a valid native slowdown layer count`);
  return { firstLayerSpeed, slowDownLayers };
}
export function createVfaPlan(input, selection) {
  const params = { mode: 'vfa', start: finite(input.start ?? 40, 'Start'), end: finite(input.end ?? 200, 'End'), step: finite(input.step ?? 10, 'Step') };
  if (params.start <= 10 || params.end > 1000 || params.step <= 0 || params.end < params.start + params.step) throw new Error('VFA requires Start > 10 mm/s, End ≤ 1000 mm/s, Step > 0 and End ≥ Start + Step');
  const height = 5 * ((params.end - params.start) / params.step + 1);
  if (height > 300) throw new Error('VFA range exceeds the native 300 mm tower; increase the step');
  if (Math.round(params.start) === Math.round(params.end)) throw new Error('VFA range is smaller than native whole-mm/s speed precision');
  const { firstLayerSpeed, slowDownLayers } = speedCalibrationContext(selection, 'VFA');
  // The final layer can reach the next band exactly, matching floor(Z / 5).
  const baseSpeed = Math.round(params.start + Math.floor(height / 5 + 1e-10) * params.step);
  return { params, speedCalibration: { baseSpeed, firstLayerSpeed, slowDownLayers }, model: { resource: 'vfa/vfa.drc', minZ: 0, maxZ: height, scale: 1 },
    printer: { resonance_avoidance: '0' }, filament: { slow_down_layer_time: ['0'] },
    process: { enable_overhang_speed: '0', timelapse_type: '0', wall_loops: '1', alternate_extra_wall: '0', top_shell_layers: '0', bottom_shell_layers: '1', sparse_infill_density: '0%', detect_thin_wall: '0', spiral_mode: '1', enable_wrapping_detection: '0', precise_z_height: '0', brim_type: 'outer_only', brim_width: '3', brim_object_gap: '0', outer_wall_speed: String(baseSpeed) },
    limitations: ['Requested outer-wall speed is rounded to whole mm/s and changes every 5 mm using the native reported layer Z. The last boundary may reach one step above the nominal end.', 'The native first-layer speed, slowdown ramp and filament volumetric limit remain effective; actual commanded speed may be lower than the requested band.', 'Geometry and extrusion remain native. Time estimates and time-based progress are unavailable after changing feedrates. Pressure equalizer and adaptive pressure advance are not supported in this workflow.', 'Evaluate surface artifacts on the printed tower. No printer is contacted and no best speed is inferred.'] };
}
export function vfaRequestedSpeed(plan, z) { return Math.round(plan.request.start + Math.floor(z / 5) * plan.request.step); }
export function vfaLayerSpeed(plan, index, z, requestedSpeed = vfaRequestedSpeed) {
  const { firstLayerSpeed, slowDownLayers } = plan.speedCalibration;
  if (index === 0) return firstLayerSpeed;
  const speed = requestedSpeed(plan, z);
  return index < slowDownLayers && firstLayerSpeed < speed ? firstLayerSpeed + (speed - firstLayerSpeed) * index / slowDownLayers : speed;
}
const numberPattern = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
const words = new RegExp(`\\b([XYZEFIJR])(${numberPattern})`, 'gi');
const feedWord = new RegExp(`\\bF${numberPattern}`, 'i');
const fmt = value => String(Number(value.toFixed(3)));

/** Native role comments and object markers delimit the scheduled moves. Feed
 * state is restored for travel, retraction and end G-code, even when F was
 * modal in the original output. No XYZE or other command is changed. */
export function applyVfaSchedule(lines, layers, plan) { return applySpeedSchedule(lines, layers, plan, vfaRequestedSpeed); }
export function applySpeedSchedule(lines, layers, plan, requestedSpeed) {
  const label = plan.label;
  const text = lines.join('\n');
  for (const [key,value] of Object.entries({outer_wall_speed:plan.speedCalibration.baseSpeed,initial_layer_speed:plan.speedCalibration.firstLayerSpeed,slow_down_layers:plan.speedCalibration.slowDownLayers,spiral_mode:1,enable_overhang_speed:0,slow_down_layer_time:0,max_volumetric_extrusion_rate_slope:0,small_perimeter_threshold:0})) {
    const match = text.match(new RegExp(`^; ${key} = (.+)$`,'m'));
    if (!match || Number(match[1]) !== value) throw new Error(`Native ${label} setting ${key} does not match the prepared calibration`);
  }
  if (/^\s*G(?:20|93)\b/m.test(text)) throw new Error(`${label} requires native millimetre units and feedrates per minute`);
  const output = [], starts = new Map(layers.map((layer,index) => [layer.start,index])), anchors = new Map(layers.map((layer,index) => [layer.anchor,index]));
  let layerIndex = -1, object = false, feature = '', e = 0, relative = false, rawFeed, emittedFeed, changedMoves = 0, cappedMoves = 0, outerMoves = 0;
  const effectiveSpeeds = new Set(), scheduledLayers = new Set();
  for (let row = 0; row < lines.length; row++) {
    let line = removeCorneringTimeEstimate(lines[row]); if (line === null) continue;
    if (starts.has(row)) { layerIndex = starts.get(row); object = false; }
    if (/^; printing object /.test(line)) object = true;
    if (/^; stop printing object /.test(line)) object = false;
    const role = nativeFeature(line); if (role !== undefined) feature = role;
    const semicolon = line.indexOf(';'), command = (semicolon < 0 ? line : line.slice(0,semicolon)).trim(), suffix = semicolon < 0 ? '' : line.slice(semicolon);
    if (/^M83\b/.test(command)) relative = true;
    if (/^M82\b/.test(command)) relative = false;
    const values = Object.fromEntries([...command.matchAll(words)].map(match => [match[1].toUpperCase(),Number(match[2])]));
    if (/^G92\b/.test(command) && values.E !== undefined) e = values.E;
    if (/^G[0123]\b/.test(command)) {
      if (values.F !== undefined) rawFeed = values.F;
      const deltaE = values.E === undefined ? 0 : relative ? values.E : values.E - e;
      let wanted = rawFeed;
      if (object && layerIndex >= 0 && row > layers[layerIndex].anchor && feature === 'Outer wall' && deltaE > 0 && ['X','Y','I','J'].some(key => values[key] !== undefined)) {
        if (!(rawFeed > 0)) throw new Error(`Native ${label} outer-wall feedrate is missing`);
        const index = layers[layerIndex].spiralClosure ? layerIndex - 1 : layerIndex;
        const target = vfaLayerSpeed(plan,index,layers[layerIndex].z,requestedSpeed) * 60;
        wanted = Math.min(rawFeed,target); outerMoves++; scheduledLayers.add(layerIndex);
        if (rawFeed < target - .01) cappedMoves++;
        if (Math.abs(wanted - rawFeed) > .0005) changedMoves++;
        effectiveSpeeds.add(fmt(wanted / 60));
      }
      if (wanted !== undefined) {
        wanted = Number(fmt(wanted));
        if (values.F !== undefined) line = command.replace(feedWord,`F${fmt(wanted)}`) + (suffix ? ` ${suffix}` : '');
        else if (emittedFeed !== wanted) line = `${command} F${fmt(wanted)}${suffix ? ` ${suffix}` : ''}`;
        emittedFeed = wanted;
      }
      if (values.E !== undefined) e = relative ? e + values.E : values.E;
    }
    output.push(line);
    if (anchors.has(row)) output.push(`; Orca Web calibration ${plan.request.mode}, layer ${anchors.get(row)+1}, requested outer-wall speed ${requestedSpeed(plan,layers[anchors.get(row)].z)} mm/s`);
  }
  if (!outerMoves || scheduledLayers.size !== layers.length) throw new Error(`Native ${label} output is missing outer-wall extrusion on a calibration layer`);
  return { lines: output, summary: { mode: plan.request.mode, changedMoves, outerMoves, cappedMoves, effectiveSpeeds: [...effectiveSpeeds].map(Number).sort((a,b)=>a-b), firstRequestedSpeed: requestedSpeed(plan,layers[0].z), lastRequestedSpeed: requestedSpeed(plan,layers.at(-1).z), timeEstimate: 'unavailable-after-speed-calibration' } };
}
