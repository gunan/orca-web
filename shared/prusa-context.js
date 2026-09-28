import {resizeNativeFilamentVariants,nativeVariantSchema} from './native-variants.js';
import {resizePurgeSettings} from './purge-volumes.js';
import {definitionsByScope,projectSettingDefinitions} from './profile-settings.js';
import {NATIVE_IMPORTED_FILAMENT_COLORS} from './prusa-model.js';
const filamentKeys=new Set(definitionsByScope.filament.map(value=>value.key));
/** PresetBundle::set_num_filaments and update_multi_material_filament_presets.
 * The caller supplies normalized full settings. Existing slots and purge matrix
 * cells remain unchanged; newly required slots repeat the last material. */
export function extendPrusaFilaments(settings,required,{colorIndex=0}={}){
 const result=structuredClone(settings),original=result.filament_settings_id?.length;
 if(!Number.isInteger(original)||original<1||original>64||!Number.isInteger(required)||required<1||required>64||!Number.isInteger(colorIndex)||colorIndex<0)throw new Error('Invalid current Prusa material context');
 const count=Math.max(required,original,result.nozzle_diameter?.length||1);
 if(count===original)return result;

 const variantValues=resizeNativeFilamentVariants(settings,[...Array(original).keys(),...Array(count-original).fill(null)],{cloneSlot:original-1}),variantKeys=new Set(Object.keys(variantValues));
 const resize=(key,fill)=>{const values=result[key]||[];if(!Array.isArray(values)||values.length>count)throw new Error(`Invalid current material vector: ${key}`);while(values.length<count)values.push(fill===undefined?values.at(-1):fill);result[key]=values;};
 for(const key of filamentKeys)if(Array.isArray(result[key])&&!variantKeys.has(key)){if(!result[key].length)throw new Error(`Empty current material vector: ${key}`);resize(key);}
 resize('filament_settings_id');resize('filament_colour',projectSettingDefinitions.find(item=>item.key==='filament_colour').default[0]);resize('filament_colour_type','1');resize('filament_map','1');
 result.filament_multi_colour=[...result.filament_colour];
 for(let i=original;i<count;i++){const color=NATIVE_IMPORTED_FILAMENT_COLORS[(colorIndex+i-original)%NATIVE_IMPORTED_FILAMENT_COLORS.length];result.filament_colour[i]=color;result.filament_multi_colour[i]=color;result.filament_colour_type[i]='1';}
 Object.assign(result,resizePurgeSettings(settings,original,[...Array(original).keys(),...Array(count-original).fill(null)]));
 Object.assign(result,variantValues);
 return result;
}
