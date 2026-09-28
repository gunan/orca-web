import{Matrix4,Vector3,Euler,Quaternion}from'three';import{fixture}from'./native-instance-project.js';import{sceneBounds}from'../../shared/geometry.js';import{prepareNativeCutToParts}from'../../shared/native-cut-to-parts.js';import{nativeBed}from'../../shared/native-project.js';
const compose=(position,rotation=[0,0,0],scale=[1,1,1])=>new Matrix4().compose(new Vector3(...position),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(...scale));
export const cutPartsCases=[
 {name:'ordinary STL without retained frame',single:true,unretained:true,roles:['normal_part']},
 {name:'linked translated solids',roles:['normal_part']},
 {name:'two normal volumes preserve A B interleaving',roles:['normal_part','normal_part']},
 {name:'crossed and outside helpers retained exactly once',roles:['negative_part','normal_part','support_enforcer','modifier_part','support_blocker'],selected:1},
 {name:'tilted scaled mirrored source with oblique cut',roles:['normal_part'],normal:[1,0,1],frames:[compose([40,40,10],[.2,.3,.4],[1.2,.8,1.3]),compose([100,40,10],[.2,.3,1.1],[-1.2,.8,1.3])]},
 {name:'selected mirrored tilted instance',roles:['normal_part'],selected:1,normal:[1,0,1],frames:[compose([40,40,10],[.2,.3,.4],[1.2,.8,1.3]),compose([100,40,10],[.2,.3,1.1],[-1.2,.8,1.3])]},
 {name:'first instance no auto-drop',roles:['normal_part','negative_part'],autoDrops:[false,true]},
];
export function cutPartsFixture(options={}){
 const roles=options.roles||['normal_part'],project=fixture({parts:roles.length});if(options.single)project.objects=project.objects.filter(o=>o.id.startsWith('i0'));
 const frames=options.frames||[compose([40,40,10]),compose([100,40,10])],selected=options.selected||0,normal=new Vector3(...(options.normal||[0,0,1])).normalize();
 for(const o of project.objects){delete o.painting;const index=Number(o.id[1]),part=Number(o.id.slice(3)),source=o.native.meshSource,combined=frames[index].clone().multiply(new Matrix4().fromArray(source.component));source.build=frames[index].toArray();o.native.partType=roles[part];o.native.instanceAutoDrop=options.autoDrops?.[index]??true;o.native.objectSettings={wall_loops:'3'};o.native.partSettings={};o.positions=[];for(let i=0;i<source.triangles.length;i+=3)for(const corner of combined.determinant()<0?[0,2,1]:[0,1,2])o.positions.push(...new Vector3(...source.vertices.slice(source.triangles[i+corner]*3,source.triangles[i+corner]*3+3)).applyMatrix4(combined).toArray());}
 const selectedId=`i${selected}p${Math.max(0,roles.indexOf('normal_part'))}`,members=project.objects.filter(o=>o.id.startsWith(`i${selected}`)),bounds=sceneBounds(members.filter(o=>o.native.partType==='normal_part')),offset=normal.dot(new Vector3(...bounds.center));project.selectedId=selectedId;project.selectedIds=[selectedId];
 const sourceParts=project.objects.filter(o=>o.id.startsWith('i0')),input={name:'Shared',selected,instances:frames.slice(0,options.single?1:2).map((m,i)=>({matrix:m.toArray(),autoDrop:options.autoDrops?.[i]??true,printable:true})),parts:sourceParts.map(o=>({name:o.name,type:o.native.partType,vertices:Array.from({length:o.native.meshSource.vertices.length/3},(_,i)=>o.native.meshSource.vertices.slice(i*3,i*3+3)),triangles:Array.from({length:o.native.meshSource.triangles.length/3},(_,i)=>o.native.meshSource.triangles.slice(i*3,i*3+3)),matrix:o.native.meshSource.component})),cutMatrix:new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal)).setPosition(new Vector3(...bounds.center).sub(new Vector3().setFromMatrixPosition(frames[selected]))).toArray()};
 if(options.unretained)for(const o of project.objects){delete o.native.meshSource;delete o.native.instanceFamily;}
 const prepared=prepareNativeCutToParts({objects:project.objects,plates:project.plates,selectedId,bed:nativeBed(project.nativeSettings)},{normal:normal.toArray(),offset,keep:'both'});
 return{project,prepared,input,normal:normal.toArray(),offset};
}
