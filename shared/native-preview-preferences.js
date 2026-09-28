import{nativeDefaultOptions}from'./native-preview-range.js';
import{nativeUsedFilaments}from'./native-filament-preview.js';
export const nativePreviewViewNames=Object.freeze(['feature','color','summary','tool','height','width','speed','actualSpeed','flow','actualFlow','fanSpeed','temperature','pressureAdvance','acceleration','jerk','layerTime','layerTimeLog']);
export function createNativePreviewPreferences(){return{category:0,mode:'feature',hiddenFeatures:[],options:{...nativeDefaultOptions},topLayerOnly:true,showCode:false};}
/** GCodeViewer::load remembers a single-vs-multiple category, not exact count.
 * The object lives with the application viewer; it is not an OS-wide preference. */
export function nativePreviewPreferencesForData(previous,data){const current={...createNativePreviewPreferences(),...previous},category=nativeUsedFilaments(data).length>1?2:1;let mode=category!==current.category?(category===2?'color':'feature'):current.mode;if(!nativePreviewViewNames.includes(mode))mode='feature';if(mode==='summary'&&data.materialStatisticsVersion!==1)mode='feature';if(['speed','actualSpeed','fanSpeed','temperature','pressureAdvance','acceleration','jerk'].includes(mode)&&data.scalarRangesVersion!==1)mode='feature';return{...current,category,mode,hiddenFeatures:[...current.hiddenFeatures],options:{...current.options}};}
