import test from'node:test';import assert from'node:assert/strict';import{createMesh}from'../../shared/geometry.js';import{replaceCutGeometry}from'../../shared/cut-geometry-lifecycle.js';
const make=(id,group=id)=>createMesh({id,name:id,plateId:'p',positions:[0,0,0,1,0,0,0,1,0],native:{groupId:group,partType:'normal_part',cutId:{id:'777',checkSum:'2',connectorsCount:'1'},cutConnector:{type:'plug',radiusTolerance:0,heightTolerance:0}}});
test('exact one-volume geometry correspondence retains cut identity and connector flags',()=>{
 const a=make('a'),b=make('b'),replacement=structuredClone(a);replacement.id='new';const result=replaceCutGeometry([a,b],['a'],[replacement]);assert.equal(result.invalidated,false);assert.deepEqual(result.parts[0].native.cutConnector,a.native.cutConnector);assert.equal(result.objects[0],b);
});
test('changed topology clears all family identities and connector flags while preserving every replacement surface',()=>{
 const a=make('a'),b=make('b'),other=make('other');other.native.cutId.id='888';const replacement=structuredClone(a);replacement.positions[3]=2;const result=replaceCutGeometry([a,b,other],['a'],[replacement]);assert.equal(result.invalidated,true);assert.ok(result.objects.filter(o=>o.id!=='other').every(o=>!o.native.cutId&&!o.native.cutConnector));assert.equal(result.objects.find(o=>o.id==='other'),other);assert.equal(result.parts[0].positions[3],2);assert.equal(a.native.cutId.id,'777');
});
test('split or assembly membership invalidates original families instead of duplicating stale connector flags',()=>{
 const a=make('a'),b=make('b'),part1=make('part1'),part2=make('part2');const split=replaceCutGeometry([a,b],['a'],[part1,part2]);assert.equal(split.objects.length,3);assert.ok(split.objects.every(o=>!o.native.cutId));const merged=replaceCutGeometry([a,b],['a','b'],[make('assembly')]);assert.equal(merged.objects.length,1);assert.equal(merged.parts[0].native.cutConnector,undefined);assert.throws(()=>replaceCutGeometry([a],['missing'],[]),/missing/);
});
