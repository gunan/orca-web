import materialRanges from './native-material-ranges.json' with { type: 'json' };
import { definitionsByScope } from './profile-settings.js';

export const dependencyProvenance = { version: '2.4.2', commit: '8500fcdccaa10b5099ac20d252af3a7c560046f1', files: ['src/slic3r/GUI/ConfigManipulation.cpp', 'src/slic3r/GUI/Tab.cpp', 'src/libslic3r/libslic3r.h', 'src/libslic3r/PrintConfig.cpp', 'src/libslic3r/PrintConfig.hpp', 'src/libslic3r/MaterialType.cpp'] };
const source = (line, file = 'ConfigManipulation.cpp') => ({ file, line, commit: dependencyProvenance.commit });
const maps = Object.fromEntries(Object.entries(definitionsByScope).map(([scope, options]) => [scope, new Map(options.map(option => [option.key, option]))]));
const list = value => value.split(' ').filter(Boolean);
const multilinePatterns = ['gyroid','grid','rectilinear','tpmsd','tpmsfk','crosshatch','honeycomb','lateral-lattice','lateral-honeycomb','concentric','cubic','stars','alignedrectilinear','lightning','3dhoneycomb','adaptivecubic','supportcubic','triangles','quartercubic','archimedeanchords','hilbertcurve','octagramspiral'];


// PrintConfig.cpp:9004. IDs are one-based; returned native variant indices are zero-based.
export function resolvePrinterVariantIndex(printer, projectSettings = {}, extruderIndex = 0) {
  const value=key=>printer[key]??maps.machine.get(key)?.default;
  const at=(key,index)=>{const a=value(key);return Array.isArray(a)?a[index]??a[0]:a;};
  const variants=value('printer_extruder_variant'),ids=value('printer_extruder_id');
  if(!Array.isArray(variants))return -1;
  const volumes=projectSettings.nozzle_volume_type;
  const volume=Array.isArray(volumes)?volumes[extruderIndex]??volumes[0]:volumes??'Standard';
  const target=`${at('extruder_type',extruderIndex)} ${volume}`;
  const generated=(value('extruder_variant_list')||[]).flatMap((text,index)=>String(text).split(',').map(item=>item.trim()).filter(Boolean).map(()=>index+1));
  const completeIds=Array.isArray(ids)&&ids.length>=variants.length;
  return variants.findIndex((variant,index)=>variant===target&&Number(completeIds?ids[index]:generated[index])===extruderIndex+1);
}

// Evaluates supplied native values without mutating or silently accepting dialogs.
// Callers apply accepted corrections and reevaluate to obtain the resulting state.
export function evaluateSettingsState({ printer = {}, process: processConfig = {}, filament = {}, context = {} } = {}) {
  const values = { machine: printer, process: processConfig, filament };
  const fields = Object.fromEntries(Object.entries(maps).map(([scope, options]) => [scope, Object.fromEntries([...options.keys()].map(key => [key, { enabled: true, visible: true, reasons: [], evaluated: false, sources: [] }]))]));
  const corrections = [], warnings = [], errors = [], unresolved = [];
  const raw = (key, scope = 'process') => values[scope][key] ?? maps[scope].get(key)?.default;
  const first = (key, scope) => { const value = raw(key, scope); return Array.isArray(value) ? value[0] : value; };
  const str = (key, scope) => String(first(key, scope) ?? '');
  const num = (key, scope) => { const value = first(key, scope); return value && typeof value === 'object' ? Number(value.value) : parseFloat(value); };
  const bool = (key, scope) => [true, 1, '1'].includes(first(key, scope));
  const reasons = new Map();
  function toggle(keys, property, condition, reason, line, scope = 'process', file) {
    for (const key of typeof keys === 'string' ? list(keys) : keys) {
      if (!fields[scope][key]) continue;
      const field = fields[scope][key], reference = source(line, file);
      if (condition === null || condition === undefined) { unresolved.push({ scope, key, property, reason, source: reference }); continue; }
      field[property] = Boolean(condition); field.evaluated = true; field.sources.push(reference);
      const identity = `${scope}.${key}.${property}`;
      if (!condition) reasons.set(identity, reason); else reasons.delete(identity);
      field.reasons = ['enabled', 'visible'].map(name => reasons.get(`${scope}.${key}.${name}`)).filter(Boolean);
    }
  }
  const enabled = (keys, condition, reason, line, scope, file) => toggle(keys, 'enabled', condition, reason, line, scope, file);
  const visible = (keys, condition, reason, line, scope, file) => toggle(keys, 'visible', condition, reason, line, scope, file);
  function correction(key, value, reason, line, { scope = 'process', mode = 'automatic', group, alternative, file } = {}) {
    const option = maps[scope].get(key);
    let current = raw(key, scope);
    // Native preset JSON can retain scalar-in-array legacy values. The native
    // option is still scalar after loading; vector/point options keep their shape.
    if (Array.isArray(current) && !['coFloats','coInts','coStrings','coBools','coPercents','coEnums','coPoint','coPoints','coPointsGroups'].includes(option?.nativeType)) current = current[0];
    const comparable = item => {
      if (Array.isArray(item)) return item.map(comparable);
      if (item === true || item === false) return item ? '1' : '0';
      if (option?.nativeType === 'coPercent' || option?.nativeType === 'coPercents') return String(parseFloat(item));
      if (option?.nativeType === 'coFloatOrPercent' && item && typeof item === 'object') return `${item.value}${item.percent ? '%' : ''}`;
      return String(item);
    };
    if (JSON.stringify(comparable(current)) === JSON.stringify(comparable(value))) return;
    corrections.push({ scope, key, value, reason, mode, ...(group ? { group } : {}), ...(alternative ? { alternative } : {}), source: source(line, file) });
  }
  const isGlobal = context.isGlobal !== false, isPlate = context.isPlate === true;
  const isBbl = typeof context.isBblPrinter === 'boolean' ? context.isBblPrinter : null;
  const flavor = str('gcode_flavor', 'machine'), marlin2 = flavor === 'marlin2', klipper = flavor === 'klipper';
  const slope = num('max_volumetric_extrusion_rate_slope') > 0;
  enabled('enable_arc_fitting', !slope, 'Disabled while extrusion rate smoothing is active.', 606);
  visible('max_volumetric_extrusion_rate_slope_segment_length extrusion_rate_smoothing_external_perimeter_only', slope, 'Requires extrusion rate smoothing.', 607);
  if (slope) correction('enable_arc_fitting', false, 'Native extrusion rate smoothing disables arc fitting.', 609);
  if (num('max_volumetric_extrusion_rate_slope_segment_length') < .5) correction('max_volumetric_extrusion_rate_slope_segment_length', '1', 'Native minimum segment length is reset to 1 mm.', 610);
  const walls = num('wall_loops') > 0, infill = num('sparse_infill_density') > 0, pattern = str('sparse_infill_pattern');
  enabled('extra_perimeters_on_overhangs ensure_vertical_shell_thickness detect_thin_wall detect_overhang_wall seam_position staggered_inner_seams wall_sequence outer_wall_line_width inner_wall_speed outer_wall_speed small_perimeter_speed small_perimeter_threshold', walls, 'Requires at least one wall loop.', 616);
  visible('sparse_infill_pattern infill_combination fill_multiline infill_direction minimum_sparse_infill_area sparse_infill_filament_id infill_anchor infill_anchor_max infill_shift_step sparse_infill_rotate_template symmetric_infill_y_axis', infill, 'Requires nonzero sparse infill.', 624);
  visible('infill_combination_max_layer_height', infill && bool('infill_combination'), 'Requires infill combination and nonzero infill.', 629);
  visible('gyroid_optimized', infill && pattern === 'gyroid', 'Requires gyroid infill.', 638);
  if (infill) {
    enabled('fill_multiline', multilinePatterns.includes(pattern), 'This infill pattern does not support multiline infill.', 642);
    if (!multilinePatterns.includes(pattern)) correction('fill_multiline', '1', 'Native unsupported multiline patterns use one line.', 646);
    enabled('infill_anchor_max', pattern !== 'line', 'Line infill does not use these anchors.', 652);
    enabled('infill_anchor', pattern !== 'line' && num('infill_anchor_max') > 0, 'Requires enabled infill anchors.', 656);
  }
  const locked = pattern === 'lockedzag', cross = pattern === 'crosszag';
  visible('infill_shift_step', cross || locked, 'Requires cross zag or locked zag infill.', 663);
  visible('skeleton_infill_density skin_infill_density infill_lock_depth skin_infill_depth skin_infill_line_width skeleton_infill_line_width', locked, 'Requires locked zag infill.', 666);
  visible('symmetric_infill_y_axis', pattern === 'zigzag' || cross || locked, 'Requires zig zag, cross zag, or locked zag infill.', 670);
  const vase = bool('spiral_mode'), top = num('top_shell_layers') > 0 || (vase && num('bottom_shell_layers') > 1), bottom = num('bottom_shell_layers') > 0;
  visible('spiral_mode_smooth spiral_starting_flow_ratio spiral_finishing_flow_ratio', vase, 'Requires spiral vase mode.', 673);
  visible('spiral_mode_max_xy_smoothing', vase && bool('spiral_mode_smooth'), 'Requires spiral mode smoothing.', 674);
  enabled('top_surface_pattern top_surface_density', top, 'Requires top shell layers.', 680);
  enabled('bottom_surface_pattern bottom_surface_density', bottom, 'Requires bottom shell layers.', 681);
  enabled('infill_direction sparse_infill_line_width gap_fill_target filter_out_gap_fill infill_wall_overlap sparse_infill_speed bridge_speed internal_bridge_speed bridge_angle internal_bridge_angle relative_bridge_angle solid_infill_direction solid_infill_rotate_template internal_solid_infill_pattern internal_solid_filament_id top_surface_filament_id bottom_surface_filament_id', infill || top || bottom, 'Requires sparse or solid infill.', 685);
  enabled('top_shell_thickness', !vase && top, 'Requires top shells outside spiral vase mode.', 691);
  enabled('bottom_shell_thickness', !vase && bottom, 'Requires bottom shells outside spiral vase mode.', 692);
  enabled('gap_infill_speed', walls, 'Requires walls.', 695);
  enabled('top_surface_line_width top_surface_speed', top, 'Requires top shell layers.', 698);
  enabled('outer_wall_acceleration inner_wall_acceleration initial_layer_acceleration initial_layer_travel_acceleration top_surface_acceleration travel_acceleration bridge_acceleration sparse_infill_acceleration internal_solid_infill_acceleration', num('default_acceleration') > 0, 'Requires nonzero default acceleration.', 702);
  const jd = marlin2 && num('machine_max_junction_deviation', 'machine') > 0;
  visible('default_junction_deviation', marlin2, 'Requires Marlin 2 firmware.', 713);
  enabled('default_junction_deviation', jd, 'Requires a machine junction deviation greater than zero.', 714);
  enabled('default_jerk', !jd, 'Disabled while junction deviation is active.', 715);
  const jerks = 'outer_wall_jerk inner_wall_jerk initial_layer_jerk initial_layer_travel_jerk top_surface_jerk travel_jerk infill_jerk';
  visible(jerks, !jd, 'Disabled while junction deviation is active.', 724);
  if (!jd) enabled(jerks, num('default_jerk') > 0, 'Requires nonzero default jerk.', 729);
  const skirt = num('skirt_loops') > 0, brim = str('brim_type') !== 'no_brim';
  enabled('skirt_height', skirt && str('draft_shield') !== 'enabled', 'Requires skirts without an enabled draft shield.', 734);
  visible('single_loop_draft_shield', skirt, 'Requires skirts.', 735);
  enabled('skirt_type min_skirt_length skirt_distance skirt_start_angle skirt_speed draft_shield', skirt, 'Requires skirts.', 737);
  enabled('brim_object_gap brim_use_efc_outline combine_brims brim_flow_ratio', brim, 'Requires a brim.', 740);
  enabled('brim_width', brim && !['auto_brim','painted'].includes(str('brim_type')), 'Width is managed by automatic or painted brims.', 745);
  enabled('outer_wall_filament_id inner_wall_filament_id', walls || brim, 'Requires walls or a brim.', 748);
  enabled('brim_ears_max_angle brim_ears_detection_length', num('brim_width') > 0, 'Requires nonzero brim width.', 754);
  visible('brim_ears_max_angle brim_ears_detection_length', str('brim_type') === 'brim_ears', 'Requires brim ears.', 757);
  visible('elefant_foot_compensation_layers', num('elefant_foot_compensation') > 0 || num('elefant_foot_layers_density') < 100, 'Requires elephant foot compensation or reduced layer density.', 761);
  const raft = num('raft_layers') > 0, support = bool('enable_support') || raft, supportType = str('support_type'), style = str('support_style');
  const autoSupport = ['normal(auto)','tree(auto)'].includes(supportType), tree = bool('enable_support') && ['tree(auto)','tree(manual)'].includes(supportType);
  const organic = tree && ['organic','default'].includes(style), normalTree = tree && !organic, supportInterface = num('support_interface_top_layers') > 0 || num('support_interface_bottom_layers') > 0;
  enabled('support_style support_base_pattern support_base_pattern_spacing support_expansion support_angle support_interface_pattern support_interface_top_layers support_interface_bottom_layers bridge_no_support max_bridge_length support_top_z_distance support_bottom_z_distance support_type support_on_build_plate_only support_critical_regions_only support_interface_not_for_body support_object_xy_distance support_object_first_layer_gap independent_support_layer_height', support, 'Requires support or a raft.', 771);
  enabled('support_threshold_angle', support && autoSupport, 'Requires automatic supports.', 777);
  enabled('support_threshold_overlap', num('support_threshold_angle') === 0 && support && autoSupport, 'Requires automatic supports with a zero threshold angle.', 778);
  visible('support_threshold_overlap', !tree, 'Tree supports do not use threshold overlap.', 786);
  visible('tree_support_branch_angle tree_support_branch_distance tree_support_branch_diameter tree_support_auto_brim tree_support_brim_width', normalTree, 'Requires non-organic tree supports.', 789);
  visible('tree_support_branch_angle_organic tree_support_branch_distance_organic tree_support_branch_diameter_organic tree_support_angle_slow tree_support_tip_diameter tree_support_top_rate tree_support_branch_diameter_angle', organic, 'Requires organic tree supports.', 792);
  visible('independent_support_layer_height', support && !organic, 'Independent layer height is unavailable for organic supports.', 795);
  enabled('tree_support_brim_width', tree && !bool('tree_support_auto_brim'), 'Requires tree supports with automatic brim disabled.', 797);
  visible('max_bridge_length', tree, 'Used by tree supports.', 799);
  visible('bridge_no_support', !tree, 'Used by non-tree supports.', 800);
  visible('support_critical_regions_only', autoSupport && tree, 'Requires automatic tree supports.', 801);
  enabled('support_interface_filament support_interface_loop_pattern support_bottom_interface_spacing', support && supportInterface, 'Requires support interface layers.', 805);
  const canIronSupport = raft || (support && num('support_interface_top_layers') > 0), supportIron = canIronSupport && bool('support_ironing');
  enabled('support_ironing', canIronSupport, 'Requires a raft or top support interface layers.', 808);
  visible('support_ironing_pattern support_ironing_flow support_ironing_spacing', supportIron, 'Requires support ironing.', 811);
  enabled('support_interface_spacing', support && supportInterface && !supportIron, 'Support ironing uses a solid support interface.', 813);
  enabled('inner_wall_line_width', walls || skirt || brim, 'Requires walls, a skirt, or a brim.', 824);
  enabled('support_filament', support || skirt, 'Requires supports or skirts.', 825);
  visible('raft_contact_distance', raft && !(support && num('support_top_z_distance') === 0), 'Requires a raft with a nonzero support top gap.', 827);
  enabled('raft_first_layer_density', support, 'Requires support or a raft.', 830);
  enabled('raft_first_layer_expansion', support && (!normalTree || style === 'tree_hybrid' || raft), 'Regular slim/strong tree supports without a raft do not use first-layer expansion.', 833);
  const ironing = str('ironing_type') !== 'no ironing';
  visible('ironing_pattern ironing_flow ironing_spacing ironing_angle ironing_inset ironing_angle_fixed', ironing, 'Requires ironing.', 838);
  enabled('ironing_angle ironing_angle_fixed', ironing && str('ironing_pattern') === 'rectilinear', 'Requires rectilinear ironing.', 841);
  visible('ironing_speed', ironing || supportIron, 'Requires object or support ironing.', 843);
  visible('zaa_minimize_perimeter_height zaa_min_z zaa_dont_alternate_fill_direction ironing_expansion', bool('zaa_enabled'), 'Requires Z anti-aliasing.', 847);
  enabled('print_order', str('print_sequence') !== 'by object', 'Object-by-object printing controls its own sequence.', 852);
  enabled('single_extruder_multi_material', isBbl === null ? null : !isBbl, 'Requires a non-Bambu printer context.', 854);
  const semm = bool('single_extruder_multi_material', 'machine');
  const tower2 = str('wipe_tower_type','machine') === 'type2' ? isBbl === null ? null : !isBbl : false;
  enabled('ooze_prevention', !semm, 'Unavailable for a single extruder multimaterial printer.', 859);
  visible('standby_temperature_delta preheat_time', bool('ooze_prevention'), 'Requires ooze prevention.', 861);
  visible('preheat_steps', bool('ooze_prevention') && num('preheat_steps') > 0, 'Requires ooze prevention and positive preheat steps.', 864);
  const tower = bool('enable_prime_tower'), towerWall = str('wipe_tower_wall_type'), rib = tower && towerWall === 'rib';
  visible('prime_tower_width prime_tower_brim_width prime_tower_skip_points wipe_tower_wall_type prime_tower_infill_gap prime_tower_enable_framework enable_tower_interface_features', tower, 'Requires the prime tower.', 868);
  visible('enable_tower_interface_cooldown_during_tower', tower && bool('enable_tower_interface_features'), 'Requires prime tower interface features.', 870);
  visible('wipe_tower_rotation_angle wipe_tower_cone_angle wipe_tower_extra_spacing wipe_tower_max_purge_speed wipe_tower_bridging wipe_tower_extra_flow wipe_tower_no_sparse_layers', tower ? tower2 : false, 'Requires a non-Bambu type 2 prime tower.', 879);
  visible('wipe_tower_cone_angle', tower && towerWall === 'cone' ? tower2 : false, 'Requires a type 2 cone tower.', 883);
  visible('wipe_tower_extra_rib_length wipe_tower_rib_width wipe_tower_fillet_wall', rib, 'Requires a rib prime tower.', 884);
  enabled('prime_tower_width', !tower ? false : rib ? true : tower2, 'Requires a type 2 or rib prime tower.', 887);
  visible('single_extruder_multi_material_priming', !semm && tower ? tower2 : false, 'Requires a multimaterial type 2 tower without single extruder mode.', 889);
  visible('prime_volume', tower && (!bool('purge_in_prime_tower','machine') || !semm), 'Unavailable when single-extruder purging is handled inside the tower.', 891);
  enabled('flush_into_infill flush_into_support flush_into_objects', tower, 'Requires the prime tower.', 894);
  visible('max_travel_detour_distance', bool('reduce_crossing_wall'), 'Requires avoiding crossing walls.', 897);
  visible('first_layer_flow_ratio outer_wall_flow_ratio inner_wall_flow_ratio overhang_flow_ratio sparse_infill_flow_ratio internal_solid_infill_flow_ratio gap_fill_flow_ratio support_flow_ratio support_interface_flow_ratio', bool('set_other_flow_ratios'), 'Requires per-feature flow ratios.', 901);
  visible('overhang_1_4_speed overhang_2_4_speed overhang_3_4_speed overhang_4_4_speed slowdown_for_curled_perimeters', bool('enable_overhang_speed'), 'Requires overhang speed control.', 905);
  visible('flush_into_objects', !isGlobal, 'Available in object settings.', 909);
  visible('support_interface_not_for_body', num('support_interface_filament') !== 0 && num('support_filament') === 0, 'Requires an explicit interface filament and default support filament.', 911);
  const fuzzy = str('fuzzy_skin') !== 'disabled_fuzzy', noise = str('fuzzy_skin_noise_type'), ripple = noise === 'ripple';
  visible('fuzzy_skin_mode fuzzy_skin_noise_type fuzzy_skin_point_distance fuzzy_skin_thickness fuzzy_skin_first_layer', fuzzy, 'Requires fuzzy skin.', 918);
  visible('fuzzy_skin_scale', fuzzy && noise !== 'classic' && !ripple, 'Requires a scaled non-classic, non-ripple noise.', 923);
  visible('fuzzy_skin_octaves', fuzzy && !['classic','voronoi'].includes(noise) && !ripple, 'This fuzzy noise does not use octaves.', 924);
  visible('fuzzy_skin_persistence', fuzzy && ['perlin','billow'].includes(noise), 'Requires Perlin or Billow noise.', 925);
  visible('fuzzy_skin_ripples_per_layer fuzzy_skin_ripple_offset fuzzy_skin_layers_between_ripple_offset', fuzzy && ripple, 'Requires ripple fuzzy skin.', 926);
  const arachne = str('wall_generator') === 'arachne';
  visible('wall_transition_length wall_transition_filter_deviation wall_transition_angle min_feature_size min_length_factor min_bead_width wall_distribution_count initial_layer_min_bead_width wall_maximum_resolution wall_maximum_deviation', arachne, 'Requires the Arachne wall generator.', 932);
  enabled('detect_thin_wall', !arachne, 'Arachne manages thin walls automatically.', 933);
  enabled('wipe_speed', !bool('role_based_wipe_speed'), 'Role-based wipe speed overrides this value.', 937);
  visible('accel_to_decel_enable accel_to_decel_factor', klipper, 'Requires Klipper firmware.', 940);
  if (klipper) enabled('accel_to_decel_factor', bool('accel_to_decel_enable'), 'Requires acceleration-to-deceleration control.', 942);
  visible('make_overhang_printable_angle make_overhang_printable_hole_size', bool('make_overhang_printable'), 'Requires make-overhangs-printable.', 945);
  visible('min_width_top_surface', bool('only_one_wall_top') || (num('min_length_factor') > .5 && arachne), 'Requires one top wall or increased Arachne minimum length.', 948);
  visible('hole_to_polyhole_threshold hole_to_polyhole_twisted', bool('hole_to_polyhole'), 'Requires polyhole conversion.', 951);
  visible('overhang_reverse', !vase, 'Unavailable in spiral vase mode.', 957);
  visible('overhang_reverse_internal_only', !vase && bool('overhang_reverse'), 'Requires reversing overhangs outside vase mode.', 958);
  if (bool('overhang_reverse_internal_only')) correction('overhang_reverse_threshold', '0%', 'Internal-only reversing resets the threshold.', 962);
  visible('overhang_reverse_threshold', bool('detect_overhang_wall') && !vase && bool('overhang_reverse') && !bool('overhang_reverse_internal_only'), 'Requires detected reversed overhangs beyond internal-only mode.', 965);
  visible('timelapse_type', isBbl, 'Requires a Bambu printer context.', 966);
  visible('small_area_infill_flow_compensation_model', bool('small_area_infill_flow_compensation'), 'Requires small-area flow compensation.', 970);
  enabled('seam_slope_type', !vase, 'Scarf joints are unavailable in spiral vase mode.', 973);
  const scarf = !vase && str('seam_slope_type') !== 'none';
  visible('seam_slope_conditional seam_slope_start_height seam_slope_entire_loop seam_slope_min_length seam_slope_steps seam_slope_inner_walls scarf_joint_speed scarf_joint_flow_ratio', scarf, 'Requires scarf joints outside vase mode.', 975);
  enabled('seam_slope_min_length', !bool('seam_slope_entire_loop'), 'Full-loop scarf does not use a minimum length.', 983);
  visible('scarf_angle_threshold scarf_overhang_threshold', scarf && bool('seam_slope_conditional'), 'Requires conditional scarf joints.', 984);
  const interlock = bool('interlocking_beam');
  visible('mmu_segmented_region_interlocking_depth', !interlock, 'Beam interlocking replaces this setting.', 988);
  visible('interlocking_beam_width interlocking_orientation interlocking_beam_layer_count interlocking_depth interlocking_boundary_avoidance', interlock, 'Requires beam interlocking.', 989);
  visible('lateral_lattice_angle_1 lateral_lattice_angle_2', pattern === 'lateral-lattice', 'Requires lateral lattice infill.', 997);
  visible('lightning_overhang_angle lightning_prune_angle lightning_straightening_angle', pattern === 'lightning', 'Requires lightning infill.', 1001);
  const adaptive = ['adaptivecubic','supportcubic'].includes(pattern);
  enabled('sparse_infill_rotate_template', !adaptive, 'Adaptive and support cubic do not support infill rotation.', 1007);
  enabled('infill_direction', str('sparse_infill_rotate_template') === '' && !adaptive, 'Controlled by a rotation template or adaptive cubic.', 1008);
  enabled('solid_infill_direction', str('solid_infill_rotate_template') === '', 'Controlled by the solid-infill rotation template.', 1009);
  visible('infill_overhang_angle', pattern === 'lateral-honeycomb', 'Requires lateral honeycomb infill.', 1011);
  visible('enable_wrapping_detection', typeof context.supportWrappingDetection === 'boolean' ? context.supportWrappingDetection : null, 'Requires native printer wrapping-detection capability.', 1014);

  // Native update_print_fff_config corrections (the disabled #if 0 block is excluded).
  const EPSILON = 1e-4; // libslic3r.h:52 at the pinned commit.
  if (num('layer_height') < EPSILON) correction('layer_height', '0.2', 'Native layer heights below EPSILON reset to 0.2 mm.', 225, { mode: 'acknowledge' });
  const maxLayer = num('max_layer_height', 'machine');
  if (maxLayer > .2 && num('layer_height') > maxLayer + EPSILON) correction('layer_height', String(maxLayer), 'Layer height exceeds the native printer maximum.', 240, { mode: 'acknowledge' });
  for (const [key,line] of [['ironing_spacing',252],['support_ironing_spacing',263]]) if (num(key) < .05) correction(key, '0.1', 'Native ironing spacing below 0.05 mm resets to 0.1 mm.', line, { mode: 'acknowledge' });
  if (num('initial_layer_print_height') < EPSILON) correction('initial_layer_print_height', '0.2', 'Native first-layer heights below EPSILON reset to 0.2 mm.', 274, { mode: 'acknowledge' });
  for (const [key,line] of [['xy_hole_compensation',288],['xy_contour_compensation',304]]) if (Math.abs(num(key)) > 2) correction(key, '0', 'Native XY compensation outside ±2 mm resets to zero.', line, { mode: 'acknowledge' });
  if (num('elefant_foot_compensation') > 1) correction('elefant_foot_compensation', '0', 'Native elephant-foot compensation above 1 mm resets to zero.', 320, { mode: 'acknowledge' });
  if (bool('enable_wrapping_detection') && context.supportWrappingDetection === false) correction('enable_wrapping_detection', false, 'The native printer does not support wrapping detection.', 335);
  const vaseChanges = { wall_loops: '1', top_shell_layers: '0', sparse_infill_density: '0%', enable_support: false, enforce_support_layers: '0', detect_thin_wall: false, overhang_reverse: false, timelapse_type: '0', enable_wrapping_detection: false };
  if (!isPlate && vase) for (const [key,value] of Object.entries(vaseChanges)) correction(key, value, 'Native spiral mode requires one wall, no top/infill/support, and traditional timelapse.', 345, { mode: isGlobal ? 'confirmation' : 'acknowledge', group: 'spiral-mode', alternative: { scope: 'process', key: 'spiral_mode', value: false } });
  if (bool('alternate_extra_wall') && str('ensure_vertical_shell_thickness') === 'ensure_all') correction('ensure_vertical_shell_thickness', 'ensure_moderate', 'Alternate extra walls require Moderate vertical shell thickness.', 381, { mode: isGlobal ? 'confirmation' : 'acknowledge', group: 'alternate-extra-wall', alternative: { scope: 'process', key: 'alternate_extra_wall', value: false } });
  if (tower && isBbl === true && towerWall === 'cone') correction('wipe_tower_wall_type', 'rectangle', 'Native Bambu printers do not support cone towers.', 468);
  // Native asks once per enable-support cycle. Context preserves that session state.
  if (isGlobal && bool('enable_support') && !context.supportOverhangsAlreadyQueried) correction('detect_overhang_wall', true, 'Enabling supports enables overhang-wall detection.', 480);
  if (bool('enable_support')) {
    const choices = ['tree(auto)','tree(manual)'].includes(supportType) ? ['default','tree_slim','tree_strong','tree_hybrid','organic'] : ['default','grid','snug'];
    fields.process.support_style.options = choices;
    if (!choices.includes(style)) correction('support_style', 'default', 'Native support type does not support this support style.', 497);
  }
  if (Number.isInteger(context.filamentCount)) for (const key of ['support_filament','support_interface_filament']) {
    if (num(key) > context.filamentCount) {
      const fallback = context.projectSettings?.[key] ?? 0;
      correction(key, String(fallback), 'Selected support filament exceeds the available filament count.', 512);
    }
  }
  const scarfValue = first('seam_slope_start_height');
  const scarfPercent = typeof scarfValue === 'object' ? scarfValue.percent : String(scarfValue).trim().endsWith('%');
  const scarfHeight = num('seam_slope_start_height') * (scarfPercent ? num('layer_height') / 100 : 1);
  if (str('seam_slope_type') !== 'none' && scarfHeight >= num('layer_height')) correction('seam_slope_start_height', '0', 'Scarf start height must be smaller than layer height.', 527, { mode: 'acknowledge' });
  if (num('infill_lock_depth') > num('skin_infill_depth')) correction('infill_lock_depth', String(num('skin_infill_depth') / 2), 'Native lock depth resets to half the skin depth.', 542, { mode: 'acknowledge' });
  if (str('fuzzy_skin_mode') !== 'displacement' && !arachne) correction('wall_generator', 'arachne', 'Extrusion and combined fuzzy skin require Arachne.', 556, { mode: 'confirmation', group: 'fuzzy-skin-generator', alternative: { scope: 'process', key: 'fuzzy_skin_mode', value: 'displacement' } });

  // TabFilament::toggle_options, evaluated for the selected first/active variant.
  const fe = (keys,value,reason,line) => enabled(keys,value,reason,line,'filament','Tab.cpp');
  const fv = (keys,value,reason,line) => visible(keys,value,reason,line,'filament','Tab.cpp');
  fe('overhang_fan_speed overhang_fan_threshold internal_bridge_fan_speed',bool('enable_overhang_bridge_fan','filament'),'Requires overhang/bridge fan control.',4295);
  fe('dont_slow_down_outer_wall',bool('slow_down_for_layer_cooling','filament'),'Requires slowing down for layer cooling.',4299);
  fv('additional_cooling_fan_speed',bool('auxiliary_fan','machine'),'Requires an auxiliary printer fan.',4301);
  const air = bool('support_air_filtration','machine');
  fv('activate_air_filtration during_print_exhaust_fan_speed complete_print_exhaust_fan_speed',air,'Requires printer air filtration support.',4305);
  if (air) {
    const active=bool('activate_air_filtration','filament');
    fe('activate_air_filtration_during_print activate_air_filtration_on_completion',active,'Requires active air filtration.',4309);
    fe('during_print_exhaust_fan_speed',active&&bool('activate_air_filtration_during_print','filament'),'Requires filtration during printing.',4310);
    fe('complete_print_exhaust_fan_speed',active&&bool('activate_air_filtration_on_completion','filament'),'Requires filtration after printing.',4312);
  }
  const pa=bool('enable_pressure_advance','filament'),adaptivePA=pa&&bool('adaptive_pressure_advance','filament');
  fe('pressure_advance adaptive_pressure_advance adaptive_pressure_advance_overhangs',pa,'Requires pressure advance.',4318);
  fv('adaptive_pressure_advance_overhangs adaptive_pressure_advance_model adaptive_pressure_advance_bridges',adaptivePA,'Requires adaptive pressure advance.',4349);
  fv('pellet_flow_coefficient',bool('pellet_modded_printer','machine'),'Requires a pellet printer.',4354);
  fv('filament_diameter',!bool('pellet_modded_printer','machine'),'Pellet printers use the flow coefficient instead.',4355);
  fv('activate_chamber_temp_control',bool('support_chamber_temp_control','machine'),'Requires chamber temperature control support.',4357);
  fe('filament_adaptive_volumetric_speed',String((raw('volumetric_speed_coefficients','filament')||[])[Math.max(0,context.variantIndex||0)]||first('volumetric_speed_coefficients','filament'))!=='0 0 0 0 0 0','Requires a fitted volumetric speed model.',4363);
  fe('filament_minimal_purge_on_wipe_tower filament_loading_speed_start filament_loading_speed filament_unloading_speed_start filament_unloading_speed filament_toolchange_delay filament_cooling_moves filament_cooling_initial_speed filament_cooling_final_speed',isBbl===null?null:!isBbl,'Native Bambu printers manage these values.',4374);
  fe('filament_multitool_ramming_volume filament_multitool_ramming_flow',bool('filament_multitool_ramming','filament'),'Requires multitool ramming.',4378);
  const nozzles=raw('nozzle_diameter','machine'),multipleNozzles=Array.isArray(nozzles)&&nozzles.length>1;
  fv('long_retractions_when_ec',multipleNozzles?isBbl:false,'Requires a Bambu multi-extruder printer.',4384);
  fv('retraction_distances_when_ec',multipleNozzles&&[true,1,'1'].includes((raw('long_retractions_when_ec','filament')||[])[Math.max(0,context.variantIndex||0)]??first('long_retractions_when_ec','filament'))?isBbl:false,'Requires long retractions on a Bambu multi-extruder printer.',4385);
  // TabPrinter::toggle_options: scalar rules plus per-physical-extruder indexed rules.
  const me = (keys,value,reason,line) => enabled(keys,value,reason,line,'machine','Tab.cpp');
  const mv = (keys,value,reason,line) => visible(keys,value,reason,line,'machine','Tab.cpp');
  mv('scan_first_layer bbl_calib_mark_logo bbl_use_printhost',isBbl,'Requires the native Bambu vendor.',5467);
  mv('use_firmware_retraction use_relative_e_distances support_multi_bed_types pellet_modded_printer bed_mesh_max bed_mesh_min bed_mesh_probe_distance adaptive_bed_mesh_margin thumbnails',isBbl===null?null:!isBbl,'Hidden for the native Bambu vendor.',5471);
  mv('enable_power_loss_recovery',marlin2?true:isBbl,'Requires Bambu or Marlin 2 firmware.',5474);
  mv('parallel_printheads_count',bool('support_parallel_printheads','machine'),'Requires parallel printheads.',5477);
  mv('wrapping_detection_gcode',context.supportWrappingDetection,'Requires native wrapping-detection support.',5484);
  mv('wipe_tower_type',isBbl===null?null:!isBbl,'Native Bambu printers manage tower type.',5489);
  me('enable_filament_ramming cooling_tube_retraction cooling_tube_length parking_pos_retraction extra_loading_move high_current_on_filament_swap',tower2,'Requires a non-Bambu type 2 wipe tower.',5499);
  if (!semm) correction('manual_filament_change',false,'Manual filament change requires single-extruder multimaterial.',5503,{scope:'machine',file:'Tab.cpp'});
  me('manual_filament_change',semm,'Requires single-extruder multimaterial.',5508);
  me('purge_in_prime_tower',semm?tower2:false,'Requires single-extruder multimaterial and a non-Bambu type 2 tower.',5509);
  me('tool_change_on_wipe_tower',!semm&&multipleNozzles?tower2:false,'Requires multiple toolheads and a non-Bambu type 2 tower.',5515);
  const nativeArray = (key,scope) => { const value=raw(key,scope);return Array.isArray(value)?value:[value]; };
  const at = (key,index,scope='machine') => { const array=nativeArray(key,scope);return array[index]??array[0]; };
  const atNum = (key,index,scope) => parseFloat(at(key,index,scope));
  const atBool = (key,index,scope) => [true,1,'1'].includes(at(key,index,scope));
  const indexed=(scope,key,index,property,condition,reason,line)=>{
    const field=fields[scope][key];if(!field)return;
    if(condition==null){unresolved.push({scope,key,index,property,reason,source:source(line,'Tab.cpp')});return;}
    field.indices ||= {};
    const item=field.indices[index] ||= {enabled:field.enabled,visible:field.visible,reasons:[],sources:[],evaluated:true};
    item[property]=Boolean(condition);item.sources.push(source(line,'Tab.cpp'));
    const identity=`${scope}.${key}.${index}.${property}`;
    if(!condition)reasons.set(identity,reason);else reasons.delete(identity);
    item.reasons=['enabled','visible'].map(name=>reasons.get(`${scope}.${key}.${index}.${name}`)).filter(Boolean);
    const active=scope==='machine'?Math.max(0,context.extruderIndex||0):Math.max(0,context.variantIndex||0);
    if(index===active){field[property]=item[property];field.reasons=[...item.reasons];field.sources=[...item.sources];}
    field.evaluated=true;
  };
  const extruderCount=Math.max(1,nativeArray('nozzle_diameter','machine').length);
  for(let index=0;index<extruderCount;index++){
    const ie=(keys,value,reason,line)=>list(keys).forEach(key=>indexed('machine',key,index,'enabled',value,reason,line));
    const iv=(keys,value,reason,line)=>list(keys).forEach(key=>indexed('machine',key,index,'visible',value,reason,line));
    ie('extruder_printable_area extruder_printable_height',false,'Native extruder printable bounds are read-only.',5527);
    iv('extruder_printable_area extruder_printable_height',extruderCount===2,'Native extruder bounds are shown for exactly two extruders.',5528);
    const variantIndex=resolvePrinterVariantIndex(printer,context.projectSettings||{},index);
    if(variantIndex<0){unresolved.push({scope:'machine',index,reason:'Native extruder variant does not match its ID/variant map.',source:source(5545,'Tab.cpp')});continue;}
    const firmware=bool('use_firmware_retraction','machine'),retraction=atNum('retraction_length',variantIndex)>0||firmware,wipe=retraction&&atBool('wipe',variantIndex);
    // Native source spells two inactive controls "retract_length" (not the real retraction_length).
    // Preserve that no-op instead of inventing a native disable rule for retraction_length.
    ie('retraction_minimum_travel z_hop retract_when_changing_layer',retraction,'Requires retraction length or firmware retraction.',5538);
    ie('retract_lift_above retract_lift_below retract_lift_enforce',retraction&&atNum('z_hop',index)>0,'Requires retraction and Z hop.',5551);
    ie('retraction_speed deretraction_speed retract_before_wipe retract_restart_extra wipe_distance',retraction&&!firmware,'Requires slicer-controlled retraction.',5560);
    ie('retract_before_wipe wipe_distance',wipe,'Requires enabled wiping and retraction.',5563);
    if(firmware&&wipe&&atNum('retract_before_wipe',variantIndex)<100){
      const details={scope:'machine',mode:'confirmation',group:'firmware-retraction',alternative:{scope:'machine',key:'use_firmware_retraction',value:false},file:'Tab.cpp'};
      correction('wipe',nativeArray('wipe','machine').map(()=>false),'Native firmware-retraction confirmation disables wiping and uses 100% retract-before-wipe.',5575,details);
      correction('retract_before_wipe',nativeArray('retract_before_wipe','machine').map(()=>100),'Native firmware-retraction confirmation disables wiping and uses 100% retract-before-wipe.',5575,details);
    }
    ie('retract_length_toolchange',true,'Native method allows material-change retraction for all printers.',5592);
    ie('retract_restart_extra_toolchange',atNum('retract_length_toolchange',variantIndex)>0,'Requires tool-change retraction.',5595);
    ie('long_retractions_when_cut',!firmware&&num('enable_long_retraction_when_cut','machine')!==0,'Requires long retraction support without firmware retraction.',5597);
    iv('retraction_distances_when_cut',atBool('long_retractions_when_cut',variantIndex),'Requires long retraction when cutting.',5598);
    ie('travel_slope',at('z_hop_types',index)!=='Normal Lift','Normal Z hop does not use a travel slope.',5600);
    for(const field of Object.values(fields.machine))if(field.indices?.[index])field.indices[index].variantIndex=variantIndex;
  }
  // Tab.cpp:5095–5119: the nozzle edit callback has a user choice only after an edit.
  const changed = context.changedSetting;
  if (changed?.scope === 'machine' && changed.key === 'nozzle_diameter' && Number.isInteger(changed.index) && changed.index >= 0 && changed.index < extruderCount && semm && extruderCount > 1) {
    const diameters = nativeArray('nozzle_diameter','machine'), otherIndex = changed.index === 0 ? 1 : 0;
    const diameter = Number(diameters[changed.index]), other = Number(diameters[otherIndex]);
    if (Number.isFinite(diameter) && Number.isFinite(other) && Math.abs(other - diameter) > EPSILON) {
      correction('nozzle_diameter',diameters.map(()=>String(diameter)),'Native single-extruder multimaterial requires the edited nozzle diameter for all extruders.',5108,{scope:'machine',mode:'confirmation',group:'semm-nozzle-diameter',alternative:{scope:'machine',key:'nozzle_diameter',value:diameters.map((value,index)=>index===changed.index?String(other):value)},file:'Tab.cpp'});
    }
  }
  const legacyMarlin=flavor==='marlin',reprap=flavor==='reprapfirmware';
  me('machine_max_acceleration_travel',!legacyMarlin&&!klipper,'Unavailable for legacy Marlin and Klipper.',5616);
  mv('machine_max_acceleration_travel',!legacyMarlin&&!klipper,'Unavailable for legacy Marlin and Klipper.',5617);
  me('machine_max_junction_deviation',marlin2,'Requires Marlin 2.',5619);mv('machine_max_junction_deviation',marlin2,'Requires Marlin 2.',5620);
  me('machine_max_jerk_x machine_max_jerk_y machine_max_jerk_z machine_max_jerk_e',!marlin2||nativeArray('machine_max_junction_deviation','machine').every(value=>Number(value)===0),'Marlin 2 jerk is disabled when any motion mode uses junction deviation.',5634);
  me('emit_machine_limits_to_gcode',legacyMarlin||marlin2||reprap,'This firmware does not support emitted machine limits.',5641);
  me('min_resonance_avoidance_speed max_resonance_avoidance_speed',bool('resonance_avoidance','machine'),'Requires resonance avoidance.',5644);
  const shaping=marlin2||reprap,shapingEmit=bool('emit_machine_limits_to_gcode','machine')&&bool('input_shaping_emit','machine');
  mv('input_shaping_emit input_shaping_type input_shaping_freq_x input_shaping_freq_y input_shaping_damp_x input_shaping_damp_y',shaping,'Native editor exposes emitted shaping for Marlin 2 and RepRapFirmware.',5651);
  if(shaping){
    me('input_shaping_emit',bool('emit_machine_limits_to_gcode','machine'),'Requires emitted machine limits.',5655);
    me('input_shaping_type input_shaping_freq_x input_shaping_damp_x',shapingEmit,'Requires emitted input shaping.',5657);
    me('input_shaping_freq_y input_shaping_damp_y',shapingEmit&&!reprap,'RepRapFirmware shares X and Y shaping parameters.',5659);
  }
  const shapers=klipper?['Default','ZV','MZV','ZVD','EI','2HUMP_EI','3HUMP_EI','Disable']:reprap?['Default','MZV','ZVD','ZVDD','ZVDDD','EI2','EI3','DAA','Disable']:marlin2?['ZV','Disable']:['Default','Disable'];
  fields.machine.input_shaping_type.options=shapers;
  if(!shapers.includes(str('input_shaping_type','machine')))correction('input_shaping_type',shapers[0],'Native input-shaping type is not supported by this firmware.',5383,{scope:'machine',file:'Tab.cpp'});

  // Nullable filament overrides have an independent checkbox for each native variant.
  const retractionKeys=list('filament_retraction_length filament_z_hop filament_z_hop_types filament_retract_lift_above filament_retract_lift_below filament_retract_lift_enforce filament_retraction_speed filament_deretraction_speed filament_retract_restart_extra filament_retraction_minimum_travel filament_retract_when_changing_layer filament_wipe filament_wipe_distance filament_retract_before_wipe filament_long_retractions_when_cut filament_retraction_distances_when_cut');
  const ironingKeys=list('filament_ironing_flow filament_ironing_spacing filament_ironing_inset filament_ironing_speed');
  const isNil=value=>value===null||value===undefined||value==='nil';
  for(let index=0;index<nativeArray('filament_retraction_length','filament').length;index++){
    const canRetract=isNil(at('filament_retraction_length',index,'filament'))||atNum('filament_retraction_length',index,'filament')>0;
    for(const key of [...retractionKeys,...ironingKeys]){
      const field=fields.filament[key];if(!field)continue;
      const ironing=ironingKeys.includes(key),checkboxEnabled=ironing||key==='filament_retraction_length'||canRetract;
      const checked=checkboxEnabled&&!isNil(at(key,index,'filament'));
      let active=checked,show=true;
      if(key==='filament_long_retractions_when_cut'||key==='filament_retraction_distances_when_cut'){
        const machineEnabled=num('enable_long_retraction_when_cut','machine')===2;
        show=machineEnabled&&(key==='filament_long_retractions_when_cut'||atBool('filament_long_retractions_when_cut',index,'filament'));active=checked&&show;
      }
      indexed('filament',key,index,'enabled',active,'Enable this native nullable override to edit its value.',3817);
      if(key.includes('when_cut'))indexed('filament',key,index,'visible',show,'Requires filament-level long retractions and its cut override.',3831);
      const item=field.indices[index];item.overrideEnabled=checkboxEnabled;item.overrideChecked=checked;
      if(!checked&&!key.includes('when_cut'))item.inheritedValue=structuredClone(!ironing&&Object.hasOwn(context.inheritedFilamentValues||{},key)?context.inheritedFilamentValues[key]:at(key.slice('filament_'.length),ironing?0:index,ironing?'process':'machine'));
      if(index===Math.max(0,context.variantIndex||0)){field.overrideEnabled=item.overrideEnabled;field.overrideChecked=item.overrideChecked;if('inheritedValue'in item)field.inheritedValue=item.inheritedValue;}
    }
  }
  const bedKeys={'Supertack Plate':'supertack_plate_temp_initial_layer','Cool Plate':'cool_plate_temp_initial_layer','Textured Cool Plate':'textured_cool_plate_temp_initial_layer','Engineering Plate':'eng_plate_temp_initial_layer','Textured PEI Plate':'textured_plate_temp_initial_layer','High Temp Plate':'hot_plate_temp_initial_layer'};
  const activeBedKey=bedKeys[context.projectSettings?.curr_bed_type];
  const multiBed=!activeBedKey||bool('support_multi_bed_types','machine')?true:isBbl;
  for(const key of Object.values(bedKeys))fv(key,key===activeBedKey?true:multiBed,'Native single-bed printers show the selected project bed temperature.',4338);

  if (num('filament_max_volumetric_speed','filament') < .5) correction('filament_max_volumetric_speed',['0.5'],'Native minimum volumetric speed is 0.5 mm³/s.',154,{scope:'filament',mode:'acknowledge'});
  if (num('chamber_minimal_temperature','filament') > num('chamber_temperature','filament')) correction('chamber_minimal_temperature',[String(num('chamber_temperature','filament'))],'Minimal chamber temperature cannot exceed the target.',193,{scope:'filament',mode:'acknowledge'});
  if (raw('nozzle_temperature_range_low','filament')!==undefined && raw('nozzle_temperature_range_high','filament')!==undefined) {
    const low=num('nozzle_temperature_range_low','filament'),high=num('nozzle_temperature_range_high','filament');
    const material=materialRanges.materials.find(item=>item.name===str('filament_type','filament'));
    const [recommendedLow,recommendedHigh]=material?.nozzle||materialRanges.unknownNozzle;
    if(low<recommendedLow)warnings.push({scope:'filament',key:'nozzle_temperature_range_low',message:`Native material recommendation for ${material?.name||'Unknown'} has minimum ${recommendedLow} °C.`,source:source(76)});
    if(high>recommendedHigh)warnings.push({scope:'filament',key:'nozzle_temperature_range_high',message:`Native material recommendation for ${material?.name||'Unknown'} has maximum ${recommendedHigh} °C.`,source:source(81)});
    if (low>high) warnings.push({scope:'filament',key:'nozzle_temperature_range_low',message:'Recommended minimum temperature exceeds the recommended maximum.',source:source(85)});
    for (const [key,line] of [['nozzle_temperature',110],['nozzle_temperature_initial_layer',132]]) if (num(key,'filament')<low||num(key,'filament')>high) warnings.push({scope:'filament',key,message:`Nozzle temperature is outside this filament’s recommended range (${low}–${high} °C).`,source:source(line)});
  }
  const material=materialRanges.materials.find(item=>item.name===str('filament_type','filament'));
  if(material&&bool('support_chamber_temp_control','machine')&&num('chamber_temperature','filament')>material.chamber[1])warnings.push({scope:'filament',key:'chamber_temperature',message:`Native material recommendation for ${material.name} has maximum chamber temperature ${material.chamber[1]} °C.`,source:source(171)});
  return { fields, corrections:corrections.filter((item,index,all)=>all.findIndex(other=>other.scope===item.scope&&other.key===item.key&&other.group===item.group)===index), warnings, errors, coverage: { implemented: ['ConfigManipulation::toggle_print_fff_options (all source branches; vendor/device context may be unresolved)', 'ConfigManipulation::update_print_fff_config (active branches)', 'TabFilament::toggle_options and update_filament_overrides_page (all native conditions)' , 'TabPrinter::toggle_options and firmware input-shaping menus (all setting controls; variant mismatches are unresolved)', 'SEMM nozzle-diameter edit confirmation with explicit changed-setting context', 'Filament volumetric-speed, chamber-minimum, configured nozzle-range, and native material temperature table checks'], evaluatedFields: Object.fromEntries(Object.entries(fields).map(([scope, options])=>[scope,Object.values(options).filter(option=>option.evaluated).length])), unresolved, remaining: ['Other native change-event behavior, including extruder-count resizing and dependency/group reconstruction', 'Virtual printer controls (extruder count), active page state, and option group/layout changes', 'Machine structural, native slicing, object/part, and multi-plate cross-setting validation beyond these GUI methods'] }, provenance: dependencyProvenance };
}
