const fields={process:['compatible_printers','compatible_printers_condition'],filament:['compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition'],machine:[]};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const allFields=new Set(Object.values(fields).flat());
const bytes=value=>new TextEncoder().encode(value).length;
/** Native dependency metadata is separate from editable print settings. Empty
 * lists are meaningful: only then does Orca evaluate the retained condition. */
export function normalizeNativeCompatibility(type,value={}, {partial=false}={}){
 if(!Object.hasOwn(fields,type)||!plain(value))throw new Error('Invalid native compatibility object');
 const allowed=new Set(fields[type]),result={};
 for(const[key,input]of Object.entries(value)){
  if(!allFields.has(key)||!allowed.has(key))throw new Error(`Unsupported ${type} compatibility field: ${key}`);
  if(key.endsWith('_condition')){
   if(typeof input!=='string'||bytes(input)>16384||input.includes('\0'))throw new Error(`${key} must be a string of at most 16 KiB`);
   result[key]=input;
  }else{
   if(!Array.isArray(input)||input.length>10000||input.some(name=>typeof name!=='string'||bytes(name)>1000||name.includes('\0')))throw new Error(`${key} must contain at most 10,000 bounded native preset names`);
   result[key]=[...input];
  }
 }
 if(!partial)for(const key of fields[type])if(!Object.hasOwn(result,key))result[key]=key.endsWith('_condition')?'':[];
 return result;
}
export function nativeCompatibilityFromConfig(type,config={}){
 if(!Object.hasOwn(fields,type))throw new Error('Unknown native preset scope');
 return normalizeNativeCompatibility(type,Object.fromEntries(fields[type].filter(key=>Object.hasOwn(config,key)).map(key=>[key,config[key]])));
}
export function mergeNativeCompatibility(type,...sources){
 const result={};for(const source of sources)Object.assign(result,normalizeNativeCompatibility(type,source??{},{partial:true}));return normalizeNativeCompatibility(type,result);
}
/** Tab.cpp:7040–7112 Set-dialog semantics: all checked or none checked becomes
 * an empty native list. Applying Set is an explicit dependency edit. */
export function nativeDependencySelection(availableNames,selectedNames){
 if(!Array.isArray(availableNames)||!Array.isArray(selectedNames))throw new Error('Invalid dependency selection');
 const selected=new Set(selectedNames),result=availableNames.filter(name=>selected.has(name));
 return result.length===availableNames.length?[]:result;
}

// PresetBundle::full_fff_config records process then material printer conditions,
// and one process condition per material. load_config_file_config resizes older
// group arrays, so retain bounded short arrays instead of padding their contents.
export const nativeExpressionGroupKeys=new Set(['compatible_machine_expression_group','compatible_process_expression_group']);
export function normalizeNativeExpressionGroups(config){
 const result={};for(const key of nativeExpressionGroupKeys){if(!Object.hasOwn(config,key))continue;const value=config[key];if(!Array.isArray(value)||value.length>66||value.some(item=>typeof item!=='string'||bytes(item)>16384||item.includes('\0')))throw new Error(`Invalid bounded native expression group: ${key}`);result[key]=[...value];}return result;
}
