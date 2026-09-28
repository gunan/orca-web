import {nativeFeature} from './native-gcode-tags.js';
// OrcaSlicer v2.4.2 Plater.cpp adjust_settings_for_flowrate_calib.
// Labels, relative flow multipliers, ten-layer scaling and speed limits are
// source-derived; selecting a measured specimen remains an explicit user action.
import { displayedSettings } from './settings.js';
import { displayedProfileSettings } from './profile-settings.js';
import { createMesh, transformPositions, meshBounds, sceneBounds, bedBounds } from './geometry.js';
export const FLOW_RATIO_METHODS = Object.freeze({
  coarse: { label: 'Pass 1 — coarse', resource: 'flowrate-test-pass1.3mf', linear: false, pass: 1, modifiers: [0,10,15,20,5,-10,-15,-20,-5] },
  fine: { label: 'Pass 2 — fine', resource: 'flowrate-test-pass2.3mf', linear: false, pass: 2, modifiers: [0,-1,-2,-3,-4,-5,-6,-7,-8,-9] },
  yolo: { label: 'YOLO — recommended', resource: 'Orca-LinearFlow.3mf', linear: true, pass: 1, modifiers: [0,.01,.02,.03,.04,.05,-.01,-.02,-.03,-.04,-.05] },
  'yolo-fine': { label: 'YOLO — perfectionist', resource: 'Orca-LinearFlow_fine.3mf', linear: true, pass: 2, modifiers: [0,.005,.01,.015,.02,.025,.03,.035,-.005,-.01,-.015,-.02,-.025,-.03,-.035,-.04] }
});
export const FLOW_RATIO_MODE = { id: 'flow-ratio', label: 'Flow ratio', supported: true, defaults: { method: 'yolo', pattern: 'archimedeanchords' } };
const first = input => Array.isArray(input) ? input[0] : input;
const finite = (input, label) => { if (input == null || input === '' || !['string','number'].includes(typeof input) || !Number.isFinite(Number(input))) throw new Error(`${label} must be a finite number`); return Number(input); };
const format = value => String(Number(value.toFixed(8)));
export function flowRatioForModifier(plan, modifier) {
  const ratio = plan.flow.linear ? plan.flow.baseFlow + modifier : plan.flow.baseFlow * (1 + modifier / 100);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 2) throw new Error('Flow result must be above 0 and no greater than the native maximum 2');
  return Number(ratio.toFixed(8));
}
export function createFlowRatioPlan(input, selection, nozzle) {
  if (Object.keys(input).some(key => !['mode','method','pattern'].includes(key))) throw new Error('Unknown flow-ratio parameter');
  const params = { mode: 'flow-ratio', method: input.method ?? 'yolo', pattern: input.pattern ?? 'archimedeanchords' }, method = FLOW_RATIO_METHODS[params.method];
  if (!method) throw new Error('Choose coarse, fine, YOLO or YOLO perfectionist flow calibration');
  if (!['archimedeanchords','monotonic'].includes(params.pattern)) throw new Error('Choose the native Archimedean Chords or Monotonic top pattern');
  const processValues = displayedSettings(selection.process), filamentValues = displayedProfileSettings('filament', selection.filament);
  const baseFlow = finite(first(filamentValues.filament_flow_ratio), 'Explicit filament flow ratio');
  if (!(baseFlow > 0 && baseFlow <= 2)) throw new Error('Flow calibration requires an explicit filament flow ratio above 0 and at most 2');
  const layerHeight = nozzle / 2, firstHeight = Math.max(finite(processValues.initial_layer_print_height, 'Initial layer height'), layerHeight), height = firstHeight + 9 * layerHeight;
  const width = Math.fround(Math.fround(nozzle) * Math.fround(1.2)), area = layerHeight * (width - layerHeight * (1 - Math.PI / 4));
  const maxVolumetric = finite(first(filamentValues.filament_max_volumetric_speed), 'Filament volumetric limit');
  if (!(maxVolumetric > 0)) throw new Error('Flow calibration requires a positive native filament volumetric limit');
  const maxSpeed = maxVolumetric / (area * (method.linear ? (baseFlow + (method.pass === 2 ? .035 : .05)) / baseFlow : method.pass === 1 ? 1.2 : 1));
  const topSpeed = Math.floor(Math.min(finite(processValues.top_surface_speed, 'Top surface speed'), maxSpeed)), solidSpeed = Math.floor(Math.min(finite(processValues.internal_solid_infill_speed, 'Internal solid infill speed'), maxSpeed));
  if (topSpeed <= 0 || solidSpeed <= 0) throw new Error('Flow calibration requires positive resolved top and solid infill speeds');
  const flow = { baseFlow, linear: method.linear, pass: method.pass, modifiers: method.modifiers, xyScale: nozzle / .6 > 1.2 ? nozzle / .6 : 1, zScale: height / 2, height };
  const partial = { flow };
  for (const modifier of method.modifiers) flowRatioForModifier(partial, modifier);
  const objectSettings = { wall_loops:'1', only_one_wall_top:'1', thick_internal_bridges:'0', enable_extra_bridge_layer:'disabled', internal_bridge_density:'100%', sparse_infill_density:'35%', min_width_top_surface:'100%', bottom_shell_layers:'2', top_shell_layers:'5', top_shell_thickness:'0', bottom_shell_thickness:'0', detect_thin_wall:'1', filter_out_gap_fill:'0', sparse_infill_pattern:'rectilinear', top_surface_line_width:format(width), internal_solid_infill_line_width:format(width), top_surface_pattern:params.pattern, top_solid_infill_flow_ratio:'1', infill_direction:'45', solid_infill_direction:'135', align_infill_direction_to_model:'1', ironing_type:'no ironing', internal_solid_infill_speed:String(solidSpeed), top_surface_speed:String(topSpeed), seam_slope_type:'none', gap_fill_target:'nowhere', calib_flowrate_topinfill_special_order:'1' };
  return { params, flow, objectSettings, inputFormat:'3mf', model:{resource:`filament_flow/${method.resource}`,minZ:0,maxZ:height,scale:1}, printer:{resonance_avoidance:'0'}, filament:{}, process:{layer_height:format(layerHeight),initial_layer_print_height:format(firstHeight),alternate_extra_wall:'0',reduce_crossing_wall:'1',enable_wrapping_detection:'0',max_volumetric_extrusion_rate_slope:'0'},
    limitations:['The labelled bundled native specimens retain independent per-object extrusion ratios; they must remain separate native 3MF objects.', 'The browser preserves the native specimen layout and centers/scales the group on a rectangular bed; it does not reproduce native automatic nesting.', 'Inspect the printed specimens and explicitly select the best result. No printer is contacted and no measurement is inferred. Saving creates a new filament preset for the selected printer.'] };
}
export function prepareFlowRatioObjects(imported, plan, bed) {
  if (!Array.isArray(imported) || imported.length !== plan.flow.modifiers.length) throw new Error('Native flow resource has the wrong number of specimens');
  const seen = new Set(), bounds = sceneBounds(imported), target = bedBounds(bed);
  if (!bounds) throw new Error('Native flow resource has no geometry');
  if (bounds.size[0] * plan.flow.xyScale + 4 > target.size[0] || bounds.size[1] * plan.flow.xyScale + 4 > target.size[1] || plan.height > target.size[2]) throw new Error('The native flow specimen layout does not fit the selected bed; select a larger printer');
  const specimens = [], objects = imported.map(object => {
    const matched = object.name.match(/^flowrate_(m?)(\d+(?:\.\d+)?)$/); if (!matched) throw new Error('Native flow specimen label is unrecognized');
    const modifier = Number(matched[2]) * (matched[1] ? -1 : 1);
    if (!plan.flow.modifiers.includes(modifier) || seen.has(modifier)) throw new Error('Native flow specimen modifiers do not match the selected calibration method'); seen.add(modifier);
    const objectBounds = meshBounds(object); if (Math.abs(objectBounds.size[2] - 2) > .01) throw new Error('Native flow specimen must have the source 2 mm height');
    const positions = transformPositions(object);
    for (let i = 0; i < positions.length; i += 3) { positions[i] = (positions[i] - bounds.center[0]) * plan.flow.xyScale + target.center[0]; positions[i+1] = (positions[i+1] - bounds.center[1]) * plan.flow.xyScale + target.center[1]; positions[i+2] = (positions[i+2] - objectBounds.min[2]) * plan.flow.zScale; }
    const flowRatio = flowRatioForModifier(plan, modifier), multiplier = plan.flow.linear ? (plan.flow.baseFlow + modifier) / plan.flow.baseFlow : 1 + modifier / 100;
    specimens.push({objectId:object.id,name:object.name,modifier,multiplier:Number(multiplier.toFixed(8)),flowRatio});
    return createMesh({...object,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,printable:true,filamentSlot:1,native:{groupId:object.id,objectName:object.name,partType:'normal_part',objectSettings:{...plan.objectSettings,print_flow_ratio:format(multiplier)},partSettings:{}}});
  });
  return { objects, specimens };
}
export function verifyFlowRatioGcode(gcode, plan) {
  if (!Array.isArray(plan.specimens) || plan.specimens.length !== plan.flow.modifiers.length) throw new Error('Prepared flow specimens are missing');
  for (const specimen of plan.specimens) {
    const label = specimen.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if (!new RegExp(`^; printing object ${label} id:`, 'm').test(gcode)) throw new Error(`Native output is missing flow specimen ${specimen.name}`);
  }
  if (!gcode.split('\n').some(line=>nativeFeature(line)==='Top surface') || !/^G1\b[^;\n]*\bE[-+\d.]+/m.test(gcode)) throw new Error('Native flow output has no top surface extrusion');
  return { mode:'flow-ratio',method:plan.request.method,pattern:plan.request.pattern,specimenCount:plan.specimens.length,baseFlow:plan.flow.baseFlow,specimens:structuredClone(plan.specimens),source:plan.source };
}
