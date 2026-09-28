import {selectedSceneIds} from './multi-selection.js';
import {nativeGroupId,normalizeObjectSettings,normalizeNativeParts} from './native-object-settings.js';
import {normalizeHeightRanges,updateHeightRanges} from './height-ranges.js';
const group=object=>JSON.stringify([object.plateId,nativeGroupId(object)]);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function members(project,scope){const ids=new Set(selectedSceneIds(project,{scope}));return project.objects.filter(object=>ids.has(object.id));}
function destinations(project,scope){const selected=members(project,scope);if(scope==='part')return selected;const seen=new Set();return selected.filter(object=>{const key=group(object);if(seen.has(key))return false;seen.add(key);return true;});}
export function captureProcessClipboard(project,{scope=project.selectionScope||'object',filamentCount=64}={}){
 const targets=destinations(project,scope);if(targets.length!==1)throw new Error('Select one object or part to copy process settings');
 const source=targets[0],settings={...source.native?.objectSettings,...(scope==='part'?source.native?.partSettings:{})};
 return {version:1,kind:scope,settings:normalizeObjectSettings(settings,filamentCount)};
}
export function processClipboardAvailability(project,clipboard,{scope=project.selectionScope||'object'}={}){
 if(!plain(clipboard)||clipboard.version!==1||!['object','part'].includes(clipboard.kind)||!plain(clipboard.settings))return'Copy process settings first';
 if(clipboard.kind!==scope)return`Select ${clipboard.kind==='object'?'objects':'parts'} to paste these process settings`;
 const targets=destinations(project,scope);if(!targets.length)return'Select a destination';if(targets.length>256)return'Paste process settings into at most256 destinations';return null;
}
export function prepareProcessSettingsPaste(project,clipboard,globalSettings,{scope=project.selectionScope||'object',filamentCount=64}={}){
 const error=processClipboardAvailability(project,clipboard,{scope});if(error)throw new Error(error);
 const targets=destinations(project,scope).map(object=>({id:object.id,kind:scope,settings:normalizeObjectSettings(object.native?.[scope==='part'?'partSettings':'objectSettings']||{},filamentCount),parentSettings:scope==='part'?normalizeObjectSettings(object.native?.objectSettings||{},filamentCount):{}}));
 return{scope,targets,request:{clipboard:{version:1,kind:scope,settings:normalizeObjectSettings(clipboard.settings,filamentCount)},targets:targets.map(({id,...target})=>target),globalSettings:structuredClone(globalSettings),filamentCount}};
}
export function applyProcessSettingsPaste(project,prepared,result){
 if(result?.settingsClipboardVersion!==1||!Array.isArray(result.settings)||result.settings.length!==prepared.targets.length)throw new Error('Invalid native process clipboard result');
 const updates=new Map();prepared.targets.forEach((target,index)=>{
  const original=project.objects.find(object=>object.id===target.id);if(!original)throw new Error('Process settings destination is missing');
  const settings=normalizeObjectSettings(result.settings[index],prepared.request.filamentCount);
  if(settings.extruder!==target.settings.extruder)throw new Error('Native process clipboard changed the destination filament');
  updates.set(prepared.scope==='part'?original.id:group(original),settings);
 });
 const key=prepared.scope==='part'?'partSettings':'objectSettings';
 const objects=project.objects.map(object=>{const settings=updates.get(prepared.scope==='part'?object.id:group(object));return settings?{...object,native:{...object.native,[key]:structuredClone(settings)}}:object;});
 const normalized=normalizeNativeParts(objects,prepared.request.filamentCount);
 return{...project,objects:objects.map((object,index)=>object===project.objects[index]?object:normalized[index]),nativeWorkflow:true};
}
// GUI_ObjectList::copy_layers_to_clipboard preserves accumulated selections;
// copying the layer root replaces the cache. std::map::emplace on Paste keeps
// an existing destination range when the two bounds are identical.
export function captureLayerClipboard(ranges,previous=null,{indices=null,filamentCount=64}={}){
 const normalized=normalizeHeightRanges(ranges,filamentCount),root=indices===null;
 if(!root&&(!Array.isArray(indices)||!indices.length||indices.some(index=>!Number.isInteger(index)||index<0||index>=normalized.length)))throw new Error('Choose valid height ranges to copy');
 const cache=new Map((root?[]:previous?.version===1&&previous.kind==='layers'?normalizeHeightRanges(previous.ranges,filamentCount):[]).map(range=>[JSON.stringify([range.minZ,range.maxZ]),range]));
 for(const range of root?normalized:indices.map(index=>normalizeHeightRanges([ranges[index]],filamentCount)[0]))cache.set(JSON.stringify([range.minZ,range.maxZ]),structuredClone(range));
 return{version:1,kind:'layers',ranges:normalizeHeightRanges([...cache.values()],filamentCount)};
}
export function pasteLayerClipboard(objects,selectedId,clipboard,filamentCount=64,{printer}={}){
 if(clipboard?.version!==1||clipboard.kind!=='layers'||!Array.isArray(clipboard.ranges)||!clipboard.ranges.length)throw new Error('Copy height ranges first');
 const selected=objects.find(object=>object.id===selectedId);if(!selected)throw new Error('Select an object for height ranges');
 const merged=new Map(normalizeHeightRanges(selected.native?.layerConfigRanges||[],filamentCount).map(range=>[JSON.stringify([range.minZ,range.maxZ]),range]));
 for(const range of normalizeHeightRanges(clipboard.ranges,filamentCount)){const key=JSON.stringify([range.minZ,range.maxZ]);if(!merged.has(key))merged.set(key,structuredClone(range));}
 return updateHeightRanges(objects,selectedId,[...merged.values()],filamentCount,{printer});
}
