import{nativeFixed}from'./native-format.js';
const f=Math.fround,hex=rgb=>'#'+rgb.map(value=>value.toString(16).padStart(2,'0')).join('');
export const nativeMaterialColumns=Object.freeze([{key:'model',label:'Model',map:'modelVolumes'},{key:'support',label:'Support',map:'supportVolumes'},{key:'flushed',label:'Flushed',map:'flushedVolumes'},{key:'tower',label:'Tower',map:'towerVolumes'}].map(Object.freeze));
/** Original Layers::update regards only PausePrint and CustomGCode as layer-wide
 * colorprint options; ColorChange alone does not mark a layer gray. */
export function nativeColorPrintLayers(data){const flags=new Uint8Array(data.layers.length);for(const v of data.vertices)if(v[11]===6||v[11]===7)flags[v[13]]=1;return flags;}
export function nativeColorPrintColor(data,index,layerFlags){const v=data.vertices[index],palette=data.colorPrintColors;if(layerFlags[v[13]]||!palette.length)return '#404040';return hex(palette[v[15]%palette.length]);}
export function nativeUsedFilaments(data){const ids=new Set();for(const vertex of data.vertices)if(vertex[11]===10)ids.add(vertex[14]);return [...ids].sort((a,b)=>a-b);}
export function nativeCompactWeight(grams,imperial=false){if(!Number.isFinite(grams))return 'Unavailable';if(imperial)return `${nativeFixed(grams/28.34952,2)} oz`;let value=Math.abs(grams),unit='g';if(value>=1000000){value/=1000000;unit='t';}else if(value>=1000){value/=1000;unit='kg';}return `${grams<0?'-':''}${nativeFixed(value,2)}${unit}`;}
export function nativeMaterialAmount(data,volume,tool,{imperial=false}={}){const diameter=data.filamentDiameters[tool],density=data.filamentDensities[tool];return{volume,length:Number.isFinite(diameter)&&diameter>0?(imperial?1/25.4:.001)*volume/(Math.PI*(.5*diameter)**2):null,grams:Number.isFinite(density)?volume*density*.001:null};}
export function nativeMaterialLabel(amount,imperial=false,multiline=false){return amount&&Number.isFinite(amount.length)&&Number.isFinite(amount.grams)?`${nativeFixed(amount.length,2)} ${imperial?'in':'m'}${multiline?'\n':'    '}${nativeCompactWeight(amount.grams,imperial)}`:'Unavailable';}
/** Original per-row Total uses float accumulators; per-column/all-row totals use
 * double. Preserve that distinction rather than rounding serialized values. */
export function nativeFilamentUsage(data,{imperial=false}={}){
 const tools=nativeUsedFilaments(data),statistics=data.materialStatistics,available=data.materialStatisticsVersion===1&&Boolean(statistics);
 if(!available)return{available:false,rows:tools.map(tool=>({tool,color:data.toolsColors[tool]?hex(data.toolsColors[tool]):'#404040'})),columns:[],totals:null,cost:null};
 const maps=Object.fromEntries(nativeMaterialColumns.map(c=>[c.key,new Map(statistics[c.map])])),columns=nativeMaterialColumns.filter(c=>tools.some(tool=>maps[c.key].has(tool))),totals=Object.fromEntries(columns.map(c=>[c.key,{length:0,grams:0}]));
 const add=(target,amount,float=false)=>{for(const key of['length','grams'])target[key]=target[key]===null||amount[key]===null?null:float?f(target[key]+amount[key]):target[key]+amount[key];};
 const rows=tools.map(tool=>{const amounts={};let total={length:0,grams:0};for(const c of columns){amounts[c.key]=maps[c.key].has(tool)?nativeMaterialAmount(data,maps[c.key].get(tool),tool,{imperial}):{volume:0,length:0,grams:0};add(totals[c.key],amounts[c.key]);add(total,amounts[c.key],true);}return{tool,color:data.toolsColors[tool]?hex(data.toolsColors[tool]):'#404040',amounts,total};});
 const total={length:0,grams:0};for(const c of columns)add(total,totals[c.key]);
 // Plater::load_gcode_file computes imported-G-code cost from all native total
 // volume entries, including entries not represented by a displayed extruder.
 let cost=0;for(const[tool,volume]of statistics.totalVolumes){const density=data.filamentDensities[tool],price=data.filamentCosts[tool];if(!Number.isFinite(density)||!Number.isFinite(price)){cost=null;break;}cost+=volume*density*.001*price*.001;}
 return{available:true,rows,columns,totals,total,showTotals:columns.some(c=>c.key!=='model'),cost,filamentChanges:statistics.filamentChanges,toolChanges:statistics.toolChanges};
}

/** Original compact uint32 counter formatting truncates tenths; it does not round. */
export function nativeCompactCount(value){if(!Number.isInteger(value)||value<0||value>4294967295)return 'Unavailable';if(value<1000)return String(value);const suffixes=['','K','M','B'];let i=0,divisor=1;while(i+1<suffixes.length&&Math.trunc(value/divisor)>=1000){divisor*=1000;i++;}const whole=Math.trunc(value/divisor),tenths=Math.trunc((value%divisor)*10/divisor);return String(whole)+(tenths?'.'+tenths:'')+suffixes[i];}
