import test from 'node:test';import assert from 'node:assert/strict';import {Matrix4} from 'three';
import {cameraRelativeNudge,createFilamentKeySequence,assignSelectedFilament,toggleSelectedPrintable} from '../../shared/prepare-keyboard.js';
import {editorShortcut} from '../../shared/native-shortcuts.js';
const part=(id,group='g',role='normal_part',extra={})=>({id,name:id,plateId:'p',filamentSlot:2,native:{groupId:group,objectName:group,partType:role,objectSettings:{extruder:'2',outer_wall_speed:'45'},partSettings:{extruder:'2'},meshSource:{retained:true}},...extra});
const project=(objects)=>({objects,activePlateId:'p',selectedId:objects[0].id,selectedIds:[objects[0].id],selectionScope:'object',filamentIds:Array(16).fill('material')});
test('camera-space arrows project inverse-view movement to XY without renormalizing the vertical component',()=>{
 const right=new Matrix4().makeBasis({x:0,y:1,z:0},{x:0,y:0,z:1},{x:1,y:0,z:0}).toArray();
 assert.deepEqual(cameraRelativeNudge([10,0,0],right),[0,10,0]);assert.deepEqual(cameraRelativeNudge([0,10,0],right),[0,0,0]);
 const oblique=new Matrix4().makeRotationX(Math.PI/3).toArray();assert.ok(Math.abs(cameraRelativeNudge([0,10,0],oblique)[1]-5)<1e-12);
 assert.throws(()=>cameraRelativeNudge([1,0,0],[NaN]),/finite/);
});
test('camera arrows and material digits are context guarded; Shift+A is not the old incorrect deselect alias',()=>{
 assert.deepEqual(editorShortcut({key:'ArrowLeft',metaKey:true,shiftKey:true}),{action:'nudge',cameraSpace:true,delta:[-1,0,0]});
 assert.deepEqual(editorShortcut({key:'0'}),{action:'filamentDigit',digit:0});assert.equal(editorShortcut({key:'1'},{editing:true}),null);assert.equal(editorShortcut({key:'1'},{modal:true}),null);assert.equal(editorShortcut({key:'1'},{page:'Preview'}),null);assert.equal(editorShortcut({key:'a',ctrlKey:true,shiftKey:true}),null);
});
test('native 500 ms filament sequence distinguishes a delayed 1,10–16,7–9,and default0 with cancellable timers',()=>{
 const timers=new Map(),seen=[];let id=0;const sequence=createFilamentKeySequence(value=>seen.push(value),{schedule(fn,ms){assert.equal(ms,500);timers.set(++id,fn);return id;},cancel(id){timers.delete(id);}});
 sequence.push(1);assert.deepEqual(seen,[]);const expire=()=>{const values=[...timers.values()];timers.clear();values.forEach(fn=>fn());};expire();assert.deepEqual(seen,[1]);
 for(const [digit,expected]of [[0,10],[1,11],[6,16],[7,7],[9,9]]){sequence.push(1);sequence.push(digit);assert.equal(seen.at(-1),expected);assert.equal(timers.size,0);}
 sequence.push(0);assert.equal(seen.at(-1),0);sequence.push(1);sequence.clear();assert.equal(timers.size,0);assert.throws(()=>sequence.push(10),/digit/);
});
test('object material assignment updates every selected group and normal part while preserving modifier overrides and geometry',()=>{
 const mesh=part('body'),modifier=part('modifier','g','modifier_part',{filamentSlot:3,native:{...part('modifier').native,partType:'modifier_part',partSettings:{extruder:'3',sparse_infill_density:'60%'}}}),second=part('second','h'),other=part('other','elsewhere');
 const p=project([mesh,modifier,second,other]);p.selectedIds=['body','second'];const before=structuredClone(p),next=assignSelectedFilament(p,4);
 assert.deepEqual(p,before);assert.deepEqual(next.objects.map(o=>o.filamentSlot),[4,3,4,2]);for(const obj of next.objects.slice(0,3))assert.equal(obj.native.objectSettings.extruder,'4');assert.equal(next.objects[0].native.partSettings.extruder,undefined);assert.equal(next.objects[1].native.partSettings.extruder,'3');assert.equal(next.objects[0].native.meshSource,mesh.native.meshSource);assert.equal(next.objects[3],other);
});
test('part default inherits the parent; modifier0 stays inherited and negative/support parts cannot receive materials',()=>{
 const p=project([part('a'),part('b','g','modifier_part'),part('c','g','negative_part'),part('d','g','support_enforcer')]);p.selectionScope='part';p.selectedIds=['a','b','c','d'];const next=assignSelectedFilament(p,0);assert.equal(next.objects[0].native.partSettings.extruder,'2');assert.equal(next.objects[1].native.partSettings.extruder,'0');assert.deepEqual(next.objects.map(o=>o.filamentSlot),[2,2,2,2]);assert.equal(next.objects[2],p.objects[2]);assert.equal(next.objects[3],p.objects[3]);assert.ok(next.objects.every(o=>o.native.objectSettings.extruder==='2'));
});
test('out-of-range and empty-selection assignments leave the project untouched; object0 resets to first filament',()=>{
 const p=project([part('a')]);assert.equal(assignSelectedFilament(p,17),p);const empty={...p,selectedId:null,selectedIds:[]};assert.equal(assignSelectedFilament(empty,3),empty);const next=assignSelectedFilament(p,0);assert.equal(next.objects[0].filamentSlot,1);assert.equal(next.objects[0].native.objectSettings.extruder,'1');assert.throws(()=>assignSelectedFilament(p,1.5),/Invalid/);
});

test("native printable toggle makes mixed selected groups uniform and leaves part selections unchanged",()=>{const p=project([part("a"),part("b","h","normal_part",{printable:false})]);p.selectedIds=["a","b"];const next=toggleSelectedPrintable(p);assert.deepEqual(next.objects.map(o=>o.printable),[false,false]);assert.deepEqual(toggleSelectedPrintable(next).objects.map(o=>o.printable),[true,true]);const parts={...p,selectionScope:"part"};assert.equal(toggleSelectedPrintable(parts),parts);});
