import { definitionsByScope, projectSettingDefinitions } from './profile-settings.js';
const allDefinitions=new Map([...Object.values(definitionsByScope).flat(),...projectSettingDefinitions].map(definition=>[definition.key,definition]));
const vectorTypes=new Set(['coFloats','coInts','coStrings','coBools','coPercents','coEnums']);
// Bundled preset JSON retains a few legacy shapes that the native preset loader
// converts before producing project JSON. Mirror only source-confirmed cases.
export function canonicalPreset(preset){
  const result=structuredClone(preset);
  delete result.adaptive_layer_height;delete result.tree_support_with_infill;delete result.bed_type;
  if(result.wall_infill_order!==undefined){
    const legacy={'inner wall/outer wall/infill':'inner wall/outer wall','infill/inner wall/outer wall':'inner wall/outer wall','outer wall/inner wall/infill':'outer wall/inner wall','infill/outer wall/inner wall':'outer wall/inner wall','inner-outer-inner wall/infill':'inner-outer-inner wall'};
    result.wall_sequence??=legacy[result.wall_infill_order]||result.wall_infill_order;delete result.wall_infill_order;
  }
  for(const[key,value]of Object.entries(result)){
    const definition=allDefinitions.get(key);if(!definition)continue;
    if(vectorTypes.has(definition.nativeType)&&!Array.isArray(value))result[key]=[value];
    else if(!vectorTypes.has(definition.nativeType)&&!['coPoint','coPoints','coPointsGroups'].includes(definition.nativeType)&&Array.isArray(value)){
      if(key==='thumbnails')result[key]=value.join(',');
      else if(value.length===1)result[key]=value[0];
      else throw new Error(`Native preset has an ambiguous scalar value for ${key}`);
    }
  }
  return result;
}
