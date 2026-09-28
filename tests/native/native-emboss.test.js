import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectSlicer,runSlicer} from '../../server/slicer.js';
import {createPresetCatalog} from '../../server/presets.js';
import {createNativeProjectService} from '../../server/native-projects.js';
import {importNative3MF} from '../../shared/native-project.js';
import {parseProject,serializeProject} from '../../shared/project.js';
import {meshBounds} from '../../shared/geometry.js';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {updateSceneTransform} from '../../shared/scene-object-operations.js';
import {meshPointMatrix} from '../../shared/brim-ears.js';
import {Matrix4} from 'three';
const binary=process.env.ORCA_SLICER_BIN||(process.platform==='darwin'?'/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer':'orca-slicer');
const motions=code=>code.split(/\r?\n/).map(line=>line.split(';',1)[0].trim().replace(/\s+/g,' ')).filter(line=>/^G(?:0?[0123])(?:\s|$)/.test(line));
async function slice(root,label,bytes,signal){
 const directory=path.join(root,label),output=path.join(directory,'output');await mkdir(output,{recursive:true});await mkdir(path.join(directory,'config'));const file=path.join(directory,'text.3mf');await writeFile(file,bytes);
 await runSlicer(binary,['--slice','0','--arrange','0','--orient','0','--datadir',path.join(directory,'config'),'--outputdir',output,file],{cwd:directory,timeoutMs:90000,signal});
 const names=(await readdir(output)).filter(name=>name.endsWith('.gcode'));assert.deepEqual(names,['plate_1.gcode']);return readFile(path.join(output,names[0]),'utf8');
}
// Fresh GUI fixtures were saved at the bed edge, and their file-local preset
// names carry a suffix while compatible_printers retains the unsuffixed name.
// Independently move the native build instance 100 mm in XY and remove only
// stale compatibility plumbing; leave all native mesh/text/config values intact.
function independentReference(bytes){
 const zip=unzipSync(bytes),key='3D/3dmodel.model';let count=0;
 zip[key]=strToU8(strFromU8(zip[key]).replace(/(<item\b[^>]*\btransform=")([^"]+)(")/g,(_,before,matrix,after)=>{const a=matrix.split(/\s+/).map(Number);assert.equal(a.length,12);a[9]+=100;a[10]+=100;count++;return before+a.join(' ')+after;}));assert.equal(count,1);
 const settings=JSON.parse(strFromU8(zip['Metadata/project_settings.config']));
 for(const key of ['compatible_printers','compatible_printers_condition','compatible_prints','compatible_prints_condition','print_compatible_printers','printer_compatible_prints'])delete settings[key];
 zip['Metadata/project_settings.config']=strToU8(JSON.stringify(settings));return zipSync(zip);
}
for(const mode of ['planar','surface'])test(`native GUI ${mode} text retains exact printable motions through validated web JSON and native 3MF roundtrip`,{timeout:180000},async t=>{
 const engine=await inspectSlicer(binary);assert.equal(engine.available,true,engine.error);assert.match(engine.version,/^OrcaSlicer-2\.4\.2(?:\b|$)/);
 const directory=await mkdtemp(path.join(tmpdir(),'orca-native-emboss-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const fixture=await readFile(new URL(`../fixtures/native-text-${mode}-2.4.2.3mf`,import.meta.url)),catalog=await createPresetCatalog({binary}),service=createNativeProjectService({catalog}),imported=await service.importArchive(fixture);
 assert.deepEqual(imported.project.nativeUnsupportedSettings,[]);
 imported.project.objects=updateSceneTransform(imported.project.objects,imported.project.objects[0].id,{position:[100,100,0]});
 const restored=parseProject(serializeProject(imported.project)),original=restored.objects.find(object=>object.native.textConfiguration);assert.ok(original);assert.equal(original.native.embossShape.useSurface,mode==='surface');
 const prepared=await service.prepare({project:restored,useEmbeddedSettings:true}),nativeAgain=importNative3MF(prepared.bytes),text=nativeAgain.objects.find(object=>object.native.textConfiguration);
 assert.deepEqual(text.native.textConfiguration,original.native.textConfiguration);assert.deepEqual({...text.native.embossShape,frame:null},{...original.native.embossShape,frame:null});const expectedFrame=meshPointMatrix(original).multiply(new Matrix4().fromArray(original.native.embossShape.frame)).elements,actualFrame=meshPointMatrix(text).multiply(new Matrix4().fromArray(text.native.embossShape.frame)).elements;actualFrame.forEach((value,index)=>assert.ok(Math.abs(value-expectedFrame[index])<.00002));assert.ok(Math.abs(meshBounds(text).min[2]-19.985)<.00002);
 const reference=await slice(directory,'original-gui',independentReference(fixture),t.signal),actual=await slice(directory,'web-roundtrip',prepared.bytes,t.signal),expected=motions(reference),observed=motions(actual);
 assert.ok(expected.length>1000);if(process.env.ORCA_EMBOSS_CAPTURE_DIR){await mkdir(process.env.ORCA_EMBOSS_CAPTURE_DIR,{recursive:true});await writeFile(path.join(process.env.ORCA_EMBOSS_CAPTURE_DIR,mode+'-reference.gcode'),reference);await writeFile(path.join(process.env.ORCA_EMBOSS_CAPTURE_DIR,mode+'-roundtrip.gcode'),actual);await writeFile(path.join(process.env.ORCA_EMBOSS_CAPTURE_DIR,mode+'-reference.3mf'),independentReference(fixture));await writeFile(path.join(process.env.ORCA_EMBOSS_CAPTURE_DIR,mode+'-roundtrip.3mf'),prepared.bytes);}const first=expected.findIndex((line,index)=>line!==observed[index]);assert.equal(first,-1,`${mode}: first mismatch ${first}, reference ${expected.length} vs observed ${observed.length} commands: ${expected[first]} / ${observed[first]}`);assert.equal(observed.length,expected.length);
 const zLayers=[...actual.matchAll(/^;Z:([0-9.]+)/gm)].map(match=>Number(match[1]));assert.ok(Math.max(...zLayers)>20.5,'Printable raised glyph layers remain above the 20 mm cube');
 t.diagnostic(`${mode}: ${observed.length} exact native motion commands; ${original.positions.length/9} glyph triangles, top layer ${Math.max(...zLayers)} mm. CLI slices retained glyph meshes; this does not test text regeneration.`);
});
