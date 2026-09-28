import {normalizeObjectSettings} from '../shared/native-object-settings.js';
import {nativeConfigurationScope} from './native-config.js';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export async function pasteNativeProcessSettings(body,service,{signal}={}){
 if(!plain(body)||Object.keys(body).some(key=>!['clipboard','targets','globalSettings','filamentCount'].includes(key)))throw new Error('Invalid process clipboard request');
 const {clipboard,targets,globalSettings,filamentCount=64}=body;
 if(!Number.isInteger(filamentCount)||filamentCount<1||filamentCount>64)throw new Error('Invalid clipboard filament count');
 if(!plain(clipboard)||clipboard.version!==1||!['object','part'].includes(clipboard.kind)||Object.keys(clipboard).some(key=>!['version','kind','settings'].includes(key)))throw new Error('Invalid process settings clipboard');
 if(!Array.isArray(targets)||!targets.length||targets.length>256)throw new Error('Choose 1–256 settings destinations');
 if(!plain(globalSettings))throw new Error('Process settings need a bounded object');
 const normalized=targets.map(target=>{
  if(!plain(target)||target.kind!==clipboard.kind||Object.keys(target).some(key=>!['kind','settings','parentSettings'].includes(key)))throw new Error('Clipboard destination must match the copied settings scope');
  return{kind:target.kind,settings:normalizeObjectSettings(target.settings,filamentCount),parentSettings:normalizeObjectSettings(target.parentSettings||{},filamentCount)};
 });
 const global=nativeConfigurationScope('process',globalSettings,'Clipboard global process');
 const result=await service.run({operation:'paste-process-settings',clipboard:normalizeObjectSettings(clipboard.settings,filamentCount),targets:normalized,globalSettings:global},{signal});
 if(result.settingsClipboardVersion!==1||!Array.isArray(result.settings)||result.settings.length!==targets.length)throw Object.assign(new Error('Rebuild the native configuration helper to enable process settings Paste'),{status:503});
 return{settingsClipboardVersion:1,settings:result.settings.map(settings=>normalizeObjectSettings(settings,filamentCount)),sourceRevision:result.sourceRevision};
}
