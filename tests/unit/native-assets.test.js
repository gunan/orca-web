import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{importNative3MF}from'../../shared/native-project.js';import{extractBoundedZip}from'../../shared/import-limits.js';import{serializeProject,parseProject}from'../../shared/project.js';
import{captureNativeAssets,exportNativeAssets,normalizeNativeAssets,inspectThumbnail,plateAppearanceSignature}from'../../shared/native-assets.js';
const bytes=await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url)),base=importNative3MF(bytes),entries=extractBoundedZip(bytes);
function project(){const p=structuredClone(base);p.nativeAssets=captureNativeAssets(entries,p);return p;}
test('real GUI plate images retain exact bytes through bounded JSON and generate correct native references',()=>{
 const p=project();assert.deepEqual(Object.keys(p.nativeAssets.plates[0].images).sort(),['noLight','pick','small','thumbnail','top']);
 const restored=parseProject(serializeProject(p)),result=exportNativeAssets(restored,restored.plates);assert.equal(result.stale.length,0);
 for(const path of Object.keys(result.files))assert.deepEqual(result.files[path],new Uint8Array(entries[path]));
 assert.equal(Object.keys(result.files).length,4);assert.equal(result.files['Metadata/pick_1.png'],undefined);assert.equal(result.metadata.get('plate-1').pick_file,undefined);
 assert.equal(result.metadata.get('plate-1').thumbnail_no_light_file,'Metadata/plate_no_light_1.png');assert.ok(inspectThumbnail(result.files['Metadata/plate_1.png']).width>0);
});
test('appearance edits invalidate only the affected plate while selection, name and process changes retain render assets',()=>{
 const p=project(),signature=plateAppearanceSignature(p,'plate-1');p.selectedId=null;p.name='Renamed';p.nativeSettings.layer_height='.24';assert.equal(plateAppearanceSignature(p,'plate-1'),signature);
 for(const change of [x=>x.objects[0].position[0]++,x=>x.objects[0].positions[0]++,x=>x.nativeSettings.filament_colour[0]='#000000',x=>x.objects[0].visible=false,x=>x.objects[0].painting={version:1,color:{0:'4'}},x=>x.objects[0].native.partType='negative_part']){const changed=structuredClone(p);change(changed);const result=exportNativeAssets(changed,changed.plates);assert.deepEqual(result.stale,['plate-1']);assert.deepEqual(result.files,{});assert.deepEqual(changed.nativeAssets,p.nativeAssets);}
 assert.equal(Object.keys(exportNativeAssets(p,p.plates).files).length,4);
});
test('selected and reordered plate exports renumber image paths without retaining another plate image',()=>{
 const p=project(),first=p.plates[0];p.plates.push({...structuredClone(first),id:'second',name:'Second'});const other=structuredClone(p.objects[0]);other.id='other';other.plateId='second';p.objects.push(other);p.nativeAssets.plates.push({plateId:'second',signature:plateAppearanceSignature(p,'second'),images:{thumbnail:p.nativeAssets.plates[0].images.thumbnail}});
 const selected=exportNativeAssets(p,[p.plates[1]]);assert.deepEqual(Object.keys(selected.files),['Metadata/plate_1.png']);assert.equal(selected.metadata.get('second').thumbnail_file,'Metadata/plate_1.png');
 const reordered=exportNativeAssets(p,[p.plates[1],first]);assert.ok(reordered.files['Metadata/plate_2_small.png']);assert.ok(!reordered.files['Metadata/plate_1_small.png']);
 p.objects[0].scale[0]=2;const partial=exportNativeAssets(p,p.plates);assert.deepEqual(partial.stale,['plate-1']);assert.deepEqual(Object.keys(partial.files),['Metadata/plate_2.png']);
});
test('missing references produce actionable warnings and unsafe image references reject without filesystem access',()=>{
 const p=project(),missing={...entries};delete missing['Metadata/plate_1.png'];const warnings=[];const assets=captureNativeAssets(missing,p,{warnings});assert.match(warnings.join(' '),/Native thumbnail is missing: Metadata\/plate_1.png/);assert.ok(!assets.plates[0].images.thumbnail);
 for(const path of ['../secret.png','/private/tmp/image.png','https://example.com/test.png','Metadata/../secret.png']){const bad=structuredClone(p);bad.plates[0].native.metadata.thumbnail_file=path;assert.throws(()=>captureNativeAssets(entries,bad),/Unsafe/);}
});
test('malformed base64, unknown image kinds, invalid chunks and image resource bounds fail closed',()=>{
 const p=project();for(const edit of [x=>x.version=2,x=>x.plates.push(structuredClone(x.plates[0])),x=>x.plates[0].images.thumbnail='%%%=',x=>x.plates[0].images.executable='anything',x=>x.plates[0].signature='unchecked']){const bad=structuredClone(p.nativeAssets);edit(bad);assert.throws(()=>normalizeNativeAssets(bad));}
 const png=entries['Metadata/plate_1.png'];assert.throws(()=>inspectThumbnail(png.subarray(0,png.length-1)),/Truncated/);const corrupt=Uint8Array.from(png);corrupt[45]^=1;assert.throws(()=>inspectThumbnail(corrupt),/Invalid/);assert.throws(()=>inspectThumbnail(new Uint8Array(8*1024*1024+1)),/size/);
 assert.throws(()=>inspectThumbnail(Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d494844520000200000002000080600000072aaca590000000949444154789c630000000100015eff7df90000000049454e44ae426082','hex'))),/dimensions/); // Independent Python zlib CRC fixture.
 assert.equal(normalizeNativeAssets(undefined),undefined);
});

test('actual native archive and strict service exports retain image bytes and omit stale or instance-ID picking references',async()=>{
 const{exportNative3MF}=await import('../../shared/native-project.js');const{createNativeProjectService}=await import('../../server/native-projects.js');const{fixtureCatalog}=await import('../fixtures/native-project-catalog.js');
 const source=project(),service=createNativeProjectService({catalog:fixtureCatalog(source)}),imported=await service.importArchive(bytes),prepared=await service.prepare({project:imported.project,useEmbeddedSettings:true});
 for(const output of [exportNative3MF(source),prepared.bytes]){const files=extractBoundedZip(output);for(const name of ['plate_1','plate_1_small','plate_no_light_1','top_1'])assert.deepEqual(new Uint8Array(files[`Metadata/${name}.png`]),new Uint8Array(entries[`Metadata/${name}.png`]));assert.ok(!files['Metadata/pick_1.png']);const config=new TextDecoder().decode(files['Metadata/model_settings.config']);assert.ok(!config.includes('pick_file'));assert.match(config,/thumbnail_no_light_file/);assert.match(new TextDecoder().decode(files['_rels/.rels']),/metadata\/thumbnail/);const reimported=importNative3MF(output);assert.equal(reimported.nativeImportWarnings.filter(w=>/thumbnail is missing/.test(w)).length,0);}
 const changed=structuredClone(imported.project);changed.objects[0].position[0]+=20;const invalidated=extractBoundedZip((await service.prepare({project:changed,useEmbeddedSettings:true})).bytes);assert.equal(Object.keys(invalidated).filter(name=>name.endsWith('.png')).length,0);assert.doesNotMatch(new TextDecoder().decode(invalidated['Metadata/model_settings.config']),/thumbnail_file|thumbnail_no_light_file|top_file|pick_file/);
});
