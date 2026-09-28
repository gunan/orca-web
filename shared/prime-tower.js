import { normalizeOverrides, settingDefinitions } from './settings.js';
import { normalizeNativeProjectValues, projectSettingDefinitions } from './profile-settings.js';
const defaults = Object.fromEntries([...settingDefinitions,...projectSettingDefinitions].map(item=>[item.key,item.default]));
const scalar = value => Array.isArray(value) ? value[0] : value;
export function primeTowerState(project, process = {}) {
  const values = {...process,...(project.useEmbeddedSettings?project.nativeSettings:project.projectOverrides),...project.overrides};
  const index = project.plates.findIndex(plate=>plate.id===project.activePlateId);
  if(index<0)throw new Error('Prime tower needs an active plate.');
  const coordinate = key => Number(values[key]?.[index] ?? values[key]?.[0] ?? defaults[key][0]);
  return {enabled:[true,1,'1'].includes(scalar(values.enable_prime_tower ?? defaults.enable_prime_tower)),x:coordinate('wipe_tower_x'),y:coordinate('wipe_tower_y'),width:Number(scalar(values.prime_tower_width ?? defaults.prime_tower_width)),rotation:Number(scalar(values.wipe_tower_rotation_angle ?? defaults.wipe_tower_rotation_angle)),plateIndex:index};
}
export function updatePrimeTower(project, draft, process = {}) {
  const state = primeTowerState(project,process);
  for(const key of ['x','y','width','rotation'])if(String(draft[key]).trim()===''||!Number.isFinite(Number(draft[key])))throw new Error(`Prime tower ${key} must be a finite number.`);
  const configured = normalizeOverrides({enable_prime_tower:draft.enabled,prime_tower_width:draft.width,wipe_tower_rotation_angle:draft.rotation});
  const source = project.useEmbeddedSettings ? project.nativeSettings : project.projectOverrides || {};
  const coordinates = normalizeNativeProjectValues(Object.fromEntries(['wipe_tower_x','wipe_tower_y'].map((key,axis)=>[key,project.plates.map((_,index)=>index===state.plateIndex?String(Number(draft[axis?'y':'x'])):String(source[key]?.[index]??source[key]?.[0]??defaults[key][0]))])));
  return project.useEmbeddedSettings ? {...project,nativeWorkflow:true,nativeSettings:{...source,...coordinates},overrides:{...project.overrides,...configured}} : {...project,nativeWorkflow:true,projectOverrides:{...source,...coordinates},overrides:{...project.overrides,...configured}};
}
