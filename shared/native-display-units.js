import{nativeFixed}from'./native-format.js';
import{nativeCompactWeight}from'./native-filament-preview.js';
import{nativeSummaryTime}from'./native-all-plate-statistics.js';
export const NATIVE_UNITS_STORAGE_KEY='orca-web:native-display-preferences-v1';
export const NATIVE_UNIT_OPTIONS=Object.freeze([{value:'0',label:'Metric (mm, g)'},{value:'1',label:'Imperial (in, oz)'}].map(Object.freeze));
export function normalizeNativeDisplayPreferences(value){if(!value||value.version!==1||!['0','1'].includes(value.use_inches))throw new Error('Invalid native display units preference');return{version:1,use_inches:value.use_inches};}
export function readNativeDisplayPreferences(storage){try{return normalizeNativeDisplayPreferences(JSON.parse(storage?.getItem(NATIVE_UNITS_STORAGE_KEY)||'null'));}catch{return{version:1,use_inches:'0'};}}
export function saveNativeDisplayPreferences(storage,value){const normalized=normalizeNativeDisplayPreferences(value);storage.setItem(NATIVE_UNITS_STORAGE_KEY,JSON.stringify(normalized));return normalized;}
export function nativePreferencesShortcut(event,{modal=false,editing=false,platform=''}={}){if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||modal||editing||event.repeat)return false;const mac=/mac|iphone|ipad/i.test(platform),key=String(event.key||'').toLowerCase();return mac?Boolean(event.metaKey&&!event.ctrlKey&&key===','):Boolean(event.ctrlKey&&!event.metaKey&&key==='p');}
/** Active native Feature rows deliberately convert imperial weight twice:
 * used_filament_per_role divides by oz_to_g, then format_compact_weight does
 * so again. Filament/Summary tables must NOT reuse that source quirk. */
export function nativeRoleUsageLabels(stats,mode,{imperial=false}={}){const seconds=Math.fround(stats.seconds),total=Math.fround(mode.totalSeconds),percent=total>0?Math.fround(seconds/total):0;return{time:seconds>0?nativeSummaryTime(seconds):'',percent:percent===0?'0':percent>.001?nativeFixed(Math.fround(percent*100),1):'<0.1',length:`${nativeFixed(stats.filamentMeters/(imperial?25.4/1000:1),2)}${imperial?'in':'m'}`,weight:nativeCompactWeight(stats.filamentGrams/(imperial?28.34952:1),imperial)};}
/** Exact active native travel/option distance formatter; caller supplies the
 * original processor distance, never an inferred geometric counter. */
export function nativeUsageDistance(distance,{imperial=false}={}){const value=Math.fround(distance);return imperial?`${nativeFixed(value/25.4,2)}in`:Math.abs(value)<1000?`${nativeFixed(value,0)}mm`:`${nativeFixed(Math.fround(value/1000),2)}m`;}
export function nativeSummaryMaterialLabels({filamentMm,filamentGrams},{imperial=false}={}){return{length:Number.isFinite(filamentMm)?`${nativeFixed(filamentMm/(imperial?25.4:1000),2)} ${imperial?'in':'m'}`:'Unavailable',weight:nativeCompactWeight(filamentGrams,imperial)};}
