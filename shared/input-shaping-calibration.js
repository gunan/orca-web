// OrcaSlicer 2.4.2, pinned 8500fcd: Plater.cpp calib_input_shaping_*,
// Tab.cpp input_shaper_types_for_flavor, GCode.cpp calibration switch,
// GCodeWriter.cpp set_input_shaping. See docs/parity/CALIBRATION.md.
export const INPUT_SHAPER_TYPES = Object.freeze({
  klipper: ['Default', 'ZV', 'MZV', 'ZVD', 'EI', '2HUMP_EI', '3HUMP_EI'],
  reprapfirmware: ['Default', 'MZV', 'ZVD', 'ZVDD', 'ZVDDD', 'EI2', 'EI3', 'DAA'],
  marlin2: ['ZV']
});
export const INPUT_SHAPING_MODES = [
  { id: 'input-shaping-frequency', label: 'Input shaping frequency', supported: true, defaults: { testModel: 'ringing', shaperType: 'auto', frequencyStartX: 15, frequencyEndX: 110, frequencyStartY: 15, frequencyEndY: 110, damping: 0.15 } },
  { id: 'input-shaping-damping', label: 'Input shaping damping', supported: true, defaults: { testModel: 'ringing', shaperType: 'auto', frequencyX: 30, frequencyY: 30, start: 0, end: 0.4 } }
];
const first = value => Array.isArray(value) ? value[0] : value;
const value = (object, key, fallback) => first(object?.[key]) ?? fallback;
const finite = (input, label) => {
  if (input == null || input === '' || !['string', 'number'].includes(typeof input) || !Number.isFinite(Number(input))) throw new Error(`${label} must be a finite number`);
  return Number(input);
};
const isTrue = input => input === true || input === 'true' || input === '1';

export function createInputShapingPlan(input, selection, flavor) {
  const definition = INPUT_SHAPING_MODES.find(item => item.id === input.mode);
  if (!definition) throw new Error('Unknown input shaping mode');
  if (Object.keys(input).some(key => key !== 'mode' && !(key in definition.defaults))) throw new Error('Unknown input shaping parameter');
  const types = INPUT_SHAPER_TYPES[flavor];
  if (!types) throw new Error('Input shaping requires Klipper, RepRapFirmware or Marlin 2; Marlin requires firmware 2.1.2 or newer');
  const params = { mode: input.mode };
  for (const [key, fallback] of Object.entries(definition.defaults)) params[key] = key === 'testModel' || key === 'shaperType' ? (input[key] ?? fallback) : finite(input[key] ?? fallback, key);
  if (!['ringing', 'fast'].includes(params.testModel)) throw new Error('Choose the native ringing or fast tower');
  if (params.shaperType === 'auto') params.shaperType = types[0];
  if (!types.includes(params.shaperType)) throw new Error(`Input shaper type must be one of ${types.join(', ')} for ${flavor}`);
  if (params.mode === 'input-shaping-frequency') {
    if (flavor === 'reprapfirmware') { params.frequencyStartY = params.frequencyStartX; params.frequencyEndY = params.frequencyEndX; }
    for (const axis of ['X', 'Y']) if (params[`frequencyStart${axis}`] < 0 || params[`frequencyEnd${axis}`] > 500 || params[`frequencyStart${axis}`] >= params[`frequencyEnd${axis}`]) throw new Error('Frequency sweep requires 0 ≤ Start < End ≤ 500 Hz on each axis');
    if (params.damping < 0 || params.damping >= 1) throw new Error('Damping must be at least 0 and below 1');
  } else {
    if (flavor === 'reprapfirmware') params.frequencyY = params.frequencyX;
    if (params.frequencyX < 0 || params.frequencyX > 500 || params.frequencyY < 0 || params.frequencyY > 500) throw new Error('Fixed frequency must be between 0 and 500 Hz');
    if (params.start < 0 || params.end > 1 || params.start >= params.end) throw new Error('Damping sweep requires 0 ≤ Start < End ≤ 1');
  }
  const printer = { resonance_avoidance: '0', input_shaping_emit: '0' };
  const process = { enable_overhang_speed: '0', timelapse_type: '0', wall_loops: '1', top_shell_layers: '0', bottom_shell_layers: '1', sparse_infill_density: '0%', detect_thin_wall: '0', spiral_mode: '1', spiral_mode_smooth: '0', bottom_surface_pattern: 'rectilinear', outer_wall_speed: '200', default_acceleration: '20000', outer_wall_acceleration: '20000', precise_z_height: '0', brim_type: 'outer_only', brim_width: '3', brim_object_gap: '0' };
  if (input.mode === 'input-shaping-frequency') process.layer_height = '0.2';
  const junction = finite(value(selection.printer, 'machine_max_junction_deviation', 0), 'Junction deviation');
  if (flavor === 'marlin2' && junction > 0) {
    printer.machine_max_junction_deviation = [String(Math.max(junction, 0.25))]; process.default_junction_deviation = '0';
  } else {
    for (const axis of ['x', 'y']) printer[`machine_max_jerk_${axis}`] = [String(Math.max(finite(value(selection.printer, `machine_max_jerk_${axis}`, 0), `Jerk ${axis}`), flavor === 'klipper' ? 5 : 10))];
    process.default_jerk = '0';
  }
  const filament = { slow_down_layer_time: ['0'], slow_down_min_speed: ['0'], slow_down_for_layer_cooling: ['0'] };
  if (!isTrue(value(selection.filament, 'enable_pressure_advance', false))) Object.assign(filament, { enable_pressure_advance: ['1'], pressure_advance: ['0'], adaptive_pressure_advance: ['0'] });
  return { params, model: { resource: `input_shaping/${params.testModel === 'ringing' ? 'ringing_tower' : 'fast_tower_test'}.drc`, minZ: 0, maxZ: 60, scale: 1 }, printer, process, filament,
    limitations: ['Firmware support is required: Marlin 2.1.2+, Klipper 0.9.0+, or RepRapFirmware 3.4.0+ with a compatible shaper.', 'Zero frequency or damping retains the firmware value, matching the native command writer; it does not turn input shaping off.', 'The 60 mm native tower uses a continuous spiral wall. The frequency test uses 0.2 mm layers; damping retains the selected layer height.', 'Commands follow the native first/second-layer special cases. No vibration measurements or measured-result preset updates are performed.'] };
}

/** Exact firmware parameter formatting from GCodeWriter::set_input_shaping. */
export function inputShapingCommand(flavor, axis, damping = 0, frequency = 0, type = '') {
  const params = [];
  if (flavor === 'klipper') {
    if (type && type !== 'Default') params.push(`SHAPER_TYPE=${type}`);
    for (const target of axis === 'A' ? ['X', 'Y'] : [axis]) if (frequency > 0) params.push(`SHAPER_FREQ_${target}=${frequency.toFixed(2)}`);
    for (const target of axis === 'A' ? ['X', 'Y'] : [axis]) if (damping > 0) params.push(`DAMPING_RATIO_${target}=${damping.toFixed(3)}`);
    return params.length ? `SET_INPUT_SHAPER ${params.join(' ')}` : '';
  }
  if (flavor === 'reprapfirmware') {
    if (type && type !== 'Default' && type !== 'DAA') params.push(`P"${type}"`);
  } else if (flavor === 'marlin2') {
    if (axis !== 'A') params.push(axis);
  } else throw new Error('Unsupported input shaping firmware');
  if (frequency > 0) params.push(`F${frequency.toFixed(2)}`);
  if (damping > 0) params.push(`${flavor === 'reprapfirmware' ? 'S' : 'D'}${damping.toFixed(3)}`);
  return params.length ? `M593 ${params.join(' ')}` : '';
}

export function inputShapingLayerCommand(plan, { index, count }, interpolate) {
  const p = plan.request, command = (axis, damping, frequency, type = '') => inputShapingCommand(plan.flavor, axis, Math.fround(damping), Math.fround(frequency), type);
  const cruise = plan.flavor === 'klipper' ? 'SET_VELOCITY_LIMIT MINIMUM_CRUISE_RATIO=0' : '';
  if (p.mode === 'input-shaping-frequency') {
    if (index === 1) return [command('A', p.damping, 0, p.shaperType), cruise].filter(Boolean).join('\n');
    const x = interpolate(p.frequencyStartX, p.frequencyEndX, index, count), y = interpolate(p.frequencyStartY, p.frequencyEndY, index, count);
    return p.frequencyStartX === p.frequencyStartY && p.frequencyEndX === p.frequencyEndY ? command('A', 0, x) : [command('X', 0, x), command('Y', 0, y)].filter(Boolean).join('\n');
  }
  if (index === 1) return [cruise, command('X', 0, p.frequencyX, p.shaperType), command('Y', 0, p.frequencyY, p.shaperType)].filter(Boolean).join('\n');
  return command('A', interpolate(p.start, p.end, index, count), 0);
}
