import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { editableDefinitionsByScope, normalizeNativeProfileValues } from './profile-settings.js';
import { normalizeObjectSettings } from './native-object-settings.js';
import objectSchema from './native-object-schema.json' with {type:'json'};

// OrcaSlicer 2.4.2 / 8500fcd: bbs_3mf.cpp:2886,7517;
// PrintApply.cpp:342; PrintObject.cpp:3664; Slicing.cpp:232;
// GUI_ObjectList.cpp:3366,4507. Bounds are object-relative Z, without raft lift.
export const HEIGHT_RANGES_PATH = 'Metadata/layer_config_ranges.xml';
export const HEIGHT_RANGE_EPSILON = 0.0001;
const supported = new Set([...objectSchema.region,'layer_height']);
export const heightRangeSettingDefinitions = editableDefinitionsByScope.process.filter(definition=>supported.has(definition.key));
const arr=value=>value==null?[]:Array.isArray(value)?value:[value];
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('\n','&#10;').replaceAll('\r','&#13;');
const at=(config,key,index)=>Number(arr(config?.[key])[index]??arr(config?.[key])[0]);
export function heightRangeLayerBounds(printer,extruder=0){
  const index=Math.max(0,Number(extruder)-1),min=at(printer,'min_layer_height',index),nativeMax=at(printer,'max_layer_height',index),nozzle=at(printer,'nozzle_diameter',index);
  return {min:Number.isFinite(min)?min:0,max:Number.isFinite(nativeMax)&&nativeMax>=HEIGHT_RANGE_EPSILON?nativeMax:Number.isFinite(nozzle)?nozzle*.75:Infinity};
}
export function normalizeHeightRanges(value=[],filamentCount=64,{printer}={}){
  if(!Array.isArray(value)||value.length>1024)throw new Error('A native object supports at most 1024 height ranges');
  const seen=new Set();
  return value.map(range=>{
    if(!plain(range)||![range.minZ,range.maxZ].every(number=>typeof number==='number'&&Number.isFinite(number)&&number>=0&&number<=1e7)||range.maxZ<=range.minZ)throw new Error('Height range bounds must be finite, non-negative, and end above the start');
    if(!plain(range.settings)||!Object.hasOwn(range.settings,'layer_height'))throw new Error('Each height range requires layer_height');
    const {layer_height,...region}=range.settings;
    const settings={...normalizeObjectSettings(region,filamentCount,{part:true}),...normalizeNativeProfileValues('process',{layer_height})};
    if(Number(settings.layer_height)<=0)throw new Error('Height range layer_height must be greater than zero');
    settings.extruder??='0';
    if(printer){const {min,max}=heightRangeLayerBounds(printer,settings.extruder);if(Number(settings.layer_height)<min||Number(settings.layer_height)>max)throw new Error(`Height range layer height must be between ${min} and ${max} mm for its nozzle`);}
    const key=JSON.stringify([range.minZ,range.maxZ]);if(seen.has(key))throw new Error('Duplicate height range bounds');seen.add(key);
    return {minZ:range.minZ,maxZ:range.maxZ,settings:Object.fromEntries(Object.entries(settings).sort(([a],[b])=>a.localeCompare(b)))};
  }).sort((a,b)=>a.minZ-b.minZ||a.maxZ-b.maxZ);
}

/** Native LayerRanges: earlier ranges trim later ranges, never merge them.
 * Half-open intervals are evaluated at the layer's slice Z (its midpoint).
 * Gaps use ordinary object/part settings; Slicing.cpp separately preserves the
 * first layer's fixed height and clips the layer-height profile at object top. */
export function effectiveHeightRanges(value){
  let end=0;const result=[];
  for(const range of normalizeHeightRanges(value))if(range.maxZ>end){
    if(range.minZ>end+HEIGHT_RANGE_EPSILON)end=range.minZ;
    if(range.maxZ>end+HEIGHT_RANGE_EPSILON){result.push({...range,minZ:end});end=range.maxZ;}
  }
  return result;
}
export function readHeightRanges(text,filamentCount=64){
  if(typeof text!=='string'||text.length>16*1024*1024)throw new Error('Height range metadata exceeds its limit');
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('Invalid height range XML');
  const document=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false}).parse(text);
  if(!Object.hasOwn(document,'objects'))throw new Error('Height range XML is missing its objects root');
  const result=new Map();
  for(const object of arr(document.objects?.object)){
    const id=Number(object['@_id']);if(!Number.isSafeInteger(id)||id<1||id>10000||result.has(id))throw new Error('Invalid or duplicate height range object index');
    const ranges=arr(object.range).map(range=>{
      const settings={};for(const option of arr(range.option)){
        const key=option['@_opt_key'];if(typeof key!=='string'||Object.hasOwn(settings,key)||['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid or duplicate height range option');
        settings[key]=option['#text']??'';
      }
      if(!String(range['@_min_z']??'').trim()||!String(range['@_max_z']??'').trim())throw new Error('Missing height range bounds');
      return {minZ:Number(range['@_min_z']),maxZ:Number(range['@_max_z']),settings};
    });
    result.set(id,normalizeHeightRanges(ranges,filamentCount));
  }
  return result;
}
export function writeHeightRanges(groups,filamentCount=64){
  const objects=groups.map((ranges,index)=>{
    ranges=normalizeHeightRanges(ranges,filamentCount);return ranges.length?`<object id="${index+1}">${ranges.map(range=>`<range min_z="${range.minZ}" max_z="${range.maxZ}">${Object.entries(range.settings).map(([key,value])=>`<option opt_key="${xml(key)}">${xml(value)}</option>`).join('')}</range>`).join('')}</object>`:'';
  }).join('');
  return objects?`<?xml version="1.0" encoding="UTF-8"?><objects>${objects}</objects>`:null;
}
export function updateHeightRanges(objects,selectedId,ranges,filamentCount=1,{printer}={}){
  const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Select an object to edit height ranges');
  const group=selected.native?.groupId||selected.id,normalized=normalizeHeightRanges(ranges,filamentCount,{printer});
  return objects.map(object=>object.plateId===selected.plateId&&(object.native?.groupId||object.id)===group?{...object,native:{...object.native,layerConfigRanges:structuredClone(normalized)}}:object);
}
