import { definitionsByScope } from './profile-settings.js';
const commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';
const definitions=new Map(Object.entries(definitionsByScope).flatMap(([scope,items])=>items.map(item=>[item.key,{...item,scope}])));
const scopeName={machine:'printer',process:'process',filament:'filament'};
const numericTypes=new Set(['coFloat','coPercent','coFloatOrPercent','coFloats','coPercents','coInt','coInts']);
const integerTypes=new Set(['coInt','coInts']);

/** Structural checks from FullPrintConfig::validate. Geometry, G-code and project
 * validation still belong to the native slicing engine; this never slices or sends. */
export function validateNativeConfiguration(input={}, {underCli=true,scalingFactor=0.000001}={}) {
 if(typeof underCli!=='boolean')throw new Error('underCli must be a boolean');
 if(![0.000001,0.00001].includes(scalingFactor))throw new Error('Unknown native coordinate scaling factor');
 const errors=[],seen=new Set();
 const raw=key=>{const definition=definitions.get(key);return input[scopeName[definition?.scope]]?.[key]??definition?.default;};
 const list=key=>{const value=raw(key);return Array.isArray(value)?value:[value];};
 const numberValue=value=>parseFloat(value&&typeof value==='object'?value.value:value);
 const num=key=>numberValue(list(key)[0]);
 const bool=key=>[true,1,'1'].includes(list(key)[0]);
 const str=key=>String(list(key)[0]);
 const fail=(key,message,line)=>{if(seen.has(key))return;seen.add(key);errors.push({scope:definitions.get(key)?.scope,key,message,source:{file:'PrintConfig.cpp',line,commit}});};
 const positive=(key,line)=>{if(!(num(key)>0))fail(key,'Must be greater than zero.',line);};
 positive('layer_height',10342);
 if(Math.abs(num('layer_height')%scalingFactor)>1e-4)fail('layer_height','Does not match native coordinate resolution.',10344);
 positive('initial_layer_print_height',10349);
 if(list('filament_diameter').some(value=>numberValue(value)<1))fail('filament_diameter','Native filament diameter must be at least 1 mm.',10355);
 if(list('nozzle_diameter').some(value=>numberValue(value)<0.005))fail('nozzle_diameter','Native nozzle diameter must be at least 0.005 mm.',10362);
 for(const [key,line]of [['wall_loops',10370],['top_shell_layers',10375],['bottom_shell_layers',10378],['skirt_height',10419]])if(num(key)<0)fail(key,'Must not be negative.',line);
 const flavor=str('gcode_flavor');
 if(bool('use_firmware_retraction')&&!['klipper','smoothie','reprap','reprapfirmware','marlin','marlin2','machinekit','repetier'].includes(flavor))fail('use_firmware_retraction','This firmware does not support native firmware retraction.',10382);
 if(bool('use_firmware_retraction')&&list('wipe').some(value=>[true,1,'1'].includes(value)))fail('use_firmware_retraction','Native firmware retraction is incompatible with wipe.',10393);
 for(const [key,line]of [['gcode_flavor',10399],['sparse_infill_pattern',10404],['top_surface_pattern',10409],['bottom_surface_pattern',10414],['internal_solid_infill_pattern',10419]])if(!definitions.get(key)?.options?.includes(str(key)))fail(key,'Invalid native option.',line);
 for(const [key,line]of [['bridge_flow',10429],['internal_bridge_flow',10434],['extruder_clearance_radius',10439],['extruder_clearance_height_to_rod',10442],['extruder_clearance_height_to_lid',10445],['nozzle_height',10448]])positive(key,line);
 if(list('filament_flow_ratio').some(value=>numberValue(value)<=0))fail('filament_flow_ratio','Native filament flow ratio must be greater than zero.',10452);
 if(underCli&&bool('spiral_mode')){
  if(num('wall_loops')!==1)fail('wall_loops','Native CLI spiral vase requires exactly one wall.',10462);
  for(const [key,line]of [['sparse_infill_density',10468],['top_shell_layers',10473],['enforce_support_layers',10483]])if(num(key)>0)fail(key,'Must be zero for native CLI spiral vase.',line);
  if(bool('enable_support'))fail('enable_support','Native CLI spiral vase cannot enable support.',10478);
 }
 const nozzles=list('nozzle_diameter').map(numberValue),maximum=Math.max(...nozzles),minimum=Math.min(...nozzles);
 for(const key of ['outer_wall_line_width','inner_wall_line_width','sparse_infill_line_width','internal_solid_infill_line_width','bridge_line_width','top_surface_line_width','support_line_width','initial_layer_line_width','skin_infill_line_width','skeleton_infill_line_width']){
  const value=list(key)[0],percent=value&&typeof value==='object'?value.percent:String(value).trim().endsWith('%');
  const absolute=numberValue(value)*(percent?maximum/100:1),allowed=key==='bridge_line_width'?minimum:5*maximum;
  if(absolute>allowed)fail(key,key==='bridge_line_width'?`Bridge line width must not exceed the smallest nozzle diameter (${minimum} mm).`:`Line width must not exceed five times the largest nozzle diameter (${allowed} mm).`,10510);
 }
 // Native numeric range checks are repeated for known profile members. Nullable
 // filament inheritance values are resolved before FullPrintConfig validation.
 for(const definition of definitions.values()){
  if(!numericTypes.has(definition.nativeType))continue;
  const values=list(definition.key);
  for(const value of values){
   if(value===null||value==='nil'||value===undefined)continue;
   const number=numberValue(value);
   if(!Number.isFinite(number)||number<definition.min||number>definition.max||(integerTypes.has(definition.nativeType)&&!Number.isInteger(number))){fail(definition.key,`Native value is outside the supported range [${definition.min}, ${definition.max}].`,10525);break;}
  }
 }
 return {valid:errors.length===0,errors,provenance:{version:'2.4.2',commit,file:'src/libslic3r/PrintConfig.cpp',line:10337},coverage:{implemented:['FullPrintConfig validate structural branches','CLI-specific spiral vase restrictions','Nozzle-dependent absolute and percentage line widths (native multiplier 5)','Numeric range checks for known profile members'],remaining:['Unknown/project-only settings and config migration before FullPrintConfig construction','Geometry, layer scheduling, G-code macro expansion, and native slicer project validation']}};
}
