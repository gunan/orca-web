import {Triangle,Vector3,Line3,Plane} from 'three';
const sub=(a,b)=>a.map((value,index)=>value-b[index]);
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const plus=(a,b,t=1)=>a.map((value,index)=>value+t*b[index]);
const distance=(a,b)=>Math.hypot(...sub(a,b));
export function distancePointSegment(point,a,b){const direction=sub(b,a),length=dot(direction,direction),t=length?Math.max(0,Math.min(1,dot(sub(point,a),direction)/length)):0;return distance(point,plus(a,direction,t));}
export function distanceSegments(a,b,c,d){
 let result=Math.min(distancePointSegment(a,c,d),distancePointSegment(b,c,d),distancePointSegment(c,a,b),distancePointSegment(d,a,b));
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),determinant=aa*cc-bb*bb;
 if(determinant>1e-12*aa*cc){const s=(bb*ee-cc*dd)/determinant,t=(aa*ee-bb*dd)/determinant;if(s>=0&&s<=1&&t>=0&&t<=1)result=Math.min(result,distance(plus(a,u,s),plus(c,v,t)));}
 return result;
}
/** Exact segment/triangle distance: an interior intersection or minimum from
 * segment endpoints and the three finite edge pairs. Also handles degenerate
 * projected triangles and zero-length pointer movements. */
export function distanceSegmentTriangle(vertices,a,b){
 const triangle=new Triangle(...vertices.map(point=>new Vector3(...point))),av=new Vector3(...a),bv=new Vector3(...b);let minimum=Math.min(...[triangle.closestPointToPoint(av,new Vector3()).distanceTo(av),triangle.closestPointToPoint(bv,new Vector3()).distanceTo(bv)].filter(Number.isFinite),Infinity);
 const normal=triangle.getNormal(new Vector3());if(normal.lengthSq()>1e-16){const hit=triangle.getPlane(new Plane()).intersectLine(new Line3(av,bv),new Vector3());if(hit&&triangle.containsPoint(hit))return 0;}
 for(let edge=0;edge<3;edge++)minimum=Math.min(minimum,distanceSegments(a,b,vertices[edge],vertices[(edge+1)%3]));return minimum;
}
