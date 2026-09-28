export const PROJECT_LOAD_KEY='orca-web:native-project-load-v1';
export const PROJECT_LOAD_DEFAULTS=Object.freeze({version:1,project_load_behaviour:'ask_when_relevant'});
export const PROJECT_LOAD_OPTIONS=Object.freeze([{value:'load_all',label:'Load All'},{value:'ask_when_relevant',label:'Ask When Relevant'},{value:'always_ask',label:'Always Ask'},{value:'load_geometry_only',label:'Load Geometry Only'}].map(Object.freeze));
export function normalizeProjectLoadPreferences(value){if(!value||value.version!==1||!PROJECT_LOAD_OPTIONS.some(o=>o.value===value.project_load_behaviour))throw Error('Invalid project load preferences.');return{version:1,project_load_behaviour:value.project_load_behaviour};}
export function readProjectLoadPreferences(storage){try{return normalizeProjectLoadPreferences(JSON.parse(storage?.getItem(PROJECT_LOAD_KEY)||'null'));}catch{return{...PROJECT_LOAD_DEFAULTS};}}
export function saveProjectLoadPreferences(storage,value){const next=normalizeProjectLoadPreferences(value);storage.setItem(PROJECT_LOAD_KEY,JSON.stringify(next));return next;}
// Plater::determine_load_type and open_3mf_file use different entry contexts.
// Explicit Open does not promote Ask When Relevant to Always Ask; Add does.
export function projectLoadAction(preferences,{entry,hasObjects=false}){const behaviour=normalizeProjectLoadPreferences(preferences).project_load_behaviour;if(!['open','add'].includes(entry))throw Error('Invalid project load entry.');if(behaviour==='load_geometry_only')return'geometry';if(behaviour==='always_ask'||(behaviour==='ask_when_relevant'&&entry==='add'&&hasObjects))return'ask';return'project';}
// Opening geometry starts a new project but keeps the current effective preset
// context; adding geometry is handled by the existing model import transaction.
export function geometryProjectContext(current,empty){const next={...empty,ids:{...current.ids},overrides:{...current.overrides}};for(const key of['filamentIds','nativeSettings','useEmbeddedSettings','nativeWorkflow','processCorrectionDecisions','projectOverrides','nativePresetNames','nativeContext','nativeUnsupportedSettings'])if(current[key]!==undefined)next[key]=structuredClone(current[key]);return next;}
