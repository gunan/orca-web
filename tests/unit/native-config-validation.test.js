import test from 'node:test';import assert from 'node:assert/strict';
import {validateNativeConfiguration} from '../../shared/native-config-validation.js';
const input=(process={},printer={},filament={})=>({process,printer,filament});
const keys=result=>result.errors.map(item=>item.key);

test('native defaults and ordinary resolved numeric values satisfy structural checks',()=>{
 assert.deepEqual(validateNativeConfiguration().errors,[]);
 const config=input({layer_height:'0.12',initial_layer_print_height:'0.2',outer_wall_line_width:'110%'},{nozzle_diameter:['0.4']},{filament_diameter:['1.75'],filament_flow_ratio:['0.98']});
 const before=structuredClone(config);assert.equal(validateNativeConfiguration(config).valid,true);assert.deepEqual(config,before);
});
test('native minimum diameter, layer, clearance and flow checks retain exact boundaries',()=>{
 const result=validateNativeConfiguration(input({layer_height:0,initial_layer_print_height:0,bridge_flow:0,internal_bridge_flow:0},{nozzle_diameter:['0.0049'],nozzle_height:0,extruder_clearance_radius:0},{filament_diameter:['0.99'],filament_flow_ratio:['0']}));
 for(const key of ['layer_height','initial_layer_print_height','bridge_flow','internal_bridge_flow','nozzle_diameter','nozzle_height','extruder_clearance_radius','filament_diameter','filament_flow_ratio'])assert.ok(keys(result).includes(key),key);
 const edge=validateNativeConfiguration(input({outer_wall_line_width:0,inner_wall_line_width:0,sparse_infill_line_width:0,internal_solid_infill_line_width:0,top_surface_line_width:0,support_line_width:0,initial_layer_line_width:0,skin_infill_line_width:0,skeleton_infill_line_width:0},{nozzle_diameter:['0.005']},{filament_diameter:['1']}));assert.equal(edge.valid,true);
});
test('CLI vase restrictions include hidden support layers while GUI validation permits its correction flow',()=>{
 const config=input({spiral_mode:true,wall_loops:3,sparse_infill_density:'15%',top_shell_layers:4,enable_support:true,enforce_support_layers:2});
 for(const key of ['wall_loops','sparse_infill_density','top_shell_layers','enable_support','enforce_support_layers'])assert.ok(keys(validateNativeConfiguration(config)).includes(key));
 assert.equal(validateNativeConfiguration(config,{underCli:false}).valid,true);
});
test('line widths resolve percentages against largest nozzle and bridge widths are bounded by smallest nozzle',()=>{
 const config=input({outer_wall_line_width:'500%',bridge_line_width:'50%'},{nozzle_diameter:['0.4','0.6']});
 assert.equal(validateNativeConfiguration(config).valid,true);
 config.process.outer_wall_line_width='501%';config.process.bridge_line_width='100%';
 const result=validateNativeConfiguration(config);assert.ok(keys(result).includes('outer_wall_line_width'));assert.ok(keys(result).includes('bridge_line_width'));
 config.process.outer_wall_line_width='3';config.process.bridge_line_width='0.4';assert.equal(validateNativeConfiguration(config).valid,true);
});
test('firmware retraction rejects wipe even at 100 percent and invalid enums and nonfinite values are reported',()=>{
 let result=validateNativeConfiguration(input({}, {gcode_flavor:'marlin2',use_firmware_retraction:true,wipe:[true],retract_before_wipe:['100%']}));assert.ok(keys(result).includes('use_firmware_retraction'));
 result=validateNativeConfiguration(input({sparse_infill_pattern:'invented',wall_loops:NaN},{gcode_flavor:'invented'}));
 for(const key of ['sparse_infill_pattern','wall_loops','gcode_flavor'])assert.ok(keys(result).includes(key));assert.equal(new Set(keys(result)).size,keys(result).length);
});
