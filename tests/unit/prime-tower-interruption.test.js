import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPrimeTowerInteraction} from '../../src/prime-tower-interaction.js';

function fixture(){
 const view=new EventTarget(),doc=new EventTarget();doc.defaultView=view;doc.hidden=false;
 const canvas=new EventTarget();Object.assign(canvas,{ownerDocument:doc,dataset:{},getBoundingClientRect:()=>({left:0,top:0,width:200,height:200}),focus(){},capture:null,setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(id){if(this.capture===id){this.capture=null;const event=new Event('lostpointercapture');Object.assign(event,{pointerId:id});this.dispatchEvent(event);}}});
 const camera=new THREE.PerspectiveCamera(45,1,.1,1000);camera.position.set(130,160,300);camera.lookAt(130,160,0);camera.updateMatrixWorld(true);
 const scene=new THREE.Scene(),meshes=new THREE.Group(),group=new THREE.Group();group.position.set(100,140,0);const mesh=new THREE.Mesh(new THREE.BoxGeometry(60,40,20),new THREE.MeshBasicMaterial());mesh.position.set(30,20,10);group.add(mesh);scene.add(group,meshes);
 const result={visible:true,plateId:'plate-1',position:[100,140],size:[60,40,20],dragContext:{version:1,space:'native-world',origin:[0,0],plateBounds:[[0,0],[200,200]],margin:3.5,scalingFactor:1e-6}};
 const selections=[],moves=[],orbit={enabled:true},transform={enabled:true,detach(){},axis:null};
 const options={mode:'Select',primeTowerPreview:{status:'ready',plateId:'plate-1',result},primeTowerSelected:null,onPrimeTowerSelect:(plate,details)=>{options.primeTowerSelected=plate;selections.push({plate,details});},onPrimeTowerMove:(...args)=>moves.push(args),onSelect(){}};
 const tool=createPrimeTowerInteraction({renderer:{domElement:canvas},camera,orbit,scene,meshes,transform},()=>options);tool.bind(group,result);
 const event=(type,properties={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,button:0,buttons:1,clientX:100,clientY:100,...properties});return e;};
 const start=()=>{assert.equal(tool.pointerDown(event('pointerdown')),true);assert.equal(tool.pointerMove(event('pointermove',{clientX:110,clientY:95})),true);assert.notDeepEqual(group.position.toArray().slice(0,2),result.position);};
 const state=()=>JSON.parse(canvas.dataset.primeTowerInteraction);
 return{tool,canvas,view,doc,group,result,options,orbit,transform,selections,moves,event,start,state};
}
for(const reason of ['lost capture','window blur','hidden page','preview replacement','tool switch','released button'])test(`tower ${reason} discards preview displacement, restores controls, and closes the gesture`,()=>{
 const f=fixture();try{f.start();
 if(reason==='lost capture')f.canvas.releasePointerCapture(1);
 if(reason==='window blur')f.view.dispatchEvent(new Event('blur'));
 if(reason==='hidden page'){f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));}
 if(reason==='preview replacement'){f.options.primeTowerPreview={status:'loading',plateId:'plate-1',result:null};f.tool.bind(null,null);}
 if(reason==='tool switch'){f.options.mode='Rotate';f.tool.sync();}
 if(reason==='released button')f.tool.pointerMove(f.event('pointermove',{buttons:0,clientX:120}));
 assert.equal(f.state().dragging,false);assert.deepEqual(f.group.position.toArray(),[100,140,0]);assert.deepEqual(f.moves,[]);assert.equal(f.canvas.capture,null);assert.equal(f.orbit.enabled,true);assert.equal(f.transform.enabled,true);assert.deepEqual(f.selections.at(-1),{plate:'plate-1',details:{dragging:false}});
 }finally{f.tool.dispose();}
});
test('foreign pointer events cannot move, replace or commit an active tower gesture',()=>{
 const f=fixture();try{f.start();const at=f.group.position.toArray();for(const [method,type]of[['pointerDown','pointerdown'],['pointerMove','pointermove'],['pointerUp','pointerup']])f.tool[method](f.event(type,{pointerId:2,clientX:170}));assert.equal(f.state().dragging,true);assert.deepEqual(f.group.position.toArray(),at);assert.deepEqual(f.moves,[]);f.tool.pointerUp(f.event('pointerup'));assert.equal(f.moves.length,1);}finally{f.tool.dispose();}
});
test('normal release commits once despite synchronous lost capture and retains prior control availability',()=>{
 const f=fixture();try{f.orbit.enabled=false;f.transform.enabled=false;f.start();const at=f.group.position.toArray().slice(0,2);f.tool.pointerUp(f.event('pointerup'));assert.deepEqual(f.moves,[[at,'plate-1']]);assert.equal(f.selections.filter(s=>!s.details.dragging).length,1);assert.equal(f.orbit.enabled,false);assert.equal(f.transform.enabled,false);}finally{f.tool.dispose();}
});
test('disposal cancels movement and removes interruption listeners without selecting into an unmounted owner',()=>{
 const f=fixture();f.start();const count=f.selections.length;f.tool.dispose();assert.deepEqual(f.moves,[]);assert.equal(f.selections.length,count);f.view.dispatchEvent(new Event('blur'));f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));f.canvas.dispatchEvent(f.event('lostpointercapture'));assert.equal(f.selections.length,count);
});
