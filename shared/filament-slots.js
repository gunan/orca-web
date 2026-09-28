import {resizeNativeFilamentVariants} from './native-variants.js';
import {resizePurgeSettings,physicalNozzleCount} from './purge-volumes.js';
import { definitionsByScope } from './profile-settings.js';

export const filamentSlotCount = project => project.useEmbeddedSettings ? project.nativeSettings?.filament_settings_id?.length || 1 : project.filamentIds?.length || 1;
const palette = ['#F0784A','#28B0D0','#F0C84A','#AB72D1','#56B47A'];
export function filamentColors(project, firstColor = '#D8DCE1') {
  const count = filamentSlotCount(project), values = project.useEmbeddedSettings ? project.nativeSettings?.filament_colour : project.projectOverrides?.filament_colour;
  return Array.from({ length: count }, (_, i) => /^#[\da-f]{6}$/i.test(values?.[i]) ? values[i] : i ? palette[(i-1) % palette.length] : firstColor);
}
function resizePurge(settings,count,indices,nozzles){return{...settings,...resizePurgeSettings(settings,count,indices,{nozzles})};}
export function addFilamentSlot(project,{nozzles=physicalNozzleCount(project.useEmbeddedSettings?project.nativeSettings||{}:{})}={}) {
  const count = filamentSlotCount(project);
  if (count >= 64) throw new Error('A project supports at most 64 filament slots.');
  const colors = [...filamentColors(project), palette[(count-1)%palette.length]];
  if (project.useEmbeddedSettings) {
    const settings = { ...project.nativeSettings };
    for (const definition of definitionsByScope.filament) if (Array.isArray(settings[definition.key]) && settings[definition.key].length === count) settings[definition.key] = [...settings[definition.key], settings[definition.key][0]];
    settings.filament_settings_id = [...project.nativeSettings.filament_settings_id, project.nativeSettings.filament_settings_id[0]];
    settings.filament_colour = colors;
    if (Array.isArray(settings.filament_map)) settings.filament_map = [...settings.filament_map, settings.filament_map[0] || '1'];
    return { ...project, nativeWorkflow: true, nativeSettings: {...resizePurge(settings,count,[...Array(count).keys(),null],nozzles),...resizeNativeFilamentVariants(project.nativeSettings,[...Array(count).keys(),null])} };
  }
  const filamentIds = [...(project.filamentIds || [project.ids.filamentId]), project.ids.filamentId];
  return { ...project, nativeWorkflow: true, filamentIds, projectOverrides: { ...resizePurge(project.projectOverrides || {},count,[...Array(count).keys(),null],nozzles), filament_colour: colors } };
}
export function removeFilamentSlot(project,index,{nozzles=physicalNozzleCount(project.useEmbeddedSettings?project.nativeSettings||{}:{})}={}) {
  const count = filamentSlotCount(project), slot = index+1;
  if (!Number.isInteger(index) || index < 0 || index >= count || count === 1) throw new Error('Keep at least one filament slot.');
  if(count<=nozzles)throw new Error('Keep at least one filament slot for each physical nozzle.');
  const assigned = object => Number(object.filamentSlot || object.native?.partSettings?.extruder || object.native?.objectSettings?.extruder || 1);
  if (project.objects.some(object => assigned(object) === slot) || project.plates.some(plate => plate.layerEvents?.items?.some(event => ['ToolChange','ColorChange'].includes(event.type) && event.extruder === slot))) throw new Error('Reassign objects and layer events that use this filament before removing it.');
  const indices = Array.from({ length: count }, (_, i) => i).filter(i => i !== index), objects = project.objects.map(object => {
    const native = object.native ? structuredClone(object.native) : undefined;
    for (const settings of [native?.objectSettings,native?.partSettings]) if (Number(settings?.extruder) > slot) settings.extruder = String(Number(settings.extruder)-1);
    return { ...object, filamentSlot: assigned(object) > slot ? assigned(object)-1 : assigned(object), ...(native && {native}) };
  });
  const plates = project.plates.map(plate => !plate.layerEvents ? plate : { ...plate, layerEvents: { ...plate.layerEvents, items: plate.layerEvents.items.map(event => ['ToolChange','ColorChange'].includes(event.type) && event.extruder > slot ? { ...event, extruder: event.extruder-1 } : event) } });
  if (project.useEmbeddedSettings) {
    const settings = { ...project.nativeSettings };
    for (const definition of definitionsByScope.filament) if (Array.isArray(settings[definition.key]) && settings[definition.key].length === count) settings[definition.key] = indices.map(i => settings[definition.key][i]);
    for (const key of ['filament_settings_id','filament_colour','filament_map']) if (Array.isArray(project.nativeSettings[key])) settings[key] = indices.map(i => project.nativeSettings[key][i]);
    return { ...project, objects, plates, nativeSettings: {...resizePurge(settings,count,indices,nozzles),...resizeNativeFilamentVariants(project.nativeSettings,indices)} };
  }
  const filamentIds = indices.map(i => (project.filamentIds || [project.ids.filamentId])[i]);
  return { ...project, objects, plates, filamentIds, ids: { ...project.ids, filamentId: filamentIds[0] }, projectOverrides: { ...resizePurge(project.projectOverrides || {},count,indices,nozzles), filament_colour: indices.map(i => filamentColors(project)[i]) } };
}
export function setFilamentColor(project,index,color) {
  if (!Number.isInteger(index) || index < 0 || index >= filamentSlotCount(project) || !/^#[\da-f]{6}$/i.test(color)) throw new Error('Choose a valid filament color and slot.');
  const colors = filamentColors(project); colors[index] = color;
  return project.useEmbeddedSettings ? { ...project, nativeSettings: { ...project.nativeSettings, filament_colour: colors } } : { ...project, projectOverrides: { ...project.projectOverrides, filament_colour: colors } };
}
