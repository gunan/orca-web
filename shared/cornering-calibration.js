// Native v2.4.2 Plater::Calib_Cornering, calib_dlg.cpp and
// GCodeWriter::{set_jerk_xy,set_junction_deviation}; see CALIBRATION.md.
const first = input => Array.isArray(input) ? input[0] : input;
const isTrue = input => input === true || input === 'true' || input === '1';
const numeric = (input, label) => {
  if (input == null || input === '' || !['number', 'string'].includes(typeof input) || !Number.isFinite(Number(input))) throw new Error(`${label} must be a finite number`);
  return Number(input);
};
export function corneringDefaults(printer) {
  const junction = first(printer?.gcode_flavor) === 'marlin2' && Number(first(printer?.machine_max_junction_deviation)) > 0;
  return { start: junction ? 0 : 1, end: junction ? 0.25 : 15, testModel: 'ringing' };
}
export const CORNERING_MODE = { id: 'cornering', label: 'Cornering', supported: true, defaults: { start: 1, end: 15, testModel: 'ringing' } };
export function createCorneringPlan(input, selection, flavor) {
  if (Object.keys(input).some(key => !['mode', 'start', 'end', 'testModel'].includes(key))) throw new Error('Unknown cornering parameter');
  const defaults = corneringDefaults(selection.printer), params = { mode: 'cornering', start: numeric(input.start ?? defaults.start, 'Start'), end: numeric(input.end ?? defaults.end, 'End'), testModel: input.testModel ?? defaults.testModel };
  const junction = flavor === 'marlin2' && Number(first(selection.printer.machine_max_junction_deviation)) > 0;
  if (params.start < 0 || params.end > (junction ? 0.3 : 100) || params.start >= params.end) throw new Error(`Cornering requires 0 ≤ Start < End ≤ ${junction ? '0.3 mm junction deviation' : '100 mm/s jerk'}`);
  if (!['ringing', 'fast', 'scv'].includes(params.testModel)) throw new Error('Choose the native ringing, fast or SCV-V2 tower');
  const printer = { resonance_avoidance: '0', input_shaping_emit: '1', input_shaping_type: 'Disable' };
  const process = { enable_overhang_speed: '0', timelapse_type: '0', wall_loops: '1', top_shell_layers: '0', bottom_shell_layers: '1', sparse_infill_density: '0%', detect_thin_wall: '0', spiral_mode: '1', spiral_mode_smooth: '0', bottom_surface_pattern: 'rectilinear', outer_wall_speed: '200', default_acceleration: '2000', outer_wall_acceleration: '2000', precise_z_height: '0', brim_type: 'outer_only', brim_width: '3', brim_object_gap: '0' };
  if (junction) { printer.machine_max_junction_deviation = [String(params.end)]; process.default_junction_deviation = '0'; }
  else { printer.machine_max_jerk_x = [String(params.end)]; printer.machine_max_jerk_y = [String(params.end)]; process.default_jerk = '0'; }
  const filament = { slow_down_layer_time: ['0'], slow_down_min_speed: ['0'], slow_down_for_layer_cooling: ['0'], filament_max_volumetric_speed: ['200'] };
  if (!isTrue(first(selection.filament.enable_pressure_advance))) Object.assign(filament, { enable_pressure_advance: ['1'], pressure_advance: ['0'], adaptive_pressure_advance: ['0'] });
  return { params, corneringKind: junction ? 'junction-deviation' : 'jerk', printer, process, filament,
    model: { resource: params.testModel === 'scv' ? 'cornering/SCV-V2.drc' : `input_shaping/${params.testModel === 'fast' ? 'fast_tower_test' : 'ringing_tower'}.drc`, minZ: 0, maxZ: params.testModel === 'scv' ? 100 : 60, scale: 1 },
    limitations: ['Cornering follows the native printer preset: positive Marlin 2 maximum junction deviation selects millimetres; other presets select jerk in mm/s.', 'The native source disables cooling slowdown, requests input shaping disabled, raises filament volumetric allowance to 200 mm³/s and uses 2,000 mm/s² acceleration.', 'Selected presets that emit competing in-layer cornering commands are rejected. Layer shifts and the best measured setting require physical evaluation; no measured result is chosen automatically.'] };
}
export function corneringLayerCommand(plan, { index, count }, interpolate) {
  const value = Math.min(plan.request.end, interpolate(plan.request.start, plan.request.end, index, count));
  if (plan.corneringKind === 'junction-deviation') return value > 0 ? `M205 J${value.toFixed(3)}` : '';
  if (value < 0.01) return '';
  const formatted = String(Number(value.toPrecision(6)));
  if (plan.flavor === 'klipper') return `SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=${formatted}`;
  if (plan.flavor === 'repetier') return `M207 X${formatted}`;
  const suffix = plan.isBambu ? ` Z${Number(plan.corneringMachineLimits.z).toPrecision(2)} E${Number(plan.corneringMachineLimits.e).toPrecision(2)}` : '';
  return `M205 X${formatted} Y${formatted}${suffix}`;
}

/** Refuse presets whose macros/role commands would overwrite the schedule.
 * Only the native object printing body is checked; start/end resets are kept. */
export function assertCorneringScheduleUnopposed(lines, start, end, kind) {
  let stop = end;
  for (let row = start; row < end; row++) if (/^; stop printing object /.test(lines[row])) stop = row;
  for (let row = start; row < stop; row++) {
    const command = lines[row].split(';')[0].trim();
    const conflicts = kind === 'junction-deviation' ? /^M205\b.*\bJ[-+\d.]/i.test(command) : /^M205\b.*\b[XY][-+\d.]/i.test(command) || /^M207\b.*\bX[-+\d.]/i.test(command) || /^M566\b/i.test(command) || /^SET_VELOCITY_LIMIT\b.*\bSQUARE_CORNER_VELOCITY=/i.test(command);
    if (conflicts) throw new Error('Preset emits a competing cornering command within a calibration layer. Remove that preset override and regenerate.');
  }
}

/** Native estimates were calculated before the varying cornering commands.
 * Drop their time/progress claims, while retaining material use and all moves. */
export function removeCorneringTimeEstimate(line) {
  if (/^\s*M73\b/i.test(line) || /^;\s*(estimated (?:first layer )?printing time|total estimated time|model printing time|total estimated printing time)\b/i.test(line)) return null;
  return line;
}
