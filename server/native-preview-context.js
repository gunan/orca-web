import{normalizeNativePreviewContext}from'../shared/native-preview-context.js';
/** Resolved native configuration already supplies engine defaults; never invent
 * them here or read mutable native user/account state for an existing job. */
export function snapshotNativePreviewContext(settings,{events=[]}={}){
 const values=key=>Array.isArray(settings?.[key])?settings[key]:undefined;
 return normalizeNativePreviewContext({version:1,source:'native-editor-job',filamentColors:values('filament_colour'),filamentDiameters:values('filament_diameter')?.map(Number),filamentDensities:values('filament_density')?.map(Number),filamentCosts:values('filament_cost')?.map(Number),timeCost:Number(settings?.time_cost),customEvents:events.map(event=>({type:['ColorChange','PausePrint','ToolChange','Template','Custom','Unknown'].indexOf(event.type),z:event.printZ,extruder:event.extruder,color:event.type==='ColorChange'?(event.color||''):''}))});
}
/** Preview's bounded helper must not make an otherwise valid slice fail. Keep
 * the absence explicit, rather than manufacturing replacement editor values. */
export function captureNativePreviewContext(settings,options){try{return{nativePreviewContext:snapshotNativePreviewContext(settings,options)};}catch(error){return{nativePreviewContextUnavailable:`Native editor Preview snapshot is unavailable: ${error.message}`};}}
