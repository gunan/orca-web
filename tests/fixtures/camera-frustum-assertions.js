import {expect} from '@playwright/test';
import {Matrix4,Vector3} from 'three';
import {sceneBounds} from '../../shared/geometry.js';
const corners=b=>[b.min[0],b.max[0]].flatMap(x=>[b.min[1],b.max[1]].flatMap(y=>[b.min[2],b.max[2]].map(z=>[x,y,z])));
// Project source model bounds and independently transformed tower corners with
// the actual rendered camera matrices, rather than checking intended fit data.
export function expectSceneInCamera(objects,tower,frame){
 const view=new Matrix4().fromArray(frame.matrixWorldInverse),projection=new Matrix4().fromArray(frame.projectionMatrix);
 const points=corners(sceneBounds(objects.filter(o=>o.visible!==false)));
 if(tower?.visible)points.push(...corners({min:[0,0,0],max:tower.size}).map(v=>new Vector3(...v).applyAxisAngle(new Vector3(0,0,1),tower.rotation).add(new Vector3(...tower.position,0)).toArray()));
 for(const point of points){const ndc=new Vector3(...point).applyMatrix4(view).applyMatrix4(projection);expect(Math.abs(ndc.x),`horizontal clip at ${point}`).toBeLessThan(.94);expect(Math.abs(ndc.y),`vertical clip at ${point}`).toBeLessThan(.94);expect(ndc.z).toBeGreaterThan(-1);expect(ndc.z).toBeLessThan(1);}
}
