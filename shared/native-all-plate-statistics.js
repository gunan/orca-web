import{nativeMaterialColumns,nativeMaterialAmount}from'./native-filament-preview.js';
import{nativeFixed}from'./native-format.js';
const f=Math.fround;
/** Original Utils.hpp float arithmetic plus short_time formatting. The final
 * subsecond sprintf/sscanf roundtrip matters at 0.0000005 and 0.9999995 seconds. */
export function nativeSummaryTime(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>1e12)throw new Error('Invalid native summary time');let t=f(seconds),days=Math.trunc(f(t/86400));t=f(t-f(f(days)*86400));let hours=Math.trunc(f(t/3600));t=f(t-f(f(hours)*3600));let minutes=Math.trunc(f(t/60));t=f(t-f(f(minutes)*60));const fractional=days||hours||minutes||t>1?0:f(Number(nativeFixed(t,6))),secs=Math.trunc(fractional||t);if(days+hours>0&&secs>=30){if(++minutes===60){minutes=0;if(++hours===24){hours=0;++days;}}}return days?`${days}d${hours}h${minutes}m`:hours?`${hours}h${minutes}m`:minutes?`${minutes}m${secs}s`:secs>=1?`${secs}s`:fractional>0&&fractional<1?'<1s':'0s';}
/** GCodeViewer::render_all_plates_stats: native assigned extruders select maps,
 * volumes accumulate in double, row totals/time/cost accumulate in float. */
export function nativeAllPlateStatistics(plates,{mode='normal',imperial=false}={}){
 if(!Array.isArray(plates)||!plates.length||plates.length>100||!['normal','stealth'].includes(mode))throw new Error('Invalid native all-plate request');
 const first=plates[0].data,colors=first.toolsColors,filamentCount=colors.length,maps=Object.fromEntries(nativeMaterialColumns.map(column=>[column.key,new Map()]));let seconds=0,cost=0;
 for(const plate of plates){const data=plate.data;if(!data?.vertexCount||data.materialStatisticsVersion!==1||data.editorStatisticsVersion!==1||data.colorPaletteSource!=='native-editor-job')throw new Error('Every nonempty plate needs completed native editor Preview statistics');if(!Array.isArray(plate.extruders)||plate.extruders.some(value=>!Number.isInteger(value)))throw new Error('Invalid native plate extruder collection');if(JSON.stringify(data.toolsColors)!==JSON.stringify(colors))throw new Error('Native all-plate editor palettes do not match');
  for(const id of plate.extruders){const tool=id-1;if(tool<0||tool>=filamentCount)continue;if(!Number.isFinite(first.filamentDiameters[tool])||first.filamentDiameters[tool]<=0||!Number.isFinite(first.filamentDensities[tool]))throw new Error('Native first-plate filament properties are unavailable');for(const column of nativeMaterialColumns){const volume=new Map(data.materialStatistics[column.map]).get(tool)||0;maps[column.key].set(tool,(maps[column.key].get(tool)||0)+volume);}}
  // Disabled native stealth mode retains a zero-initialized statistics slot.
  const time=data.modes.find(value=>value.name===mode)?.processorSeconds??0;seconds=f(seconds+time);cost=f(cost+data.editorStatistics.cost);
 }
 const tools=[...maps.model.keys()].sort((a,b)=>a-b),columns=nativeMaterialColumns.filter(column=>[...maps[column.key].values()].some(value=>value!==0));
 const rows=tools.map(tool=>{const amounts={},total={length:0,grams:0};for(const column of columns){const amount=nativeMaterialAmount(first,maps[column.key].get(tool)||0,tool,{imperial});amounts[column.key]=amount;total.length=f(total.length+amount.length);total.grams=f(total.grams+amount.grams);}return{tool,color:'#'+colors[tool].map(value=>value.toString(16).padStart(2,'0')).join(''),amounts,total};});
 return{available:true,provenance:'native-all-plate-editor',plateCount:plates.length,mode,imperial,rows,columns,showTotals:columns.some(column=>column.key!=='model'),seconds,cost,timeLabel:nativeSummaryTime(seconds)};
}
