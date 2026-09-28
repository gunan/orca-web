import {normalizeNativeProfileValues} from '../shared/profile-settings.js';
import {normalizeNativeCompatibility,nativeCompatibilityFromConfig} from '../shared/preset-compatibility.js';
import {nativeConfigurationScope} from './native-config.js';
const types=new Set(['machine','process','filament']),plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const bytes=value=>Buffer.byteLength(value),identity={machine:'printer_settings_id',process:'print_settings_id',filament:'filament_settings_id'};
function text(value,label,{empty=false,max=1000}={}){if(typeof value!=='string'||(!empty&&!value)||bytes(value)>max||value.includes('\0'))throw new Error(`Invalid native preset ${label}`);return value;}
/** Same typed/security boundary as existing native JSON import. Dependency and
 * inheritance metadata are independent of ordinary editable setting values. */
export function normalizeUserPresetValues(type,values){
 if(!types.has(type)||!plain(values))throw new Error('Invalid native user preset settings');
 const result={},ordinary={},dependencies={};
 for(const[key,value]of Object.entries(values)){
  if(['name','version','from','instantiation','inherits','setting_id'].includes(key)){result[key]=text(value,key,{empty:true});continue;}
  if(key==='type'){if(value!==type)throw new Error('Native user preset scope does not match');result.type=type;continue;}
  if(key==='filament_id'){if(type!=='filament')throw new Error('Filament identity is only valid for filament presets');result[key]=text(value,key,{empty:true});continue;}
  if(key===identity[type]){if(type==='filament'){if(!Array.isArray(value)||value.length>1024)throw new Error('Invalid native material identities');result[key]=value.map(item=>text(item,key,{empty:true}));}else result[key]=text(value,key,{empty:true});continue;}
  if(key.startsWith('compatible_')){dependencies[key]=value;continue;}
  ordinary[key]=value;
 }
 return{...normalizeNativeProfileValues(type,ordinary),...result,...normalizeNativeCompatibility(type,dependencies,{partial:true})};
}
/** Private server projection; no client paths or arbitrary worker requests. The
 * caller resolves the parent ID through its trusted catalog before supplying it. */
export async function projectNativeUserPreset({type,mode,name,settings,document,parent,filamentId},{nativeConfig,signal}={}){
 if(!types.has(type)||!['save','load','reload'].includes(mode)||!nativeConfig?.run)throw new Error('Invalid native user preset projection');
 text(name,'name');if(mode==='reload'&&!parent)throw new Error('Native preset reload requires its parent');
 const input={operation:'user-preset-projection',scope:type,mode,name};
 if(parent){if(!plain(parent)||Object.keys(parent).some(key=>!['name','settings'].includes(key)))throw new Error('Invalid native parent preset');text(parent.name,'parent name');if(parent.name===name)throw new Error('A preset cannot inherit itself');input.parent={name:parent.name,settings:normalizeUserPresetValues(type,parent.settings)};}
 if(filamentId!==undefined){if(type!=='filament')throw new Error('Filament identity is only valid for filament presets');input.filamentId=text(filamentId,'filament ID',{empty:true});}
 if(mode==='save'){input.settings=normalizeUserPresetValues(type,settings);}
 else{input.document={version:'2.4.2',...normalizeUserPresetValues(type,document)};if((input.document.inherits||'')!==(parent?.name||''))throw new Error('Native user preset parent does not match resolved inheritance');}
 const response=await nativeConfig.run(input,{signal});if(response?.userPresetVersion!==1)throw Object.assign(new Error('Rebuild the pinned native configuration helper for native user preset inheritance.'),{status:503});const result=response.userPreset;if(!plain(result)||!plain(result.settings))throw new Error('Invalid native user preset result');
 const full={...nativeConfigurationScope(type,result.settings,name),...nativeCompatibilityFromConfig(type,result.settings),inherits:result.settings.inherits||'',from:'user',version:text(result.version||'2.4.2','version'),...(type==='filament'&&result.filamentId?{filament_id:text(result.filamentId,'filament ID')}:{} )};
 return{nativeFullSettings:full,...(mode==='save'?{nativeDocument:{...normalizeUserPresetValues(type,Object.fromEntries(Object.entries(result.document).filter(([key])=>!['bbl_use_printhost','bed_custom_model','bed_custom_texture'].includes(key)&&!/^(?:print_host$|printhost_|flashforge_serial_number$|printer_agent|host_type$|printer_access_code$|access_code$|api_key$|auth_token$|password$|secret$|token$)/.test(key)))),type}}:{})};
}

/** Resolve a trusted bundled source through the original system-preset sequence,
 * independently of selected project materials or compatibility expressions. */
export async function resolveNativeUserPresetBase({type,source},{nativeConfig,signal}={}){
 if(!types.has(type)||!plain(source)||!Array.isArray(source.chain)||!source.chain.length||source.chain.length>64)throw new Error('Invalid trusted native parent source');
 text(source.name,'parent name');
 // Do not reshape trusted system fields through the web schema. Original
 // load_from_json intentionally reads the first scalar token in some legacy
 // arrays, while native variant vectors must retain every alternative.
 const chain=structuredClone(source.chain);
 const input={operation:'user-preset-projection',scope:type,mode:'system',name:source.name,source:{name:source.name,chain,vendor:source.vendor||'',...(source.vendors?{vendors:source.vendors}:{} )}};
 const response=await nativeConfig.run(input,{signal});if(response?.userPresetVersion!==1)throw Object.assign(new Error('Rebuild the pinned native configuration helper for native user preset inheritance.'),{status:503});
 const result=response.userPreset;if(!plain(result)||!plain(result.settings))throw new Error('Invalid native parent settings');
 return {...nativeConfigurationScope(type,result.settings,source.name),...nativeCompatibilityFromConfig(type,result.settings),version:result.version||'2.4.2',...(type==='filament'&&result.filamentId?{filament_id:text(result.filamentId,'filament ID')}:{} )};
}
