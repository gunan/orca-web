export const NATIVE_PREVIEW_SCHEMA=1;
export const NATIVE_PREVIEW_COMMIT='8500fcdccaa10b5099ac20d252af3a7c560046f1';
export const nativePreviewColumns=Object.freeze(['x','y','z','height','width','feedrate','actualFeedrate','mm3PerMm','fanSpeed','temperature','role','type','sourceLine','layerId','tool','colorId','timeNormal','timeStealth','pressureAdvance','acceleration','jerk','renderZ','renderHeight','renderWidth','turnAngle','renderBias','validLine']);
export const NATIVE_PREVIEW_LIMITS=Object.freeze({inputBytes:25000000,outputBytes:128*1024*1024,moves:250000,vertices:500000,layers:100000,sourceLines:1000000});
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const finite=(v,min=-1e9,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
/** Validate native worker output before retaining it or passing it to WebGL. */
export function validateNativePreview(value){
 const fail=message=>{throw new TypeError('Invalid native preview: '+message);};
 if(!value||typeof value!=='object'||value.engine?.sourceCommit!==NATIVE_PREVIEW_COMMIT||value.engine?.schemaVersion!==NATIVE_PREVIEW_SCHEMA||value.engine?.version!=='2.4.2')fail('worker identity');
 if(JSON.stringify(value.columns)!==JSON.stringify(nativePreviewColumns))fail('vertex columns');
 if(!Array.isArray(value.vertices)||value.vertices.length>NATIVE_PREVIEW_LIMITS.vertices||value.vertexCount!==value.vertices.length||!integer(value.processorMoveCount,0,NATIVE_PREVIEW_LIMITS.moves))fail('vertex/move count');
 if(!Array.isArray(value.layers)||value.layers.length>NATIVE_PREVIEW_LIMITS.layers)fail('layer count');
 const times=v=>Array.isArray(v)&&v.length===2&&v.every(n=>finite(n,0,1e10));
 for(let i=0;i<value.layers.length;i++){const row=value.layers[i];if(row?.id!==i||!finite(row.z,-1e6,1e6)||!times(row.seconds))fail('layer values');}
 for(let index=0;index<value.vertices.length;index++){
  const row=value.vertices[index];
  if(!Array.isArray(row)||row.length!==nativePreviewColumns.length)fail('vertex row');
  for(let i=0;i<row.length;i++)if(!(i===18&&row[i]===null)&&!finite(row[i]))fail('non-finite vertex value');
  if(!row.slice(0,3).every(n=>finite(n,-1e6,1e6))||!row.slice(3,10).every(n=>n>=0)||!integer(row[10],0,19)||!integer(row[11],0,10)||!integer(row[12],0,NATIVE_PREVIEW_LIMITS.sourceLines)||!integer(row[13],0,Math.max(0,value.layers.length-1))||!integer(row[14],0,255)||!integer(row[15],0,255)||row[16]<0||row[17]<0||row[19]<0||row[20]<0||!finite(row[21],-1e6,1e6)||row[22]<0||row[23]<0||!finite(row[24],-Math.PI-1e-6,Math.PI+1e-6)||row[25]<0||!integer(row[26],0,1))fail('vertex bounds');
  if(row[26]&&(!value.vertices[index+1]||![8,9,10].includes(row[11])||value.vertices[index+1][11]!==row[11]))fail('render line adjacency');
 }
 if(!Array.isArray(value.modes)||!value.modes.length||value.modes.length>2||value.modes[0].name!=='normal')fail('time modes');
 if(value.modes.length===2&&value.modes[1].name!=='stealth')fail('time mode names');
 for(const mode of value.modes)if(mode.summaryTimeLabel!==undefined&&(typeof mode.summaryTimeLabel!=='string'||mode.summaryTimeLabel.length>64))fail('native summary time label');
 for(const mode of value.modes)for(const key of ['totalSeconds','travelSeconds','processorSeconds','prepareSeconds','firstLayerSeconds'])if(!finite(mode[key],0,1e10))fail('time values');
 if(!Array.isArray(value.roles)||value.roles.length>20)fail('role count');
 const roles=new Set();for(const row of value.roles){if(!integer(row.role,0,19)||roles.has(row.role)||!times(row.seconds)||!finite(row.filamentMeters,0,1e8)||!finite(row.filamentGrams,0,1e8))fail('role values');roles.add(row.role);}
 const rgb=v=>Array.isArray(v)&&v.length===3&&v.every(channel=>integer(channel,0,255));
 for(const key of ['toolsColors','colorPrintColors'])if(!Array.isArray(value[key])||value[key].length>256||!value[key].every(rgb))fail('tool colors');
 for(const key of ['filamentDiameters','filamentDensities','filamentCosts'])if(!Array.isArray(value[key])||value[key].length>256||!value[key].every(v=>finite(v,0,1e8)))fail('filament properties');
 for(const mode of value.modes)for(const variant of ['customVisible','customHidden'])for(const key of ['height','width','flow','actualFlow','layerTime','layerTimeLog']){
  const range=value.ranges?.[mode.name]?.[variant]?.[key];
  if(!range||!integer(range.count,0,NATIVE_PREVIEW_LIMITS.vertices)||!Array.isArray(range.values)||![0,1,2,11].includes(range.values.length)||!range.values.every(v=>finite(v,0,1e10))||!Array.isArray(range.palette)||range.palette.length!==11||!range.palette.every(rgb))fail('native scalar range');
  if(range.count===0?(range.min!==null||range.max!==null||range.values.length!==0):(!finite(range.min,0,1e10)||!finite(range.max,range.min,1e10)||!range.values.length))fail('native range bounds');
  if(key.startsWith('layerTime')&&(!Array.isArray(range.layerColors)||range.layerColors.length!==value.layers.length||!range.layerColors.every(rgb)))fail('native layer colors');
 }
 if(value.scalarRangesVersion!==undefined||value.scalarRanges!==undefined){
  if(value.scalarRangesVersion!==1||!value.scalarRanges||Object.keys(value.scalarRanges).length!==4)fail('scalar range capability');
  for(const variant of ['travelHiddenWipeHidden','travelVisibleWipeHidden','travelHiddenWipeVisible','travelVisibleWipeVisible']){
   const collection=value.scalarRanges[variant];if(!collection||Object.keys(collection).length!==7)fail('scalar visibility ranges');
   for(const key of ['speed','actualSpeed','fanSpeed','temperature','pressureAdvance','acceleration','jerk']){
    const range=collection[key];
    if(!range||!integer(range.count,0,NATIVE_PREVIEW_LIMITS.vertices)||!Array.isArray(range.values)||![0,1,2,11].includes(range.values.length)||!range.values.every(v=>finite(v,0,1e10))||!Array.isArray(range.palette)||range.palette.length!==11||!range.palette.every(rgb))fail('native motion scalar range');
    if(range.count===0?(range.min!==null||range.max!==null||range.values.length!==0):(!finite(range.min,0,1e10)||!finite(range.max,range.min,1e10)||!range.values.length))fail('motion scalar range bounds');
   }
  }
 }
 if(value.colorPaletteSource!==undefined&&!['native-standalone-import','native-editor-job'].includes(value.colorPaletteSource))fail('color palette provenance');
 if(value.customEventOverviewVersion!==undefined||value.customEventOverview!==undefined){
  if(value.customEventOverviewVersion!==1||!Array.isArray(value.customEventOverview)||value.customEventOverview.length>10000)fail('custom event capability');
  for(const event of value.customEventOverview){if(!integer(event.type,0,5)||!integer(event.extruder,-1,256)||!finite(event.z,0,10000)||!integer(event.layer,0,value.layers.length)||!Array.isArray(event.seconds)||event.seconds.length!==value.modes.length||!event.seconds.every(value=>finite(value,0,1e10))||!Array.isArray(event.labels)||event.labels.length!==value.modes.length||event.labels.some(value=>typeof value!=='string'||value.length>64))fail('custom event metadata');}
 }
 if(value.editorStatisticsVersion!==undefined||value.editorStatistics!==undefined){
  const summary=value.editorStatistics;if(value.editorStatisticsVersion!==1||!summary||summary.source!=='native-editor-formula'||value.colorPaletteSource!=='native-editor-job')fail('editor summary capability');
  for(const key of ['filamentMm','filamentGrams','filamentMm3','cost','timeCost'])if(!finite(summary[key],0,1e14))fail('editor summary value');
 }
 if(value.materialStatisticsVersion!==undefined||value.materialStatistics!==undefined){
  const statistics=value.materialStatistics;if(value.materialStatisticsVersion!==1||!statistics||typeof statistics!=='object')fail('material statistics capability');
  for(const key of ['modelVolumes','supportVolumes','towerVolumes','flushedVolumes','totalVolumes']){
   const rows=statistics[key],ids=new Set();if(!Array.isArray(rows)||rows.length>256)fail('material volume map');
   for(const row of rows){if(!Array.isArray(row)||row.length!==2||!integer(row[0],0,255)||ids.has(row[0])||!finite(row[1],0,1e12))fail('material volume value');ids.add(row[0]);}
  }
  for(const key of ['filamentChanges','toolChanges'])if(!integer(statistics[key],0,4294967295))fail('material change count');
 }
 if(!Array.isArray(value.nativeWarnings)||value.nativeWarnings.length>1000||value.nativeWarnings.some(w=>typeof w.message!=='string'||w.message.length>16384))fail('native warnings');
 return value;
}
