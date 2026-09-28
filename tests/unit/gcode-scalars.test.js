import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseGcode} from '../../shared/gcode.js';
import {derivePreviewAttributes,nativeLinearFlow} from '../../shared/gcode-attributes.js';
import {nativeRangeBin,previewScalarRange,nativeScalarColor,nativeScalarLegend,nativeScalarLegendRows} from '../../shared/gcode-scalar-colors.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/native-preview-scalars.json',import.meta.url),'utf8'));
const prefix='; filament_diameter: 1.75\nG90\nM83\nG92 X0 Y0 Z0 E0\n;HEIGHT:0.2\n;WIDTH:0.45\n';
const parse=text=>{const parsed=parseGcode(text,{includeSource:true});return {parsed,attributes:derivePreviewAttributes(parsed)};};

test('scalar colors and legend values equal unmodified native ColorRange/Types C++ in 50 boundary and interpolation cases',()=>{
 for(const row of reference.colors){let min=Infinity,max=-Infinity,count=0;for(const value of row.values.map(Math.fround)){if(value!==min&&value!==max)count++;min=Math.min(min,value);max=Math.max(max,value);}const range={min,max,count};assert.equal(nativeScalarColor(row.value,range),'#'+row.rgb.map(v=>v.toString(16).padStart(2,'0')).join(''));assert.deepEqual(nativeScalarLegend(range),row.legend.map(Math.fround));}
 for(const[value,expected]of reference.bins)assert.equal(nativeRangeBin(value),Math.fround(expected));
 assert.equal(nativeScalarColor(null,{min:0,max:1}),'#b8bdc0');assert.deepEqual(nativeScalarLegend({count:0}),[]);
 assert.throws(()=>nativeRangeBin(-1),RangeError);assert.throws(()=>nativeRangeBin(NaN),RangeError);assert.throws(()=>nativeRangeBin(1e30),RangeError);
 assert.deepEqual(nativeScalarLegendRows({min:1,max:2,count:2}),[{value:1,color:'#0b2c7a'},{value:2,color:'#942616'}]);
});

test('commanded flow matches six independent C++ float-operation cases and rejects missing or non-extrusion inputs',()=>{
 for(const row of reference.flows)assert.deepEqual(nativeLinearFlow({delta:row.input.slice(0,4).map(Math.fround),diameter:row.input[4],feedrate:row.input[5]}),{flow:Math.fround(row.flow),mm3PerMm:Math.fround(row.mm3PerMm)});
 for(const input of [{delta:[0,0,1,1],diameter:1.75,feedrate:600},{delta:[1,0,0,-1],diameter:1.75,feedrate:600},{delta:[1,0,0,1],diameter:NaN,feedrate:600},{delta:[1,0,0,1],diameter:1.75,feedrate:null}])assert.equal(nativeLinearFlow(input),null);
});

test('native height/width tags persist across roles, clamp excessive width, and clear invalid metadata without geometry mutation',()=>{
 const text=prefix+';TYPE:Outer wall\nG1 X10 E1 F1200\n;TYPE:Sparse infill\nG1 Y10 E1\n;WIDTH:7\nG1 X0 E1\n;HEIGHT:0.8\nG1 Y0 E1\n;WIDTH:nan\nG1 X1 E.1\n;HEIGHT:0\nG1 Y1 E.1\n',plain=parseGcode(text,{includeSource:true}),{parsed,attributes}=parse(text);
 assert.deepEqual(parsed,plain);assert.deepEqual(attributes.segments.map(a=>a.width),[Math.fround(.45),Math.fround(.45),2,Math.fround(3.2),null,null]);assert.deepEqual(attributes.segments.map(a=>a.height),[.2,.2,.2,.8,.8,null].map(v=>v===null?null:Math.fround(v)));assert.equal(attributes.warnings.length,2);
});

test('filament config overrides header, tool commands select diameter, heater T parameters do not and M221 does not change commanded flow',()=>{
 const {attributes}=parse(prefix+'G1 X10 E1 F1200\nM104 T1 S200\nG1 X20 E1\nT1\nG1 X30 E1\nM221 S50\nG1 X40 E1\n; filament_diameter = 1.75,2.85\n');
 const flow=attributes.segments.map(a=>a.flow);assert.equal(flow[0],flow[1]);assert.ok(flow[2]>flow[1]*2);assert.equal(flow[2],flow[3]);assert.deepEqual(attributes.diameters,[Math.fround(1.75),Math.fround(2.85)]);
 const invalid=parse(prefix+'G1 X10 E1 F1200\n; filament_diameter = invalid\n').attributes;assert.equal(invalid.segments[0].flow,null);
});

test('known tags remain inspectable while arc, volumetric E, wipe, firmware retract and conflicting relative modes leave flow unavailable',()=>{
 const cases=[['G2 X10 Y10 I10 J0 E1 F1200','arc'],['M200 D1.75\nG1 X10 E1 F1200','Volumetric'],['G10\nG1 X10 E1 F1200','Firmware'],['M82\nG91\nG1 X10 E1 F1200','G91']];
 for(const[code,reason]of cases){const {attributes}=parse(prefix+code+'\n');assert.ok(attributes.segments.length>0);for(const row of attributes.segments){assert.equal(row.flow,null);assert.match(row.reason,new RegExp(reason));assert.equal(row.height,Math.fround(.2));}}
 const wipe=parse(prefix+';WIPE_START\nG1 X10 E1 F1200\n;WIPE_END\nG1 X20 E1\n').attributes;assert.equal(wipe.segments[0].height,null);assert.ok(wipe.segments[1].flow>0);
 const z=parse(prefix+'G1 Z1 E1 F1200\n').attributes;assert.equal(z.segments[0].flow,null);assert.equal(z.segments[0].height,null);
});

test('missing diameter, feed or tags produce explicit nulls and source-less previews are not populated from assumptions',()=>{
 for(const text of ['G90\nM83\nG92 X0 Y0 Z0 E0\nG1 X1 E1 F60\n',prefix+'G1 X1 E1\n']){const{attributes}=parse(text);assert.equal(attributes.segments[0].flow,null);assert.ok(attributes.segments[0].reason);}
 const parsed=parseGcode(prefix+'G1 X10 E1 F1200\n');assert.equal(derivePreviewAttributes(parsed).segments[0].height,null);
 const {attributes}=parse(prefix+'M1020 S1\nG92 E0\nG1 X10 E1 F1200\nT0\nG1 X20 E1\n');assert.equal(attributes.segments[0].flow,null);assert.ok(attributes.segments[1].flow>0);
});

test('native scalar ranges cover the whole file and only exclude hidden Custom for width/flow, preserving native singleton behavior',()=>{
 const{parsed,attributes}=parse(prefix+';TYPE:Custom\n;WIDTH:1\n;HEIGHT:.4\nG1 X10 E1 F1200\n;TYPE:Outer wall\n;WIDTH:.4\n;HEIGHT:.2\nG1 X20 E1\n;TYPE:Sparse infill\n;WIDTH:.6\nG1 X30 E1\n');
 assert.equal(previewScalarRange(parsed,attributes,'width').max,1);assert.equal(previewScalarRange(parsed,attributes,'width',{hiddenFeatures:['Custom','Sparse infill']}).max,0.5999999642372131);assert.equal(previewScalarRange(parsed,attributes,'height',{hiddenFeatures:['Custom']}).max,0.3999999761581421);assert.throws(()=>previewScalarRange(parsed,attributes,'layerTime'),RangeError);
});

test('all 6,896 tagged linear motions from the actual native GUI fixture equal the independent C++ float rows',async()=>{
 const bytes=await readFile(new URL('../fixtures/'+reference.gui.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.gui.sha256);
 const{parsed,attributes}=parse(bytes.toString()),rows=[];
 parsed.segments.forEach((segment,index)=>{const a=attributes.segments[index];if(a.height!==null&&a.width!==null&&a.flow!==null)rows.push([segment.line,a.height,a.width,a.flow,a.mm3PerMm]);});assert.equal(rows.length,reference.gui.rowCount);
 const binary=Buffer.alloc(rows.length*20);rows.forEach((row,index)=>{binary.writeUInt32LE(row[0],index*20);row.slice(1).forEach((v,j)=>binary.writeFloatLE(v,index*20+4+j*4));});assert.equal(createHash('sha256').update(binary).digest('hex'),reference.gui.float32RowSha256);
 const byLine=new Map(rows.map(row=>[row[0],row]));for(const row of reference.gui.samples)assert.deepEqual(byLine.get(row[0]),[row[0],...row.slice(1).map(Math.fround)]);
 assert.equal(attributes.segments.filter(a=>a.flow!==null).length,6900);assert.equal(parsed.nativeEstimates.printTime,'42m 18s');assert.equal(Object.hasOwn(attributes,'layerTimes'),false);
});
