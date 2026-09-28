import test from'node:test';import assert from'node:assert/strict';import fixture from'../fixtures/cut-connectors-native-reference.json'with{type:'json'};
import{CONNECTOR_SHAPES,nativeConnectorPrimitive,centeredConnectorPositions}from'../../shared/cut-connector-geometry.js';import{analyzeMesh,createMesh,meshBounds}from'../../shared/geometry.js';
test('all native connector primitive vertices and triangles match independently compiled pinned native functions',()=>{
 for(const[shape,sectors]of Object.entries(CONNECTOR_SHAPES))for(const[type,style,index]of [['plug','prism',0],['dowel','prism',0],['plug','frustum',1],['dowel','frustum',2],['snap','prism','snap']]){
  const expected=fixture[index==='snap'?'snap':`${sectors}-${index}`],actual=nativeConnectorPrimitive({type,style,shape});assert.deepEqual(actual.faces,expected.faces,`${type}/${style}/${shape} faces`);assert.equal(actual.vertices.length,expected.vertices.length);for(let i=0;i<actual.vertices.length;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(actual.vertices[i][axis]-expected.vertices[i][axis])<2e-7,`${type}/${style}/${shape} v${i}.${axis}: ${actual.vertices[i][axis]} vs ${expected.vertices[i][axis]}`);
 }
});
test('native primitive recentering produces closed outward surfaces for every connector type and shape',()=>{
 for(const shape of Object.keys(CONNECTOR_SHAPES))for(const type of ['plug','dowel','snap'])for(const style of ['prism','frustum']){const mesh=createMesh({positions:centeredConnectorPositions({type,style,shape})}),analysis=analyzeMesh(mesh);assert.equal(analysis.manifold,true,`${shape}/${type}/${style}`);assert.ok(analysis.signedVolume>0);for(const coordinate of meshBounds(mesh).center)assert.ok(Math.abs(coordinate)<1e-6);}
 assert.throws(()=>nativeConnectorPrimitive({shape:'pentagon'}),/Unsupported/);assert.throws(()=>nativeConnectorPrimitive({type:'snap',snapSpace:.5}),/Snap/);
});
