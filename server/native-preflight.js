import {platePrintSequence} from '../shared/filament-sequence.js';
import {meshBounds} from '../shared/geometry.js';
import { effectiveHeightRanges } from '../shared/height-ranges.js';
import { validateNativeConfiguration } from '../shared/native-config-validation.js';

export function assertNativeConfiguration(selection, label = 'Slicing settings') {
  const validation = validateNativeConfiguration(selection);
  if (!validation.valid) {
    const error = new Error(`${label}: ${validation.errors.map(item => `${item.key}: ${item.message}`).join(' ')}`);
    error.status = 400;
    error.validation = validation;
    throw error;
  }
  return validation;
}

// Project JSON is a flattened native FullPrintConfig. Keep that effective shape
// for every scope, then validate printable region overrides on their own parts.
export function assertNativeProjectConfiguration(prepared) {
  const { project } = prepared;
  const settings = prepared.effectiveSettings || prepared.settings;
  const validate = (config, label) => assertNativeConfiguration({ printer:config, process:config, filament:config }, label);
  validate(settings, 'Project slicing settings');
  for(const plate of project.plates){
    const order=platePrintSequence(plate,settings,settings.filament_settings_id?.length);
    if(order.firstLayer===null&&!order.ranges.length)continue;
    const normal=project.objects.filter(object=>object.plateId===plate.id&&object.visible!==false&&object.printable!==false&&(object.native?.partType||'normal_part')==='normal_part');
    if(normal.length&&normal.every(object=>meshBounds(object).min[2]>Number(settings.initial_layer_print_height||.2))){
      const error=new Error('Custom filament order needs printable geometry on the first layer. Drop a normal part onto the plate or reset to automatic ordering.');error.status=400;throw error;
    }
  }
  for (const object of project.objects) {
    if (object.visible === false || object.printable === false || ['negative_part','support_enforcer','support_blocker'].includes(object.native?.partType)) continue;
    const plate = project.plates.find(item=>item.id===object.plateId), metadata = plate?.native?.metadata || {};
    const plateSettings = {};
    if (metadata.spiral_mode !== undefined) plateSettings.spiral_mode = ['true','1',true].includes(metadata.spiral_mode) ? '1' : '0';
    if (metadata.print_sequence !== undefined) plateSettings.print_sequence = metadata.print_sequence;
    const config = { ...settings, ...plateSettings, ...object.native?.objectSettings, ...object.native?.partSettings };
    validate(config, `Slicing settings for ${object.name}`);
    for(const range of effectiveHeightRanges(object.native?.layerConfigRanges||[])){
      // Native model regions: global -> object -> part -> height range. A
      // modifier overlays its parent region afterwards (PrintObject.cpp:3664).
      const ranged={...settings,...plateSettings,...object.native?.objectSettings,...object.native?.partSettings,...range.settings};
      if(object.native?.partType==='modifier_part')Object.assign(ranged,object.native.partSettings);
      validate(ranged, `Slicing settings for ${object.name}, height ${range.minZ}–${range.maxZ} mm`);
    }
  }
}
