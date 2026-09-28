/** Explicit user measurements become native filament settings. The server must
 * call this with its cached, source-bound plan, never a client-supplied plan. */
export const MEASURED_CALIBRATION_MODES = Object.freeze(['temperature','pressure-advance','pressure-advance-line','pressure-advance-pattern','retraction','max-volumetric-speed']);
const definitions = Object.freeze({
 temperature:{label:'Nozzle temperature',unit:'°C',min:155,max:500,integer:true,keys:['nozzle_temperature','nozzle_temperature_initial_layer'],description:'Sets both normal and first-layer nozzle temperature to your entered value.'},
 'pressure-advance':{label:'Pressure advance',unit:'',min:0,max:2,keys:['enable_pressure_advance','pressure_advance','adaptive_pressure_advance'],description:'Enables fixed filament pressure advance, disables adaptive pressure advance and sets your entered value.'},
 retraction:{label:'Retraction length',unit:'mm',min:0,max:20,keys:['filament_retraction_length'],description:'Sets the filament override for retraction length. Other retraction settings are retained.'},
 'max-volumetric-speed':{label:'Maximum volumetric speed',unit:'mm³/s',min:Number.MIN_VALUE,max:200,keys:['filament_max_volumetric_speed'],description:'Sets the filament maximum volumetric speed. Enter the usable limit you chose after examining the print; no safety margin is inferred.'}
});
export function calibrationResultDefinition(plan){
 const request=plan?.request,definition=definitions[['pressure-advance-line','pressure-advance-pattern'].includes(request?.mode)?'pressure-advance':request?.mode];if(!definition)return null;
 const start=Number(request.start),end=Number(request.end);if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('The generated calibration range is invalid');
 return{...definition,mode:request.mode,min:Math.max(definition.min,Math.min(start,end)),max:Math.min(definition.max,plan.paLine?.actualEnd??plan.patternActualEnd??Math.max(start,end))};
}
export function measuredCalibrationResult(plan,input){
 const definition=calibrationResultDefinition(plan);if(!definition)throw new Error('Measured-result saving is unavailable for this calibration mode');
 if(!['number','string'].includes(typeof input)||(typeof input==='string'&&!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim())))throw new Error('Enter a finite measured calibration value');
 const value=Number(input);if(!Number.isFinite(value)||value<definition.min||value>definition.max||(definition.integer&&!Number.isInteger(value)))throw new Error(`Enter ${definition.integer?'a whole-number':'a finite'} ${definition.label.toLowerCase()} from ${definition.min} through ${definition.max}${definition.unit?' '+definition.unit:''}`);
 const text=String(Object.is(value,-0)?0:value),settings=['pressure-advance','pressure-advance-line','pressure-advance-pattern'].includes(definition.mode)?{enable_pressure_advance:['1'],pressure_advance:[text],adaptive_pressure_advance:['0']}:Object.fromEntries(definition.keys.map(key=>[key,[text]]));
 return{settings,result:{mode:definition.mode,label:definition.label,value:Number(text),unit:definition.unit,settings:structuredClone(settings),source:structuredClone(plan.source),measuredBy:'user-entry'}};
}
