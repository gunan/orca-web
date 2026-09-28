import{updateBrimEars}from'../../shared/brim-ears.js';import{meshBounds}from'../../shared/geometry.js';
import{readFile,writeFile}from'node:fs/promises';import{importNative3MF}from'../../shared/native-project.js';import{createNativeProjectService}from'../../server/native-projects.js';import{fixtureCatalog}from'./native-project-catalog.js';import{addFilamentSlot}from'../../shared/filament-slots.js';
export async function shrinkageCase(kind){
const initial=importNative3MF(await readFile(new URL('./native-gui-shrink98-2.4.2.3mf',import.meta.url)));initial.useEmbeddedSettings=true;
let p=structuredClone(initial);p.name=`Shrinkage ${kind}`;if(['unused-slot','mixed-xy','paint-same','range-same','support-slot'].includes(kind))p=addFilamentSlot(p);Object.assign(p.nativeSettings,{filament_shrink:p.nativeSettings.filament_settings_id.map(()=>kind==='z-only'?'100':'98'),filament_shrinkage_compensation_z:p.nativeSettings.filament_settings_id.map(()=>kind==='xy-only'?'100':'98')});
 if(kind==='unused-slot'||kind==='mixed-xy')p.nativeSettings.filament_shrink[1]='97';
 if(kind==='paint-same'||kind==='mixed-xy')p.objects[0].painting={version:1,color:{4:'8'}};
 if(kind==='range-same')p.objects[0].native.layerConfigRanges=[{minZ:4,maxZ:8,settings:{layer_height:'.2',extruder:'2'}}];
 if(kind==='brim'){const bounds=meshBounds(p.objects[0]);p.objects=updateBrimEars(p.objects,p.objects[0].id,[{position:[bounds.min[0],bounds.min[1],0],radius:5},{position:[bounds.max[0],bounds.max[1],0],radius:4}]);p.nativeSettings.brim_type='painted';}
 if(kind==='support-slot')Object.assign(p.nativeSettings,{enable_support:'1',support_filament:'2',support_interface_filament:'1',support_type:'normal(auto)'});
 return await createNativeProjectService({catalog:fixtureCatalog(p)}).prepare({project:p,useEmbeddedSettings:true});
}
