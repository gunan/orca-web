import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8,strFromU8} from 'fflate';
import {normalizeHeightRanges,effectiveHeightRanges,readHeightRanges,writeHeightRanges,updateHeightRanges,heightRangeSettingDefinitions,heightRangeLayerBounds,HEIGHT_RANGES_PATH} from '../../shared/height-ranges.js';
import {importNative3MF,exportNative3MF,validateNativeArchiveSafety} from '../../shared/native-project.js';
import {extractBoundedZip} from '../../shared/import-limits.js';
import {updateNativePart,normalizeNativeParts} from '../../shared/native-object-settings.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {assertNativeProjectConfiguration} from '../../server/native-preflight.js';
import {fixtureCatalog} from '../fixtures/native-project-catalog.js';
import {makeNativeAcceptanceProject} from '../fixtures/native-project.js';
const fixture=await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)),base=importNative3MF(fixture);
const range=(minZ=0,maxZ=4,settings={})=>({minZ,maxZ,settings:{layer_height:'.2',extruder:'0',...settings}});
const canonical=value=>normalizeHeightRanges(value);
function archived(change){const files=extractBoundedZip(fixture);change(files);return zipSync(files);}
function grouped(){const project=makeNativeAcceptanceProject(base);project.nativeSettings={...project.nativeSettings,filament_settings_id:['Red','Blue']};return project;}

test('height ranges normalize native scalar/vector settings, expose only region controls plus mandatory layer height, and sort natively',()=>{
 const normalized=canonical([range(4,8,{sparse_infill_density:'42%',wall_loops:5}),range(0,4)]);assert.deepEqual(normalized.map(r=>[r.minZ,r.maxZ]),[[0,4],[4,8]]);assert.equal(normalized[1].settings.sparse_infill_density,'42%');assert.equal(normalized[1].settings.wall_loops,'5');
 assert.equal(heightRangeSettingDefinitions.length,148);for(const key of ['wall_loops','layer_height','sparse_infill_density','outer_wall_speed'])assert.ok(heightRangeSettingDefinitions.some(d=>d.key===key));for(const key of ['travel_speed','enable_support','post_process'])assert.ok(!heightRangeSettingDefinitions.some(d=>d.key===key));
});
test('native overlaps trim later ranges rather than merge settings, including identical starts and fully covered ranges',()=>{
 const result=effectiveHeightRanges([range(2,8,{wall_loops:5}),range(8,10),range(3,6,{wall_loops:7}),range(0,4,{outer_wall_speed:30})]);assert.deepEqual(result.map(r=>[r.minZ,r.maxZ]),[[0,4],[4,8],[8,10]]);assert.equal(result[0].settings.wall_loops,undefined);assert.equal(result[1].settings.outer_wall_speed,undefined);
 assert.deepEqual(effectiveHeightRanges([range(0,2),range(2.00001,4)]).map(r=>[r.minZ,r.maxZ]),[[0,2],[2,4]]);
 assert.deepEqual(effectiveHeightRanges([range(2,6),range(2,4)]).map(r=>[r.minZ,r.maxZ]),[[2,4],[4,6]]);assert.deepEqual(effectiveHeightRanges([range(0,2),range(2,2.00001)]).map(r=>[r.minZ,r.maxZ]),[[0,2]]);
});
test('range validation rejects unsafe numbers, duplicate bounds, host scripts, global controls and missing layer heights',()=>{
 for(const value of [[range(-1,2)],[range(2,2)],[range(0,Infinity)],[range('0',2)],[range(0,1),range(0,1)],[{minZ:0,maxZ:2,settings:{}}],[range(0,2,{layer_height:0})],[range(0,2,{post_process:'echo unsafe'})],[range(0,2,{travel_speed:50})],[range(0,2,{wall_loops:2.5})],[range(0,2,{extruder:2})]])assert.throws(()=>normalizeHeightRanges(value,1));
 assert.throws(()=>canonical(Array.from({length:1025},(_,i)=>range(i,i+1))),/1024/);
});
test('range layer-height bounds follow native extruder fallback and zero maximum uses 75 percent nozzle',()=>{
 const printer={nozzle_diameter:['.4'],min_layer_height:['.07'],max_layer_height:['0']};assert.deepEqual(heightRangeLayerBounds(printer,5),{min:.07,max:.30000000000000004});
 assert.throws(()=>normalizeHeightRanges([range(0,2,{layer_height:'.05'})],1,{printer}),/between/);assert.throws(()=>normalizeHeightRanges([range(0,2,{layer_height:'.31'})],1,{printer}),/between/);assert.equal(normalizeHeightRanges([range(0,2)],1,{printer})[0].settings.layer_height,'0.2');
});
test('XML roundtrip uses 1-based model-object indices, preserves gaps and rejects malformed or hostile metadata',()=>{
 const text=writeHeightRanges([[],[range(4,8,{wall_loops:4}),range(0,3)],[]]);assert.match(text,/<object id="2">/);assert.deepEqual(readHeightRanges(text).get(2),canonical([range(0,3),range(4,8,{wall_loops:4})]));assert.equal(writeHeightRanges([[],[]]),null);
 for(const text of ['<!DOCTYPE objects [<!ENTITY x "bad">]><objects/>','<objects><object id="1"/><object id="1"/></objects>','<objects><object id="0"/></objects>','<objects><object id="1"><range min_z="" max_z="2"/></object></objects>','<objects><object id="1"><range min_z="0" max_z="2"><option opt_key="layer_height">.2</option><option opt_key="post_process">bad</option></range></object></objects>'])assert.throws(()=>readHeightRanges(text));
});
test('native range metadata attaches to whole model objects, not component resource IDs, and remaps selected plates',()=>{
 let project=grouped();project.objects=updateHeightRanges(project.objects,'base',[range(0,4,{wall_loops:5})],2);project.objects=updateHeightRanges(project.objects,'second',[range(2,6,{outer_wall_speed:30})],2);
 const bytes=exportNative3MF(project),text=strFromU8(extractBoundedZip(bytes)[HEIGHT_RANGES_PATH]);assert.match(text,/<object id="1">/);assert.match(text,/<object id="3">/);assert.doesNotMatch(text,/<object id="2">/);
 const imported=importNative3MF(bytes);for(const name of ['Red main','Through hole','Dense corner'])assert.deepEqual(imported.objects.find(o=>o.name===name).native.layerConfigRanges,canonical([range(0,4,{wall_loops:5})]));assert.equal(imported.objects.find(o=>o.name==='Blue part').native.layerConfigRanges,undefined);
 assert.ok(!imported.nativeImportWarnings.some(w=>w.includes('layer_config_ranges')));
 const active=importNative3MF(exportNative3MF({...project,activePlateId:'plate-2'},{allPlates:false}));assert.deepEqual(active.objects[0].native.layerConfigRanges,canonical([range(2,6,{outer_wall_speed:30})]));
});
test('all instances of one native model object inherit its indexed ranges',()=>{
 const result=importNative3MF(archived(files=>{files[HEIGHT_RANGES_PATH]=strToU8(writeHeightRanges([[range()]]));files['3D/3dmodel.model']=strToU8(strFromU8(files['3D/3dmodel.model']).replace('</build>','<item objectid="2" transform="1 0 0 0 1 0 0 0 1 40 0 0"/></build>'));}));assert.equal(result.objects.length,2);assert.notEqual(result.objects[0].native.groupId,result.objects[1].native.groupId);assert.deepEqual(result.objects.map(o=>o.native.layerConfigRanges),[canonical([range()]),canonical([range()])]);
 assert.throws(()=>importNative3MF(archived(files=>{files[HEIGHT_RANGES_PATH]=strToU8(writeHeightRanges([[],[range()]]));})),/missing native object/);
});
test('regrouping adopts the target height ranges and detached copies retain independent values',()=>{
 let project=grouped();project.objects=updateHeightRanges(project.objects,'base',[range()],2);const edited=updateNativePart(project.objects,'hole',{groupId:'blue'});assert.deepEqual(edited.find(o=>o.id==='hole').native.layerConfigRanges,[]);assert.equal(edited.find(o=>o.id==='base').native.layerConfigRanges.length,1);
 const split=updateNativePart(project.objects,'modifier',{groupId:'new',partType:'normal_part'});assert.deepEqual(split.find(o=>o.id==='modifier').native.layerConfigRanges,canonical([range()]));split.find(o=>o.id==='modifier').native.layerConfigRanges[0].settings.wall_loops='8';assert.equal(project.objects.find(o=>o.id==='base').native.layerConfigRanges[0].settings.wall_loops,undefined);
 project.objects.find(o=>o.id==='hole').native.layerConfigRanges=[];assert.throws(()=>normalizeNativeParts(project.objects,2),/share/);assert.throws(()=>exportNative3MF(project),/conflicting height/);
});
test('server sanitizes and preserves ranges, validates nozzle bounds and rejects hidden host hooks',async()=>{
 const service=createNativeProjectService({catalog:fixtureCatalog(base)});let project=structuredClone(base);project.objects=updateHeightRanges(project.objects,project.objects[0].id,[range(0,4,{wall_loops:5})]);const prepared=await service.prepare({project,useEmbeddedSettings:true});assert.deepEqual(importNative3MF(prepared.bytes).objects[0].native.layerConfigRanges,canonical([range(0,4,{wall_loops:5})]));
 for(const settings of [{layer_height:'.9'},{layer_height:'.2',post_process:'bad'},{layer_height:'.2',extruder:'2'}]){const invalid=structuredClone(project);invalid.objects[0].native.layerConfigRanges[0].settings=settings;await assert.rejects(service.prepare({project:invalid,useEmbeddedSettings:true}));}
 const malicious=archived(files=>{files[HEIGHT_RANGES_PATH]=strToU8('<objects><object id="1"><range min_z="0" max_z="2"><option opt_key="post_process">never run</option></range></object></objects>');});assert.throws(()=>validateNativeArchiveSafety(malicious),/post_process commands are prohibited/);
});
test('structural preflight validates effective ranged settings after ordinary part settings',()=>{
 const project=structuredClone(base),settings={...base.nativeSettings,spiral_mode:'1',wall_loops:'1',top_shell_layers:'0',sparse_infill_density:'0%',enable_support:'0',enforce_support_layers:'0'};project.objects[0].native.layerConfigRanges=canonical([range(2,4,{wall_loops:4})]);assert.throws(()=>assertNativeProjectConfiguration({project,settings}),/height 2–4.*exactly one wall/);
});
