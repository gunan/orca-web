import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{strToU8,strFromU8,unzipSync,zipSync}from'fflate';
import{CUT_INFORMATION_PATH,normalizeCutId,normalizeCutConnector,readCutInformation,writeCutInformation,cutInformationForParts,invalidateCutFamily}from'../../shared/cut-metadata.js';
import{importNative3MF,exportNative3MF}from'../../shared/native-project.js';import{updateNativePart,normalizeNativeParts}from'../../shared/native-object-settings.js';import{createNativeProjectService}from'../../server/native-projects.js';import{fixtureCatalog}from'../fixtures/native-project-catalog.js';
const cutId={id:'9007199254740997',checkSum:'3',connectorsCount:'2'},plug={type:'plug',radiusTolerance:.125,heightTolerance:.2};
async function project(){const p=importNative3MF(await readFile(new URL('../fixtures/orca-2.4.2-cube.3mf',import.meta.url)));p.objects[0].position=[60,70,0];return p;}
const member=(id,extra={})=>({id,name:id,plateId:'plate-1',filamentSlot:1,native:{groupId:'g',partType:'normal_part',objectSettings:{},partSettings:{},cutId:{...cutId},...extra}});
test('cut identities preserve unsigned 64-bit values exactly and reject unsafe numbers',()=>{
 assert.deepEqual(normalizeCutId(cutId),cutId);assert.equal(normalizeCutId({...cutId,id:'18446744073709551615'}).id,'18446744073709551615');
 for(const id of [0,'0',-1,'18446744073709551616',9007199254740997,'1e3','',{},' 3'])assert.throws(()=>normalizeCutId({...cutId,id}),/cut/);
 assert.throws(()=>normalizeCutId({...cutId,checkSum:'.5'}),/checksum/);assert.throws(()=>normalizeCutId({...cutId,extra:1}),/identity/);
 assert.equal(normalizeCutId({...cutId,connectorsCount:'0002'}).connectorsCount,'2');
});
test('connector types and distances are explicit and do not infer editable source plans',()=>{
 assert.deepEqual(normalizeCutConnector(plug),plug);assert.deepEqual(normalizeCutConnector({...plug,type:'snap'}),{...plug,type:'snap'});
 for(const value of [{...plug,type:'Undef'},{...plug,radiusTolerance:-.1},{...plug,heightTolerance:Infinity},{...plug,heightTolerance:'0.1'},{...plug,position:[0,0,0]}])assert.throws(()=>normalizeCutConnector(value),/connector/i);
 assert.throws(()=>cutInformationForParts([{native:{cutConnector:plug}}]),/identity/);assert.throws(()=>cutInformationForParts([member('a',{partType:'modifier_part',cutConnector:plug})]),/normal or negative/);
});
test('cut XML uses native object and volume indexes, repeated connector containers and exact identity strings',()=>{
 const a=member('body'),b=member('plug',{cutConnector:plug}),c=member('hole',{partType:'negative_part',cutConnector:{...plug,type:'dowel'}});
 const xml=writeCutInformation([[{native:{}}],[a,b,c]]),parsed=readCutInformation(xml);assert.equal(parsed.size,1);assert.deepEqual(parsed.get(2).cutId,cutId);assert.deepEqual([...parsed.get(2).connectors],[[1,plug],[2,{...plug,type:'dowel'}]]);
 const nativeRepeated=xml.replace('/><connector volume_id=', '/></connectors><connectors><connector volume_id=');assert.deepEqual(readCutInformation(nativeRepeated),parsed);
 assert.equal(writeCutInformation([[{native:{}}]]),null);
});
test('malformed XML, missing identities, duplicate indexes and invalid connector references fail explicitly',()=>{
 const valid=writeCutInformation([[member('body'),member('plug',{cutConnector:plug})]]);
 for(const text of ['<!DOCTYPE objects><objects/>','<objects>','<objects><object id="1"/></objects>',valid.replace('volume_id="1"','volume_id="-1"'),valid.replace('type="0"','type="3"'),valid.replace('r_tolerance="0.125"','r_tolerance=""'),valid.replace('</objects>',valid.match(/<object .*<\/object>/)[0]+'</objects>'),valid.replace('</connectors>',valid.match(/<connector volume.*?\/>/)[0]+'</connectors>')])assert.throws(()=>readCutInformation(text),/cut|XML/i);
 assert.throws(()=>writeCutInformation([[member('a'),member('b',{cutId:{...cutId,checkSum:'4'}})]]),/conflicting/);
});
test('native project roundtrip retains grouped connector identities, roles, material slots and plate reindexing',async()=>{
 const p=await project(),body=p.objects[0];body.native.cutId=cutId;const hole=structuredClone(body);hole.id='hole';hole.name='Connector-2';hole.native.partType='negative_part';hole.native.cutConnector={...plug,type:'snap'};hole.scale=[.2,.2,.2];p.objects.push(hole);
 const second=structuredClone(body);second.id='second';second.name='Other cut part';second.native.groupId='second';delete second.native.instanceFamily;second.position=[100,70,0];p.objects.push(second);
 const bytes=exportNative3MF(p),q=importNative3MF(bytes);assert.equal(q.objects.length,3);for(const object of q.objects)assert.deepEqual(object.native.cutId,cutId);assert.deepEqual(q.objects.find(o=>o.name==='Connector-2').native.cutConnector,{...plug,type:'snap'});assert.equal(q.objects.find(o=>o.name==='Connector-2').native.partType,'negative_part');assert.ok(!q.nativeImportWarnings.some(text=>text.includes('cut_information')));
 const xml=strFromU8(unzipSync(bytes)[CUT_INFORMATION_PATH]);assert.equal(readCutInformation(xml).size,2);
 p.plates.push({id:'plate-2',name:'Second'});second.plateId='plate-2';p.activePlateId='plate-2';const selected=importNative3MF(exportNative3MF(p,{allPlates:false}));assert.equal(selected.objects.length,1);assert.deepEqual(selected.objects[0].native.cutId,cutId);assert.deepEqual([...readCutInformation(strFromU8(unzipSync(exportNative3MF(p,{allPlates:false}))[CUT_INFORMATION_PATH])).keys()],[1]);
});
test('missing object or volume metadata references reject before the native executable',async()=>{
 const p=await project();p.objects[0].native.cutId=cutId;const archive=unzipSync(exportNative3MF(p));const xml=strFromU8(archive[CUT_INFORMATION_PATH]);archive[CUT_INFORMATION_PATH]=strToU8(xml.replace('<object id="1"','<object id="2"'));assert.throws(()=>importNative3MF(zipSync(archive)),/missing native object/);
 archive[CUT_INFORMATION_PATH]=strToU8(xml.replace('</object>','<connectors><connector volume_id="1" type="0" r_tolerance="0" h_tolerance=".1"/></connectors></object>'));assert.throws(()=>importNative3MF(zipSync(archive)),/missing native volume/);
});
test('repeated build instances retain one native cut record on every expanded group',async()=>{
 const p=await project();p.objects[0].native.cutId=cutId;const archive=unzipSync(exportNative3MF(p)),model=strFromU8(archive['3D/3dmodel.model']),item=model.match(/<item [^>]*\/>/)[0];archive['3D/3dmodel.model']=strToU8(model.replace('</build>',item+'</build>'));const result=importNative3MF(zipSync(archive));assert.equal(result.objects.length,2);assert.notEqual(result.objects[0].native.groupId,result.objects[1].native.groupId);assert.ok(result.objects.every(object=>object.native.cutId.id===cutId.id));
});
test('membership and role changes invalidate related cut metadata without deleting connector geometry',()=>{
 const a=member('a'),b=member('b',{cutConnector:plug}),mate=member('mate',{groupId:'other'}),unrelated=member('unrelated',{cutId:{...cutId,id:'7'},groupId:'other2'});
 const renamed=updateNativePart([a,b,mate,unrelated],'b',{name:'New name'});assert.deepEqual(renamed[1].native.cutConnector,plug);
 const changed=updateNativePart([a,b,mate,unrelated],'b',{groupId:'other2'});assert.equal(changed.length,4);assert.ok(changed.every(object=>!object.native.cutId&&!object.native.cutConnector));
 const role=updateNativePart([a,b,mate,unrelated],'b',{partType:'negative_part'});assert.ok(role.slice(0,3).every(object=>!object.native.cutId));assert.equal(role[3],unrelated);
 const invalidated=invalidateCutFamily([a,b,mate,unrelated],['a']);assert.equal(invalidated.length,4);assert.equal(invalidated[3],unrelated);assert.equal(b.native.cutConnector.type,'plug');
});
test('client normalization and server preparation preserve only validated cut fields',async()=>{
 const p=await project();p.objects[0].native.cutId=cutId;assert.deepEqual(normalizeNativeParts(p.objects)[0].native.cutId,cutId);const service=createNativeProjectService({catalog:fixtureCatalog(p)});const prepared=await service.prepare({project:p,useEmbeddedSettings:true});assert.deepEqual(prepared.project.objects[0].native.cutId,cutId);assert.deepEqual(importNative3MF(prepared.bytes).objects[0].native.cutId,cutId);
 p.objects[0].native.cutConnector={...plug,heightTolerance:-1};await assert.rejects(service.prepare({project:p,useEmbeddedSettings:true}),/tolerances/);
});

test('empty native mesh volumes cannot shift connector volume indexes silently',async()=>{
 const p=await project();p.objects[0].native.cutId=cutId;const archive=unzipSync(exportNative3MF(p));const model=strFromU8(archive['3D/3dmodel.model']);archive['3D/3dmodel.model']=strToU8(model.replace(/<triangles>.*?<\/triangles>/,'<triangles/>'));assert.throws(()=>importNative3MF(zipSync(archive)),/empty native volume/);
});
