import {Matrix4,Vector3} from 'three';
import {fixture} from './native-instance-project.js';
import {cutNativeGroupWithConnectors} from '../../shared/cut-connectors.js';
import {prepareNativeInstanceCut} from '../../shared/native-instance-cut.js';
import {sceneBounds,meshBounds} from '../../shared/geometry.js';
import {nativeBed} from '../../shared/native-project.js';
export function cutFixture({frames,flags={},selected=0,multiPlate=false,autoDrops=[true,true],keep='both',normal=[0,0,1],connector,parts=2}={}){
 const project=fixture({parts});
 if(multiPlate)project.plates.push({...structuredClone(project.plates[0]),id:'plate-2',name:'Plate 2'});
 for(const object of project.objects){delete object.painting;const index=Number(object.id[1]),source=object.native.meshSource;
  if(frames){source.build=frames[index].toArray();const combined=frames[index].clone().multiply(new Matrix4().fromArray(source.component));object.positions=[];for(let i=0;i<source.triangles.length;i+=3)for(const corner of combined.determinant()<0?[0,2,1]:[0,1,2])object.positions.push(...new Vector3(...source.vertices.slice(source.triangles[i+corner]*3,source.triangles[i+corner]*3+3)).applyMatrix4(combined).toArray());}
  object.native.instanceAutoDrop=autoDrops[index];if(multiPlate&&index===1)object.plateId='plate-2';
 }
 const selectedId=`i${selected}p0`,members=project.objects.filter(o=>o.id.startsWith(`i${selected}`)),bounds=sceneBounds(members),n=new Vector3(...normal).normalize(),offset=n.dot(new Vector3(...bounds.center));
 const connectors=connector?[{type:connector,style:'prism',shape:'circle',u:meshBounds(members[0]).center[0],v:meshBounds(members[0]).center[1],diameter:2,depth:2,radiusTolerance:.1,heightTolerance:.1,rotation:0}]:[];
 const cut=cutNativeGroupWithConnectors(project.objects,selectedId,{normal,offset,keep,connectors});
 const prepared=prepareNativeInstanceCut({objects:project.objects,plates:project.plates,selectedId,bed:nativeBed(project.nativeSettings)},cut,flags);
 return{project,cut,prepared};
}
