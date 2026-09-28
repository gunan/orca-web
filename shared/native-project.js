import {instanceFamily,assertInstanceFamilies,normalizeInstanceAutoDrop} from './native-instances.js';
import {normalizePurgeSettings,physicalNozzleCount} from './purge-volumes.js';
import {capturePrusaSource,exportPrusaSource,prusaSourceWarnings} from './prusa-provenance.js';
import {captureAuxiliary,exportAuxiliary,captureModelMetadata,normalizeModelMetadata} from './native-auxiliary.js';
import {captureNativeAssets,exportNativeAssets} from './native-assets.js';
import {captureNativeMeshSource,nativeMeshSourceGroup,nativeMatrix12} from './native-mesh-source.js';
import {readNativeEmbossPart,importNativeEmbossMetadata,nativeEmbossXML} from './native-emboss.js';
import {bindGeneratedPatternProject} from './generated-pattern-binding.js';
import {CUT_INFORMATION_PATH,readCutInformation,writeCutInformation} from './cut-metadata.js';
import {LAYER_PROFILE_PATH,readLayerHeightProfiles,writeLayerHeightProfiles,normalizeLayerHeightProfile} from './variable-layers.js';
import {FILAMENT_SEQUENCE_PATH,readFilamentSequences,writeFilamentSequences,decodePrintSequence} from './filament-sequence.js';
import {canonicalPreset} from './canonical-preset.js';
import {PAINT_CHANNELS,decodeFacet,normalizePainting} from './facet-painting.js';
import {HEIGHT_RANGES_PATH,readHeightRanges,writeHeightRanges,normalizeHeightRanges} from './height-ranges.js';
import {BRIM_EARS_PATH,readBrimEars,writeBrimEars,worldBrimEars,transformBrimEars} from './brim-ears.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Matrix4, Vector3 } from 'three';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { createMesh, transformPositions, meshBounds, sceneBounds } from './geometry.js';
import { emptyProject, serializeProject } from './project.js';
import nativeProjectSchema from './native-project-schema.json' with { type: 'json' };
import { assertFileSize, assertTriangleCount, extractBoundedZip, importLimits } from './import-limits.js';

// Format source: OrcaSlicer 2.4.2, commit 8500fcdccaa10b5099ac20d252af3a7c560046f1,
// src/libslic3r/Format/bbs_3mf.cpp and src/slic3r/GUI/PartPlate.{cpp,hpp}.
export const NATIVE_PROJECT_VERSION = '2.4.2';
const MODEL = '3D/3dmodel.model', SETTINGS = 'Metadata/project_settings.config', CONFIG = 'Metadata/model_settings.config';
const EVENTS = 'Metadata/custom_gcode_per_layer.xml';
export const NATIVE_LAYER_EVENT_TYPES = ['ColorChange','PausePrint','ToolChange','Template','Custom','Unknown'];
const EVENT_MODES = ['SingleExtruder','MultiAsSingle','MultiExtruder'];
const UNITS = { micron: .001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const PART_TYPES = new Set(['normal_part', 'negative_part', 'modifier_part', 'support_enforcer', 'support_blocker']);
const SECRET = /^(?:print_host|printhost_apikey|printhost_cafile|printhost_user|printhost_password|printhost_port|printer_access_code|access_code|api_key|auth_token|password|secret|token)$/i;
const META_KEYS = new Set(['name','type','from','instantiation','inherits','setting_id','filament_id','compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition']);
const PART_META = new Set(['name','matrix','source_file','source_object_id','source_volume_id','source_offset_x','source_offset_y','source_offset_z','source_in_inches','source_in_meters','mesh_shared','part_type','volume_type']);
const arr = value => value == null ? [] : Array.isArray(value) ? value : [value];
const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('\n','&#10;').replaceAll('\r','&#13;').replaceAll('\t','&#9;');
const attrs = entries => entries.map(([key,value]) => ` ${key}="${xml(value)}"`).join('');
const metadataXML = settings => Object.entries(settings).map(([key,value]) => {
  if (Array.isArray(value)) throw new Error(`Native object and plate option ${key} must use its serialized scalar representation`);
  return `<metadata key="${xml(key)}" value="${xml(value)}"/>`;
}).join('');
function xmlParse(bytes) {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Native 3MF XML document types and entities are unsupported');
  if (XMLValidator.validate(text) !== true) throw new Error('Native 3MF contains malformed XML');
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false, htmlEntities: true }).parse(text);
}
function xmlRead(bytes, root) {
  const result = xmlParse(bytes);
  if (!result[root]) throw new Error(`Native 3MF is missing its ${root} XML root`);
  return result[root];
}

/** Validate every configuration carrier before handing any 3MF to native code.
 * Never rely on CLI profile overrides to disable an embedded post-process hook. */
export function validateNativeArchiveSafety(input,{limits:options}={}) {
  const limits=importLimits(options);assertFileSize(input.byteLength,limits);
  const entries=extractBoundedZip(input,options);let checkedFiles=0;const paintBudget={nodes:0};
  const empty=value=>value==null || typeof value==='string'&&(value.trim()===''||value.trim()==='""') || Array.isArray(value)&&value.every(empty);
  function check(value,filename,depth=0){
    if(depth>100)throw new Error('3MF configuration nesting limit exceeded');
    if(!value||typeof value!=='object')return;
    for(const[channel,attribute]of Object.entries(PAINT_CHANNELS))if(value[`@_${attribute}`])decodeFacet(value[`@_${attribute}`],{channel,budget:paintBudget});
    if(String(value['@_key']||value['@_opt_key']||'').toLowerCase()==='post_process'&&!empty(value['@_value']??value['#text']))throw new Error(`Native 3MF post_process commands are prohibited (${filename})`);
    for(const [key,child]of Object.entries(value)){
      if(key.toLowerCase()==='post_process'&&!empty(child))throw new Error(`Native 3MF post_process commands are prohibited (${filename})`);
      check(child,filename,depth+1);
    }
  }
  for(const [name,bytes]of Object.entries(entries)){
    if(!/\.(?:json|config|xml|model|rels)$/i.test(name))continue;
    const text=strFromU8(bytes).replace(/^\uFEFF/,'').trim();if(!text)continue;checkedFiles++;
    if(text[0]==='{'||text[0]==='['){let value;try{value=JSON.parse(text);}catch{throw new Error(`Invalid 3MF JSON configuration (${name})`);}check(value,name);}
    else if(text[0]==='<')check(xmlParse(bytes),name);
    else if(/\.json$/i.test(name))throw new Error(`Invalid 3MF JSON configuration (${name})`);
    else if(/\.config$/i.test(name)){
      for(const match of text.matchAll(/^[\t ;]*post_process\s*=\s*([^\r\n]*)/gmi))if(!empty(match[1]))throw new Error(`Native 3MF post_process commands are prohibited (${name})`);
    }
  }
  return {checkedFiles,entryCount:Object.keys(entries).length};
}
function settingsCopy(value = {}, { omitMetadata = false, warnings = [] } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 5000) throw new Error('Invalid native project settings');
  const result = {};
  const scalar = entry => ['string','number','boolean'].includes(typeof entry) && (typeof entry !== 'number' || Number.isFinite(entry)) && String(entry).length <= 2 * 1024 * 1024;
  for (const [key,entry] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(key) || ['__proto__','constructor','prototype'].includes(key)) throw new Error(`Invalid native setting name: ${key}`);
    if (SECRET.test(key)) { warnings.push(`Connection setting ${key} was omitted.`); continue; }
    if (omitMetadata && META_KEYS.has(key)) continue;
    if (!(scalar(entry) || Array.isArray(entry) && entry.length <= 10000 && entry.every(scalar))) throw new Error(`Invalid native setting value: ${key}`);
    result[key] = Array.isArray(entry) ? [...entry] : entry;
  }
  return result;
}
function metadata(node) {
  const result = {};
  for (const entry of arr(node?.metadata)) {
    const key = entry['@_key'];
    if (!key || ['__proto__','constructor','prototype'].includes(key)) throw new Error('Invalid native metadata key');
    result[key] = entry['@_value'] ?? entry['#text'] ?? '';
  }
  return settingsCopy(result);
}
function positiveInt(value, label, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error(`Invalid ${label}`);
  return number;
}
function assignedSlot(part, object) {
  const chosen = [part, object].find(value => value != null && Number(value) !== 0) ?? 1;
  return positiveInt(chosen, 'filament assignment', 64);
}
function transform(value) {
  if (!value) return new Matrix4();
  const v = String(value).trim().split(/\s+/).map(Number);
  if (v.length !== 12 || !v.every(Number.isFinite)) throw new Error('3MF transform needs twelve finite numbers');
  return new Matrix4().set(v[0],v[3],v[6],v[9],v[1],v[4],v[7],v[10],v[2],v[5],v[8],v[11],0,0,0,1);
}
function archivePath(path, current = MODEL) {
  const input = String(path || current);
  if (input.includes('\\') || input.includes('\0')) throw new Error('Unsafe 3MF component path');
  const parts = input.startsWith('/') ? input.slice(1).split('/') : [...current.split('/').slice(0,-1), ...input.split('/')];
  const safe = [];
  for (const part of parts) {
    if (part === '..' || part.includes(':')) throw new Error('Unsafe 3MF component path');
    if (part && part !== '.') safe.push(part);
  }
  return safe.join('/');
}
export function nativeBed(settings) {
  const points = arr(settings?.printable_area).map(point => typeof point === 'string' ? point.split('x').map(Number) : []);
  if (points.length < 3 || points.some(point => point.length !== 2 || !point.every(Number.isFinite))) return null;
  const min = [0,1].map(axis => Math.min(...points.map(point => point[axis]))), max = [0,1].map(axis => Math.max(...points.map(point => point[axis])));
  const width = max[0]-min[0], depth = max[1]-min[1];
  return width > 0 && depth > 0 ? { width, depth, minX: min[0], minY: min[1], height: Number(settings.printable_height) || 250 } : null;
}
export function nativePlateOrigin(index, count, bed) {
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(count) || count < 1 || count > 36 || index >= count) throw new Error('Native projects support 1–36 plates');
  if (count === 1) return [0,0,0];
  if (!bed || !(bed.width > 0) || !(bed.depth > 0)) throw new Error('Multi-plate native projects need valid printable_area dimensions');
  const columns = Math.ceil(Math.sqrt(count));
  return [(index % columns)*bed.width*1.2, -Math.floor(index/columns)*bed.depth*1.2, 0];
}

/** Layer-event text is project data consumed by the slicer, never a host command. */
export function normalizeNativeLayerEvents(value = {mode:'SingleExtruder',items:[]}) {
  if (!value || !EVENT_MODES.includes(value.mode) || !Array.isArray(value.items) || value.items.length > 10000) throw new Error('Invalid native layer-event list');
  const text = entry => typeof entry === 'string' && entry.length <= 1024 * 1024;
  return {mode:value.mode,items:value.items.map(event => {
    if (!event || !NATIVE_LAYER_EVENT_TYPES.includes(event.type) || !Number.isFinite(event.printZ) || event.printZ <= 0 || event.printZ > 10000) throw new Error('Invalid native layer event type or height');
    if (!Number.isInteger(event.extruder) || event.extruder < -1 || event.extruder > 64 || (['ColorChange','ToolChange'].includes(event.type) && event.extruder < 1)) throw new Error('Invalid native layer-event extruder');
    if (!text(event.color ?? '') || !text(event.extra ?? '') || !text(event.gcode ?? '')) throw new Error('Invalid native layer-event text');
    return {printZ:event.printZ,type:event.type,extruder:event.extruder,color:event.color ?? '',extra:event.extra ?? '',...(event.gcode == null ? {} : {gcode:event.gcode})};
  })};
}

function readLayerEvents(bytes,plates) {
  const root=xmlRead(bytes,'custom_gcodes_per_layer'),nodes=arr(root.plate).length?arr(root.plate):[root];
  const seen=new Set();
  for(const node of nodes){
    const number=positiveInt(node.plate_info?.['@_id']||1,'layer-event plate ID',36),plate=plates.find(value=>value.native.number===number);
    if(!plate)throw new Error('Layer events reference a missing native plate');
    if(seen.has(number))throw new Error('Duplicate layer-event plate');seen.add(number);
    const items=arr(node.layer).map(layer=>{
      const old=layer['@_type']==null,gcode=layer['@_gcode']||'';
      const type=old?(gcode==='M600'?'ColorChange':gcode==='M601'?'PausePrint':gcode==='tool_change'?'ToolChange':'Custom'):NATIVE_LAYER_EVENT_TYPES[Number(layer['@_type'])];
      return {printZ:Number(layer['@_top_z']),type,extruder:Number(layer['@_extruder']),color:layer['@_color']||'',extra:old?(type==='PausePrint'?(layer['@_color']||''):type==='Custom'?gcode:''):(layer['@_extra']||''),gcode};
    });
    plate.layerEvents=normalizeNativeLayerEvents({mode:node.mode?.['@_value']||'SingleExtruder',items});
  }
}

function writeLayerEvents(plates,settings) {
  const bodies=[];
  plates.forEach((plate,index)=>{
    if(!plate.layerEvents)return;
    const events=normalizeNativeLayerEvents(plate.layerEvents);
    bodies.push(`<plate><plate_info id="${index+1}"/>${events.items.map(event=>{
      const gcode=event.type==='PausePrint'?(settings.machine_pause_gcode||''):event.type==='Template'?(settings.template_custom_gcode||''):event.type==='ToolChange'?'tool_change':event.extra;
      return `<layer${attrs([['top_z',event.printZ],['type',NATIVE_LAYER_EVENT_TYPES.indexOf(event.type)],['extruder',event.extruder],['color',event.color],['extra',event.extra],['gcode',gcode]])}/>`;
    }).join('')}<mode value="${events.mode}"/></plate>`);
  });
  return bodies.length?strToU8(`<?xml version="1.0" encoding="UTF-8"?><custom_gcodes_per_layer>${bodies.join('')}</custom_gcodes_per_layer>`):null;
}

/** Merge resolved native presets into a project profile. Filament slots retain
 * separate vector entries; printer and process vectors keep their native shape. */
export function nativeSettingsFromSelection({ printer, process, filament, filaments = filament ? [filament] : [] }) {
  if (!printer || !process || !filaments.length) throw new Error('Printer, process and filament settings are required');
  printer=canonicalPreset(printer);process=canonicalPreset(process);filaments=filaments.map(canonicalPreset);
  const result = { ...settingsCopy(printer,{omitMetadata:true}), ...settingsCopy(process,{omitMetadata:true}) };
  const sources = filaments.map(value => settingsCopy(value,{omitMetadata:true}));
  for (const key of new Set(sources.flatMap(value => Object.keys(value)))) {
    const values = sources.map(value => value[key]);
    if (values.some(value => value == null)) throw new Error(`Filament profiles must define the same option: ${key}`);
    if (values.every(Array.isArray)) {
      if (values.some(value => value.length !== 1)) throw new Error(`Filament profile must contain one value per slot: ${key}`);
      result[key] = values.map(value => value[0]);
    }
    else if (values.every(value => !Array.isArray(value))) result[key] = values[0];
    else throw new Error(`Filament option shape differs: ${key}`);
  }
  result.filament_settings_id = filaments.map(value => value.filament_settings_id?.[0] || value.name || 'Filament');
  result.printer_settings_id = printer.printer_settings_id || printer.name;
  result.print_settings_id = process.print_settings_id || process.name;
  // Orca's default purge volumes are 140 mm³ on each side of a change. The
  // each physical nozzle owns a separate filament-slot-square table.
  Object.assign(result,normalizePurgeSettings({},filaments.length,{nozzles:physicalNozzleCount(printer)}));
  result.filament_map = Array(filaments.length).fill('1');
  // ToolOrdering uses this vector length as its filament count, even when
  // bundled material presets omit the project-only visual color field.
  const defaultColor = nativeProjectSchema.options.find(option=>option.key==='filament_colour').default[0];
  result.filament_colour = filaments.map(value=>arr(value.filament_colour)[0] || defaultColor);
  return { ...result, name:'project_settings', version:'2.4.2' };
}

/** Load native Orca/Bambu projects as editable parts using plate-local positions.
 * Native settings are retained, not silently applied to a different printer. */
export function importNative3MF(input, { filename = 'Project.3mf', limits: options } = {}) {
  const limits = importLimits(options); assertFileSize(input.byteLength,limits);
  const entries = extractBoundedZip(input,options), warnings = [];
  if (!entries[MODEL]) throw new Error('3MF has no root model');
  const nativeSettings = entries[SETTINGS] ? settingsCopy(JSON.parse(strFromU8(entries[SETTINGS])),{warnings}) : {};
  const config = entries[CONFIG] ? xmlRead(entries[CONFIG],'config') : {};
  const documents = new Map(), units = new Set(); let sourceTriangles = 0;
  for (const [path,bytes] of Object.entries(entries)) if (/\.model$/i.test(path)) {
    const model = xmlRead(bytes,'model'), unit = model['@_unit'] || 'millimeter';
    if (!(unit in UNITS)) throw new Error(`Unsupported 3MF unit: ${unit}`);
    units.add(unit);
    const objects = new Map();
    for (const object of arr(model.resources?.object)) {
      const id = positiveInt(object['@_id'],'3MF object ID');
      if (objects.has(id)) throw new Error('Duplicate 3MF object ID');
      sourceTriangles += arr(object.mesh?.triangles?.triangle).length; assertTriangleCount(sourceTriangles,limits);
      objects.set(id,object);
    }
    documents.set(path,{model,objects});
  }
  if (units.size !== 1) throw new Error('3MF models with mixed length units are unsupported');
  const unit = UNITS[[...units][0]], root = documents.get(MODEL).model;
  const objectConfig = new Map();
  for (const object of arr(config.object)) {
    const id = positiveInt(object['@_id'],'native object ID');
    if (objectConfig.has(id)) throw new Error('Duplicate native object settings');
    const parts = new Map();
    for (const part of arr(object.part)) {
      const partId = positiveInt(part['@_id'],'native part ID');
      if (parts.has(partId)) throw new Error('Duplicate native part settings');
      const values = metadata(part), partType = part['@_subtype'] || values.part_type || 'normal_part';
      if (!PART_TYPES.has(partType)) throw new Error(`Unsupported native part type: ${partType}`);
      const emboss=readNativeEmbossPart(part,asset=>{const path=asset.replace(/^\//,'');if(path.includes('..')||path.includes('\\')||!entries[path])throw new Error('Native embossed shape has a missing or invalid archive source');return strFromU8(entries[path]);});
      parts.set(partId,{values,partType,emboss});
    }
    if (object.volume) warnings.push('Legacy triangle-range part settings were not restored.');
    objectConfig.set(id,{values:metadata(object),parts});
  }
  const plateNodes = arr(config.plate), memberships = new Map();
  const plates = plateNodes.length ? plateNodes.map((node,index) => {
    const values = metadata(node), number = positiveInt(values.plater_id || index+1,'native plate ID',36);
    for (const instance of arr(node.model_instance)) {
      const m = metadata(instance), objectId = positiveInt(m.object_id,'native plate object ID'), instanceId = Number(m.instance_id ?? 0);
      if (!Number.isInteger(instanceId) || instanceId < 0) throw new Error('Invalid native instance ID');
      const key = `${objectId}:${instanceId}`;
      if (memberships.has(key)) throw new Error('A native model instance belongs to multiple plates');
      memberships.set(key,number);
    }
    return { id:`plate-${number}`,name:values.plater_name || `Plate ${number}`,native:{number,metadata:values},locked:values.locked === 'true' };
  }).sort((a,b)=>a.native.number-b.native.number) : [{ id:'plate-1',name:'Plate 1',native:{number:1,metadata:{}} }];
  if (new Set(plates.map(plate=>plate.id)).size !== plates.length) throw new Error('Duplicate native plate IDs');
  if (entries[EVENTS]) readLayerEvents(entries[EVENTS],plates);
  const sequenceOptions={filamentCount:arr(nativeSettings.filament_settings_id).length||64,nozzleCount:arr(nativeSettings.nozzle_diameter).length||64};
  if(entries[FILAMENT_SEQUENCE_PATH])readFilamentSequences(strFromU8(entries[FILAMENT_SEQUENCE_PATH]),plates,sequenceOptions);
  for(const plate of plates)decodePrintSequence({...nativeSettings,...plate.native?.metadata},sequenceOptions.filamentCount);
  const plateCount = Math.max(...plates.map(plate=>plate.native.number)), bed = nativeBed(nativeSettings), plateByNumber = new Map(plates.map(plate=>[plate.native.number,plate]));
  for (const plate of plates) plate.native.origin = nativePlateOrigin(plate.native.number-1,plateCount,bed);
  const brimEarsByIndex = entries[BRIM_EARS_PATH] ? readBrimEars(strFromU8(entries[BRIM_EARS_PATH])) : new Map();
  const heightRangesByIndex = entries[HEIGHT_RANGES_PATH] ? readHeightRanges(strFromU8(entries[HEIGHT_RANGES_PATH]),arr(nativeSettings.filament_settings_id).length||64) : new Map();
  const layerProfilesByIndex = entries[LAYER_PROFILE_PATH] ? readLayerHeightProfiles(strFromU8(entries[LAYER_PROFILE_PATH])) : new Map();
  const cutInformationByIndex=entries[CUT_INFORMATION_PATH]?readCutInformation(strFromU8(entries[CUT_INFORMATION_PATH])):new Map();
  const nativeObjectIndices = new Map();
  const objects = [], instanceFamilies = new Map(), instanceCounts = new Map(), paintBudget={nodes:0}; let triangles = 0, expansions = 0;
  function expand(path,id,matrix,active,context,depth=0,componentMatrix=new Matrix4()) {
    if (++expansions > 100000) throw new Error('3MF component expansion limit exceeded');
    if (depth>64) throw new Error('3MF component nesting limit exceeded');
    const key=`${path}:${id}`;
    if (active.has(key)) throw new Error('Cyclic 3MF component references');
    const doc=documents.get(path), object=doc?.objects.get(id);
    if (!object) throw new Error(`Missing 3MF component: ${key}`);
    const next = new Set(active); next.add(key);
    if (object.mesh) {
      const vertices=arr(object.mesh.vertices?.vertex).map(vertex=>['x','y','z'].map(axis=>Number(vertex[`@_${axis}`])));
      if (vertices.some(point=>!point.every(Number.isFinite))) throw new Error('3MF contains invalid vertices');
      const faces=arr(object.mesh.triangles?.triangle); triangles+=faces.length; assertTriangleCount(triangles,limits);
      const positions=[]; const mirrored=matrix.determinant()<0, painting={version:1,winding:mirrored?-1:1};
      for (const [faceIndex,face] of faces.entries()) {
        const indices=['v1','v2','v3'].map(name=>Number(face[`@_${name}`]));
        if (indices.some(index=>!Number.isInteger(index)||index<0||index>=vertices.length)) throw new Error('3MF contains invalid triangle indices');
        if(mirrored)[indices[1],indices[2]]=[indices[2],indices[1]];
        for(const index of indices){ const point=new Vector3(...vertices[index]).applyMatrix4(matrix).multiplyScalar(unit);positions.push(point.x,point.y,point.z); }
        for(const[channel,attribute]of Object.entries(PAINT_CHANNELS))if(face[`@_${attribute}`]){painting[channel]||={};painting[channel][faceIndex]=face[`@_${attribute}`];}
      }
      if (!positions.length){if(context.hasCutMetadata)throw new Error('Cut information references an empty native volume');return;}
      const part=context.config?.parts.get(id), partMeta=part?.values || {}, objectMeta=context.config?.values || {};
      const objectSettings=Object.fromEntries(Object.entries(objectMeta).filter(([key])=>!['name','module'].includes(key))), partSettings=Object.fromEntries(Object.entries(partMeta).filter(([key])=>!PART_META.has(key)));
      const filamentSlot=assignedSlot(partSettings.extruder, objectSettings.extruder);
      const name=partMeta.name || object['@_name'] || objectMeta.name || `${filename} part ${objects.length+1}`;
      if (objects.length >= 10000) throw new Error('Native project exceeds the 10000 part limit');
      const mesh=createMesh({name,positions,printable:context.printable,sourceFormat:'3mf',sourceFile:filename,filamentSlot,
        native:{groupId:context.groupId,instanceFamily:context.instanceFamily,instanceAutoDrop:context.autoDrop,objectId:context.id,partId:id,instanceId:context.instanceId,objectName:objectMeta.name || name,partType:part?.partType || 'normal_part',objectSettings,partSettings,...(context.layerHeightProfile?.length&&{layerHeightProfile:[...context.layerHeightProfile]}),...(context.layerConfigRanges?.length&&{layerConfigRanges:structuredClone(context.layerConfigRanges)})},
        ...(Object.keys(PAINT_CHANNELS).some(channel=>painting[channel])&&{painting:normalizePainting(painting,faces.length,{filamentCount:arr(nativeSettings.filament_settings_id).length||16,budget:paintBudget})}),importWarnings:[]});
      let plateNumber=memberships.get(`${context.id}:${context.instanceId}`);
      if (!plateNumber && plates.length>1) {
        const center=meshBounds(mesh).center;
        plateNumber=plates.find(plate=>center[0]>=plate.native.origin[0]+(bed.minX||0)&&center[0]<=plate.native.origin[0]+(bed.minX||0)+bed.width&&center[1]>=plate.native.origin[1]+(bed.minY||0)&&center[1]<=plate.native.origin[1]+(bed.minY||0)+bed.depth)?.native.number;
        if(!plateNumber)warnings.push(`No plate assignment found for ${name}; assigned to first plate.`);
      }
      const plate=plateByNumber.get(plateNumber) || plates[0];mesh.plateId=plate.id;
      for(let offset=0;offset<mesh.positions.length;offset++)mesh.positions[offset]-=plate.native.origin[offset%3];
      Object.assign(mesh.native,importNativeEmbossMetadata(part?.emboss,vertices,matrix,{unit,plateOrigin:plate.native.origin}));
      if(unit===1)mesh.native.meshSource=captureNativeMeshSource(mesh,{vertices,faces,build:context.buildMatrix,component:componentMatrix,plateOrigin:plate.native.origin});
      objects.push(mesh);
    }
    for(const component of arr(object.components?.component)){
      const childPath=component['@_p:path']?archivePath(component['@_p:path'],path):path;
      expand(childPath,positiveInt(component['@_objectid'],'3MF component ID'),matrix.clone().multiply(transform(component['@_transform'])),next,context,depth+1,componentMatrix.clone().multiply(transform(component['@_transform'])));
    }
  }
  for(const item of arr(root.build?.item)){
    const id=positiveInt(item['@_objectid'],'3MF build object ID'),instanceId=instanceCounts.get(id)||0;instanceCounts.set(id,instanceId+1);
    const path=item['@_p:path']?archivePath(item['@_p:path'],MODEL):MODEL;
    const objectKey=JSON.stringify([path,id]);if(!nativeObjectIndices.has(objectKey))nativeObjectIndices.set(objectKey,nativeObjectIndices.size+1);
    if(!instanceFamilies.has(objectKey))instanceFamilies.set(objectKey,crypto.randomUUID());
    const before=objects.length,instanceMatrix=transform(item['@_transform']);
    expand(path,id,instanceMatrix,new Set(),{id,instanceId,instanceFamily:instanceFamilies.get(objectKey),buildMatrix:instanceMatrix,groupId:`native-${id}-${instanceId}`,config:objectConfig.get(id),hasCutMetadata:cutInformationByIndex.has(nativeObjectIndices.get(objectKey)),printable:item['@_printable']!=='0',autoDrop:item['@_auto_drop']===undefined||Boolean(Number.parseInt(item['@_auto_drop'],10)||0),layerConfigRanges:heightRangesByIndex.get(nativeObjectIndices.get(objectKey)),layerHeightProfile:layerProfilesByIndex.get(nativeObjectIndices.get(objectKey))});
    const cutInfo=cutInformationByIndex.get(nativeObjectIndices.get(objectKey));
    if(cutInfo){const parts=objects.slice(before);if([...cutInfo.connectors.keys()].some(index=>index>=parts.length))throw new Error('Cut connector references a missing native volume');for(const [index,part]of parts.entries()){part.native.cutId=structuredClone(cutInfo.cutId);if(cutInfo.connectors.has(index))part.native.cutConnector=structuredClone(cutInfo.connectors.get(index));}}
    const ears=brimEarsByIndex.get(nativeObjectIndices.get(objectKey));
    if(ears?.length){const anchor=objects.slice(before).find(object=>object.native.partType==='normal_part');if(!anchor)throw new Error('Brim ears have no normal part');const origin=plates.find(plate=>plate.id===anchor.plateId).native.origin;anchor.brimEars=transformBrimEars(ears,instanceMatrix).map(ear=>({position:ear.position.map((value,axis)=>value*unit-origin[axis]),radius:ear.radius*unit}));}

  }
  if([...brimEarsByIndex.keys()].some(index=>index>nativeObjectIndices.size))throw new Error('Brim ears reference a missing native object');
  if([...layerProfilesByIndex.keys()].some(index=>index>nativeObjectIndices.size))throw new Error('Variable layer profile references a missing native object');
  if([...heightRangesByIndex.keys()].some(index=>index>nativeObjectIndices.size))throw new Error('Height ranges reference a missing native object');
  if([...cutInformationByIndex.keys()].some(index=>index>nativeObjectIndices.size))throw new Error('Cut information references a missing native object');
  if(!objects.length)throw new Error('Native 3MF contains no buildable triangles');
  const meta=Object.fromEntries(arr(root.metadata).map(value=>[value['@_name'],value['#text']||'']));
  const project={...emptyProject(),name:meta.Title||filename.replace(/\.3mf$/i,''),objects,plates,activePlateId:plates[0].id,selectedId:objects[0].id,metadata:{author:meta.Designer||'',description:meta.Description||''},nativeSettings,
    nativePresetNames:{printer:String(nativeSettings.printer_settings_id||''),process:String(nativeSettings.print_settings_id||''),filaments:arr(nativeSettings.filament_settings_id).map(String)},nativeImportWarnings:[]};
  // Pinned bbs_3mf.cpp:2228-2250 normalizes material IDs and erases a
  // single volume's extruder override on import. Expose the same effective
  // material in the viewport/layer context while retaining source metadata.
  const importedGroups=new Map(),sourceSlotCount=arr(nativeSettings.filament_settings_id).length||Number.MAX_SAFE_INTEGER;
  for(const object of project.objects){const key=object.native.groupId;if(!importedGroups.has(key))importedGroups.set(key,[]);importedGroups.get(key).push(object);}
  for(const members of importedGroups.values())for(const object of members){
    const rawObject=Number(object.native.objectSettings.extruder||0),base=rawObject===0||rawObject>sourceSlotCount?1:rawObject,rawPart=Number(object.native.partSettings.extruder||0);
    object.filamentSlot=members.length===1?base:rawPart===0?base:rawPart>sourceSlotCount?1:rawPart;
  }
  project.nativeLegacySource=capturePrusaSource(entries);
  warnings.push(...prusaSourceWarnings(project.nativeLegacySource));
  project.nativeAssets=captureNativeAssets(entries,project,{warnings});
  project.nativeModelMetadata=captureModelMetadata(meta);
  const relationships=entries['_rels/.rels']?arr(xmlRead(entries['_rels/.rels'],'Relationships').Relationship):[];
  project.nativeAuxiliary=captureAuxiliary(entries,{relations:relationships,warnings});
  if(meta.DesignerCover&&!project.nativeAuxiliary?.files.some(file=>file.path===`Auxiliaries/Model Pictures/${meta.DesignerCover}`))warnings.push(`Project cover attachment is missing: ${meta.DesignerCover}`);
  project.nativeImportWarnings=[...new Set(warnings)];
  return bindGeneratedPatternProject(project);
}

function meshXML(object,id,origin,options,sourceMesh) {
  const painting=normalizePainting(object.painting,object.positions.length/9,options),reversed=painting?.winding===-1;
  const points=sourceMesh?[]:transformPositions(object),vertices=sourceMesh?Array.from({length:sourceMesh.vertices.length/3},(_,i)=>sourceMesh.vertices.slice(i*3,i*3+3)):[],faces=sourceMesh?Array.from({length:sourceMesh.triangles.length/3},(_,i)=>sourceMesh.triangles.slice(i*3,i*3+3)):[],map=new Map();
  for(let offset=0;offset<points.length;offset+=9){const ids=[];for(let v=0;v<3;v++){const point=[0,1,2].map(axis=>points[offset+(reversed?[0,2,1][v]:v)*3+axis]+origin[axis]);if(reversed)point[0]=-point[0];const key=point.join(',');if(!map.has(key)){map.set(key,vertices.length);vertices.push(point);}ids.push(map.get(key));}faces.push(ids);}
  return `<object id="${id}" type="model" name="${xml(object.name)}"><mesh><vertices>${vertices.map(point=>`<vertex x="${point[0]}" y="${point[1]}" z="${point[2]}"/>`).join('')}</vertices><triangles>${faces.map((ids,index)=>`<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"${Object.entries(PAINT_CHANNELS).filter(([channel])=>painting?.[channel]?.[index]).map(([channel,attribute])=>` ${attribute}="${painting[channel][index]}"`).join('')}/>`).join('')}</triangles></mesh></object>`;
}

/** Native settings, plate memberships, object/part overrides and material-slot
 * assignments. Editable surfaces are exported as native object components. */
export function exportNative3MF(project,{settings=project.nativeSettings,allPlates=true,includeWebProject=true}={}){
  const warnings=[],nativeSettings=settingsCopy(settings||{}, {warnings});
  const plates=project.plates.filter(plate=>allPlates||plate.id===project.activePlateId);
  if(!plates.length||plates.length>36)throw new Error('Native projects support 1–36 plates');
  const assets=exportNativeAssets(project,plates,nativeSettings),auxiliary=exportAuxiliary(project.nativeAuxiliary),modelMetadata=normalizeModelMetadata(project.nativeModelMetadata)||{};
  const objects=project.objects.filter(object=>object.visible!==false&&plates.some(plate=>plate.id===object.plateId));
  if(!objects.length)throw new Error('No visible objects to export');
  assertInstanceFamilies(objects);
  const familyExports=new Map(),exportedGroups=[];
  const bed=nativeBed(nativeSettings),groups=new Map(),resources=[],objectSettings=[],build=[],brimGroups=[],heightRangeGroups=[],layerProfileGroups=[],plateObjects=new Map(),paintBudget={nodes:0},embossAssets={};let nextId=1;
  for(const object of objects){const key=JSON.stringify([object.plateId,object.native?.groupId||object.id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(object);}
  for(const parts of groups.values()){
    const first=parts[0],plateIndex=plates.findIndex(plate=>plate.id===first.plateId),origin=nativePlateOrigin(plateIndex,plates.length,bed),family=instanceFamily(parts),previous=family&&familyExports.get(family);
    if(!plateObjects.has(first.plateId))plateObjects.set(first.plateId,[]);
    if(previous){const precise=nativeMeshSourceGroup(parts,origin);if(!precise)throw new Error('Shared native instances require retained model frames');const instanceId=previous.count++;plateObjects.get(first.plateId).push({objectId:previous.objectId,instanceId});const frame=previous.direct?precise.build:precise.build.clone().multiply(previous.sourceBuild.clone().invert()).multiply(previous.emittedBuild);build.push(`<item objectid="${previous.objectId}" transform="${nativeMatrix12(frame)}" printable="${first.printable===false?'0':'1'}" auto_drop="${normalizeInstanceAutoDrop(first.native?.instanceAutoDrop)?'1':'0'}"/>`);continue;}
    const partIds=parts.map(()=>nextId++),objectId=nextId++;exportedGroups.push(parts);if(family)familyExports.set(family,{objectId,count:1});plateObjects.get(first.plateId).push({objectId,instanceId:0});
    const brimWorld=parts.flatMap(worldBrimEars),center=brimWorld.length?sceneBounds(parts.filter(part=>(part.native?.partType||'normal_part')==='normal_part')).center:[0,0,0];
    const nativeCenter=brimWorld.length?center.map((value,axis)=>value+origin[axis]):[0,0,0],meshOrigin=origin.map((value,axis)=>value-nativeCenter[axis]);
    // Native imports recenter volumes without rebasing auxiliary brim points.
    // Emit ears and meshes in one centered object frame, then place the instance.
    brimGroups.push(brimWorld.map(ear=>({...ear,position:ear.position.map((value,axis)=>value+origin[axis]-nativeCenter[axis])})));
    const ranges=normalizeHeightRanges(first.native?.layerConfigRanges||[],arr(nativeSettings.filament_settings_id).length||64);
    for(const part of parts)if(JSON.stringify(normalizeHeightRanges(part.native?.layerConfigRanges||[],arr(nativeSettings.filament_settings_id).length||64))!==JSON.stringify(ranges))throw new Error('Parts of one native object have conflicting height ranges');
    heightRangeGroups.push(ranges);
    const profile=normalizeLayerHeightProfile(first.native?.layerHeightProfile||[]);
    for(const part of parts)if(JSON.stringify(normalizeLayerHeightProfile(part.native?.layerHeightProfile||[]))!==JSON.stringify(profile))throw new Error('Parts of one native object have conflicting variable layer profiles');
    layerProfileGroups.push(profile);
    const precise=nativeMeshSourceGroup(parts,origin,{hasBrim:!!brimWorld.length}),componentXML=[],partsXML=[];
    if(family){const shared=familyExports.get(family);shared.direct=!!precise;shared.sourceBuild=nativeMeshSourceGroup(parts,origin)?.build;shared.emittedBuild=precise?.build||new Matrix4().makeTranslation(...nativeCenter);}
    parts.forEach((part,index)=>{
      const partType=part.native?.partType||'normal_part';if(!PART_TYPES.has(partType))throw new Error(`Unsupported native part type: ${partType}`);
      const slot=assignedSlot(part.filamentSlot ?? part.native?.partSettings?.extruder, part.native?.objectSettings?.extruder);
      const slotCount=arr(nativeSettings.filament_settings_id).length;if(slotCount&&slot>slotCount)throw new Error(`Filament slot ${slot} is missing from native settings`);
      resources.push(meshXML(part,partIds[index],meshOrigin,{filamentCount:slotCount||16,budget:paintBudget},precise?.sources[index]));componentXML.push(`<component objectid="${partIds[index]}"${precise?` transform="${nativeMatrix12(new Matrix4().fromArray(precise.sources[index].component))}"`:part.painting?.winding===-1?' transform="-1 0 0 0 1 0 0 0 1 0 0 0"':''}/>`);
      partsXML.push(`<part id="${partIds[index]}" subtype="${xml(partType)}">${metadataXML({...settingsCopy(part.native?.partSettings||{}),name:part.name,matrix:'1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1',extruder:String(slot)})}${nativeEmbossXML(part,{sourceMesh:precise?.sources[index],origin:meshOrigin,reversed:part.painting?.winding===-1,assetName:`Metadata/emboss-${partIds[index]}.svg`,writeAsset:(name,source)=>{embossAssets[name]=strToU8(source);}})}</part>`);
    });
    const values={...settingsCopy(first.native?.objectSettings||{}),name:first.native?.objectName||first.name,extruder:String(parts.length===1?assignedSlot(first.filamentSlot??first.native?.partSettings?.extruder,first.native?.objectSettings?.extruder):first.native?.objectSettings?.extruder||first.filamentSlot||1)};
    for(const part of parts)if(JSON.stringify(settingsCopy(part.native?.objectSettings||{}))!==JSON.stringify(settingsCopy(first.native?.objectSettings||{})))throw new Error('Parts of one native object have conflicting object settings');
    resources.push(`<object id="${objectId}" type="model" name="${xml(values.name)}"><components>${componentXML.join('')}</components></object>`);
    if(parts.some(part=>(part.printable!==false)!==(first.printable!==false)))throw new Error('Parts of one native object have conflicting printable flags');
    objectSettings.push(`<object id="${objectId}">${metadataXML(values)}${partsXML.join('')}</object>`);build.push(`<item objectid="${objectId}"${precise?` transform="${nativeMatrix12(precise.build)}"`:brimWorld.length?` transform="1 0 0 0 1 0 0 0 1 ${nativeCenter.join(' ')}"`: ''} printable="${first.printable===false?'0':'1'}" auto_drop="${normalizeInstanceAutoDrop(first.native?.instanceAutoDrop)?'1':'0'}"/>`);
  }
  const plateXML=plates.map((plate,index)=>`<plate>${metadataXML({...Object.fromEntries(Object.entries(settingsCopy(plate.native?.metadata||{})).filter(([key])=>!['gcode_file','thumbnail_file','top_file','pick_file','pattern_bbox_file','no_light_thumbnail_file','thumbnail_no_light_file'].includes(key))),...assets.metadata.get(plate.id),plater_id:index+1,plater_name:plate.name,locked:plate.locked?'true':'false'})}${(plateObjects.get(plate.id)||[]).map(({objectId,instanceId})=>`<model_instance>${metadataXML({object_id:objectId,instance_id:instanceId,identify_id:objectId})}</model_instance>`).join('')}</plate>`).join('');
  const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"><metadata name="Application">OrcaWeb</metadata><metadata name="OrcaSlicer">${NATIVE_PROJECT_VERSION}</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">${xml(project.name)}</metadata><metadata name="Designer">${xml(project.metadata?.author||'')}</metadata><metadata name="Description">${xml(project.metadata?.description||'')}</metadata>${Object.entries(modelMetadata).map(([key,value])=>`<metadata name="${xml(key)}">${xml(value)}</metadata>`).join('')}<resources>${resources.join('')}</resources><build>${build.join('')}</build></model>`;
  const fallbackCover=Object.keys(assets.files).find(path=>/^Metadata\/plate_\d+\.png$/.test(path));
  const cover=auxiliary.covers.cover||fallbackCover,smallCover=auxiliary.covers.small||(!auxiliary.covers.cover&&fallbackCover&&assets.files[fallbackCover.replace('.png','_small.png')]?fallbackCover.replace('.png','_small.png'):undefined),middleCover=auxiliary.covers.middle||(!auxiliary.covers.cover?fallbackCover:undefined);
  const coverRelations=[['cover',cover,'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail'],['cover-small',smallCover,'http://schemas.bambulab.com/package/2021/cover-thumbnail-small'],['cover-middle',middleCover,'http://schemas.bambulab.com/package/2021/cover-thumbnail-middle']].filter(([,path])=>path).map(([id,path,type])=>`<Relationship Target="/${xml(path)}" Id="${id}" Type="${type}"/>`).join('');
  const auxiliaryTypes=[...new Set(Object.keys(auxiliary.files).map(path=>path.split('.').at(-1).toLowerCase()).filter(ext=>/^[a-z0-9]{1,16}$/.test(ext)&&!['rels','model','png','config','json'].includes(ext)))].map(ext=>`<Default Extension="${ext}" ContentType="application/octet-stream"/>`).join('');
  const files={
    ...assets.files,...auxiliary.files,
    '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="json" ContentType="application/json"/>'+auxiliaryTypes+'</Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'+coverRelations+'</Relationships>'),
    [MODEL]:strToU8(model),[CONFIG]:strToU8(`<?xml version="1.0" encoding="UTF-8"?><config>${objectSettings.join('')}${plateXML}<assemble/></config>`)
  };
  if(Object.keys(nativeSettings).length)files[SETTINGS]=strToU8(JSON.stringify({...nativeSettings,name:'project_settings',version:nativeSettings.version||NATIVE_PROJECT_VERSION}));
  const legacyFiles=exportPrusaSource(project.nativeLegacySource);
  for(const[name,bytes]of Object.entries(legacyFiles)){if(Object.hasOwn(files,name))throw new Error('Prusa provenance archive collision');files[name]=bytes;}
  Object.assign(files,embossAssets);
  const cutData=writeCutInformation(exportedGroups);if(cutData)files[CUT_INFORMATION_PATH]=strToU8(cutData);
  const profileData=writeLayerHeightProfiles(layerProfileGroups);if(profileData)files[LAYER_PROFILE_PATH]=strToU8(profileData);
  const heightData=writeHeightRanges(heightRangeGroups,arr(nativeSettings.filament_settings_id).length||64);if(heightData)files[HEIGHT_RANGES_PATH]=strToU8(heightData);
  const brimData=writeBrimEars(brimGroups);if(brimData)files[BRIM_EARS_PATH]=strToU8(brimData);
  const sequences=writeFilamentSequences(plates,{filamentCount:arr(nativeSettings.filament_settings_id).length||64,nozzleCount:arr(nativeSettings.nozzle_diameter).length||64});if(sequences)files[FILAMENT_SEQUENCE_PATH]=strToU8(sequences);
  const events=writeLayerEvents(plates,nativeSettings);if(events)files[EVENTS]=events;
  if(includeWebProject)files['Metadata/orca-web.json']=strToU8(serializeProject({...project,nativeSettings}));
  return zipSync(files,{level:6});
}
