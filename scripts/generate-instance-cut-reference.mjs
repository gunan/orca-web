import{Matrix4,Euler,Quaternion,Vector3}from'three';import{writeFile,readFile}from'node:fs/promises';import{execFileSync}from'node:child_process';import{cutFixture}from'../tests/fixtures/native-instance-cut-project.js';
const frame=(position,rotation=[0,0,0],scale=[1,1,1])=>new Matrix4().compose(new Vector3(...position),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(...scale));
const cases=[
 ['horizontal default',{}],['selected second instance',{selected:1}],
 ['tilt scale and mirror',{frames:[frame([40,40,10],[.2,.3,.4],[1.2,.8,1.3]),frame([100,40,10],[.2,.3,1.1],[-1.2,.8,1.3])]}],
 ['oblique upper and lower place on cut',{parts:1,normal:[1,0,1],flags:{upper:{placeOnCut:true},lower:{placeOnCut:true}}}],
 ['flip both sides',{flags:{upper:{flip:true},lower:{flip:true}}}],
 ['first instance auto-drop disabled',{autoDrops:[false,true],frames:[frame([40,40,10]),frame([100,40,16],[0,0,Math.PI/2])]}],
 ['both instances auto-drop disabled',{autoDrops:[false,false]}],
 ['two native plates',{multiPlate:true,selected:1}],
 ['retain one side',{keep:'upper'}],
 ['upright prism dowels',{parts:1,connector:'dowel',autoDrops:[false,true]}],
 ['plug connector volumes',{parts:1,connector:'plug'}]
].map(([name,options])=>({name,request:cutFixture(options).prepared.request}));
await writeFile('.reference-cut/input.json',JSON.stringify(cases.map(c=>c.request)));execFileSync('.reference-cut/instance-cut-reference',['.reference-cut/input.json','.reference-cut/output.json']);const expected=JSON.parse(await readFile('.reference-cut/output.json')),source=JSON.parse(await readFile('.reference-cut/source.json'));for(let i=0;i<cases.length;i++)cases[i].expected=expected[i];await writeFile('tests/fixtures/native-instance-cut-reference.json',JSON.stringify({...source,cases},null,2)+'\n');console.log(cases.length);
