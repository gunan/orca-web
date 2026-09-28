import {displayedSettings} from './settings.js';
import {displayedProfileSettings} from './profile-settings.js';
import {PAWriter,paExtrusionPerMM,paNumber,drawPABox,drawPANumber} from './pa-calibration-primitives.js';
import {paStartTemplate} from './pa-line-calibration.js';
export const PA_PATTERN_MODE={id:'pressure-advance-pattern',label:'Pressure advance pattern',supported:true,defaults:{start:0,end:.08,step:.005,speeds:[],accelerations:[]},unit:''};
const first=v=>Array.isArray(v)?v[0]:v,truth=v=>v===true||v==='1';
const num=(v,label)=>{if(v===null||v===''||!['number','string'].includes(typeof v)||!Number.isFinite(Number(v)))throw new Error(`${label} must be a finite number`);return Number(v);};
const abs=(v,base,label)=>typeof v==='string'&&v.endsWith('%')?num(v.slice(0,-1),label)*base/100:num(v,label);
const sin=Math.sin(Math.PI/4),cos=Math.cos(Math.PI/4),rounded=1-Math.PI/4;
const array=(v,label,max)=>{if(!Array.isArray(v)||v.length>4)throw new Error(`${label} must contain at most four values`);const values=v.map(x=>num(x,label));if(new Set(values).size!==values.length||values.some(x=>x<=0||x>max))throw new Error(`${label} require unique positive values through ${max}`);return values;};
function setupDimensions(p,request){
 const count=Math.ceil((request.end-request.start)/request.step+1),lineWidth=p.config.nozzle*1.125,firstWidth=p.config.nozzle*1.4,spacing=lineWidth-p.layerHeight*rounded,firstSpacing=firstWidth-p.firstHeight*rounded,angledSpacing=spacing/sin;
 let numberLength=paNumber(p.acceleration,0).length;for(let i=0;i<count;i+=2)numberLength=Math.max(numberLength,paNumber(request.start+i*request.step,0).length);numberLength=Math.min(numberLength,5);
 const numberingHeight=numberLength*2+(numberLength-1),shift=2*firstSpacing+firstWidth+1,frameHeight=2*sin*30,printWidth=count*2*angledSpacing+(count-1)*(2+lineWidth)+cos*30+firstSpacing*3+shift,printHeight=frameHeight+numberingHeight+2+firstWidth;
 const area=Math.fround(Math.fround(p.layerHeight)*(Math.fround(lineWidth)-Math.fround(p.layerHeight)*rounded)),flow=p.speed*area*p.config.filamentFlow;
 for(const value of [...Array.from({length:Math.ceil(count/2)},(_,i)=>request.start+i*2*request.step),flow,p.acceleration]){const text=paNumber(value,numberLength);if(text.length>numberLength||!/^\d+(?:\.\d+)?$/.test(text))throw new Error('Native PA pattern labels cannot represent this range, flow or acceleration');}
 return{...p,count,lineWidth,firstWidth,spacing,firstSpacing,angledSpacing,numberLength,numberingHeight,shift,frameHeight,printWidth,printHeight,flow};
}
export function createPAPatternPlan(input,selection,nozzle){
 if(Object.keys(input).some(key=>!['mode','start','end','step','speeds','accelerations'].includes(key)))throw new Error('Unknown PA pattern parameter');
 const params={mode:'pressure-advance-pattern',start:num(input.start??0,'Start PA'),end:num(input.end??.08,'End PA'),step:num(input.step??.005,'PA step'),speeds:array(input.speeds??[],'Pattern speeds',1000),accelerations:array(input.accelerations??[],'Pattern accelerations',100000)};
 if(params.start<0||params.end>2||params.step<.001||params.end<params.start+params.step)throw new Error('PA pattern requires 0 ≤ Start < End ≤ 2 and Step ≥ 0.001');
 const printer=displayedProfileSettings('machine',selection.printer),process=displayedSettings(selection.process,{includeDefaults:true}),filament=displayedProfileSettings('filament',selection.filament),points=selection.printer.printable_area?.map(s=>String(s).split('x').map(Number));
 if(!points||points.length!==4||points.some(p=>p.length!==2||!p.every(Number.isFinite)))throw new Error('PA patterns require a rectangular bed');
 const bed={min:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),0],max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])),num(printer.printable_height,'Printable height')]};
 if(points.some(([x,y])=>![bed.min[0],bed.max[0]].includes(x)||![bed.min[1],bed.max[1]].includes(y))||bed.max[0]-bed.min[0]<=50||bed.max[1]-bed.min[1]<=50)throw new Error('PA patterns require a rectangular bed wider than 50 mm');
 if(String(selection.printer.printer_model||'').startsWith('Bambu')||String(selection.printer.printer_structure||'').toLowerCase()==='bambu')throw new Error('PA patterns do not yet support Bambu-specific calibration sequences');
 if(truth(printer.use_firmware_retraction))throw new Error('PA patterns currently require explicit extrusion retraction');
 const firstHeight=abs(process.initial_layer_print_height,nozzle,'Initial layer height'),layerHeight=abs(process.layer_height,nozzle,'Layer height'),height=firstHeight+3*layerHeight;
 if(firstHeight<=0||layerHeight<=0||firstHeight>=nozzle*1.125||layerHeight>=nozzle*1.125||height>bed.max[2])throw new Error('PA pattern layer heights must fit the native extrusion width and printer height');
 const effective=key=>first(filament[`filament_${key}`])??first(printer[key]),travelSpeed=abs(process.initial_layer_travel_speed,num(process.travel_speed,'Travel speed'),'Initial travel speed');
 const config={nozzle,layerHeight,relative:truth(printer.use_relative_e_distances),flavor:printer.gcode_flavor,isBambu:false,filamentDiameter:num(first(filament.filament_diameter),'Filament diameter'),filamentFlow:num(first(filament.filament_flow_ratio),'Filament flow ratio'),retractionLength:num(effective('retraction_length'),'Retraction length'),restartExtra:num(effective('retract_restart_extra'),'Extra restart length'),retractionSpeed:num(effective('retraction_speed'),'Retraction speed'),deretractionSpeed:num(effective('deretraction_speed'),'Deretraction speed'),travelSpeed,travelZSpeed:num(selection.process.travel_speed_z??0,'Z travel speed')||travelSpeed,zOffset:num(printer.z_offset,'Z offset')};
 if(config.deretractionSpeed===0)config.deretractionSpeed=config.retractionSpeed;if(config.retractionLength<0||config.restartExtra!==0||config.retractionSpeed<=0||config.deretractionSpeed<=0||config.filamentDiameter<=0||config.filamentFlow<=0||travelSpeed<=0)throw new Error('PA patterns require positive extrusion/travel settings and zero extra restart length');
 const zHop=num(first(printer.z_hop),'Z hop'),nativeAccel=num(process.outer_wall_acceleration,'Outer acceleration')||num(process.inner_wall_acceleration,'Inner acceleration')||num(process.default_acceleration,'Default acceleration');
 const w=Math.fround(nozzle*1.125),h=Math.fround(layerHeight),area=Math.fround(h*(w-h*rounded)),nativeSpeed=Math.floor(Math.min(Math.max(100,num(process.outer_wall_speed,'Outer speed')),num(first(filament.filament_max_volumetric_speed),'Volumetric limit')/area));
 const speeds=params.speeds.length?params.speeds:[nativeSpeed],accelerations=params.accelerations.length?params.accelerations:[nativeAccel];if(speeds.some(v=>v<=0)||accelerations.some(v=>v<=0))throw new Error('Native PA pattern speed and acceleration must be positive');
 const useLimits=['marlin','marlin2','klipper','reprapfirmware'].includes(config.flavor);config.maxAcceleration=useLimits?Math.round(num(first(printer.machine_max_acceleration_extruding),'Maximum print acceleration')):0;if(config.flavor==='klipper')for(const key of['machine_max_acceleration_x','machine_max_acceleration_y']){const limit=Math.round(num(first(printer[key]),key));if(limit>0)config.maxAcceleration=Math.min(config.maxAcceleration,limit);}
 config.accelToDecel=truth(process.accel_to_decel_enable);config.accelToDecelFactor=abs(process.accel_to_decel_factor,100,'Acceleration to deceleration factor');
 const patterns=[];for(const acceleration of accelerations)for(const speed of speeds)patterns.push(setupDimensions({config,firstHeight,layerHeight,height,speed,acceleration,zHop},params));
 const maxWidth=Math.max(...patterns.map(p=>p.printWidth)),maxHeight=Math.max(...patterns.map(p=>p.printHeight));
 // Native Plater arranges the full pattern footprint and creates each missing
 // bed_idx. This bounded rectangular grid preserves that per-plate lifecycle;
 // it deliberately does not claim native polygon nesting equivalence.
 const columns=Math.floor((bed.max[0]-bed.min[0]-4)/(maxWidth+4)),rowsPerPlate=Math.floor((bed.max[1]-bed.min[1]-4)/(maxHeight+4));
 if(columns<1||rowsPerPlate<1)throw new Error('A complete PA pattern does not fit this plate; reduce the PA range or use a larger rectangular bed');
 const capacity=columns*rowsPerPlate,plates=[];
 for(let offset=0;offset<patterns.length;offset+=capacity){
  const count=Math.min(capacity,patterns.length-offset),plateIndex=plates.length,plateId=`plate-${plateIndex+1}`,usedCols=Math.min(columns,count),rows=Math.ceil(count/usedCols),originX=(bed.min[0]+bed.max[0]-usedCols*(maxWidth+4))/2,originY=(bed.min[1]+bed.max[1]-rows*(maxHeight+4))/2;
  plates.push({id:plateId,name:`Plate ${plateIndex+1}`,patternCount:count});
  for(let local=0;local<count;local++){const p=patterns[offset+local],centerX=originX+(local%usedCols+.5)*(maxWidth+4),centerY=originY+(Math.floor(local/usedCols)+.5)*(maxHeight+4);p.plateId=plateId;p.plateIndex=plateIndex;p.startX=centerX-p.printWidth/2;p.startY=centerY-p.numberingHeight/2-1-sin*30;p.handle={x:p.startX+1.2,y:p.startY+sin*30-2.5,size:5,height};}
 }
 const processOverrides={overhang_reverse:'0',precise_z_height:'0',outer_wall_acceleration:String(Math.max(...accelerations)),outer_wall_speed:String(Math.max(...speeds)),print_sequence:'by layer',initial_layer_speed:'30',line_width:String(nozzle*1.125),initial_layer_line_width:String(nozzle*1.4),wall_loops:'3',skirt_loops:'0',brim_type:'no_brim',enable_wrapping_detection:'0',gcode_comments:'1'};
 const hasJD=config.flavor==='marlin2'&&num(first(printer.machine_max_junction_deviation),'Junction deviation')>0;
 if(hasJD)processOverrides.default_junction_deviation='0';else if(num(process.default_jerk,'Default jerk')>0){const jerk=num(process.outer_wall_jerk,'Outer jerk')||num(process.inner_wall_jerk,'Inner jerk')||num(process.default_jerk,'Default jerk');for(const key of['default_jerk','outer_wall_jerk','inner_wall_jerk','top_surface_jerk','infill_jerk','travel_jerk'])processOverrides[key]=String(jerk);}
 const filamentCode=[selection.filament.filament_start_gcode,selection.filament.filament_end_gcode].flat().filter(Boolean).join('\n');if(/\bfirst_layer_print_(?:min|max|size|convex_hull)\b|\bscan_first_layer\b/.test(filamentCode))throw new Error('PA patterns do not yet support bed-context filament start/end templates');
 const actualEnd=params.start+(patterns[0].count-1)*params.step;if(actualEnd>2)throw new Error('The last native pattern PA exceeds the supported value 2');
 const result={params,patterns,plates,bed,actualEnd,model:{resource:'pressure_advance/generated-pattern-handle',minZ:0,maxZ:height,scale:1},process:processOverrides,printer:{resonance_avoidance:'0',wipe:['0'],retract_when_changing_layer:['0'],machine_start_gcode:paStartTemplate(selection.printer.machine_start_gcode,bed)},filament:{filament_wipe:['0'],filament_retract_when_changing_layer:['0'],enable_pressure_advance:['0'],adaptive_pressure_advance:['0']},limitations:['Generates native four-layer PA patterns around 5 mm handle cubes, with frame, labels and source-defined custom layer commands.','Up to four speeds × four accelerations are placed on additional rectangular plates as needed. Placement uses a bounded grid; native polygon nesting is not reproduced.','One extruder, explicit extrusion retraction and zero extra restart length are supported. Native GUI export comparison and physical results remain unverified.']};
 const bounds=[];
 for(const pattern of patterns){const generated=generatePAPatternEvents({request:params,pattern}),b={plateId:pattern.plateId,min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
  for(const e of generated.events)if(e.type==='extrude')for(const point of[e.from,[e.x,e.y,e.z]]){for(let axis=0;axis<2;axis++){b.min[axis]=Math.min(b.min[axis],point[axis]-e.width/2);b.max[axis]=Math.max(b.max[axis],point[axis]+e.width/2);}if(point[2]<0||point[2]>bed.max[2])throw new Error('Generated PA pattern Z is outside the printer volume');}
  const h=pattern.handle;for(let axis=0;axis<2;axis++){b.min[axis]=Math.min(b.min[axis],axis?h.y:h.x);b.max[axis]=Math.max(b.max[axis],(axis?h.y:h.x)+h.size);if(b.min[axis]<bed.min[axis]+1||b.max[axis]>bed.max[axis]-1)throw new Error('The generated PA pattern or labels exceed the printer bed margin');}
  for(const other of bounds)if(b.plateId===other.plateId&&b.min[0]<other.max[0]&&b.max[0]>other.min[0]&&b.min[1]<other.max[1]&&b.max[1]>other.min[1])throw new Error('Generated PA pattern batch footprints overlap');bounds.push(b);pattern.bounds=b;
 }
 return result;
}

export function generatePAPatternEvents({request,pattern:p}){
 const w=new PAWriter(p.config),layers=[],{startX:x,startY:y}=p;let begin=0;
 const box={perimeters:3,height:p.firstHeight,width:p.firstWidth,speed:1800};
 w.move(x,y,'Move to start XY position');w.travelZ(p.firstHeight+p.config.zOffset,'Move to start Z position');w.pressure(request.start);
 drawPABox(w,x,y,p.printWidth,p.frameHeight,box);drawPABox(w,x,y+p.frameHeight+p.firstSpacing,p.printWidth,p.numberingHeight+p.firstSpacing+2,{...box,filled:true});
 for(let i=0;i<4;i++){
  const z=p.firstHeight+p.config.zOffset+i*p.layerHeight,hop=z+p.zHop;
  if(i){layers.push({printZ:p.firstHeight+(i-1)*p.layerHeight,events:w.events.slice(begin)});begin=w.events.length;w.travelZ(z,'Move to layer height');w.resetE();}
  if(i===1){w.pressure(request.start);const e=paExtrusionPerMM(p.lineWidth,p.layerHeight,p.config.nozzle,p.config.filamentDiameter,p.config.filamentFlow),glyphX=index=>x+p.shift+index*2*p.angledSpacing+index*p.lineWidth+index*2+3*p.angledSpacing/2-(p.lineWidth+4)/2;for(let j=0;j<p.count;j+=2)drawPANumber(w,glyphX(j),y+p.frameHeight+1+p.lineWidth,request.start+j*request.step,p.lineWidth,e,30,{bottomToTop:true,maxLength:p.numberLength});drawPANumber(w,glyphX(p.count+2),y+p.frameHeight+1+p.lineWidth,p.flow,p.lineWidth,e,30,{bottomToTop:true,maxLength:p.numberLength});drawPANumber(w,glyphX(p.count+4),y+p.frameHeight+1+p.lineWidth,p.acceleration,p.lineWidth,e,30,{bottomToTop:true,maxLength:p.numberLength});}
  let tx=x+p.shift,ty=y,side=30;
  if(!i){const shrink=(p.firstSpacing*2+p.firstWidth*(1-1/3))/sin;side-=shrink;tx+=shrink*cos;ty+=p.firstSpacing*2+p.firstWidth*(1-1/3);}
  else{w.acceleration(Math.max(1,Math.trunc(p.acceleration-1)));w.move(x,y,'Move to starting point',hop,z);w.line(x,y+p.frameHeight,p.lineWidth,p.layerHeight,Math.trunc(Math.max(1,p.speed-1))*60,'Accel/flow trick line');w.acceleration(Math.trunc(p.acceleration));}
  const initialX=tx,initialY=ty;w.move(tx,ty,'Move to pattern start',hop,z);
  for(let j=0;j<p.count;j++){w.pressure(request.start+j*request.step);for(let k=0;k<3;k++){tx+=cos*side;ty+=sin*side;w.line(tx,ty,p.lineWidth,i?p.layerHeight:p.firstHeight,(i?Math.trunc(p.speed):30)*60,'Print pattern wall');tx-=cos*side;ty+=sin*side;w.line(tx,ty,p.lineWidth,i?p.layerHeight:p.firstHeight,(i?Math.trunc(p.speed):30)*60,'Print pattern wall');ty=initialY;if(k!==2){tx+=p.angledSpacing;w.move(tx,ty,'Move to start next pattern wall',hop,z);}else if(j!==p.count-1){tx+=2+p.lineWidth;w.move(tx,ty,'Move to next pattern',hop,z);}else if(i!==3){tx=initialX;w.move(tx,ty,'Move back to start position',hop,z);w.resetE();}}}
 }
 w.pressure(request.start);layers.push({printZ:p.height,events:w.events.slice(begin)});return{events:w.events,layers,material:w.material};
}

/** Select only this plate's source paths. The whole request stays bound to the
 * session; marker indices restart at zero as native merges the current plate. */
export function paPatternPlanForPlate(plan,plateId){
 const plate=plan.patternPlates?.find(item=>item.id===plateId),patterns=plan.paPatterns?.filter(pattern=>pattern.plateId===plateId);
 if(!plate||!patterns?.length)throw new Error('Select an existing generated PA pattern plate; regenerate after changing plates');
 return {...plan,paPatterns:patterns,patternPlateId:plateId,patternPlateName:plate.name};
}
