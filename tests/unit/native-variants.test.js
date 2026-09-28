import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeVariantVectors, hasExpandedNativeVariants } from '../../shared/native-variants.js';
const context = () => ({ nozzle_diameter: ['.4', '.4'],extruder_type:['Direct Drive','Direct Drive'],nozzle_volume_type:['Standard','High Flow'], filament_settings_id: ['A', 'B'],filament_map:['1','2'], filament_self_index: ['1','1','2','2'], filament_extruder_variant: ['Direct Drive Standard','Direct Drive High Flow','Direct Drive Standard','Direct Drive High Flow'], nozzle_temperature: ['220','230','240','250'], filament_max_volumetric_speed: ['25','40','30','45'], printer_extruder_id: ['1','1','2','2'], printer_extruder_variant: ['Direct Drive Standard','Direct Drive High Flow','Direct Drive Standard','Direct Drive High Flow'], retraction_length: ['.4','.8','.5','.9'], machine_max_speed_x: ['100','50','200','100','300','150','400','200'] });
test('full native vectors retain distinct material/nozzle/stride-two alternatives', () => {
  const settings = context(), original = structuredClone(settings);
  assert.deepEqual(validateNativeVariantVectors(settings,2), {filamentVariantCount:4,printerVariantCount:4,expanded:true});
  assert.deepEqual(settings, original); assert.equal(hasExpandedNativeVariants(settings), true);
});
test('expanded vectors require complete bounded unambiguous source identities', () => {
  for (const modify of [value => delete value.filament_self_index, value => value.filament_self_index=['1','1','1','1'], value => value.filament_self_index=['1','1','2','65'], value => value.filament_extruder_variant[1]=value.filament_extruder_variant[0], value => value.filament_extruder_variant[1]='unrecognized']) {
    const settings=context(); modify(settings); assert.throws(()=>validateNativeVariantVectors(settings,2), /variant/);
  }
});
test('expanded arrays cannot silently fall back to a different variant or truncate machine mode pairs', () => {
  const short=context();short.nozzle_temperature=['220','230'];assert.throws(()=>validateNativeVariantVectors(short,2),/nozzle_temperature.*4 values/);
  const stride=context();stride.machine_max_speed_x=['100','50','200','100'];assert.throws(()=>validateNativeVariantVectors(stride,2),/machine_max_speed_x.*8 values/);
  const missing=context();delete missing.filament_extruder_variant;assert.throws(()=>validateNativeVariantVectors(missing,2),/complete filament variant map/);
});
test('ordinary native one-value/default vectors remain accepted without invented identities', () => {
  const settings={nozzle_diameter:['.4','.4'],filament_settings_id:['A','B'],filament_extruder_variant:['Direct Drive Standard'],filament_self_index:['1'],nozzle_temperature:['200','220'],retraction_length:['.8'],machine_max_speed_x:['100','50']};
  assert.equal(validateNativeVariantVectors(settings,2).expanded,false); assert.equal(hasExpandedNativeVariants(settings),false);
});
import {resizeNativeFilamentVariants} from '../../shared/native-variants.js';
import {addFilamentSlot,removeFilamentSlot} from '../../shared/filament-slots.js';
import {extendPrusaFilaments} from '../../shared/prusa-context.js';
test('slot growth/removal and native import expansion preserve whole variant groups and reindex ownership',()=>{
  const settings={...context(),filament_colour:['#FF0000','#00FF00'],filament_map:['1','2']};
  assert.deepEqual(resizeNativeFilamentVariants(settings,[1,0,null]).nozzle_temperature,['240','250','220','230','220','230']);
  const project={useEmbeddedSettings:true,nativeSettings:settings,objects:[],plates:[]},added=addFilamentSlot(project);
  assert.deepEqual(added.nativeSettings.filament_self_index,['1','1','2','2','3','3']);assert.deepEqual(added.nativeSettings.filament_max_volumetric_speed,['25','40','30','45','25','40']);
  const removed=removeFilamentSlot(added,0);assert.deepEqual(removed.nativeSettings.filament_self_index,['1','1','2','2']);assert.deepEqual(removed.nativeSettings.nozzle_temperature,['240','250','220','230']);
  const imported=extendPrusaFilaments(settings,3);assert.deepEqual(imported.filament_self_index,['1','1','2','2','3','3']);assert.deepEqual(imported.nozzle_temperature,['220','230','240','250','240','250']);
});
