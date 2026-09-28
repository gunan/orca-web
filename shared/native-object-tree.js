import {instanceGroups,instanceFamily,instanceGroupKey} from './native-instances.js';
import {definitionsByScope} from './profile-settings.js';
import schema from './native-object-schema.json' with {type:'json'};
import resetSchema from './native-tree-reset-keys.json' with {type:'json'};
import {selectSceneIds,selectedSceneIds} from './multi-selection.js';
const definitions=new Map(definitionsByScope.process.map(d=>[d.key,d]));
const objectKeys=new Set([...schema.object,...schema.region]),partKeys=new Set(schema.region),printKeys=new Set(resetSchema.keys);
const restrictedRoles=new Set(['negative_part','support_enforcer','support_blocker']);
const volumeIcons={normal_part:'menu_add_part',negative_part:'menu_add_negative',modifier_part:'menu_add_modifier',support_enforcer:'menu_support_enforcer',support_blocker:'menu_support_blocker'};
export function nativeTreeCategoryExcluded(category,filamentCount=1,isObject=true){return !category||filamentCount===1&&['Extruders','Wipe options'].includes(category)||!isObject&&category==='Support material';}
/** GUI_Factories::get_bundle, active NEW_OBJECT_SETTING branch. */
export function nativeTreeSettingsCategories(settings={}, {kind='object',role='normal_part',filamentCount=1,parentSettings={}}={}) {
 if(kind!=='object'&&restrictedRoles.has(role))return[];
 const allowed=kind==='object'?objectKeys:partKeys,categories=new Set();
 for(const key of Object.keys(settings)){
  if(!allowed.has(key)&&!(kind==='layer'&&key==='layer_height'))continue;
  if(kind==='layer'&&key==='layer_height'&&Number(settings[key])===Number(parentSettings[key]))continue;
  const category=definitions.get(key)?.category;
  if(nativeTreeCategoryExcluded(category,filamentCount,kind==='object'))continue;
  categories.add(category);
 }
 return [...categories].sort();
}
// cutConnector is only retained for processed native connector volumes.
export function nativeTreeShowsVolumes(parts){
 if(parts.length<2)return false;
 if(!parts.some(p=>p.native?.cutId))return true;
 const visible=parts.filter(p=>!p.native?.cutConnector);
 return visible.length>1||visible.some(p=>(p.native?.partType||'normal_part')!=='normal_part');
}
export function nativeTreeInstanceLabel(index,plateIndex,{renumbered=false}={}){return `${renumbered&&plateIndex>0?`[P${plateIndex}]`:''}Instance ${index+1}`;}
function plateLabel(plate,index){const label=`Plate ${index+1}`,custom=plate.native?.metadata?.plater_name??(plate.name===label?'':plate.name);return custom?`${label} (${custom})`:label;}
const painted=(parts,channel)=>parts.some(part=>Object.keys(part.painting?.[channel]||{}).length>0);
function volumeIcon(part,role){const suffix={normal_part:'part',negative_part:'negative',modifier_part:'modifier'}[role];return suffix&&part.native?.textConfiguration?`add_text_${suffix}`:suffix&&part.native?.embossShape?.svg?`svg_${suffix}`:volumeIcons[role];}
/** A ModelObject owns shared volumes and linked instance rows. Plate membership
 * here follows saved assignments, not PartPlate's geometric outside-set. */
export function nativeObjectTree(project,{filamentCount=1,globalSettings={}}={}){
 const plates=project.plates.map((plate,index)=>({id:`plate:${plate.id}`,kind:'plate',label:plateLabel(plate,index),plateId:plate.id,children:[]}));
 const outside={id:'plate:outside',kind:'outside',label:'Outside',children:[]},families=new Map();
 for(const parts of instanceGroups(project.objects).values()){
  const family=instanceFamily(parts),key=family?`family:${family}`:`group:${instanceGroupKey(parts[0])}`;
  if(!families.has(key))families.set(key,[]);families.get(key).push(parts);
 }
 for(const [key,instances]of families){
  const parts=instances[0],first=parts[0],id=`object:${key}`,label=first.native?.objectName||first.name;
  const base={objectId:first.id,plateId:first.plateId,familyKey:key,instanceIds:instances.map(p=>p.map(v=>v.id))};
  const objectFilament=Number(first.native?.objectSettings?.extruder??1),parentSettings={...globalSettings,...first.native?.objectSettings};
  const categories=nativeTreeSettingsCategories(first.native?.objectSettings,{filamentCount});
  const node={...base,id,kind:'object',label,printable:instances.some(p=>p[0].printable!==false),categories,filament:objectFilament,variableHeight:(first.native?.layerHeightProfile?.length||0)>4,supportPaint:painted(parts,'supports'),colorPaint:painted(parts,'color'),children:[]};
  const connectors=parts.flatMap((part,index)=>part.native?.cutConnector?[index]:[]);
  if(first.native?.cutId&&parts.length>1&&connectors.length)node.children.push({...base,id:`${id}:connectors`,kind:'connectors',label:'Cut connectors',volumeIndices:connectors,icon:'cut_connectors',children:[]});
  if(nativeTreeShowsVolumes(parts))for(const [index,part]of parts.entries()){
   if(first.native?.cutId&&part.native?.cutConnector)continue;
   const role=part.native?.partType||'normal_part',rawFilament=Number(part.native?.partSettings?.extruder??part.filamentSlot??0);
   node.children.push({...base,id:`${id}:volume:${part.id}`,kind:'volume',label:part.name,objectId:part.id,volumeIndex:index,role,icon:volumeIcon(part,role),filament:restrictedRoles.has(role)?null:rawFilament|| (role==='modifier_part'?'default':objectFilament),categories:nativeTreeSettingsCategories(part.native?.partSettings,{kind:'volume',role,filamentCount}),children:[]});
  }
  const ranges=first.native?.layerConfigRanges||[];
  if(ranges.length){
   const root={...base,id:`${id}:layers`,kind:'layers',label:'Layers',icon:'height_range_modifier',children:[]};
   const sorted=ranges.map((range,index)=>({range,index})).sort((a,b)=>a.range.minZ-b.range.minZ||a.range.maxZ-b.range.maxZ);
   for(const {range,index:rangeIndex}of sorted)if(Object.hasOwn(range.settings,'extruder'))root.children.push({...base,id:`${id}:layer:${range.minZ}:${range.maxZ}`,kind:'layer',label:`Range ${range.minZ.toFixed(2)}-${range.maxZ.toFixed(2)} (mm)`,icon:'height_range_layer',rangeIndex,categories:nativeTreeSettingsCategories(range.settings,{kind:'layer',filamentCount,parentSettings}),filament:Number(range.settings.extruder),children:[]});
   node.children.push(root);
  }
  if(instances.length>1)node.children.push({...base,id:`${id}:instances`,kind:'instances',label:'Instances',children:instances.map((members,index)=>({...base,id:`${id}:instance:${instanceGroupKey(members[0])}`,kind:'instance',label:nativeTreeInstanceLabel(index,project.plates.findIndex(p=>p.id===members[0].plateId)),plateNumber:project.plates.findIndex(p=>p.id===members[0].plateId)+1,objectId:members[0].id,plateId:members[0].plateId,instanceIndex:index,printable:members[0].printable!==false,children:[]}))});
  (plates.find(p=>p.plateId===first.plateId)||outside).children.push(node);
 }
 return [...plates,outside];
}
export function flattenNativeTree(nodes){return nodes.flatMap(node=>[node,...flattenNativeTree(node.children)]);}
function currentNode(project,node){const current=flattenNativeTree(nativeObjectTree(project)).find(n=>n.id===node.id);if(!current||current.objectId!==node.objectId)throw new Error('The object tree changed; select the object again');return current;}
function activeMembers(project,node){const instances=node.instanceIds||[],chosen=instances.find(ids=>ids.includes(project.selectedId))||instances.find(ids=>project.objects.find(o=>o.id===ids[0])?.plateId===project.activePlateId)||instances[0];return chosen||[];}
export function nativeTreeSelectionIds(project,node){
 if(!node.instanceIds)return[];
 if(node.kind==='instance')return node.instanceIds[node.instanceIndex];
 const members=activeMembers(project,node);
 if(node.kind==='volume')return[members[node.volumeIndex]];
 if(node.kind==='connectors')return node.volumeIndices.map(index=>members[index]);
 const plateId=project.objects.find(o=>o.id===members[0])?.plateId;
 return node.instanceIds.flat().filter(id=>project.objects.find(o=>o.id===id)?.plateId===plateId);
}
export function nativeTreeNodeSelected(project,node){
 if(['plate','outside','layers','layer','instances'].includes(node.kind))return false;
 const ids=nativeTreeSelectionIds(project,node),selected=new Set(selectedSceneIds(project,{scope:project.selectionScope||'object'}));
 if(node.kind==='instance'&&node.instanceIds.length>1&&node.instanceIds.flat().every(id=>selected.has(id)))return false;
 return ids.length>0&&ids.every(id=>selected.has(id))&&(['volume','connectors'].includes(node.kind)?project.selectionScope==='part':project.selectionScope!=='part');
}
export function setNativeTreePrintable(project,node,printable){
 if(typeof printable!=='boolean'||!['object','instance'].includes(node.kind))throw new Error('Select an object or instance printability control');
 const current=currentNode(project,node),ids=new Set(current.kind==='object'?current.instanceIds.flat():current.instanceIds[current.instanceIndex]);
 return {...project,nativeWorkflow:true,objects:project.objects.map(o=>ids.has(o.id)?{...o,printable}:o)};
}
export function selectNativeTreeNode(project,node,{mode='replace'}={}){
 const current=currentNode(project,node);
 if(['plate','outside'].includes(current.kind))return current.plateId?{...project,activePlateId:current.plateId,selectedId:null,selectedIds:[],selectionFrame:null}:project;
 const ids=nativeTreeSelectionIds(project,current),object=project.objects.find(o=>o.id===ids[0]);
 if(!object)throw new Error('The selected native tree object no longer exists');
 return selectSceneIds({...project,activePlateId:object.plateId},ids,{scope:['volume','connectors'].includes(current.kind)?'part':'object',mode:project.activePlateId===object.plateId?mode:'replace'});
}
/** TabPrintModel::reset_model_config erases intersection(Preset::print_options,
 * scope keys). It retains extruder and object-only keys stored on a part by
 * process-settings Paste. TabPrintLayer restores its parent's layer_height. */
export function resetNativeTreeSettings(project,node,{globalSettings={}}={}){
 const current=currentNode(project,node);if(!['object','volume','layer'].includes(current.kind)||restrictedRoles.has(current.role))throw new Error('This tree row has no editable process settings');
 const field=current.kind==='object'?'objectSettings':'partSettings',allowed=current.kind==='object'?objectKeys:partKeys;
 const erase=settings=>Object.fromEntries(Object.entries(settings||{}).filter(([key])=>!(printKeys.has(key)&&(allowed.has(key)||current.kind==='layer'&&key==='layer_height'))));
 const ids=new Set(current.kind==='volume'?current.instanceIds.map(members=>members[current.volumeIndex]):current.instanceIds.flat());
 const objects=project.objects.map(object=>{
  if(!ids.has(object.id))return object;
  const native={...object.native};
  if(current.kind==='layer'){
   const inherited=object.native?.objectSettings?.layer_height??globalSettings.layer_height;
   if(!Number.isFinite(Number(inherited))||Number(inherited)<=0)throw new Error('Resolve the parent layer height before resetting this range');
   native.layerConfigRanges=object.native.layerConfigRanges.map((range,index)=>index===current.rangeIndex?{...range,settings:{...erase(range.settings),layer_height:String(inherited)}}:range);
  }else native[field]=erase(native[field]);
  return {...object,native};
 });
 return {...project,nativeWorkflow:true,objects};
}

/** Native context Hide/Show is viewport visibility, independent of printing. */
export function nativeTreeHasVisible(project,node){const ids=new Set(nativeTreeSelectionIds(project,node));return project.objects.some(object=>ids.has(object.id)&&object.visible!==false);}
export function setNativeTreeVisible(project,node,visible){
 if(typeof visible!=='boolean'||!['object','volume','instance','connectors'].includes(node.kind))throw new Error('Select an object, part or instance visibility action');
 const ids=new Set(nativeTreeSelectionIds(project,currentNode(project,node)));
 return {...project,objects:project.objects.map(object=>ids.has(object.id)?{...object,visible}:object)};
}
