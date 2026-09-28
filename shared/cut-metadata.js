import {XMLParser,XMLValidator} from 'fast-xml-parser';
// OrcaSlicer 2.4.2 / 8500fcd: bbs_3mf.cpp:2559,7419; ObjectID.hpp:133;
// Model.hpp:248,820. The archive stores processed meshes, not connector plans.
export const CUT_INFORMATION_PATH='Metadata/cut_information.xml';
export const CUT_CONNECTOR_TYPES=['plug','dowel','snap'];
const maximum=(1n<<64n)-1n;
const arr=value=>value==null?[]:Array.isArray(value)?value:[value];
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function integer(value,label,{positive=false}={}){
  if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);
  if(typeof value!=='string'||!/^\d{1,20}$/.test(value)||BigInt(value)>maximum||positive&&BigInt(value)===0n)throw new Error(`Invalid cut ${label}: expected ${positive?'positive ':''}unsigned 64-bit integer`);
  return BigInt(value).toString();
}
export function normalizeCutId(value){
  if(value==null)return null;
  if(!plain(value)||Object.keys(value).some(key=>!['id','checkSum','connectorsCount'].includes(key)))throw new Error('Invalid native cut identity');
  return{id:integer(value.id,'identity',{positive:true}),checkSum:integer(value.checkSum,'checksum'),connectorsCount:integer(value.connectorsCount,'connector count')};
}
export function normalizeCutConnector(value){
  if(value==null)return null;
  if(!plain(value)||Object.keys(value).some(key=>!['type','radiusTolerance','heightTolerance'].includes(key))||!CUT_CONNECTOR_TYPES.includes(value.type))throw new Error('Invalid native cut connector type');
  for(const key of ['radiusTolerance','heightTolerance'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>1e7)throw new Error('Cut connector tolerances must be finite non-negative distances within the geometry limit');
  return{type:value.type,radiusTolerance:value.radiusTolerance,heightTolerance:value.heightTolerance};
}
export function normalizedCutMetadata(native={}){
  const cutId=normalizeCutId(native.cutId),cutConnector=normalizeCutConnector(native.cutConnector);
  if(cutConnector&&!cutId)throw new Error('Cut connector requires its native object cut identity');
  if(cutConnector&&!['normal_part','negative_part'].includes(native.partType||'normal_part'))throw new Error('Cut connectors must be normal or negative parts');
  return{...(cutId&&{cutId}),...(cutConnector&&{cutConnector})};
}
function index(value,label,minimum=1){
  if(typeof value!=='string'||!/^\d+$/.test(value))throw new Error(`Invalid cut ${label}`);
  const result=Number(value);if(!Number.isInteger(result)||result<minimum||result>=10000+minimum)throw new Error(`Invalid cut ${label}`);return result;
}
function distance(value){if(typeof value!=='string'||!value.trim())throw new Error('Missing cut connector tolerance');return Number(value);}
export function readCutInformation(text){
  if(typeof text!=='string'||text.length>16*1024*1024)throw new Error('Cut information exceeds its metadata limit');
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('Invalid cut information XML');
  const document=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false}).parse(text);
  if(!Object.hasOwn(document,'objects'))throw new Error('Cut information is missing its objects root');
  const result=new Map();
  for(const node of arr(document.objects?.object)){
    const id=index(node['@_id'],'object index');if(result.has(id))throw new Error('Duplicate cut object index');
    if(Array.isArray(node.cut_id)||!node.cut_id)throw new Error('Cut object requires one cut identity');
    const source=node.cut_id,cutId=normalizeCutId({id:source['@_id'],checkSum:source['@_check_sum'],connectorsCount:source['@_connectors_cnt']}),connectors=new Map();
    for(const group of arr(node.connectors))for(const entry of arr(group?.connector)){
      const volume=index(entry['@_volume_id'],'connector volume index',0);if(connectors.has(volume))throw new Error('Duplicate cut connector volume index');
      const type=entry['@_type'];if(!/^[012]$/.test(type||''))throw new Error('Invalid native cut connector type');
      connectors.set(volume,normalizeCutConnector({type:CUT_CONNECTOR_TYPES[Number(type)],radiusTolerance:distance(entry['@_r_tolerance']),heightTolerance:distance(entry['@_h_tolerance'])}));
    }
    result.set(id,{cutId,connectors});
  }
  return result;
}
export function cutInformationForParts(parts){
  const entries=parts.map(part=>normalizedCutMetadata(part.native)),cutId=entries[0]?.cutId||null;
  if(entries.some(entry=>JSON.stringify(entry.cutId||null)!==JSON.stringify(cutId)))throw new Error('Parts of one native object have conflicting cut identities');
  return cutId?{cutId,connectors:new Map(entries.flatMap((entry,index)=>entry.cutConnector?[[index,entry.cutConnector]]:[]))}:null;
}
export function writeCutInformation(groups){
  const objects=groups.map((parts,index)=>{
    const info=cutInformationForParts(parts);if(!info)return'';
    const {id,checkSum,connectorsCount}=info.cutId;
    return `<object id="${index+1}"><cut_id id="${id}" check_sum="${checkSum}" connectors_cnt="${connectorsCount}"/>${info.connectors.size?`<connectors>${[...info.connectors].map(([volume,connector])=>`<connector volume_id="${volume}" type="${CUT_CONNECTOR_TYPES.indexOf(connector.type)}" r_tolerance="${connector.radiusTolerance}" h_tolerance="${connector.heightTolerance}"/>`).join('')}</connectors>`:''}</object>`;
  }).join('');
  return objects?`<?xml version="1.0" encoding="UTF-8"?><objects>${objects}</objects>`:null;
}
/** Native invalidate_cut() clears identity and flags; it keeps the meshes.
 * Use this explicitly for changed membership or geometry with no correspondence. */
export function invalidateCutMetadata(native){
  if(!native)return native;const result=structuredClone(native);delete result.cutId;delete result.cutConnector;return result;
}
export function invalidateCutFamily(objects,selectedIds){
  const chosen=new Set(selectedIds),families=new Set(objects.filter(object=>chosen.has(object.id)&&object.native?.cutId).map(object=>normalizeCutId(object.native.cutId).id));
  return objects.map(object=>chosen.has(object.id)||families.has(object.native?.cutId?.id)?{...object,native:invalidateCutMetadata(object.native)}:object);
}
