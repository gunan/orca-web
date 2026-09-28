import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8,strFromU8} from 'fflate';
import {extractBoundedZip} from '../../shared/import-limits.js';
import {importNative3MF,exportNative3MF} from '../../shared/native-project.js';
import {parseProject,serializeProject} from '../../shared/project.js';
import {AUXILIARY_LIMITS,auxiliaryPath,normalizeAuxiliary,normalizeModelMetadata,captureAuxiliary,exportAuxiliary,addAttachments,renameAttachment,removeAttachment,renameProjectAttachment,removeProjectAttachment,attachmentInfo,attachmentImageSource} from '../../shared/native-auxiliary.js';
const base=extractBoundedZip(await readFile(new URL('../fixtures/native-gui-cube-2.4.2.3mf',import.meta.url)));
function archive(){
  const files={...base,'Auxiliaries/Others/notes & tips.txt':strToU8('Read before assembly.\n汉字'), 'Auxiliaries/Bill of Materials/parts.xlsx':new Uint8Array([0x50,0x4b,3,4,0,255]),'Auxiliaries/Model Pictures/photo.png':base['Metadata/plate_1.png'],'Auxiliaries/.thumbnails/thumbnail_3mf.png':base['Metadata/plate_1.png']};
  files['3D/3dmodel.model']=strToU8(strFromU8(files['3D/3dmodel.model']).replace('<resources>','<metadata name="DesignerCover">photo.png</metadata><metadata name="License">BY-SA</metadata><metadata name="Copyright">A &amp; B</metadata><metadata name="Origin">https://example.com/design</metadata><resources>'));
  files['_rels/.rels']=strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/><Relationship Target="/Auxiliaries/.thumbnails/thumbnail_3mf.png" Id="cover" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/></Relationships>');
  return files;
}
test('native attachments, cover relationships and attribution survive JSON and native export with exact opaque bytes',()=>{
  const files=archive(),project=importNative3MF(zipSync(files)),restored=parseProject(serializeProject(project));
  assert.equal(restored.nativeModelMetadata.License,'BY-SA');assert.equal(restored.nativeModelMetadata.Copyright,'A & B');assert.equal(restored.nativeAuxiliary.files.length,4);
  const output=extractBoundedZip(exportNative3MF(restored));for(const[path,bytes]of Object.entries(files))if(path.startsWith('Auxiliaries/'))assert.deepEqual(output[path],new Uint8Array(bytes),path);
  assert.match(strFromU8(output['_rels/.rels']),/Target="\/Auxiliaries\/.thumbnails\/thumbnail_3mf.png" Id="cover"/);
  assert.match(strFromU8(output['3D/3dmodel.model']),/<metadata name="Copyright">A &amp; B<\/metadata>/);
  assert.equal(importNative3MF(zipSync(output)).nativeImportWarnings.filter(w=>/attachment is missing/.test(w)).length,0);
  const noWeb=exportNative3MF(restored,{includeWebProject:false});assert.deepEqual(importNative3MF(noWeb).nativeAuxiliary,restored.nativeAuxiliary);
});
test('native folders accept supported uploads atomically and preserve byte count and Unicode names',()=>{
  const bytes=strToU8('Hello ✓'),data=addAttachments(undefined,'Others',[{name:'步骤.txt',bytes}]);assert.deepEqual(attachmentInfo(data.files[0]),{name:'步骤.txt',group:'Others',size:bytes.length});
  assert.throws(()=>addAttachments(data,'Others',[{name:'valid.txt',bytes},{name:'bad.exe',bytes}]),/Unsupported/);assert.equal(data.files.length,1);
  assert.throws(()=>addAttachments(data,'Others',[{name:'步骤.TXT',bytes}]),/Duplicate/);
  for(const[group,name]of [['Model Pictures','part.jpeg'],['Bill of Materials','bom.pdf'],['Assembly Guide','guide.pdf']])assert.equal(addAttachments(undefined,group,[{name,bytes}]).files.length,1);
});
test('rename and deletion keep covers coherent, clear generated cover files and leave original history unchanged',()=>{
  const original=importNative3MF(zipSync(archive())),renamed=renameProjectAttachment(original,'Auxiliaries/Model Pictures/photo.png','renamed.png');
  assert.equal(renamed.nativeModelMetadata.DesignerCover,'renamed.png');assert.equal(original.nativeModelMetadata.DesignerCover,'photo.png');
  assert.ok(renamed.nativeAuxiliary.files.some(f=>f.path.endsWith('/renamed.png')));
  const removed=removeProjectAttachment(renamed,'Auxiliaries/Model Pictures/renamed.png');assert.equal(removed.nativeModelMetadata.DesignerCover,undefined);assert.equal(removed.nativeAuxiliary.files.length,2);assert.deepEqual(removed.nativeAuxiliary.covers,undefined);
  assert.throws(()=>renameAttachment(original.nativeAuxiliary,'Auxiliaries/Model Pictures/photo.png','image.txt'),/extension/);
  assert.throws(()=>removeAttachment(original.nativeAuxiliary,'Auxiliaries/Others/not-there.txt'),/no longer exists/);
});
test('missing designer covers and referenced cover resources are diagnosed without external reads',()=>{
  const files=archive();delete files['Auxiliaries/Model Pictures/photo.png'];delete files['Auxiliaries/.thumbnails/thumbnail_3mf.png'];const project=importNative3MF(zipSync(files));
  assert.equal(project.nativeImportWarnings.filter(w=>/attachment is missing/.test(w)).length,2);assert.equal(project.nativeAuxiliary.files.length,2);assert.equal(project.nativeAuxiliary.covers,undefined);
  const warnings=[];captureAuxiliary(files,{warnings,relations:[{'@_Type':'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail','@_Target':'https://outside.example/image.png'}]});assert.equal(warnings.length,0);
  assert.throws(()=>captureAuxiliary(files,{relations:[{'@_Type':'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail','@_Target':'/Auxiliaries/../outside.png'}]}),/Unsafe/);
});
test('unsafe paths, portability collisions, malformed payloads and reference forgery reject before output',()=>{
  for(const path of ['../secret','Auxiliaries/../secret','Auxiliaries/a/../../a','Auxiliaries/a\\file','Auxiliaries/a/secret:stream','Auxiliaries//file','Auxiliaries/a/constructor','Auxiliaries/a/file.','Auxiliaries/a/\u0001'])assert.throws(()=>auxiliaryPath(path),/Unsafe/);
  for(const data of ['AAAA=','!!==','AB=='])assert.throws(()=>normalizeAuxiliary({version:1,files:[{path:'Auxiliaries/Others/a.txt',data}]}),/encoding/);
  assert.throws(()=>normalizeAuxiliary({version:1,files:[],covers:{cover:'Auxiliaries/missing.png'}}),/missing/);
  assert.throws(()=>normalizeAuxiliary({version:1,files:[{path:'Auxiliaries/Others/é.txt',data:''},{path:'Auxiliaries/Others/e\u0301.txt',data:''}]}),/Duplicate/);
  assert.throws(()=>normalizeAuxiliary({version:1,files:Array.from({length:AUXILIARY_LIMITS.count+1},(_,i)=>({path:`Auxiliaries/Others/${i}.txt`,data:''}))}),/Invalid/);
});
test('unknown auxiliary categories and root-level opaque files survive while metadata rejects invalid keys and values',()=>{
  const files={'Auxiliaries/vendor-data.bin':new Uint8Array([0,1,2,255]),'Auxiliaries/Custom Folder/example.svg':strToU8('<svg><script>untrusted()</script></svg>')},retained=captureAuxiliary(files);assert.deepEqual(exportAuxiliary(retained).files,files);
  assert.equal(attachmentInfo(retained.files[0]).group,'Other imported files');
  for(const bad of [{DesignerUserId:'123'}, {Application:'fake'}, {License:10},{Copyright:'\u0000'}, {DesignerCover:'../outside.png'},{Origin:'x'.repeat(131073)}])assert.throws(()=>normalizeModelMetadata(bad),/Invalid|Unsafe/);
  assert.deepEqual(normalizeModelMetadata({Copyright:'<b>literal attribution</b>',License:'custom license'}),{Copyright:'<b>literal attribution</b>',License:'custom license'});
});
test('picture previews accept bounded static raster data and never interpret renamed active or oversized content',()=>{
  const png=addAttachments(undefined,'Model Pictures',[{name:'photo.png',bytes:base['Metadata/plate_1.png']}]).files[0];assert.equal(attachmentImageSource(png).width,512);assert.match(attachmentImageSource(png).url,/^data:image\/png;base64,/);
  for(const name of ['malformed.png','malformed.jpg','malformed.bmp']){const file=addAttachments(undefined,'Model Pictures',[{name,bytes:strToU8('<svg onload="execute()"/>')}]).files[0];assert.equal(attachmentImageSource(file),null);}
  const header=new Uint8Array(54),view=new DataView(header.buffer);header[0]=66;header[1]=77;view.setUint32(14,40,true);view.setInt32(18,100000,true);view.setInt32(22,100000,true);assert.equal(attachmentImageSource(addAttachments(undefined,'Model Pictures',[{name:'huge.bmp',bytes:header}]).files[0]),null);
});
