import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{Matrix4,Vector3}from'three';import{unzipSync,strFromU8}from'fflate';
import{importNative3MF,exportNative3MF}from'../../shared/native-project.js';import{meshBounds}from'../../shared/geometry.js';import{meshPointMatrix}from'../../shared/brim-ears.js';import{serializeProject,parseProject}from'../../shared/project.js';import{readNativeEmbossPart,importNativeEmbossMetadata,normalizeNativeTextConfiguration,normalizeNativeEmbossMetadata,nativeEmbossLossMessage,hasNativeEmboss}from'../../shared/native-emboss.js';import{updateSceneTransform,placeSceneOnFace,duplicateSceneSelection}from'../../shared/scene-object-operations.js';import{mirrorNativeGroup,cutNativeGroup}from'../../shared/geometry-cut.js';import{splitDisconnected,repairMesh}from'../../shared/geometry-operations.js';import{transformMultipleSelection,removeMultipleSelection}from'../../shared/multi-selection.js';
const fixture=async mode=>importNative3MF(await readFile(new URL(`../fixtures/native-text-${mode}-2.4.2.3mf`,import.meta.url)));
const textPart=project=>project.objects.find(object=>object.native.textConfiguration);
const near=(actual,expected,tolerance=2e-5)=>{assert.equal(actual.length,expected.length);actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<tolerance,`${index}: ${value} vs ${expected[index]}`));};
const frame=object=>meshPointMatrix(object).multiply(new Matrix4().fromArray(object.native.embossShape.frame));
const framePoints=object=>[[0,0,0],[10,0,0],[0,10,0],[0,0,1]].flatMap(point=>new Vector3(...point).applyMatrix4(frame(object)).toArray());
for(const mode of ['planar','surface'])test(`fresh native GUI ${mode} fixture retains text/shape attributes, exact overlap and independent regeneration plane`,async()=>{
 const p=await fixture(mode),object=textPart(p),shape=object.native.embossShape,bounds=meshBounds(object);
 assert.equal(object.native.textConfiguration.text,'A & B');assert.equal(object.native.textConfiguration.faceName,'Helvetica');assert.equal(object.native.textConfiguration.fontDescriptorType,'wxFontDescriptor_MacOsX');assert.equal(object.native.textConfiguration.lineHeight,13);assert.equal(object.native.textConfiguration.perGlyph,false);assert.equal(shape.depth,1);assert.equal(shape.useSurface,mode==='surface');
 near(new Vector3(0,0,0).applyMatrix4(frame(object)).toArray(),[11.55856357,1.09159894,20]);near([bounds.min[2],bounds.max[2]],[19.985,mode==='surface'?21:20.985]);assert.equal(object.positions.length/9,mode==='surface'?572:1176);
 const bytes=exportNative3MF(p,{includeWebProject:false}),zip=unzipSync(bytes),config=strFromU8(zip['Metadata/model_settings.config']);assert.match(config,/<slic3rpe:text text="A &amp; B"/);assert.match(config,/font_descriptor=.*&lt;plist/);assert.equal(zip['Metadata/orca-web.json'],undefined);
 const q=importNative3MF(bytes),copy=textPart(q);assert.deepEqual(copy.native.textConfiguration,object.native.textConfiguration);near(framePoints(copy),framePoints(object));near(meshBounds(copy).min,bounds.min);near(meshBounds(copy).max,bounds.max);
 const saved=parseProject(serializeProject(p));assert.deepEqual(textPart(saved).native,textPart(p).native);
});
test('native metadata roundtrip retains all source font attributes and explicit alignments',async()=>{
 const p=await fixture('planar'),object=textPart(p);Object.assign(object.native.textConfiguration,{text:'A < B\nC & "D"',styleName:'Bold & custom',charGap:-101,lineGap:77,boldness:1250,skew:.2,perGlyph:true,horizontal:'right',vertical:'bottom',collection:2,family:'swiss',faceName:'Helvetica',style:'italic',weight:'bold'});
 const q=importNative3MF(exportNative3MF(p,{includeWebProject:false}));assert.deepEqual(textPart(q).native.textConfiguration,object.native.textConfiguration);
});
test('baked native groups, reflected painting frames, brim centering and multiple plates preserve regeneration placement',async()=>{
 const p=await fixture('surface'),object=textPart(p);p.objects=updateSceneTransform(p.objects,object.id,{position:[60,70,0],rotation:[0,0,27],scale:[1.2,.8,1]});
 p.objects=mirrorNativeGroup(p.objects,object.id,'x');const changed=textPart(p);changed.painting={version:1,winding:-1,color:{0:'4'}};p.objects[0].brimEars=[{position:[0,0,0],radius:3}];p.plates.unshift({id:'unused',name:'Unused plate'});
 const q=importNative3MF(exportNative3MF(p,{includeWebProject:false})),copy=textPart(q);near(framePoints(copy),framePoints(changed));assert.deepEqual(copy.native.textConfiguration,changed.native.textConfiguration);near(meshBounds(copy).min,meshBounds(changed).min);near(meshBounds(copy).max,meshBounds(changed).max);assert.equal(copy.painting.winding,-1);
});
test('single-part face placement, group rebasing, multiple-selection baking and duplicate preserve native frame',async()=>{
 let p=await fixture('planar'),part=textPart(p);p.objects=placeSceneOnFace(p.objects,part.id,[0,0,1],{width:250,depth:210,height:220},{scope:'part'});part=textPart(p);let q=importNative3MF(exportNative3MF(p));near(framePoints(textPart(q)),framePoints(part));
 p.selectedId=part.id;p.selectedIds=[part.id];p.selectionScope='part';const before=framePoints(part);p=transformMultipleSelection(p,{position:[10,20,30]},{scope:'part'});part=textPart(p);assert.notDeepEqual(framePoints(part),before);q=importNative3MF(exportNative3MF(p));near(framePoints(textPart(q)),framePoints(part));
 const result=duplicateSceneSelection(p.objects,part.id,{scope:'part',offset:[5,0,0]}),copy=result.objects.find(object=>result.createdIds.includes(object.id));near(framePoints(copy),framePoints(part).map((value,index)=>value+(index%3===0?5:0)));assert.deepEqual(copy.native.textConfiguration,part.native.textConfiguration);
});
test('topology rewrites remove stale native regeneration data and expose an explicit loss message',async()=>{
 const p=await fixture('surface'),object=textPart(p);assert.match(nativeEmbossLossMessage([object]),/editing metadata will be removed/);assert.equal(nativeEmbossLossMessage([p.objects[0]]),null);
 const split=splitDisconnected(object);assert.ok(split.length>1);assert.ok(split.every(part=>!hasNativeEmboss(part)));assert.equal(hasNativeEmboss(repairMesh(object).mesh),false);
 const cut=cutNativeGroup(p.objects,object.id,{normal:[0,0,1],offset:10,keep:'both'});assert.ok(cut.created.every(part=>!hasNativeEmboss(part)));
});
test('self-contained native SVG shape archive survives without filesystem access',async()=>{
 const p=await fixture('planar'),object=textPart(p);delete object.native.textConfiguration;object.native.embossShape.svg={name:'shape & contour.svg',source:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 0L10 10Z"/></svg>'};
 const bytes=exportNative3MF(p,{includeWebProject:false}),zip=unzipSync(bytes);assert.ok(Object.keys(zip).some(name=>/^Metadata\/emboss-\d+\.svg$/.test(name)));const q=importNative3MF(bytes),copy=q.objects.find(hasNativeEmboss);assert.deepEqual(copy.native.embossShape.svg,object.native.embossShape.svg);near(framePoints(copy),framePoints(object));
});
test('malformed text, nonaffine/singular frames and active SVG metadata are rejected before export',async()=>{
 const p=await fixture('planar'),object=textPart(p),base=object.native;
 for(const value of [NaN,Infinity,0,-1])assert.throws(()=>normalizeNativeTextConfiguration({...base.textConfiguration,lineHeight:value}),/line height/);
 assert.throws(()=>normalizeNativeTextConfiguration({...base.textConfiguration,fontDescriptorType:'execute'}),/descriptor type/);assert.throws(()=>normalizeNativeTextConfiguration({...base.textConfiguration,text:'a\0b'}),/text/);
 for(const change of [a=>a[0]=NaN,a=>a[15]=0,a=>a[0]=a[1]=a[2]=0,a=>a[3]=1]){const frame=[...base.embossShape.frame];change(frame);assert.throws(()=>normalizeNativeEmbossMetadata({...base,embossShape:{...base.embossShape,frame}}),/frame/);}
 for(const source of ['<!DOCTYPE svg><svg/>','<svg><script>alert(1)</script></svg>','<svg onload="x()"/>','<svg><image href="file:///etc/passwd"/></svg>'])assert.throws(()=>normalizeNativeEmbossMetadata({...base,embossShape:{...base.embossShape,svg:{name:'a.svg',source}}}),/SVG/);
 const bad=structuredClone(p);textPart(bad).native.embossShape.frame[0]=NaN;assert.throws(()=>serializeProject(bad),/frame/);
});

test('deleting a neighboring part preserves a transformed native text frame without rebaking it',async()=>{
 let p=await fixture('planar'),part=textPart(p);p.objects=updateSceneTransform(p.objects,part.id,{position:[30,40,0],rotation:[0,0,25],scale:[1.2,.8,1]});
 part=textPart(p);const before=framePoints(part),body=p.objects.find(object=>!object.native.textConfiguration);p.selectedId=body.id;p.selectedIds=[body.id];p.selectionScope='part';
 const result=removeMultipleSelection(p,{scope:'part'}),retained=textPart(result);assert.equal(result.objects.length,1);near(framePoints(retained),before);near(framePoints(textPart(importNative3MF(exportNative3MF(result)))),before);
});

test('native XML legacy inline shapes and numeric alignment values follow the pinned loader',()=>{
 const part={'slic3rpe:text':{'@_text':'Legacy','@_font_descriptor_type':'undefined','@_line_height':'12','@_horizontal':'2','@_vertical':'0','@_per_glyph':'1','@_depth':'2.5','@_use_surface':'1','@_transform':'1 0 0 0 1 0 0 0 1 2 3 4'}};
 const data=readNativeEmbossPart(part,()=>{throw new Error('No archive asset should be read for text');});assert.equal(data.textConfiguration.horizontal,'right');assert.equal(data.textConfiguration.vertical,'top');assert.equal(data.textConfiguration.perGlyph,true);assert.equal(data.shape.depth,2.5);assert.equal(data.shape.useSurface,true);
 const result=importNativeEmbossMetadata(data,[[0,0,0],[10,20,30]],new Matrix4());near(result.embossShape.frame.slice(12,15),[3,7,11]);assert.throws(()=>importNativeEmbossMetadata(data,[[0,0,0],[10,20,30]],new Matrix4(),{unit:25.4}),/millimeter/);
});

test('retained native source stays bounded and rejects stale geometry, hidden vertices and invalid indices',async()=>{
 const p=await fixture('planar');for(const object of p.objects){assert.ok(object.native.meshSource);assert.equal(object.native.meshSource.triangles.length,object.positions.length/3);}
 for(const mutate of [q=>{q.objects[1].positions[0]+=.1;},q=>{q.objects[1].native.meshSource.vertices.push(0,0,999);},q=>{q.objects[1].native.meshSource.triangles[0]=1e8;},q=>{q.objects[1].native.meshSource.build[15]=0;}]){const q=structuredClone(p);mutate(q);assert.throws(()=>serializeProject(q),/retained native mesh|Retained native mesh|Singular/);assert.throws(()=>exportNative3MF(q),/retained native mesh|Retained native mesh|Singular/);}
 const part=textPart(p);for(const result of [repairMesh(part).mesh,...splitDisconnected(part)]){assert.equal(result.native.meshSource,undefined);assert.equal(result.native.textConfiguration,undefined);}
});

test('face placement of a retained plain parent mesh keeps its precision source bound',async()=>{
 const p=await fixture('planar'),body=p.objects.find(object=>!object.native.textConfiguration);p.objects=placeSceneOnFace(p.objects,body.id,[1,0,0],{width:250,depth:210,height:220},{scope:'part'});assert.doesNotThrow(()=>serializeProject(p));assert.doesNotThrow(()=>exportNative3MF(p));
});
