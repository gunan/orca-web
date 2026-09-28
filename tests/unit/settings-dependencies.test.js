import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSettingsState } from '../../shared/settings-dependencies.js';
const context={isBblPrinter:false,supportWrappingDetection:false};
const evaluate=(process={},printer={},filament={},extra={})=>evaluateSettingsState({process,printer,filament,context:{...context,...extra}});
const p=result=>result.fields.process;

test('disabled, manual, normal tree, organic tree, and raft support states match native conditions',()=>{
  let state=p(evaluate({enable_support:false,raft_layers:0}));
  assert.equal(state.support_type.enabled,false);assert.equal(state.tree_support_branch_diameter.visible,false);assert.equal(state.support_ironing.enabled,false);
  state=p(evaluate({enable_support:true,support_type:'normal(manual)',support_threshold_angle:0,support_style:'grid'}));
  assert.equal(state.support_threshold_angle.enabled,false);assert.equal(state.support_threshold_overlap.enabled,false);assert.equal(state.support_threshold_overlap.visible,true);
  state=p(evaluate({enable_support:true,support_type:'tree(auto)',support_style:'tree_slim',tree_support_auto_brim:false,raft_layers:0}));
  assert.equal(state.tree_support_branch_diameter.visible,true);assert.equal(state.tree_support_branch_diameter_organic.visible,false);assert.equal(state.tree_support_brim_width.enabled,true);assert.equal(state.support_threshold_overlap.visible,false);assert.equal(state.raft_first_layer_expansion.enabled,false);
  state=p(evaluate({enable_support:true,support_type:'tree(auto)',support_style:'default'}));
  assert.equal(state.tree_support_branch_diameter_organic.visible,true);assert.equal(state.independent_support_layer_height.visible,false);assert.equal(state.raft_first_layer_expansion.enabled,true);
  state=p(evaluate({enable_support:false,raft_layers:2,support_ironing:true,support_top_z_distance:0}));
  assert.equal(state.support_type.enabled,true);assert.equal(state.support_ironing.enabled,true);assert.equal(state.ironing_speed.visible,true);assert.equal(state.raft_contact_distance.visible,false);
});

test('ironing and support-interface dependencies include the native solid-interface rule',()=>{
  let state=p(evaluate({ironing_type:'no ironing',enable_support:false,support_ironing:false}));
  assert.equal(state.ironing_speed.visible,false);assert.equal(state.ironing_spacing.visible,false);
  state=p(evaluate({ironing_type:'top',ironing_pattern:'concentric'}));
  assert.equal(state.ironing_spacing.visible,true);assert.equal(state.ironing_angle.enabled,false);assert.equal(state.ironing_angle.visible,true);
  state=p(evaluate({enable_support:true,support_interface_top_layers:2,support_ironing:true,ironing_type:'no ironing'}));
  assert.equal(state.support_interface_spacing.enabled,false);assert.equal(state.support_ironing_spacing.visible,true);assert.equal(state.ironing_speed.visible,true);
});

test('infill conditions preserve native overwrite order, pattern restrictions, and rotation-template behavior',()=>{
  let result=evaluate({sparse_infill_density:0,sparse_infill_pattern:'lockedzag'}),state=p(result);
  assert.equal(state.sparse_infill_pattern.visible,false);
  assert.equal(state.infill_shift_step.visible,true,'Native later pattern rule replaces the earlier density visibility rule');
  result=evaluate({sparse_infill_density:'20%',sparse_infill_pattern:'crosszag',fill_multiline:3,infill_anchor_max:'0'});state=p(result);
  assert.equal(state.fill_multiline.enabled,false);assert.equal(state.infill_anchor.enabled,false);assert.equal(result.corrections.find(item=>item.key==='fill_multiline').value,'1');
  state=p(evaluate({sparse_infill_density:20,sparse_infill_pattern:'gyroid',infill_combination:true}));
  assert.equal(state.gyroid_optimized.visible,true);assert.equal(state.fill_multiline.enabled,true);assert.equal(state.infill_combination_max_layer_height.visible,true);
  state=p(evaluate({sparse_infill_pattern:'adaptivecubic',sparse_infill_rotate_template:''}));
  assert.equal(state.infill_direction.enabled,false);assert.equal(state.sparse_infill_rotate_template.enabled,false);
  state=p(evaluate({sparse_infill_pattern:'grid',sparse_infill_rotate_template:'0,45',solid_infill_rotate_template:'0,90'}));
  assert.equal(state.infill_direction.enabled,false);assert.equal(state.solid_infill_direction.enabled,false);
});

test('vase mode produces a reviewable correction group and never mutates user input or decides its native dialog',()=>{
  const input={spiral_mode:true,wall_loops:3,top_shell_layers:4,sparse_infill_density:15,enable_support:true,detect_thin_wall:true,overhang_reverse:true,timelapse_type:'1'};
  const before=structuredClone(input),result=evaluate(input);
  assert.deepEqual(input,before);assert.equal(p(result).seam_slope_type.enabled,false);assert.equal(p(result).top_shell_thickness.enabled,false);
  const changes=result.corrections.filter(item=>item.group==='spiral-mode');
  assert.ok(changes.length>=7);assert.ok(changes.every(item=>item.mode==='confirmation'&&item.alternative.key==='spiral_mode'));
  assert.ok(changes.every(item=>item.source.file==='ConfigManipulation.cpp'));
  const valid={spiral_mode:true,wall_loops:1,top_shell_layers:0,sparse_infill_density:0,enable_support:false,enforce_support_layers:0,detect_thin_wall:false,overhang_reverse:false,timelapse_type:'0',enable_wrapping_detection:false};
  assert.equal(evaluate(valid).corrections.filter(item=>item.group==='spiral-mode').length,0);
  assert.equal(evaluate(input,{}, {},{isPlate:true}).corrections.filter(item=>item.group==='spiral-mode').length,0);
});

test('prime towers use machine type, vendor, purge mode, and wall shape without guessing missing vendor context',()=>{
  let state=p(evaluate({enable_prime_tower:false},{wipe_tower_type:'type2'}));assert.equal(state.wipe_tower_rotation_angle.visible,false);
  state=p(evaluate({enable_prime_tower:true,wipe_tower_wall_type:'cone'},{wipe_tower_type:'type2',single_extruder_multi_material:true,purge_in_prime_tower:true}));
  assert.equal(state.wipe_tower_cone_angle.visible,true);assert.equal(state.prime_tower_width.enabled,true);assert.equal(state.prime_volume.visible,false);
  let result=evaluate({enable_prime_tower:true,wipe_tower_wall_type:'cone'},{wipe_tower_type:'type2'}, {},{isBblPrinter:true});
  assert.equal(p(result).wipe_tower_cone_angle.visible,false);assert.equal(result.corrections.find(item=>item.key==='wipe_tower_wall_type').value,'rectangle');
  result=evaluateSettingsState({process:{enable_prime_tower:true},printer:{wipe_tower_type:'type2'}});
  assert.ok(result.coverage.unresolved.some(item=>item.key==='wipe_tower_rotation_angle'));
});

test('line widths, acceleration, and jerk depend on native extrusion and firmware settings',()=>{
  let state=p(evaluate({wall_loops:0,skirt_loops:0,brim_type:'no_brim',top_shell_layers:0,bottom_shell_layers:0,sparse_infill_density:0,default_acceleration:0}));
  for(const key of ['outer_wall_line_width','inner_wall_line_width','sparse_infill_line_width','top_surface_line_width','outer_wall_acceleration'])assert.equal(state[key].enabled,false,key);
  state=p(evaluate({wall_loops:0,skirt_loops:1}));assert.equal(state.inner_wall_line_width.enabled,true);
  state=p(evaluate({default_jerk:10},{gcode_flavor:'marlin2',machine_max_junction_deviation:['0.02']}));
  assert.equal(state.default_jerk.enabled,false);assert.equal(state.outer_wall_jerk.visible,false);assert.equal(state.default_junction_deviation.enabled,true);
  state=p(evaluate({accel_to_decel_enable:false},{gcode_flavor:'klipper'}));assert.equal(state.accel_to_decel_factor.visible,true);assert.equal(state.accel_to_decel_factor.enabled,false);
});

test('smoothing, scarf, support styles, and native GUI numeric corrections keep exact boundary behavior',()=>{
  const result=evaluate({max_volumetric_extrusion_rate_slope:1,enable_arc_fitting:true,max_volumetric_extrusion_rate_slope_segment_length:.49,layer_height:.5,ironing_spacing:.049,support_ironing_spacing:.05,xy_hole_compensation:2.01,xy_contour_compensation:2,enable_support:true,support_type:'normal(auto)',support_style:'organic',seam_slope_type:'external',seam_slope_start_height:'100%',skin_infill_depth:.4,infill_lock_depth:.6},{max_layer_height:['0.3']});
  const corrections=Object.fromEntries(result.corrections.map(item=>[item.key,item.value]));
  assert.equal(corrections.enable_arc_fitting,false);assert.equal(corrections.max_volumetric_extrusion_rate_slope_segment_length,'1');assert.equal(corrections.layer_height,'0.3');assert.equal(corrections.ironing_spacing,'0.1');assert.equal(corrections.support_ironing_spacing,undefined);assert.equal(corrections.xy_hole_compensation,'0');assert.equal(corrections.xy_contour_compensation,undefined);assert.equal(corrections.support_style,'default');assert.equal(corrections.seam_slope_start_height,'0');assert.equal(corrections.infill_lock_depth,'0.2');
  assert.deepEqual(p(result).support_style.options,['default','grid','snug']);
});

test('filament pressure advance, cooling, heater bounds, and machine capabilities follow native conditions',()=>{
  const result=evaluate({}, {auxiliary_fan:false,support_air_filtration:true,support_chamber_temp_control:false,pellet_modded_printer:true},{enable_pressure_advance:[false],adaptive_pressure_advance:[true],enable_overhang_bridge_fan:[false],slow_down_for_layer_cooling:[false],activate_air_filtration:[true],activate_air_filtration_during_print:[false],filament_max_volumetric_speed:['0.2'],chamber_temperature:['50'],chamber_minimal_temperature:['60'],nozzle_temperature_range_low:['190'],nozzle_temperature_range_high:['230'],nozzle_temperature:['240']});
  const state=result.fields.filament;
  assert.equal(state.pressure_advance.enabled,false);assert.equal(state.adaptive_pressure_advance_model.visible,false);assert.equal(state.overhang_fan_speed.enabled,false);assert.equal(state.additional_cooling_fan_speed.visible,false);assert.equal(state.during_print_exhaust_fan_speed.enabled,false);assert.equal(state.filament_diameter.visible,false);assert.equal(state.pellet_flow_coefficient.visible,true);assert.equal(state.activate_chamber_temp_control.visible,false);
  assert.deepEqual(result.corrections.find(item=>item.key==='chamber_minimal_temperature').value,['50']);assert.deepEqual(result.corrections.find(item=>item.key==='filament_max_volumetric_speed').value,['0.5']);assert.ok(result.warnings.some(item=>item.key==='nozzle_temperature'));
});

test('coverage distinguishes evaluated fields, missing native context, and remaining native behavior',()=>{
  const result=evaluateSettingsState();
  assert.ok(result.coverage.evaluatedFields.process>240);assert.ok(result.coverage.evaluatedFields.filament>=20);assert.ok(result.coverage.unresolved.length>0);assert.ok(result.coverage.remaining.length>0);
  assert.equal(result.fields.machine.nozzle_diameter.evaluated,false);assert.equal(result.fields.process.support_type.evaluated,true);
  assert.ok(result.fields.process.support_type.reasons.length>0);assert.ok(result.fields.process.support_type.sources.every(item=>item.commit===result.provenance.commit));
});

test('machine vendor, multimaterial, and firmware rules expose native supported controls and options',()=>{
  let result=evaluate({}, {gcode_flavor:'marlin2',single_extruder_multi_material:false,manual_filament_change:true,wipe_tower_type:'type2',nozzle_diameter:['0.4','0.4'],machine_max_junction_deviation:['0','0.02'],emit_machine_limits_to_gcode:true,input_shaping_emit:true,input_shaping_type:'MZV'}),state=result.fields.machine;
  assert.equal(state.manual_filament_change.enabled,false);assert.equal(state.tool_change_on_wipe_tower.enabled,true);assert.equal(state.enable_filament_ramming.enabled,true);
  assert.equal(state.machine_max_jerk_x.enabled,false,'Any motion mode with junction deviation disables native Marlin jerk');
  assert.equal(state.input_shaping_emit.visible,true);assert.equal(state.input_shaping_freq_y.enabled,true);assert.deepEqual(state.input_shaping_type.options,['ZV','Disable']);
  assert.equal(result.corrections.find(item=>item.key==='input_shaping_type').value,'ZV');assert.equal(result.corrections.find(item=>item.key==='manual_filament_change').value,false);
  state=evaluate({}, {gcode_flavor:'reprapfirmware',emit_machine_limits_to_gcode:true,input_shaping_emit:true}).fields.machine;
  assert.equal(state.input_shaping_freq_x.enabled,true);assert.equal(state.input_shaping_freq_y.enabled,false);assert.ok(state.input_shaping_type.options.includes('DAA'));
  state=evaluate({}, {gcode_flavor:'klipper'}).fields.machine;
  assert.equal(state.emit_machine_limits_to_gcode.enabled,false);assert.equal(state.machine_max_acceleration_travel.visible,false);assert.equal(state.input_shaping_emit.visible,false);
  state=evaluate({}, {}, {},{isBblPrinter:true,supportWrappingDetection:true}).fields.machine;
  assert.equal(state.use_firmware_retraction.visible,false);assert.equal(state.wipe_tower_type.visible,false);assert.equal(state.scan_first_layer.visible,true);assert.equal(state.wrapping_detection_gcode.visible,true);
});

test('machine extruder controls use native variant maps while preserving per-extruder differences',()=>{
  const printer={nozzle_diameter:['0.4','0.6'],extruder_type:['Direct Drive','Bowden'],printer_extruder_variant:['Direct Drive Standard','Direct Drive High Flow','Bowden Standard'],printer_extruder_id:[1,1,2],retraction_length:['0','1','2'],wipe:[false,true,true],z_hop:['0','0.4'],z_hop_types:['Normal Lift','Slope Lift'],retract_length_toolchange:['0','3','4']};
  let result=evaluate({},printer,{}, {projectSettings:{nozzle_volume_type:['Standard','Standard']}}),state=result.fields.machine;
  assert.equal(state.retraction_minimum_travel.indices[0].enabled,false);assert.equal(state.retraction_minimum_travel.indices[1].enabled,true);assert.equal(state.retraction_minimum_travel.indices[1].variantIndex,2);
  assert.equal(state.travel_slope.indices[0].enabled,false);assert.equal(state.travel_slope.indices[1].enabled,true);assert.equal(state.extruder_printable_area.visible,true);assert.equal(state.extruder_printable_area.enabled,false);
  result=evaluate({},printer,{}, {extruderIndex:1,projectSettings:{nozzle_volume_type:['Standard','Standard']}});assert.equal(result.fields.machine.retraction_minimum_travel.enabled,true);
  result=evaluate({}, {...printer,printer_extruder_id:[1],extruder_variant_list:['Direct Drive Standard, Direct Drive High Flow','Bowden Standard']});
  assert.equal(result.fields.machine.retraction_minimum_travel.indices[1].variantIndex,2,'Incomplete native ID maps fall back to generated variant IDs');
  result=evaluate({}, {...printer,printer_extruder_variant:['Direct Drive Standard'],printer_extruder_id:[1]});
  assert.ok(result.coverage.unresolved.some(item=>item.scope==='machine'&&item.index===1));
});

test('firmware retraction conflicts preserve the actual native confirmation and alternative without silent edits',()=>{
  const printer={use_firmware_retraction:true,wipe:[true,true],retract_before_wipe:['50%','25%'],retraction_length:['0.8']};
  const snapshot=structuredClone(printer),result=evaluate({},printer);
  assert.deepEqual(printer,snapshot);assert.equal(result.fields.machine.retraction_speed.enabled,false);
  assert.equal(result.fields.machine.wipe_distance.enabled,true,'Native later wipe rule replaces the firmware retraction disable rule');
  const changes=result.corrections.filter(item=>item.group==='firmware-retraction');assert.equal(changes.length,2);
  assert.deepEqual(changes.find(item=>item.key==='wipe').value,[false,false]);assert.deepEqual(changes.find(item=>item.key==='retract_before_wipe').value,[100,100]);
  assert.ok(changes.every(item=>item.mode==='confirmation'&&item.alternative.key==='use_firmware_retraction'));
  assert.equal(result.fields.machine.retraction_length.evaluated,false,'Native misspelled retract_length toggle does not disable the real control');
});

test('nullable filament override states preserve inherit values, disabled checkboxes, and variant differences',()=>{
  const result=evaluate({ironing_speed:31},{retraction_length:['0.8','1.2'],retraction_speed:['30','40'],enable_long_retraction_when_cut:2},{filament_retraction_length:['nil','0'],filament_retraction_speed:['nil','50'],filament_long_retractions_when_cut:[true,true],filament_retraction_distances_when_cut:['10','20'],filament_ironing_speed:['nil','40']});
  let state=result.fields.filament;
  assert.equal(state.filament_retraction_length.indices[0].overrideEnabled,true);assert.equal(state.filament_retraction_length.indices[0].overrideChecked,false);assert.equal(state.filament_retraction_length.indices[0].inheritedValue,'0.8');
  assert.equal(state.filament_retraction_speed.indices[0].enabled,false);assert.equal(state.filament_retraction_speed.indices[0].inheritedValue,'30');
  assert.equal(state.filament_retraction_speed.indices[1].overrideEnabled,false);assert.equal(state.filament_retraction_speed.indices[1].overrideChecked,false);
  assert.equal(state.filament_long_retractions_when_cut.indices[0].visible,true);assert.equal(state.filament_retraction_distances_when_cut.indices[0].enabled,true);assert.equal(state.filament_retraction_distances_when_cut.indices[1].enabled,false);
  assert.equal(state.filament_ironing_speed.indices[0].inheritedValue,31);assert.equal(state.filament_ironing_speed.indices[1].enabled,true);
  state=evaluate({}, {enable_long_retraction_when_cut:1},{filament_long_retractions_when_cut:[true]}).fields.filament;
  assert.equal(state.filament_long_retractions_when_cut.visible,false);assert.equal(state.filament_long_retractions_when_cut.enabled,false);
});

test('project bed selection and material temperature recommendations follow native tables',()=>{
  let result=evaluate({}, {support_multi_bed_types:false,support_chamber_temp_control:true},{filament_type:['PLA'],nozzle_temperature_range_low:['170'],nozzle_temperature_range_high:['250'],chamber_temperature:['46']},{projectSettings:{curr_bed_type:'Textured PEI Plate'}}),state=result.fields.filament;
  assert.equal(state.textured_plate_temp_initial_layer.visible,true);assert.equal(state.cool_plate_temp_initial_layer.visible,false);assert.equal(state.hot_plate_temp_initial_layer.visible,false);
  assert.ok(result.warnings.some(item=>item.key==='nozzle_temperature_range_low'&&item.message.includes('180')));assert.ok(result.warnings.some(item=>item.key==='nozzle_temperature_range_high'&&item.message.includes('240')));assert.ok(result.warnings.some(item=>item.key==='chamber_temperature'&&item.message.includes('45')));
  result=evaluate({}, {support_multi_bed_types:true},{},{projectSettings:{curr_bed_type:'Cool Plate'}});assert.equal(result.fields.filament.hot_plate_temp_initial_layer.visible,true);
  result=evaluate({}, {support_multi_bed_types:false},{},{isBblPrinter:true,projectSettings:{curr_bed_type:'Cool Plate'}});assert.equal(result.fields.filament.hot_plate_temp_initial_layer.visible,true);
  result=evaluate({}, {support_chamber_temp_control:true},{filament_type:['Custom material'],chamber_temperature:['200']});assert.ok(!result.warnings.some(item=>item.key==='chamber_temperature'),'Native unknown materials have no chamber warning');
});


test('SEMM nozzle edit confirmation requires an actual edit context and keeps both native choices',()=>{
  const printer={single_extruder_multi_material:true,nozzle_diameter:['0.4','0.6']};
  assert.ok(!evaluate({},printer).corrections.some(item=>item.group==='semm-nozzle-diameter'));
  let result=evaluate({},printer,{}, {changedSetting:{scope:'machine',key:'nozzle_diameter',index:1}});
  const change=result.corrections.find(item=>item.group==='semm-nozzle-diameter');
  assert.deepEqual(change.value,['0.6','0.6']);assert.deepEqual(change.alternative.value,['0.4','0.4']);assert.equal(change.mode,'confirmation');assert.equal(change.source.file,'Tab.cpp');
  result=evaluate({}, {...printer,nozzle_diameter:['0.40005','0.4']},{},{changedSetting:{scope:'machine',key:'nozzle_diameter',index:0}});
  assert.ok(!result.corrections.some(item=>item.group==='semm-nozzle-diameter'),'Native EPSILON avoids a prompt for negligible differences');
  assert.deepEqual(printer.nozzle_diameter,['0.4','0.6']);
});
