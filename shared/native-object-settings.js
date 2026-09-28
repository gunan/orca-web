import {normalizedCutMetadata,invalidateCutFamily} from './cut-metadata.js';
import {normalizeLayerHeightProfile} from './variable-layers.js';
import { normalizeHeightRanges } from './height-ranges.js';
import { definitionsByScope, editableDefinitionsByScope, normalizeNativeProfileValues, displayedProfileSettings } from './profile-settings.js';
import objectSchema from './native-object-schema.json' with {type:'json'};
const processDefinitions=new Map(definitionsByScope.process.map(definition=>[definition.key,definition]));
export const supportedObjectSettings=new Set([...objectSchema.object,...objectSchema.region].filter(key=>processDefinitions.has(key)));
export const supportedPartSettings=new Set(objectSchema.region.filter(key=>processDefinitions.has(key)));
export const objectSettingDefinitions=editableDefinitionsByScope.process.filter(definition=>supportedObjectSettings.has(definition.key));
export const partSettingDefinitions=editableDefinitionsByScope.process.filter(definition=>supportedPartSettings.has(definition.key));
export const NATIVE_PART_ROLES={normal_part:'Part',negative_part:'Negative volume',modifier_part:'Modifier',support_enforcer:'Support enforcer',support_blocker:'Support blocker'};
const vectorTypes=new Set(['coFloats','coInts','coStrings','coBools','coPercents','coEnums']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const canonical=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
function slot(value,count,label='filament slot',allowZero=false){const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;if(!Number.isInteger(n)||n<(allowZero?0:1)||n>count)throw new Error(`Invalid ${label}: choose ${allowZero?'0–':'1–'}${count}`);return n;}
export function stringsFromNative(value){
  if(Array.isArray(value))return value;
  if(typeof value!=='string')throw new Error('Native string-vector settings must be serialized text');
  if(!value.trim())return[];
  const parts=[];let start=0,quoted=false,escaped=false;
  for(let i=0;i<value.length;i++){
    const char=value[i];if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char==='"')quoted=!quoted;
    if(char===';'&&!quoted){parts.push(value.slice(start,i));start=i+1;}
  }
  if(quoted||escaped)throw new Error('Invalid native string-vector quoting');parts.push(value.slice(start));
  return parts.map(part=>{const s=part.trim();if(s.startsWith('"')){try{return JSON.parse(s);}catch{throw new Error('Invalid native string-vector quoting');}}return s;});
}
export function normalizeObjectSettings(values={},filamentCount=1,{part=false,preserveNativeObjectOptions=false}={}){
  if(!plain(values))throw new Error('Object settings must be an object');
  const result={};
  for(const [key,value]of Object.entries(values)){
    if(key==='extruder'){result[key]=String(slot(value,filamentCount,'object extruder',true));continue;}
    const definition=processDefinitions.get(key);
    if(!definition||!(part&&!preserveNativeObjectOptions?supportedPartSettings:supportedObjectSettings).has(key))throw new Error(`Unsupported ${part?'part':'object'} process setting: ${key}`);
    let input=value;
    if(vectorTypes.has(definition.nativeType)&&!Array.isArray(input))input=definition.nativeType==='coStrings'?stringsFromNative(input):String(input).split(',').map(value=>value.trim());
    const normalized=normalizeNativeProfileValues('process',{[key]:input})[key];
    result[key]=Array.isArray(normalized)?definition.nativeType==='coStrings'?normalized.map(value=>JSON.stringify(value)).join(';'):normalized.join(','):normalized;
  }
  return canonical(result);
}

/** Decode XML scalar strings for controls without adding unrelated defaults. */
export function displayedObjectSettings(values={}){
  const decoded={};
  for(const[key,value]of Object.entries(values)){
    const definition=processDefinitions.get(key);if(!definition)continue;
    if(vectorTypes.has(definition.nativeType)&&!Array.isArray(value)){
      try{decoded[key]=definition.nativeType==='coStrings'?stringsFromNative(value):String(value).split(',').map(item=>item.trim());}
      catch{decoded[key]=[String(value)];}
    }else decoded[key]=value;
  }
  return displayedProfileSettings('process',decoded,{includeDefaults:false});
}

export const nativeGroupId=object=>object.native?.groupId||object.id;
const inGroup=(left,right)=>left.plateId===right.plateId&&nativeGroupId(left)===nativeGroupId(right);

/** Object settings belong to every part in a native object. Part changes remain
 * local. Joining another object adopts its settings atomically. */
export function updateNativePart(objects,id,patch){
  const selected=objects.find(object=>object.id===id);if(!selected)throw new Error('Selected part is missing');
  const target=patch.groupId===undefined?selected:objects.find(object=>object.id!==id&&object.plateId===selected.plateId&&nativeGroupId(object)===patch.groupId);
  const newGroupId=patch.groupId??nativeGroupId(selected);
  const objectSettings=patch.objectSettings??target?.native?.objectSettings??selected.native?.objectSettings??{};
  const layerConfigRanges=patch.layerConfigRanges??(target?(target.native?.layerConfigRanges||[]):selected.native?.layerConfigRanges||[]);
  const layerHeightProfile=patch.layerHeightProfile??(target?(target.native?.layerHeightProfile||[]):selected.native?.layerHeightProfile||[]);
  const objectName=patch.objectName??target?.native?.objectName??target?.name??selected.native?.objectName??selected.name;
  if(newGroupId!==nativeGroupId(selected)||patch.partType!==undefined&&patch.partType!==(selected.native?.partType||'normal_part'))objects=invalidateCutFamily(objects,[id,...(target?[target.id]:[])]);
  return objects.map(object=>{
    const sameGroup=object.plateId===selected.plateId&&nativeGroupId(object)===newGroupId;
    if(object.id!==id&&!sameGroup)return object;
    const updated={...object,native:{...object.native,groupId:newGroupId,objectName,layerHeightProfile:[...layerHeightProfile],layerConfigRanges:structuredClone(layerConfigRanges),objectSettings:structuredClone(objectSettings),partType:object.native?.partType||'normal_part',partSettings:{...object.native?.partSettings}}};
    if(object.id===id){
      if(patch.partSettings!==undefined)updated.native.partSettings=structuredClone(patch.partSettings);
      if(patch.partType!==undefined)updated.native.partType=patch.partType;
      if(patch.filamentSlot!==undefined){updated.filamentSlot=patch.filamentSlot;delete updated.native.partSettings.extruder;}
      if(patch.name!==undefined)updated.name=patch.name;
      if(patch.printable!==undefined)updated.printable=patch.printable;
    }
    return updated;
  });
}

export function normalizeNativeParts(objects,filamentCount=1){
  const groupSettings=new Map();
  const result=objects.map(object=>{
    const layerConfigRanges=normalizeHeightRanges(object.native?.layerConfigRanges||[],filamentCount);
    const layerHeightProfile=normalizeLayerHeightProfile(object.native?.layerHeightProfile||[]);
    const cut=normalizedCutMetadata(object.native);
    const native={...object.native,...cut,layerConfigRanges,layerHeightProfile,groupId:nativeGroupId(object),objectName:object.native?.objectName||object.name,partType:object.native?.partType||'normal_part',objectSettings:normalizeObjectSettings(object.native?.objectSettings||{},filamentCount),partSettings:normalizeObjectSettings(object.native?.partSettings||{},filamentCount,{part:true,preserveNativeObjectOptions:true})};
    if(!Object.hasOwn(NATIVE_PART_ROLES,native.partType))throw new Error('Invalid native part role');
    if(typeof native.groupId!=='string'||!native.groupId||native.groupId.length>256||native.groupId.includes('\0'))throw new Error('Invalid native group ID');
    if(typeof native.objectName!=='string'||!native.objectName.trim()||native.objectName.length>1000||native.objectName.includes('\0'))throw new Error('Enter a native object name');
    if(typeof object.name!=='string'||!object.name.trim()||object.name.length>1000||object.name.includes('\0'))throw new Error('Enter a part name');
    const key=JSON.stringify([object.plateId,native.groupId]),signature=JSON.stringify([native.objectSettings,layerConfigRanges,layerHeightProfile,cut.cutId||null]);
    if(groupSettings.has(key)&&groupSettings.get(key)!==signature)throw new Error('Parts in a native object must share object settings, height ranges, variable layer profiles and cut identities');groupSettings.set(key,signature);
    return{...object,native,filamentSlot:slot(object.filamentSlot??(Number(native.partSettings.extruder)||Number(native.objectSettings.extruder)||1),filamentCount)};
  });
  for(const object of result)if(object.visible!==false&&object.native.partType!=='normal_part'&&!result.some(other=>other.visible!==false&&inGroup(other,object)&&other.native.partType==='normal_part'))throw new Error(`${object.name} needs a normal part in the same native object group`);
  return result;
}
