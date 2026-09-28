import {RAW_CLI_SHRINKAGE_WARNING} from './shrinkage-status.js';
import {definitionsByScope,normalizeNativeProfileValues} from './profile-settings.js';
import objectSchema from './native-object-schema.json' with {type:'json'};
import {meshBounds,sceneBounds,transformPositions} from './geometry.js';
import {decodeFacet} from './facet-codec.js';
import {effectiveHeightRanges} from './height-ranges.js';

// OrcaSlicer 2.4.2 / 8500fcd: Print.cpp:451–545,3290,3851;
// Print.hpp:362,429,942; Model.cpp:2536; PrintObject.cpp:3664;
// PrintRegion.cpp:71; PrintApply.cpp:342,878,957.
// Parsed C++ FloatOrPercent defaults are structured; native config values are serialized scalars.
const defaults=Object.fromEntries(Object.values(definitionsByScope).flat().map(d=>[d.key,d.nativeType==='coFloatOrPercent'&&d.default&&typeof d.default==='object'?`${d.default.value}${d.default.percent?'%':''}`:d.nativeType==='coBool'&&[0,1].includes(d.default)?Boolean(d.default):d.default]));
const list=value=>value==null?[]:Array.isArray(value)?value:[value],num=value=>parseFloat(list(value)[0]),yes=value=>[true,1,'1'].includes(list(value)[0]);
const regionKeys=new Set(objectSchema.region.filter(key=>definitionsByScope.process.some(definition=>definition.key===key)));
const featureKeys=['outer_wall_filament_id','inner_wall_filament_id','sparse_infill_filament_id','internal_solid_filament_id','top_surface_filament_id','bottom_surface_filament_id'];
const role=object=>object.native?.partType||'normal_part',group=object=>object.native?.groupId||object.id;
const MAX_REGIONS=20000,MAX_TRIANGLE_RANGES=4000000,EPSILON=.0001;
function regionConfig(parent,object,count,range){
 const result=Object.fromEntries(Object.entries(parent).filter(([key])=>regionKeys.has(key))),normal=role(object)==='normal_part',mask=Object.fromEntries(featureKeys.map(key=>[key,normal&&num(parent[key])>0]));
 const scopes=[...(normal?[object.native?.objectSettings||{}]:[]),{...object.native?.partSettings,extruder:object.filamentSlot??object.native?.partSettings?.extruder??object.native?.objectSettings?.extruder??1},...(range?[range]:[])];
 for(const scope of scopes){for(const[key,value]of Object.entries(scope)){if(key==='extruder'||!regionKeys.has(key))continue;if(featureKeys.includes(key)){mask[key]=num(value)>0;if(mask[key])result[key]=value;}else result[key]=value;}if(num(scope.extruder)>0)for(const key of featureKeys)if(!mask[key])result[key]=scope.extruder;}
 for(const key of featureKeys)if(!(num(result[key])>0&&num(result[key])<=count))result[key]=1;
 result.sparse_infill_density=num(result.sparse_infill_density)<.00011?0:Math.min(100,num(result.sparse_infill_density));return normalizeNativeProfileValues('process',result);
}
function hasSupport(config){return yes(config.enable_support)||num(config.enforce_support_layers)>0||num(config.raft_layers)>0;}
function hasBrim(config,members){return num(config.raft_layers)<=0&&((config.brim_type!=='no_brim'&&num(config.brim_width)>0)||config.brim_type==='auto_brim'||config.brim_type==='painted'&&members.some(object=>object.brimEars?.length));}
function regionsSlots(region,brim,count){const keys=[],wall=num(region.wall_loops),density=num(region.sparse_infill_density),top=num(region.top_shell_layers),bottom=num(region.bottom_shell_layers);if(wall>0||brim){keys.push(featureKeys[0]);if(wall>1)keys.push(featureKeys[1]);}if(density>0)keys.push(featureKeys[2]);if(density>0||top>0||bottom>0)keys.push(featureKeys[3]);if(top>0)keys.push(featureKeys[4]);if(bottom>0)keys.push(featureKeys[5]);return keys.map(key=>num(region[key])>0&&num(region[key])<=count?num(region[key]):1);}
const intersect=(a,b)=>a&&b&&[0,1,2].every(axis=>a.min[axis]<=b.max[axis]&&b.min[axis]<=a.max[axis]);
const union=(a,b)=>({min:a.min.map((v,i)=>Math.min(v,b.min[i])),max:a.max.map((v,i)=>Math.max(v,b.max[i]))});
const sameRegion=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
// PrintApply partitions Z before constructing regions and checks the projected
// XYZ extents of triangle portions inside each interval, not whole-object boxes.
function rangeBox(points,minZ,maxZ,offset,budget){
 const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let found=false;
 const F=Math.fround,add=p=>{found=true;for(let axis=0;axis<3;axis++){box.min[axis]=Math.min(box.min[axis],p[axis]);box.max[axis]=Math.max(box.max[axis],p[axis]);}};
 for(let index=0;index<points.length;index+=9){if(++budget.visits>MAX_TRIANGLE_RANGES)throw new Error('Layer material context exceeds the triangle/range limit');const vertices=[0,3,6].map(start=>[0,1,2].map(axis=>F(points[index+start+axis])));
  for(let edge=0;edge<3;edge++){let a=vertices[edge],b=vertices[(edge+1)%3];if(a[2]>b[2])[a,b]=[b,a];if(b[2]<=minZ||a[2]>=maxZ)continue;
   const at=z=>{const t=F((z-a[2])/F(b[2]-a[2]));return[F(a[0]+F(F(b[0]-a[0])*t)),F(a[1]+F(F(b[1]-a[1])*t)),F(z)];};
   if(a[2]<minZ){add(at(minZ));add(b[2]>maxZ?at(maxZ):b);}else if(b[2]>maxZ){add(at(maxZ));add(a);}else{add(a);add(b);}
  }
 }
 if(!found)return null;for(let axis=0;axis<3;axis++){const grow=axis===2?EPSILON:offset;box.min[axis]=F(box.min[axis]-grow);box.max[axis]=F(box.max[axis]+grow);}return box;
}
function intervals(members){let end=0;const ranges=[];for(const range of effectiveHeightRanges(members[0].native?.layerConfigRanges||[])){if(range.minZ>end+EPSILON)ranges.push({minZ:end,maxZ:range.minZ});ranges.push(range);end=range.maxZ;}ranges.push({minZ:end,maxZ:Infinity});return ranges;}
function collectRegions(members,config,count,brim,output,budget){
 const ranges=intervals(members),normal=members.filter(object=>role(object)==='normal_part'),minZ=sceneBounds(normal).min[2],painted=members.some(object=>Object.keys(object.painting?.color||{}).length),offset=painted&&count>1?0:Math.max(0,num({...config,...members[0].native?.objectSettings}.xy_contour_compensation)||0);
 const transformed=new Map();if(ranges.length>1)for(const object of members)if(['normal_part','modifier_part'].includes(role(object)))transformed.set(object.id,transformPositions(object));
 for(const range of ranges){const regions=[];for(const object of members){if(!['normal_part','modifier_part'].includes(role(object)))continue;const raw=ranges.length===1?meshBounds(object):rangeBox(transformed.get(object.id),minZ+range.minZ-EPSILON,minZ+range.maxZ+EPSILON,offset,budget);if(!raw)continue;const bbox={min:[...raw.min],max:[...raw.max]};if(ranges.length===1)for(let axis=0;axis<3;axis++){const grow=axis===2?EPSILON:offset;bbox.min[axis]=Math.fround(bbox.min[axis]-grow);bbox.max[axis]=Math.fround(bbox.max[axis]+grow);}
   if(role(object)==='normal_part'){const region=regionConfig(config,object,count,range.settings);regions.push({config:region,bbox,normal:true});regionsSlots(region,brim,count).forEach(slot=>output.add(slot));}
   else {const parents=[...regions].reverse();let added=false,fallback;for(const parent of parents)if(intersect(parent.bbox,bbox)){const region=regionConfig(parent.config,object,count);if(!sameRegion(region,parent.config)){added=true;regions.push({config:region,bbox:union(parent.bbox,bbox),normal:false});regionsSlots(region,brim,count).forEach(slot=>output.add(slot));}else if(!fallback&&parent.normal)fallback=parent;}if(!added&&fallback)regions.push({config:fallback.config,bbox:union(fallback.bbox,bbox),normal:false});}
   if((budget.regions+=regions.length)>MAX_REGIONS)throw new Error('Layer material context exceeds the native-region limit');
  }
 }
}
function paintedSlots(object,count,budget){const slots=new Set();for(const code of Object.values(object.painting?.color||{})){const{tree}=decodeFacet(code,{channel:'color',filamentCount:count,budget});const visit=node=>{if(Object.hasOwn(node,'state')){if(node.state)slots.add(node.state);}else node.children.forEach(visit);};visit(tree);}return slots;}
/** One-based filament slots used by Print::extruders(false), before slicing.
 * This intentionally includes declared volume/range extruders even if no final
 * extrusion uses them. Layer ToolChange events are intentionally excluded. */
export function plateShrinkageContext(objects,plateId,settings={}, {filamentCount,materialSettingsComplete=true,plate}={}){
 if(!materialSettingsComplete)throw new Error('Layer preview needs resolved shrinkage settings for every filament slot');
 const config={...defaults,...settings};if(plate?.native?.metadata?.spiral_mode!==undefined)config.spiral_mode=['true','1',true,1].includes(plate.native.metadata.spiral_mode)?'1':'0';filamentCount??=list(settings.filament_settings_id).length||list(config.filament_diameter).length;if(!Number.isInteger(filamentCount)||filamentCount<1||filamentCount>64)throw new Error('Layer preview needs 1–64 resolved filament slots');
 const groups=new Map();for(const object of objects)if(object.plateId===plateId&&object.visible!==false){const key=group(object);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);}
 const active=[...groups.values()].filter(members=>members[0].printable!==false&&members.some(object=>role(object)==='normal_part'));
 const brim=active.some(members=>hasBrim({...config,...members[0].native?.objectSettings},members)),objectSlots=new Set(),supportSlots=new Set(),budget={nodes:0,regions:0,visits:0};let currentSupport=false;
 for(const members of active){const objectConfig={...config,...members[0].native?.objectSettings};collectRegions(members,config,filamentCount,brim,objectSlots,budget);
  for(const object of members)if(['normal_part','modifier_part'].includes(role(object))){const slot=num(object.filamentSlot??object.native?.partSettings?.extruder)||num(object.native?.objectSettings?.extruder)||1;if(!Number.isInteger(slot)||slot<1||slot>filamentCount)throw new Error('An object references an unresolved filament slot');objectSlots.add(slot);for(const value of paintedSlots(object,filamentCount,budget))objectSlots.add(value);}
  for(const range of members[0].native?.layerConfigRanges||[]){const slot=num(range.settings.extruder);if(slot>0){if(!Number.isInteger(slot)||slot>filamentCount)throw new Error('A height range references an unresolved filament slot');objectSlots.add(slot);}}
  if(hasSupport(objectConfig))for(const key of ['support_filament','support_interface_filament']){const slot=num(objectConfig[key]);if(slot===0)currentSupport=true;else supportSlots.add(slot>filamentCount?1:slot);}
 }
 if(currentSupport)for(const slot of objectSlots)supportSlots.add(slot);
 const used=new Set([...objectSlots,...supportSlots]),hasTower=yes(config.enable_prime_tower)&&((yes(config.enable_wrapping_detection)&&list(config.wrapping_exclude_area).length>2)||String(config.timelapse_type)==='1'||(!yes(config.spiral_mode)&&filamentCount>1));
 // Native checks the concatenated, not yet deduplicated vector here.
 if(hasTower&&num(config.wipe_tower_filament)>0&&objectSlots.size+supportSlots.size>1){const slot=num(config.wipe_tower_filament);if(!Number.isInteger(slot)||slot>filamentCount)throw new Error('Prime tower references an unresolved filament slot');used.add(slot);}
 const usedFilamentSlots=[...used].sort((a,b)=>a-b),at=(key,slot)=>{const values=list(config[key]),value=num(values[slot-1]??values[0]);if(!Number.isFinite(value)||value<50||value>150)throw new Error(`Layer preview needs valid ${key} percentages for slot ${slot}`);return value;};
 const values=usedFilamentSlots.map(slot=>[at('filament_shrink',slot),at('filament_shrinkage_compensation_z',slot)]),same=values.length>0&&values.every(value=>value[0]===values[0][0]&&value[1]===values[0][1]),shrinkageCompensation=same?[100/values[0][0],100/values[0][0],100/values[0][1]]:[1,1,1];
 return{usedFilamentSlots,shrinkageCompensation,shrinkageCompensationZ:shrinkageCompensation[2],shrinkageDisabledByMixedMaterials:values.length>1&&!same,warnings:shrinkageCompensation.some(value=>value!==1)?[RAW_CLI_SHRINKAGE_WARNING]:[]};
}
