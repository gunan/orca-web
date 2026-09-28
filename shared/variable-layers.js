import {plateShrinkageContext} from './plate-shrinkage.js';
import {sceneBounds,transformPositions} from './geometry.js';
import {definitionsByScope} from './profile-settings.js';
import {normalizeHeightRanges} from './height-ranges.js';

// OrcaSlicer 2.4.2, 8500fcd: Slicing.cpp, SlicingAdaptive.cpp,
// PrintObject.cpp:3743,3806, PrintRegion.cpp:71, bbs_3mf.cpp:2824,7482.
export const LAYER_PROFILE_PATH='Metadata/layer_heights_profile.txt';
const EPSILON=.0001,MAX_POINTS=100000,F=Math.fround,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const defaults=Object.fromEntries(Object.values(definitionsByScope).flat().map(d=>[d.key,d.default]));
const array=v=>Array.isArray(v)?v:[v],num=v=>parseFloat(array(v)[0]),bool=v=>[true,1,'1'].includes(array(v)[0]);
const featureKeys=['sparse_infill_filament_id','internal_solid_filament_id','top_surface_filament_id','bottom_surface_filament_id','outer_wall_filament_id','inner_wall_filament_id'];
const groupId=object=>object.native?.groupId||object.id;
export function layerProfileMembers(objects,selectedId){const selected=objects.find(o=>o.id===selectedId);if(!selected)throw new Error('Select an object to edit variable layers');return objects.filter(o=>o.plateId===selected.plateId&&groupId(o)===groupId(selected));}
export function normalizeLayerHeightProfile(value=[],context){
 if(!Array.isArray(value)||value.length>MAX_POINTS*2||value.length%2||value.length>0&&value.length<6)throw new Error('Variable layer profiles need 3–100000 Z/height pairs');
 if(!value.length)return[];
 const result=[...value];for(let i=0;i<result.length;i+=2){const z=result[i],height=result[i+1];if(typeof z!=='number'||!Number.isFinite(z)||z<0||z>1e7||typeof height!=='number'||!Number.isFinite(height)||height<=0||height>1e7)throw new Error('Variable layer profile coordinates and heights must be finite and positive (Z may be zero)');if(i&&z<result[i-2])throw new Error('Variable layer profile Z coordinates must be in ascending order');}
 if(result[0]!==0||result.at(-2)<=0)throw new Error('Variable layer profiles must start at Z=0 and end above zero');
 if(context){
  if(Math.abs(result.at(-2)-context.objectHeight)>.001)throw new Error(`Variable layer profile ends at ${result.at(-2)} mm, but this object is ${context.objectHeight} mm high. Reset or regenerate the profile after changing geometry.`);
  if(result[1]!==context.firstLayerHeight)throw new Error(`Variable layer profile first height must match ${context.firstLayerHeight} mm. Reset or regenerate it after changing the first layer.`);
  for(let i=0;i<result.length;i+=2){const height=result[i+1];if(context.firstLayerFixed&&result[i]<=context.firstLayerHeight&&height===context.firstLayerHeight)continue;if(height<context.minLayerHeight-EPSILON||height>context.maxLayerHeight+EPSILON)throw new Error(`Variable layer heights must be between ${context.minLayerHeight} and ${context.maxLayerHeight} mm for this object`);}
 }
 return result;
}
function regionFromPart(config,object,range){
 const result={...config},mask=Object.fromEntries(featureKeys.map(key=>[key,num(config[key])>0]));
 for(const scope of [object.native?.objectSettings||{},{...object.native?.partSettings,extruder:object.filamentSlot??object.native?.partSettings?.extruder},range||{}]){
  for(const[key,value]of Object.entries(scope)){if(key==='extruder')continue;if(featureKeys.includes(key)){mask[key]=num(value)>0;if(mask[key])result[key]=value;}else result[key]=value;}
  if(num(scope.extruder)>0)for(const key of featureKeys)if(!mask[key])result[key]=scope.extruder;
 }
 return result;
}
export function layerProfileContext(objects,selectedId,settings={}, {filamentCount,materialSettingsComplete=true,plate}={}){
 const members=layerProfileMembers(objects,selectedId),normal=members.filter(o=>o.visible!==false&&(o.native?.partType||'normal_part')==='normal_part');if(!normal.length)throw new Error('Variable layers require a normal part');
 const objectSettings=members[0].native?.objectSettings||{},config={...defaults,...settings,...objectSettings},box=sceneBounds(normal),objectHeight=F(box.size[2]);if(!(objectHeight>0))throw new Error('Variable layers require an object with positive height');
 const layerHeight=num(config.layer_height),raft=num(config.raft_layers)>0,firstLayerHeight=raft?layerHeight:num(config.initial_layer_print_height)>0?num(config.initial_layer_print_height):layerHeight;
 filamentCount??=array(config.filament_diameter).length;const used=new Set();
 function collect(region){const wall=num(region.wall_loops),density=num(region.sparse_infill_density),top=num(region.top_shell_layers),bottom=num(region.bottom_shell_layers),brim=config.brim_type!=='no_brim'&&num(config.brim_width)>0,keys=[];
  if(wall>0||brim){keys.push('outer_wall_filament_id');if(wall>1)keys.push('inner_wall_filament_id');}if(density>0)keys.push('sparse_infill_filament_id');if(density>0||top>0||bottom>0)keys.push('internal_solid_filament_id');if(top>0)keys.push('top_surface_filament_id');if(bottom>0)keys.push('bottom_surface_filament_id');
  for(const key of keys){const slot=num(region[key]);used.add(slot>0&&slot<=filamentCount?slot-1:0);}
 }
 for(const object of normal){collect(regionFromPart({...defaults,...settings},object));for(const range of object.native?.layerConfigRanges||[])if(featureKeys.some(key=>Object.hasOwn(range.settings,key)))collect(regionFromPart({...defaults,...settings},object,range.settings));}
 const at=(key,index)=>num(array(config[key])[index]??array(config[key])[0]);
 function bounds(nozzle){const minimum=at('min_layer_height',nozzle-1),min=minimum===0?.07:Math.max(.01,minimum),maximum=at('max_layer_height',nozzle-1);return{min,max:Math.max(min,maximum===0?.75*at('nozzle_diameter',nozzle-1):maximum)};}
 let minLayerHeight=.01,maxLayerHeight=Infinity;
 if(bool(config.enable_support)||raft||num(config.enforce_support_layers)>0){for(const key of ['support_filament','support_interface_filament']){let nozzle=num(config[key]);if(nozzle>filamentCount)nozzle=1;const b=bounds(nozzle);minLayerHeight=Math.max(minLayerHeight,b.min);maxLayerHeight=Math.min(maxLayerHeight,b.max);}}
 // Preserve native's index convention: collected region IDs are zero-based,
 // and Slicing.cpp passes them to its get_at(idx_nozzle-1) helper unchanged.
 for(const nozzle of used.size?used:[0]){const b=bounds(nozzle);minLayerHeight=Math.max(minLayerHeight,b.min);maxLayerHeight=Math.min(maxLayerHeight,b.max);}
 minLayerHeight=Math.min(minLayerHeight,layerHeight);maxLayerHeight=Math.max(maxLayerHeight,layerHeight);
 if(![firstLayerHeight,layerHeight,minLayerHeight,maxLayerHeight].every(n=>Number.isFinite(n)&&n>0))throw new Error('Variable layers need valid native layer-height and nozzle settings');
 const shrinkage=plateShrinkageContext(objects,members[0].plateId,settings,{filamentCount,materialSettingsComplete,plate});
 return{...shrinkage,objectHeight,firstLayerHeight,firstLayerFixed:!raft,layerHeight,minLayerHeight,maxLayerHeight,normal,minZ:box.min[2],ranges:normalizeHeightRanges(members[0].native?.layerConfigRanges||[],filamentCount)};
}
export function readLayerHeightProfiles(text){
 if(typeof text!=='string'||text.length>16*1024*1024)throw new Error('Variable layer metadata exceeds its limit');const result=new Map();
 for(const line of text.trim().split(/\r?\n/).filter(Boolean)){const match=line.match(/^object_id=([1-9]\d*)\|(.+)$/);if(!match||Number(match[1])>10000||result.has(Number(match[1])))throw new Error('Invalid or duplicate variable layer object index');const values=match[2].split(';');if(values.some(value=>!value.trim()))throw new Error('Missing variable layer profile coordinate');result.set(Number(match[1]),normalizeLayerHeightProfile(values.map(Number)));}return result;
}
export function writeLayerHeightProfiles(groups){const lines=groups.map((value,index)=>{const profile=normalizeLayerHeightProfile(value);return profile.length?`object_id=${index+1}|${profile.map(value=>value.toFixed(6)).join(';')}`:'';}).filter(Boolean);return lines.length?lines.join('\n')+'\n':null;}
export function updateLayerHeightProfile(objects,selectedId,value,settings={},options){const context=layerProfileContext(objects,selectedId,settings,options),profile=normalizeLayerHeightProfile(value,context),members=layerProfileMembers(objects,selectedId);return objects.map(object=>members.includes(object)?{...object,native:{...object.native,layerHeightProfile:[...profile]}}:object);}
export function initialLayerHeightProfile(context){const {firstLayerHeight:h,layerHeight,objectHeight:top,firstLayerFixed}=context;return firstLayerFixed&&h<top?[0,h,h,h,h,layerHeight,top,layerHeight]:[0,h,top/2,layerHeight,top,layerHeight];}

/** Native SlicingAdaptive::prepare/next_layer_height and Slicing.cpp adaptive
 * profile construction. Float32 operations retain native float boundaries. */
export function adaptiveLayerHeightProfile(context,quality=.5){
 if(context.objectHeight<=context.firstLayerHeight)throw new Error('Adaptive layers need an object taller than its first layer');
 if(typeof quality!=='number'||!Number.isFinite(quality)||quality<0||quality>1)throw new Error('Adaptive quality must be between 0 and 1');quality=F(quality);
 const faces=[];
 for(const object of context.normal){const positions=transformPositions(object);for(let i=0;i<positions.length;i+=9){const v=[0,1,2].map(j=>[0,1,2].map(a=>F(positions[i+j*3+a]-(a===2?context.minZ:0))));const a=v[1].map((n,k)=>F(n-v[0][k])),b=v[2].map((n,k)=>F(n-v[0][k])),cross=[F(F(a[1]*b[2])-F(a[2]*b[1])),F(F(a[2]*b[0])-F(a[0]*b[2])),F(F(a[0]*b[1])-F(a[1]*b[0]))],length=F(Math.sqrt(F(F(F(cross[0]*cross[0])+F(cross[1]*cross[1]))+F(cross[2]*cross[2]))));if(!(length>0))continue;const n=cross.map(value=>F(value/length));faces.push({lo:Math.min(...v.map(p=>p[2])),hi:Math.max(...v.map(p=>p[2])),cos:Math.abs(n[2]),sin:F(Math.sqrt(F(F(n[0]*n[0])+F(n[1]*n[1]))))});}}
 faces.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);const {minLayerHeight:min,maxLayerHeight:max,layerHeight:base,firstLayerHeight:first,objectHeight:top}=context;const deviation=F(quality<.5?(1-2*quality)*min+2*quality*base:(1-2*(1-quality))*max+2*(1-quality)*base);
 const slope=face=>Math.min(F(deviation/F(.184)),face.cos>1e-5?F(1.44*deviation*F(Math.sqrt(F(face.sin/face.cos)))):3.4028234663852886e38);let current=0;
 function nextHeight(printZ){let height=F(max),id=current,firstHit=false;for(;id<faces.length;id++){const face=faces[id];if(face.lo>=printZ)break;if(face.hi>printZ){if(!firstHit){firstHit=true;current=id;}if(face.hi<printZ+EPSILON)continue;height=Math.min(height,slope(face));}}height=Math.max(height,F(min));if(height>F(min)){for(;id<faces.length;id++){const face=faces[id];if(face.lo>=F(printZ+height))break;if(face.hi<printZ+EPSILON)continue;const reduced=slope(face),difference=F(face.lo-printZ);if(reduced<difference)height=difference;else if(reduced<height)height=reduced;}height=Math.max(height,F(min));}return height;}
 const profile=[0,first];if(context.firstLayerFixed)profile.push(first,first);let z=first;
 while(z+EPSILON<top){if(profile.length>=MAX_POINTS*2-2)throw new Error('Adaptive profile exceeds the point limit');let height=Math.min(nextHeight(F(z)),F(max));if(profile.at(-1)<height&&height-profile.at(-1)>.04)height=F(profile.at(-1)+.04);else if(profile.at(-1)>height&&profile.at(-1)-height>.04)height=F(profile.at(-1)-.04);for(const range of context.ranges)if(z>=range.minZ&&z<=range.maxZ){height=F(Number(range.settings.layer_height));break;}profile.push(z,height);z+=height;}
 const gap=top-profile.at(-2);if(gap>0)profile.push(top,clamp(gap,min,max));if(profile.length===4)profile.splice(2,0,top/2,profile.at(-1));return normalizeLayerHeightProfile(profile,context);
}

/** Native smooth_height_profile: six biased Gaussian passes, preserving the
 * first layer and optionally preventing any local increase in height. */
export function smoothLayerHeightProfile(value,context,{radius=5,keepMin=false}={}){
 let profile=normalizeLayerHeightProfile(value,context);if(!Number.isInteger(radius)||radius<1||radius>100)throw new Error('Smoothing radius must be an integer from 1 to 100');if(typeof keepMin!=='boolean')throw new Error('Smoothing keep-min must be a boolean');const skip=context.firstLayerFixed?4:0;if(profile.length-skip<6)return profile;
 const sigma=.3*(radius-1)+.8,twice=2*sigma*sigma,kernel=Array.from({length:radius*2+1},(_,i)=>1/Math.sqrt(Math.PI*twice)*Math.exp(-((i-radius)**2)/twice)),delta=context.maxLayerHeight-context.minLayerHeight,inv=delta!==0?1/delta:1;
 for(let pass=0;pass<6;pass++){const next=profile.slice(0,skip);for(let i=skip;i<profile.length;i+=2){let weighted=0,total=0;for(let j=Math.max(i-radius*2,skip);j<=Math.min(i+radius*2,profile.length-2);j+=2){if(Math.abs(profile[i]-profile[j])*context.layerHeight<=radius*context.layerHeight){const weight=kernel[radius+(j-i)/2]*Math.sqrt(Math.abs(context.maxLayerHeight-profile[j+1])*inv);weighted+=weight*profile[j+1];total+=weight;}}let height=clamp(total===0?profile[i+1]:weighted/total,context.minLayerHeight,context.maxLayerHeight);if(keepMin)height=Math.min(height,profile[i+1]);next.push(profile[i],height);}profile=next;}
 return normalizeLayerHeightProfile(profile,context);
}
