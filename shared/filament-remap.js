import {decodeFacet,encodeFacet,normalizePainting} from './facet-codec.js';
const groupId=object=>object.native?.groupId||object.id;
const normal=object=>(object.native?.partType||'normal_part')==='normal_part';
const baseSlot=object=>Number(object.filamentSlot)||Number(object.native?.partSettings?.extruder)||Number(object.native?.objectSettings?.extruder)||1;
function members(objects,selectedId){const selected=objects.find(object=>object.id===selectedId);if(!selected||!normal(selected))throw new Error('Choose a normal part to remap filaments');return objects.filter(object=>object.plateId===selected.plateId&&groupId(object)===groupId(selected));}
function visit(tree,fn){if(Object.hasOwn(tree,'state'))fn(tree);else tree.children.forEach(child=>visit(child,fn));}
export function usedPaintFilaments(objects,selectedId,{filamentCount=16}={}){
 const used=new Set();for(const object of members(objects,selectedId).filter(normal)){used.add(baseSlot(object));const painting=normalizePainting(object.painting||{version:1},object.positions.length/9,{filamentCount});for(const code of Object.values(painting.color||{}))visit(decodeFacet(code,{channel:'color',filamentCount}).tree,leaf=>{if(leaf.state)used.add(leaf.state);});}
 return[...used].filter(slot=>slot>=1&&slot<=Math.min(filamentCount,16)).sort((a,b)=>a-b);
}
/** Apply a simultaneous native slot mapping to selected-object normal volumes.
 * Slot zero remains the unpainted/base state. Geometry and other channels retain
 * exact correspondence; explicit and inherited native extruders stay coherent. */
export function remapPaintFilaments(objects,selectedId,mapping,{filamentCount=16}={}){
 if(!Number.isInteger(filamentCount)||filamentCount<1||filamentCount>64)throw new Error('Invalid filament count');
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||![Object.prototype,null].includes(Object.getPrototypeOf(mapping)))throw new Error('Filament mapping must be an object');
 const maximum=Math.min(filamentCount,16),map={};for(const[source,destination]of Object.entries(mapping)){const from=Number(source);if(!/^\d+$/.test(source)||!Number.isInteger(from)||from<1||from>maximum||!Number.isInteger(destination)||destination<1||destination>maximum)throw new Error(`Filament remap slots must be between 1 and ${maximum}`);map[from]=destination;}
 const group=members(objects,selectedId),ids=new Set(group.map(object=>object.id)),first=group.find(normal),objectSettings=first.native?.objectSettings||{},fallback=Number(objectSettings.extruder)||1,mappedFallback=map[fallback]??fallback;
 const signature=JSON.stringify(Object.entries(objectSettings).sort());if(group.some(object=>JSON.stringify(Object.entries(object.native?.objectSettings||{}).sort())!==signature))throw new Error('Native object parts have inconsistent inherited settings');
 let changedParts=0,changedFacets=0;const next=objects.map(object=>{
  if(!ids.has(object.id))return object;
  let result=object;
  if(mappedFallback!==fallback)result={...result,native:{...result.native,objectSettings:{...objectSettings,extruder:String(mappedFallback)}}};
  if(!normal(object))return result;
  const slot=baseSlot(object),nextSlot=map[slot]??slot,painting=normalizePainting(object.painting||{version:1},object.positions.length/9,{filamentCount}),color={...painting.color};let painted=false;
  for(const[index,code]of Object.entries(color)){const tree=decodeFacet(code,{channel:'color',filamentCount}).tree;let changed=false;visit(tree,leaf=>{if(leaf.state&&map[leaf.state]!==undefined&&map[leaf.state]!==leaf.state){leaf.state=map[leaf.state];changed=true;}});if(changed){color[index]=encodeFacet(tree,{channel:'color',filamentCount});changedFacets++;painted=true;}}
  if(painted)result={...result,painting:{...painting,color}};
  if(nextSlot!==slot){result={...result,filamentSlot:nextSlot};const explicit=Number(object.native?.partSettings?.extruder);if(explicit>0)result.native={...result.native,partSettings:{...object.native.partSettings,extruder:String(map[explicit]??explicit)}};}
  if(result!==object)changedParts++;return result;
 });
 return{objects:next,selectedId,report:{changedParts,changedFacets,sourceSlots:usedPaintFilaments(objects,selectedId,{filamentCount})}};
}
