// OrcaSlicer 2.4.2: bbs_3mf.cpp, ParameterUtils.cpp and GCode/ToolOrdering.cpp.
export const FILAMENT_SEQUENCE_PATH = 'Metadata/filament_sequence.json';
export const SEQUENCE_KEYS = ['first_layer_print_sequence','other_layers_print_sequence','other_layers_print_sequence_nums'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function integer(value,min,max,label) {
  if (!['number','string'].includes(typeof value) || (typeof value==='string'&&!/^[+-]?\d+$/.test(value.trim())) || !Number.isInteger(Number(value)) || Number(value)<min || Number(value)>max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return Number(value);
}
function vector(value,label,max=100000) {
  const values=typeof value==='string'?value.trim().split(/\s+/).filter(Boolean):value;
  if(!Array.isArray(values)||values.length>max)throw new Error(`${label} must be a bounded array`);
  return values;
}
function order(value,count,label) {
  const result=vector(value,label,64).map(item=>integer(item,1,count??64,label));
  if(!result.length||new Set(result).size!==result.length)throw new Error(`${label} must contain distinct filament slots`);
  if(count!==undefined&&result.length!==count)throw new Error(`${label} must include every filament slot once; unused slots are ignored by native slicing`);
  return result;
}
/** Layer indices are embedded in other_layers_print_sequence. The generic
 * schema's 0–16 bound is only applicable to its filament entries, not Z layers. */
export function decodePrintSequence(values={},filamentCount) {
  const first=vector(values.first_layer_print_sequence??[0],'First-layer sequence');
  const firstLayer=first.length===0||(first.length===1&&(first[0]===0||first[0]==='0'))?null:order(first,filamentCount,'First-layer sequence');
  const count=integer(values.other_layers_print_sequence_nums??0,0,1024,'Layer sequence count');
  const raw=vector(values.other_layers_print_sequence??[0],'Layer sequence');
  if(!count){if(raw.length>1||(raw.length&&(raw[0]!==0&&raw[0]!=='0')))throw new Error('Layer sequence data requires a positive range count');return{firstLayer,ranges:[]};}
  const width=raw.length/count;
  if(!Number.isInteger(width)||width<3||width>(filamentCount??64)+2)throw new Error('Layer sequence rows must have equal width and at least one filament');
  const ranges=[];
  for(let i=0;i<count;i++){
    const row=raw.slice(i*width,(i+1)*width),start=integer(row[0],2,1000000,'Layer start'),end=integer(row[1],start,1000000,'Layer end');
    ranges.push({start,end,order:order(row.slice(2),filamentCount,'Layer sequence')});
  }
  return{firstLayer,ranges};
}
export function encodePrintSequence(value,filamentCount) {
  if(!plain(value)||!Array.isArray(value.ranges)||value.ranges.length>1024)throw new Error('Filament print sequence needs a range list');
  if(value.ranges.some(range=>!plain(range)||!Array.isArray(range.order)||range.order.length!==value.ranges[0].order.length))throw new Error('Every layer sequence range must contain the same number of filament slots');
  const result={first_layer_print_sequence:value.firstLayer===null?['0']:order(value.firstLayer,filamentCount,'First-layer sequence').map(String),other_layers_print_sequence_nums:String(value.ranges.length),other_layers_print_sequence:value.ranges.length?value.ranges.flatMap(range=>[range.start,range.end,...range.order]).map(String):['0']};
  decodePrintSequence(result,filamentCount);return result;
}
export function normalizePrintSequenceSettings(value,filamentCount) {
  const defined=SEQUENCE_KEYS.filter(key=>Object.hasOwn(value,key));if(!defined.length)return{};
  const all=encodePrintSequence(decodePrintSequence(value,filamentCount),filamentCount);
  // Preserve absent first-layer overrides; paired range fields must travel together.
  return Object.fromEntries(Object.entries(all).filter(([key])=>defined.includes(key)||(key!=='first_layer_print_sequence'&&defined.some(item=>item!=='first_layer_print_sequence'))));
}
export function normalizeFilamentSequence(value,{filamentCount=64,nozzleCount=64}={}) {
  if(!plain(value))throw new Error('Native filament sequence must be an object');
  const sequence=vector(value.sequence??value.filament_sequence,'Native filament sequence',1000000).map(item=>integer(item,1,filamentCount,'Sequence filament'));
  const nozzle_sequence=vector(value.nozzle_sequence,'Native nozzle sequence',1000000).map(item=>integer(item,0,nozzleCount-1,'Sequence nozzle'));
  const optimal_assignment=vector(value.optimal_assignment??[],'Native optimal assignment',1000000).map(item=>integer(item,-1,2147483647,'Optimal assignment'));
  return{sequence,nozzle_sequence,optimal_assignment};
}
export function readFilamentSequences(text,plates,options={}) {
  if(typeof text!=='string'||text.length>32*1024*1024)throw new Error('Native filament sequence file is too large');
  const data=JSON.parse(text);if(!plain(data)||Object.keys(data).length>36)throw new Error('Invalid native filament sequence document');
  const byNumber=new Map(plates.map((plate,index)=>[plate.native?.number??index+1,plate]));
  for(const[key,value]of Object.entries(data)){
    if(!/^plate_[1-9]\d*$/.test(key))throw new Error('Invalid filament sequence plate key');
    const plate=byNumber.get(Number(key.slice(6)));if(!plate)throw new Error('Filament sequence references a missing plate');
    plate.native={...plate.native,filamentSequence:normalizeFilamentSequence(value,options)};
  }
}
export function writeFilamentSequences(plates,options={}) {
  const result={};plates.forEach((plate,index)=>{if(plate.native?.filamentSequence)result[`plate_${index+1}`]=normalizeFilamentSequence(plate.native.filamentSequence,options);});
  return Object.keys(result).length?JSON.stringify(result):null;
}
export function platePrintSequence(plate,settings={},filamentCount) {
  return decodePrintSequence({...settings,...plate.native?.metadata},filamentCount);
}
export function updatePlatePrintSequence(plate,value,filamentCount) {
  const normalized=encodePrintSequence(value,filamentCount),metadata={...plate.native?.metadata};
  for(const[key,item]of Object.entries(normalized))metadata[key]=Array.isArray(item)?item.join(' '):item;
  // Imported sliced output records no longer describe the edited ordering.
  const native={...plate.native,metadata};delete native.filamentSequence;return{...plate,native};
}
