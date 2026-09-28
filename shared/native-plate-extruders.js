import{decodeFacet}from'./facet-codec.js';
import{instanceFamily,instanceGroups}from'./native-instances.js';
const fields=['support_interface_filament','support_filament','outer_wall_filament_id','inner_wall_filament_id','sparse_infill_filament_id','internal_solid_filament_id','top_surface_filament_id','bottom_surface_filament_id','enable_support','raft_layers','extruder'];
const roles=new Set(['normal_part','modifier_part','negative_part','support_blocker','support_enforcer']);
function configuration(value={},global=false){const out={};for(const key of fields){if(!Object.hasOwn(value,key)){if(global&&key!=='extruder')throw new Error(`Native plate statistics need resolved ${key}`);continue;}const raw=value[key],n=raw===true?1:raw===false?0:Number(raw);if(!Number.isInteger(n)||n<0||n>2147483647)throw new Error(`Invalid native plate statistics ${key}`);out[key]=n;}return out;}
function paintedSlots(part){const out=new Set(),budget={nodes:0};for(const code of Object.values(part.painting?.color||{})){const {tree}=decodeFacet(code,{channel:'color',filamentCount:16,budget});const walk=node=>{if(Object.hasOwn(node,'state')){if(node.state)out.add(node.state);}else for(const child of node.children)walk(child);};walk(tree);}return [...out].sort((a,b)=>a-b);}
/** Descriptor mirrors exportNative3MF's object/volume assignments. The original
 * GUI collection checks only instance 0 of each ModelObject. Other shared
 * instances are not silently treated as independent objects for statistics. */
export function nativePlateExtruderDescriptor(project,settings,{plateId=project.activePlateId,fullProject=project}={}){
 const count=settings.filament_colour?.length;if(!Array.isArray(settings.filament_colour)||count<1||count>256)throw new Error('Native plate statistics need the project filament palette');
 const global=configuration(settings,true),familyOwners=new Map();for(const parts of instanceGroups(fullProject.objects.filter(object=>object.visible!==false)).values()){const family=instanceFamily(parts);if(family&&!familyOwners.has(family))familyOwners.set(family,parts[0].plateId);}
 const objects=[];for(const parts of instanceGroups(project.objects.filter(object=>object.visible!==false&&object.plateId===plateId)).values()){
  const first=parts[0],family=instanceFamily(parts),object=configuration(first.native?.objectSettings),firstSlot=Number(first.filamentSlot??first.native?.partSettings?.extruder)||Number(object.extruder)||1;object.extruder=parts.length===1?firstSlot:Number(object.extruder)||firstSlot;
  const volumes=parts.map(part=>{const type=part.native?.partType||'normal_part';if(!roles.has(type))throw new Error('Unknown native plate statistics volume type');const config=configuration(part.native?.partSettings);config.extruder=Number(part.filamentSlot??config.extruder)||Number(object.extruder)||1;return{type,config,painted:paintedSlots(part)};});
  objects.push({contained:!family||familyOwners.get(family)===plateId,config:object,volumes,ranges:(first.native?.layerConfigRanges||[]).map(range=>configuration(range.settings))});
 }
 const events=(project.plates.find(plate=>plate.id===plateId)?.layerEvents?.items||[]).map(event=>({type:event.type,extruder:event.extruder}));return{global,filamentCount:count,objects,events};
}
/** Direct port of pinned GUI PartPlate::get_extruders(true), with original
 * ModelVolume::get_extruders role/assignment rules and native decoded paint leaves. */
export function nativePlateExtrudersFromDescriptor({global:g,filamentCount,objects,events}){
 if(!objects.length)return [];
 const out=[];let outer=g.outer_wall_filament_id,inner=g.inner_wall_filament_id;if(outer===0)outer=inner;if(inner===0)inner=outer;
 const solid=g.internal_solid_filament_id,top=g.top_surface_filament_id||solid,bottom=g.bottom_surface_filament_id||solid,support=Boolean(g.enable_support||g.raft_layers>0);
 for(const object of objects){if(!object.contained)continue;const c=object.config;
  for(const volume of object.volumes){if(['negative_part','support_blocker','support_enforcer'].includes(volume.type))continue;out.push(...volume.painted);const slot=volume.config.extruder||c.extruder;if((slot??1)>0)out.push(slot??1);}
  for(const range of object.ranges)if(range.extruder>0)out.push(range.extruder);
  const objectSupport=Object.hasOwn(c,'enable_support')||Object.hasOwn(c,'raft_layers')?Boolean(c.enable_support||c.raft_layers>0):support;
  if(objectSupport){if(c.support_interface_filament||g.support_interface_filament)out.push(c.support_interface_filament||g.support_interface_filament);if(c.support_filament||g.support_filament)out.push(c.support_filament||g.support_filament);}
  const objectOuter=c.outer_wall_filament_id||c.inner_wall_filament_id,objectInner=c.inner_wall_filament_id||c.outer_wall_filament_id,objectSolid=c.internal_solid_filament_id;
  for(const value of[objectOuter||outer,objectInner||inner,c.sparse_infill_filament_id||g.sparse_infill_filament_id,objectSolid||solid,c.top_surface_filament_id||objectSolid||top,c.bottom_surface_filament_id||objectSolid||bottom])if(value)out.push(value);
 }
 for(const event of events)if(event.type==='ToolChange'&&event.extruder<=filamentCount)out.push(event.extruder);
 return [...new Set(out)].sort((a,b)=>a-b);
}
export function nativePlateExtruders(project,settings,options){return nativePlateExtrudersFromDescriptor(nativePlateExtruderDescriptor(project,settings,options));}
