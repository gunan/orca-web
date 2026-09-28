export const STARTUP_PREFERENCES_KEY='orca-web:native-startup-preferences-v1';
export const NATIVE_STARTUP_DEFAULTS=Object.freeze({version:1,default_page:'0'});
export const NATIVE_STARTUP_PAGES=Object.freeze([{value:'0',label:'Home'},{value:'1',label:'Prepare'}].map(Object.freeze));
export function normalizeNativeStartupPreferences(value){if(!value||value.version!==1||!['0','1'].includes(value.default_page))throw new TypeError('Invalid startup preferences');return{version:1,default_page:value.default_page};}
export function readNativeStartupPreferences(storage){try{return normalizeNativeStartupPreferences(JSON.parse(storage?.getItem(STARTUP_PREFERENCES_KEY)||'null'));}catch{return{...NATIVE_STARTUP_DEFAULTS};}}
export function saveNativeStartupPreferences(storage,value){const next=normalizeNativeStartupPreferences(value);storage.setItem(STARTUP_PREFERENCES_KEY,JSON.stringify(next));return next;}
export function nativeStartupPage(value){return normalizeNativeStartupPreferences(value).default_page==='1'?'Prepare':'Home';}
