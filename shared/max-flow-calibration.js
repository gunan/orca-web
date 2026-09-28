import { displayedSettings } from './settings.js';
import { displayedProfileSettings } from './profile-settings.js';
import { speedCalibrationContext, applySpeedSchedule } from './vfa-calibration.js';
// OrcaSlicer v2.4.2 Plater::calib_max_vol_speed and Flow::mm3_per_mm.
export const MAX_FLOW_MODE = Object.freeze({ id:'max-volumetric-speed',label:'Max volumetric speed',supported:true,defaults:{start:5,end:20,step:.5},unit:'mm³/s' });
const first=value=>Array.isArray(value)?value[0]:value;
const finite=(value,label)=>{if(value==null||value===''||!['string','number'].includes(typeof value)||!Number.isFinite(Number(value)))throw new Error(`${label} must be a finite number`);return Number(value)};
const format=value=>String(Number(value.toFixed(10)));
export function maxFlowRequestedSpeed(plan,z){return Math.round(plan.flowRate.startSpeed+z*plan.flowRate.stepSpeed);}
export function createMaxFlowPlan(input,selection,nozzle){
 const params={mode:'max-volumetric-speed',start:finite(input.start??5,'Start'),end:finite(input.end??20,'End'),step:finite(input.step??.5,'Step')};
 if(params.start<=0||params.end>200||params.step<=0||params.end<params.start+params.step)throw new Error('Max volumetric speed requires Start > 0, End ≤ 200 mm³/s, Step > 0 and End ≥ Start + Step');
 const height=(params.end-params.start+1)/params.step,layerHeight=nozzle*.8,lineWidth=nozzle*1.75;
 if(height>280)throw new Error('Volumetric range exceeds the native 280 mm tower; increase the step');
 const processValues=displayedSettings(selection.process,{includeDefaults:true}),filament=displayedProfileSettings('filament',selection.filament),printer=displayedProfileSettings('machine',selection.printer);
 const initialHeight=finite(processValues.initial_layer_print_height,'Native first layer height');if(height<initialHeight+layerHeight)throw new Error('Volumetric range needs at least two native layers; reduce the step');
 const flowRatio=finite(first(filament.filament_flow_ratio),'Filament flow ratio');if(!(flowRatio>0&&flowRatio<=2))throw new Error('Volumetric calibration requires a positive filament flow ratio no greater than 2');
 // Flow stores width and height as float and rounds its area to float before
 // converting to double and multiplying by the filament flow ratio.
 const w=Math.fround(lineWidth),h=Math.fround(layerHeight),area=Math.fround(h*(w-h*(1-Math.PI/4)))*flowRatio;
 const flowRate={flowRatio,area,startSpeed:params.start/area,stepSpeed:params.step/area,lineWidth,layerHeight};
 const baseSpeed=Math.ceil((params.start+(height+layerHeight+initialHeight)*params.step)/area);
 if(!Number.isFinite(baseSpeed)||baseSpeed>1000000||Math.round(flowRate.startSpeed)<1)throw new Error('Volumetric range is outside supported native feedrate precision');
 // The native workflow explicitly disables pressure equalizer before slicing.
 const context=speedCalibrationContext({...selection,process:{...selection.process,max_volumetric_extrusion_rate_slope:'0'}},'Max volumetric speed');
 const maxLayerHeight=finite(first(printer.max_layer_height),'Native maximum layer height');
 return{params,flowRate,speedCalibration:{...context,baseSpeed},model:{resource:'volumetric_speed/SpeedTestStructure.drc',minZ:0,maxZ:height,scale:1},
  printer:{resonance_avoidance:'0',max_layer_height:[format(Math.max(maxLayerHeight,layerHeight))]},filament:{filament_max_volumetric_speed:['200'],slow_down_layer_time:['0']},
  process:{enable_overhang_speed:'0',wall_loops:'1',alternate_extra_wall:'0',top_shell_layers:'0',bottom_shell_layers:'0',sparse_infill_density:'0%',outer_wall_line_width:format(lineWidth),layer_height:format(layerHeight),brim_type:'outer_and_inner',brim_width:'5',brim_object_gap:'0',precise_z_height:'0',timelapse_type:'0',spiral_mode:'1',max_volumetric_extrusion_rate_slope:'0',enable_wrapping_detection:'0',outer_wall_speed:String(baseSpeed)},
  limitations:['Uses the bundled native structure, 1.75× nozzle line width, 0.8× nozzle layer height and a 200 mm³/s filament allowance. X is compressed only when the bed width needs the native 10 mm surrounding clearance.', 'Requested flow increases with native layer Z. Whole-mm/s rounding, first-layer speed, slowdown ramp and the native flow cap affect actual commanded flow. The native model-height rule can exceed the nominal end.', 'Time estimates are unavailable after the feedrate schedule; material estimates remain native. Adaptive pressure advance, nonzero small-perimeter threshold and rafts are unsupported.', 'Inspect a physical print to choose a measured flow limit. The chosen limit can be saved explicitly as a new filament preset. This workflow does not contact printers or infer failure height.']};
}
export function applyMaxFlowSchedule(lines,layers,plan){
 const result=applySpeedSchedule(lines,layers,plan,maxFlowRequestedSpeed);
 for(const [key,expected]of Object.entries({outer_wall_line_width:plan.flowRate.lineWidth,layer_height:plan.flowRate.layerHeight,filament_max_volumetric_speed:200})){const match=lines.join('\n').match(new RegExp(`^; ${key} = (.+)$`,'m'));if(!match||Math.abs(Number(match[1])-expected)>1e-8)throw new Error(`Native volumetric setting ${key} does not match the prepared calibration`);}
 result.summary={...result.summary,flowRatio:plan.flowRate.flowRatio,flowArea:plan.flowRate.area,firstRequestedFlow:plan.request.start+layers[0].z*plan.request.step,lastRequestedFlow:plan.request.start+layers.at(-1).z*plan.request.step};return result;
}
