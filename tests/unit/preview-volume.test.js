import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreviewVolumeData,nativeSegmentIndices} from '../../shared/preview-volume.js';
const make=(points,extra={})=>({segments:points.slice(1).map((end,index)=>({start:points[index],end,kind:'extrusion',feature:'Inner wall',line:index+1,arc:false,...extra})),source:{lines:points.slice(1).map(p=>`G1 X${p[0]} Y${p[1]} E1`)}});
const attrs=n=>({segments:Array.from({length:n},()=>({height:Math.fround(.2),width:Math.fround(.4),mm3PerMm:Math.fround(.08),flow:2}))});
test('native segment topology is eight logical vertices/eight triangles and connected corners preserve float turn angles',()=>{
 assert.equal(nativeSegmentIndices.length,24);assert.equal(new Set(nativeSegmentIndices).size,8);
 const parsed=make([[0,0,.2],[10,0,.2],[10,10,.2],[0,10,.2]]),before=structuredClone(parsed),data=buildPreviewVolumeData(parsed,attrs(3));assert.equal(data.knownCount,3);assert.deepEqual(parsed,before);assert.equal(data.segments[0].start.hwa[2],0);assert.equal(data.segments[0].end.hwa[2],Math.fround(Math.PI/2));assert.equal(data.segments[1].end.hwa[2],Math.fround(Math.PI/2));assert.ok(data.segments[2].end.hwa[2]===0);assert.equal(data.segments[0].start.position[2],Math.fround(.1));assert.equal(data.segments[1].start.sourceIndex,0);
});
test('native role and mm3/mm changes insert phantom endpoints instead of joining unrelated scalar paths',()=>{
 const parsed=make([[0,0,.2],[10,0,.2],[10,10,.2],[0,10,.2]]),attributes=attrs(3);attributes.segments[1].mm3PerMm=Math.fround(.081);parsed.segments[2].feature='Outer wall';const data=buildPreviewVolumeData(parsed,attributes);for(const item of data.segments){assert.ok(item.start.hwa[2]===0);assert.ok(item.end.hwa[2]===0);}assert.equal(data.segments[1].start.sourceIndex,1);
});
test('endpoint dimensions can vary within a source path while each top stays at its commanded Z',()=>{
 const parsed=make([[0,0,.4],[10,0,.4],[10,10,.4]]),attributes=attrs(2);attributes.segments[1].height=Math.fround(.4);attributes.segments[1].width=Math.fround(.8);const data=buildPreviewVolumeData(parsed,attributes);assert.equal(data.segments[1].start.hwa[0],Math.fround(.2));assert.equal(data.segments[1].end.hwa[0],Math.fround(.4));assert.equal(data.segments[1].start.position[2],Math.fround(Math.fround(.4)-Math.fround(.1)));assert.equal(data.segments[1].end.position[2],Math.fround(.2));
});
test('missing data, arcs and omitted stationary extrusion events cannot silently join solid paths',()=>{
 const parsed=make([[0,0,.2],[10,0,.2],[10,10,.2]]);parsed.segments[1].line=3;parsed.source.lines=['G1 X10 E1','G1 E-1','G1 Y10 E1'];const attributes=attrs(2),data=buildPreviewVolumeData(parsed,attributes);assert.ok(data.segments[0].end.hwa[2]===0);assert.equal(data.segments[1].start.sourceIndex,1);attributes.segments[0].height=null;const missing=buildPreviewVolumeData(parsed,attributes);assert.equal(missing.knownCount,1);assert.equal(missing.segments[0],null);parsed.segments[1].arc=true;assert.equal(buildPreviewVolumeData(parsed,attributes).knownCount,0);assert.throws(()=>buildPreviewVolumeData(null,attributes),TypeError);
});
