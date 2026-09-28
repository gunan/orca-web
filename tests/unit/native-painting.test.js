import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{zipSync,strFromU8,strToU8}from'fflate';
import{importNative3MF,exportNative3MF,validateNativeArchiveSafety}from'../../shared/native-project.js';import{extractBoundedZip}from'../../shared/import-limits.js';import{paintedFacetGeometry,flipPaintingWinding}from'../../shared/facet-painting.js';
test('native 3MF preserves all four painted channels and exact mirrored two-edge subfacets',async()=>{
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),mesh=project.objects[0];mesh.painting={version:1,supports:{0:'0482'},seam:{1:'00443'},color:{2:'00443'},fuzzy:{3:'04403'}};
 for(const mirrored of[false,true]){const object=structuredClone(mesh);if(mirrored){for(let i=0;i<object.positions.length;i+=3)object.positions[i]=20-object.positions[i];for(let i=0;i<object.positions.length;i+=9)for(let axis=0;axis<3;axis++)[object.positions[i+3+axis],object.positions[i+6+axis]]=[object.positions[i+6+axis],object.positions[i+3+axis]];object.painting=flipPaintingWinding(object.painting,object.positions.length/9);assert.throws(()=>exportNative3MF({...project,objects:[object]}),/no longer matches/);delete object.native.meshSource;}
  const bytes=exportNative3MF({...project,objects:[object]}),loaded=importNative3MF(bytes).objects[0];assert.ok(validateNativeArchiveSafety(bytes).checkedFiles>0);for(const channel of['supports','seam','color','fuzzy'])assert.deepEqual(paintedFacetGeometry(loaded,channel),paintedFacetGeometry(object,channel));assert.equal(loaded.painting.supports[0],'0482');assert.equal(loaded.painting.winding,mirrored?-1:1);
 }
});
test('raw 3MF safety gate rejects dangerous malformed native facet trees before the CLI sees them',async()=>{
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));const original=extractBoundedZip(exportNative3MF(project));for(const code of['C','000','0044F','EC','4a']){const entries={...original,'3D/3dmodel.model':strToU8(strFromU8(original['3D/3dmodel.model']).replace('<triangle ','<triangle paint_supports="'+code+'" '))};assert.throws(()=>validateNativeArchiveSafety(zipSync(entries)));assert.throws(()=>importNative3MF(zipSync(entries)));}
});

test('mirrored subfacet regions coexist with centered native brim frames and project persistence',async()=>{
 const {mirrorMesh}=await import('../../shared/geometry-cut.js'),{worldBrimEars}=await import('../../shared/brim-ears.js'),{parseProject,serializeProject}=await import('../../shared/project.js');
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),source=project.objects[0];source.position=[60,70,0];source.painting={version:1,color:{6:'0442'}};source.brimEars=[{position:[20,0,0],radius:4}];source.native.objectSettings.brim_type='painted';
 const mirrored=mirrorMesh(source,'x'),loaded=importNative3MF(exportNative3MF({...project,objects:[mirrored]})).objects[0];
 assert.deepEqual(paintedFacetGeometry(loaded,'color'),paintedFacetGeometry(mirrored,'color'));assert.deepEqual(worldBrimEars(loaded),worldBrimEars(mirrored));assert.deepEqual(parseProject(serializeProject({...project,objects:[mirrored]})).objects[0].painting,mirrored.painting);
 const corrupt={...project,objects:[{...mirrored,painting:{version:1,color:{6:'C'}}}]};assert.throws(()=>serializeProject(corrupt),/Truncated/);assert.throws(()=>parseProject(JSON.stringify(corrupt)),/Truncated/);
});

test('geometry edits preserve valid facet correspondence or clear painting when topology changes',async()=>{
 const {mirrorMesh,cutMesh}=await import('../../shared/geometry-cut.js'),{repairMesh,splitDisconnected}=await import('../../shared/geometry-operations.js'),{updateSceneTransform,duplicateSceneSelection}=await import('../../shared/scene-object-operations.js');
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),source=project.objects[0];source.painting={version:1,supports:{6:'0442'}};
 const moved=updateSceneTransform([source],source.id,{position:[50,50,0],rotation:[0,0,30],scale:[1.2,1,1]});assert.deepEqual(moved[0].painting,source.painting);
 const duplicated=duplicateSceneSelection(moved,source.id);assert.ok(duplicated.objects.every(object=>JSON.stringify(object.painting)===JSON.stringify(source.painting)));
 const mirror=mirrorMesh(source,'x');assert.equal(mirror.painting.winding,-1);assert.equal(mirror.painting.supports[6],'0442');assert.equal(mirrorMesh(mirror,'x').painting.winding,1);
 assert.ok(cutMesh(source,{offset:10}).objects.every(object=>object.painting===undefined));assert.deepEqual(paintedFacetGeometry(splitDisconnected(source)[0],'supports'),paintedFacetGeometry(source,'supports'));assert.deepEqual(paintedFacetGeometry(repairMesh(source).mesh,'supports'),paintedFacetGeometry(source,'supports'));
});

test('project service rejects missing painted filament slots and helper-volume paint',async()=>{
 const {createNativeProjectService}=await import('../../server/native-projects.js'),{fixtureCatalog}=await import('../fixtures/native-project-catalog.js');
 const project=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url))),service=createNativeProjectService({catalog:fixtureCatalog(project)});project.objects[0].position=[50,50,0];project.objects[0].painting={version:1,color:{6:'8'}};
 await assert.rejects(()=>service.prepare({project,useEmbeddedSettings:true}),/filament slot/);
 const helper=structuredClone(project.objects[0]);helper.id='helper';helper.native.partType='modifier_part';helper.painting={version:1,supports:{6:'4'}};delete project.objects[0].painting;project.objects.push(helper);
 await assert.rejects(()=>service.prepare({project,useEmbeddedSettings:true}),/normal part/);
});
