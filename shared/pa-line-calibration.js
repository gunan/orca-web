import {displayedSettings} from './settings.js';
import {displayedProfileSettings} from './profile-settings.js';
import {PAWriter,paExtrusionPerMM,paNumber,drawPABox,drawPANumber} from './pa-calibration-primitives.js';
export const PA_LINE_MODE={id:'pressure-advance-line',label:'Pressure advance lines',supported:true,defaults:{start:0,end:.1,step:.002,printNumbers:true},unit:''};
const first=v=>Array.isArray(v)?v[0]:v;
const numeric=(v,label)=>{if(v===null||v===''||!['number','string'].includes(typeof v)||!Number.isFinite(Number(v)))throw new Error(`${label} must be finite`);return Number(v);};
const truth=v=>v===true||v==='1';
const absolute=(v,base,label)=>typeof v==='string'&&v.endsWith('%')?numeric(v.slice(0,-1),label)*base/100:numeric(v,label);
/** Native PA line/pattern uses bed bounds inset by 25 mm for these macros.
 * Rewrite only recognized constant-index forms before the native template
 * engine runs; unsupported expressions fail rather than silently mesh one area
 * and print in another. Source templates remain immutable. */
function replaceContext(source, values) {
 let text=String(source||'');
 for(const [key,value] of Object.entries(values)) {
  text=text.replace(new RegExp(`\\[\\s*${key}\\s*\\]`,'g'),String(value));
  text=text.replace(new RegExp(`\\b${key}\\b`,'g'),String(value));
 }
 return text;
}
export function paStartTemplate(source,bed){
 let text=String(source||'');
 const vectors={first_layer_print_min:[bed.min[0]+25,bed.min[1]+25],first_layer_print_max:[bed.max[0]-25,bed.max[1]-25],first_layer_print_size:[bed.max[0]-bed.min[0]-50,bed.max[1]-bed.min[1]-50]};
 for(const[key,values]of Object.entries(vectors)){
  text=text.replace(new RegExp(`\\[\\s*${key}\\s*\\[\\s*([01])\\s*\\]\\s*\\]`,'g'),(_,i)=>String(values[Number(i)]));
  text=text.replace(new RegExp(`\\b${key}\\s*\\[\\s*([01])\\s*\\]`,'g'),(_,i)=>String(values[Number(i)]));
  if(new RegExp(`\\b${key}\\b`).test(text))throw new Error(`PA lines do not support this template expression for ${key}`);
 }
 if(/\bfirst_layer_print_convex_hull\b/.test(text))throw new Error('PA lines do not yet support convex-hull expressions in custom G-code');
 return replaceContext(text,{scan_first_layer:'false'});
}
export function paEndTemplate(source,bed,height){
 const text=paStartTemplate(source,bed);
 if(/\b(?:e_position|position|extruded_volume|extruded_weight|total_extruded_volume|total_extruded_weight)[a-z_]*\b/.test(text))throw new Error('PA line end templates cannot depend on native object extrusion or position state');
 // Native PA_Line bypasses process_layer: m_layer_index remains -1 and
 // m_max_layer_z remains zero. layer_z is the generated writer's final Z.
 return replaceContext(text,{layer_z:height,max_layer_z:0,layer_num:-1});
}
function rectangularBed(selection){const points=selection.printer.printable_area?.map(p=>Array.isArray(p)?p.map(Number):String(p).split('x').map(Number));if(!points||points.length!==4||points.some(p=>p.length!==2||!p.every(Number.isFinite)))throw new Error('PA lines require a rectangular native bed');const min=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),0],max=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])),Number(selection.printer.printable_height)];if(points.some(([x,y])=>![min[0],max[0]].includes(x)||![min[1],max[1]].includes(y)))throw new Error('PA lines require a rectangular native bed');return{min,max};}
export function createPALinePlan(input,selection,nozzle){
 if(Object.keys(input).some(key=>!['mode','start','end','step','printNumbers'].includes(key)))throw new Error('Unknown PA line parameter');
 const customCode=[selection.printer.machine_start_gcode,selection.printer.machine_end_gcode,selection.filament.filament_start_gcode,selection.filament.filament_end_gcode].flat().filter(Boolean).join('\n');
 if(/^\s*;\s*(?:LAYER_CHANGE|CHANGE_LAYER|TYPE:Custom|FEATURE:\s*Custom|stop printing object|ORCA_WEB_)/m.test(customCode))throw new Error('PA line custom start/end code contains reserved native calibration boundary comments');
 const params={mode:'pressure-advance-line',start:numeric(input.start??0,'Start PA'),end:numeric(input.end??.1,'End PA'),step:numeric(input.step??.002,'PA step'),printNumbers:input.printNumbers??true};
 if(typeof params.printNumbers!=='boolean')throw new Error('Print numbers must be a boolean');if(params.start<0||params.end>2||params.step<.001||params.end<params.start+params.step)throw new Error('PA lines require 0 ≤ Start < End ≤ 2 and Step ≥ 0.001');
 const printer=displayedProfileSettings('machine',selection.printer),filament=displayedProfileSettings('filament',selection.filament),process=displayedSettings(selection.process,{includeDefaults:true}),bed=rectangularBed(selection),width=bed.max[0]-bed.min[0],height=bed.max[1]-bed.min[1];
 if(String(selection.printer.printer_model||'').startsWith('Bambu')||String(selection.printer.printer_structure||'').toLowerCase()==='bambu')throw new Error('PA line export does not yet support Bambu machine-specific start/end sequences');
 const requestedCount=Math.ceil((params.end-params.start)/params.step)+1,count=Math.min(requestedCount,Math.floor((height-10)/3.5));if(width<=80||height<=50||count<2)throw new Error('The native PA line test does not fit this printer bed');
 const layerHeight=absolute(process.initial_layer_print_height,nozzle,'Initial layer height'),lineWidth=nozzle<.51?nozzle*1.5:nozzle*1.05;
 if(layerHeight<=0||layerHeight>.4||lineWidth<=layerHeight)throw new Error('PA line preview slicing currently requires initial layer height above 0 through 0.4 mm and smaller than line width');
 const volumetric=numeric(first(filament.filament_max_volumetric_speed),'Filament volumetric speed');
 // Native Flow keeps its cross-section in float32.
 const w=Math.fround(lineWidth),h=Math.fround(layerHeight),flowArea=Math.fround(h*(w-h*(1-Math.PI/4)));
 let fast=Math.floor(Math.min(Math.max(100,numeric(process.outer_wall_speed,'Outer wall speed')),volumetric/flowArea)),slow=Math.max(10,fast/10);if(fast<slow+5)fast=slow+5;
 const effective=key=>first(filament[`filament_${key}`])??first(printer[key]);if(truth(printer.use_firmware_retraction))throw new Error('PA lines currently require explicit extrusion retraction rather than firmware retraction');
 const travelSpeed=absolute(process.initial_layer_travel_speed,numeric(process.travel_speed,'Travel speed'),'Initial layer travel speed'),travelZ=numeric(selection.process.travel_speed_z??selection.printer.travel_speed_z??0,'Z travel speed');
 const config={nozzle,layerHeight,relative:truth(printer.use_relative_e_distances),flavor:printer.gcode_flavor,isBambu:false,filamentDiameter:numeric(first(filament.filament_diameter),'Filament diameter'),filamentFlow:numeric(first(filament.filament_flow_ratio),'Filament flow ratio'),printFlow:numeric(process.print_flow_ratio,'Object flow ratio'),retractionLength:numeric(effective('retraction_length'),'Retraction length'),restartExtra:numeric(effective('retract_restart_extra'),'Extra restart length'),retractionSpeed:numeric(effective('retraction_speed'),'Retraction speed'),deretractionSpeed:numeric(effective('deretraction_speed'),'Deretraction speed'),travelSpeed,travelZSpeed:travelZ||travelSpeed,zOffset:numeric(printer.z_offset,'Z offset')};
 if(config.deretractionSpeed===0)config.deretractionSpeed=config.retractionSpeed;if(config.restartExtra<0||config.retractionLength<0||config.retractionSpeed<=0||config.deretractionSpeed<=0||config.travelSpeed<=0||config.travelZSpeed<=0||config.filamentDiameter<=0||config.printFlow<=0||config.filamentFlow<=0)throw new Error('PA lines require valid extrusion and travel settings, with nonnegative restart extra');
 const data={bed,config,lineWidth,layerHeight,count,requestedCount,actualEnd:params.start+(count-1)*params.step,shortLength:20,longLength:40+Math.min(width-120,0),spacing:3.5,fast:Math.trunc(fast)*60,slow:Math.trunc(slow)*60,outerAcceleration:numeric(process.outer_wall_acceleration,'Outer wall acceleration'),outerJerk:numeric(process.outer_wall_jerk,'Outer wall jerk')};
 data.startX=bed.min[0]+(width-2*data.shortLength-data.longLength-20)/2;data.startY=bed.min[1]+(height-count*data.spacing)/2;
 if(params.printNumbers)for(let i=0;i<count;i+=2){const label=paNumber(params.start+i*params.step);if(label.length>5||!/^[\d.]+$/.test(label))throw new Error('This PA range cannot be represented by the native five-character labels; use a coarser range or disable Print numbers');}
 if(data.actualEnd>2)throw new Error('The last native PA line exceeds the supported PA value 2');
 const useLimits=['marlin','marlin2','klipper','reprapfirmware'].includes(config.flavor), nativeLimit=key=>Math.round(numeric(first(printer[key]),key));
 data.maxAcceleration=useLimits?nativeLimit('machine_max_acceleration_extruding'):0;
 if(config.flavor==='klipper')for(const key of ['machine_max_acceleration_x','machine_max_acceleration_y']){const value=nativeLimit(key);if(value>0)data.maxAcceleration=Math.min(data.maxAcceleration,value);}
 data.maxJerk=useLimits?[nativeLimit('machine_max_jerk_x'),nativeLimit('machine_max_jerk_y')]:[0,0];
 data.accelToDecel=truth(process.accel_to_decel_enable);data.accelToDecelFactor=absolute(process.accel_to_decel_factor,100,'Acceleration to deceleration factor');
 const allFilamentCode=[...([selection.filament.filament_start_gcode,selection.filament.filament_end_gcode].flat().filter(Boolean))].join('\n');
 if(/\b(?:first_layer_print_(?:min|max|size|convex_hull)|scan_first_layer|layer_z|max_layer_z|layer_num|e_position|position|extruded_volume|extruded_weight)[a-z_]*\b/.test(allFilamentCode))throw new Error('PA lines do not yet support context-dependent filament start/end templates');
 const preview={request:params,paLine:data};generatePALineEvents(preview);
 return{params,paLine:data,model:{resource:'pressure_advance/pressure_advance_test.drc',minZ:0,maxZ:Math.max(.21,layerHeight*(params.printNumbers?2:1)),scale:1},printer:{resonance_avoidance:'0',before_layer_change_gcode:config.relative?'G92 E0':'',layer_change_gcode:'',machine_start_gcode:paStartTemplate(selection.printer.machine_start_gcode,bed),machine_end_gcode:paEndTemplate(selection.printer.machine_end_gcode,bed,layerHeight*(params.printNumbers?2:1))},filament:{enable_pressure_advance:['0'],adaptive_pressure_advance:['0']},process:{overhang_reverse:'0',precise_z_height:'0',gcode_comments:'1',gcode_label_objects:'1'},limitations:['Uses native prime/anchor and slow–fast–slow PA lines, with optional native numbered tabs. Prepare shows the native preview asset; Preview shows the generated toolpaths.',count<requestedCount?`The native bed-height rule limits this test to ${count} lines, ending at PA ${data.actualEnd}.`:`Generates ${count} PA lines.`, 'One rectangular plate and one extruder are supported. Firmware retraction, unsupported custom template expressions and unrepresentable native labels fail explicitly. Native GUI export comparison remains unverified.']};
}
export function generatePALineEvents(plan){const p=plan.paLine,{config,lineWidth,layerHeight,count,shortLength,longLength,spacing,startX,startY,fast,slow}=p,w=new PAWriter(config),wideE=paExtrusionPerMM(lineWidth,layerHeight,config.nozzle,config.filamentDiameter,config.printFlow),numberE=paExtrusionPerMM(config.nozzle,layerHeight,config.nozzle,config.filamentDiameter,config.printFlow);
 w.travelZ(layerHeight+config.zOffset);w.pressure(0);w.move(startX,startY+count*spacing,'Prime line start');w.speed(slow);w.extrude(startX,startY,wideE*count*spacing*1.2,'Prime line',lineWidth,layerHeight);
 for(let i=0;i<count;i++){const y=startY+i*spacing;w.pressure(plan.request.start+i*plan.request.step);w.move(startX,y,`PA line ${i+1}`);w.speed(slow);w.extrude(startX+shortLength,y,wideE*shortLength,'Slow start',lineWidth,layerHeight);w.speed(fast);w.extrude(startX+shortLength+longLength,y,wideE*longLength,'Fast middle',lineWidth,layerHeight);w.speed(slow);w.extrude(startX+2*shortLength+longLength,y,wideE*shortLength,'Slow end',lineWidth,layerHeight);if(i===0){w.pressure(0);w.extrude(startX+2*shortLength+longLength,startY+count*spacing,wideE*count*spacing*1.2,'Anchor line',lineWidth,layerHeight);}}
 w.pressure(0);if(plan.request.printNumbers){const boxX=startX+2*shortLength+longLength+lineWidth;drawPABox(w,boxX,startY-spacing,24,(count+1)*spacing,{perimeters:2,height:layerHeight,width:lineWidth,speed:fast,filled:true});w.travelZ(layerHeight*2+config.zOffset);for(let i=0;i<count;i+=2)drawPANumber(w,boxX+3+lineWidth,startY+i*spacing+spacing/2,plan.request.start+i*plan.request.step,config.nozzle,numberE,3600);}
 for(const event of w.events)if(event.type==='extrude')for(const point of[event.from,[event.x,event.y,event.z]])if(point[0]-(event.width||0)/2<p.bed.min[0]||point[1]-(event.width||0)/2<p.bed.min[1]||point[0]+(event.width||0)/2>p.bed.max[0]||point[1]+(event.width||0)/2>p.bed.max[1]||point[2]<0||point[2]>p.bed.max[2])throw new Error('The generated native PA lines or labels extend outside the printer bed');
 return{events:w.events,material:w.material,lastPosition:w.position,extrusionCoordinate:w.e,retracted:w.retracted};
}
