import{Matrix4,Euler,Quaternion,Vector3}from'three';import{readFile,writeFile}from'node:fs/promises';import{execFileSync}from'node:child_process';
const matrix=(p,r,s=[1,1,1])=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r,'XYZ')),new Vector3(...s)).toArray();
const cases=[
 {name:'translate-z-auto-drop',old:matrix([20,30,5],[.2,.1,.3]),current:matrix([23,34,8],[.2,.1,.3]),rotation:'none'},
 {name:'world-z-only',old:matrix([20,30,5],[0,0,.3]),current:matrix([20,30,5],[0,0,1.1]),rotation:'none'},
 {name:'tilt-general',old:matrix([20,30,5],[.2,.1,.3]),current:matrix([20,30,7],[.5,.2,.3])},
 {name:'nonuniform-scale',old:matrix([20,30,5],[.2,.1,.3]),current:matrix([20,30,5],[.2,.1,.3],[2,.6,1.5])},
 {name:'mirrored-even-NONE',old:matrix([20,30,5],[.2,.1,.3]),current:matrix([20,30,5],[.2,.1,.3],[-1,1,1]),rotation:'none'},
 {name:'SLA-no-Z-sync',old:matrix([20,30,5],[.2,.1,.3]),current:matrix([20,30,8],[.5,.2,.3]),sla:true},
];
for(const row of cases){const first=new Matrix4().fromArray(row.old),oldPeer=new Matrix4().makeRotationZ(.7).multiply(first).setPosition(80,90,3).toArray();row.peers=[{matrix:oldPeer,autoDrop:true},{matrix:oldPeer,autoDrop:false}];}
await writeFile('.reference/input.json',JSON.stringify(cases));execFileSync('.reference/instance-reference',['.reference/input.json','.reference/output.json']);const results=JSON.parse(await readFile('.reference/output.json'));const provenance=JSON.parse(await readFile('.reference/source.json'));await writeFile('tests/fixtures/native-instance-reference.json',JSON.stringify({...provenance,basis:'Unchanged native Selection.cpp method compiled with Eigen and a GUI ownership shim; no production JavaScript calculations',cases:cases.map((input,i)=>({input,expected:results[i]}))},null,2)+'\n');
