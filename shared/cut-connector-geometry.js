// Direct port of OrcaSlicer 2.4.2 / 8500fcd TriangleMesh.cpp:920,962,1168,1221.
// Mesh vertices use native float32 arithmetic; native ModelVolume recenters the
// primitive's bounding box before GLGizmoCut applies radius/depth/rotation.
export const CONNECTOR_SHAPES={triangle:3,square:4,hexagon:6,circle:360};
const f=Math.fround,PI=Math.PI;
const rotate=(angle,radius)=>{angle=f(angle);return[f(-f(Math.sin(angle))*f(radius)),f(f(Math.cos(angle))*f(radius))];};
function prism(sectors,taper){
 const vertices=[[0,0,0],[0,0,1],[0,1,0],[0,taper,1]],faces=[],step=2*PI/sectors;
 for(let i=1;i<sectors;i++){vertices.push([...rotate(step*i,1),0],[...rotate(step*i,taper),1]);const id=vertices.length-1;faces.push([0,id-1,id-3],[id,1,id-2],[id,id-2,id-3],[id,id-3,id-1]);}
 const id=vertices.length-1;faces.push([0,2,id-1],[3,1,id],[id,2,3],[id,id-1,2]);return{vertices,faces};
}
function frustumDowel(sectors){
 const vertices=[],faces=[],sectorStep=f(2*PI/sectors),stackStep=f(PI/2);
 for(let i=0;i<=2;i++){const angle=.5*PI-f(stackStep*i),xy=Math.cos(angle),z=Math.sin(angle);if(i===0||i===2)vertices.push([f(xy),0,f(Math.sin(angle))]);else for(let j=0;j<sectors;j++){const a=f(sectorStep*j)+.25*PI;vertices.push([f(xy*Math.cos(a)),f(xy*Math.sin(a)),f(z)]);}}
 for(let i=0;i<2;i++){let k1=i===0?0:1+(i-1)*sectors,k2=i===0?1:k1+sectors;const first1=k1,first2=k2;for(let j=0;j<sectors;j++){let next1=k1,next2=k2;if(i!==0){next1=j+1===sectors?first1:k1+1;faces.push([k1,k2,next1]);}if(i+1!==2){next2=j+1===sectors?first2:k2+1;faces.push([next1,k2,next2]);}k1=next1;k2=next2;}}
 return{vertices,faces};
}
function snap(space,bulge){
 const vertices=[],faces=[],halfPI=f(.5*f(PI)),spaceLen=f(space),middle=f(1+f(bulge)),ba=f(Math.acos(spaceLen)),ta=f(Math.acos(f(spaceLen/.5))),bs=f(ba/10),ts=f(ta/10),flatten=f(f(1-middle)/middle);
 const middleRadius=angle=>{const sin=Math.sin(angle),sin2=f(sin*sin),flat2=f(f(1-flatten)*f(1-flatten));return f(Math.sqrt(f(1/f(1+f(f(f(1/flat2)-1)*sin2)))));};
 function addSides(b,t){vertices.push([...rotate(b,1),0],[...rotate(b,middleRadius(b)),.5],[...rotate(t,.5),1]);}
 for(const[center,rotation]of [[-spaceLen,halfPI],[spaceLen,f(3*halfPI)]]){
  const first=vertices.length,second=first+1;vertices.push([center,0,0],[center,0,1]);let b=f(rotation-ba),t=f(rotation-ta);addSides(b,t);let id=vertices.length-1;faces.push([first,id-2,id-1],[first,id-1,id],[first,id,second]);
  for(let step=0;step<20;step++){b=f(b+bs);t=f(t+ts);addSides(b,t);id=vertices.length-1;faces.push([first,id-2,id-5],[id-2,id-1,id-5],[id-1,id-4,id-5],[id-4,id-1,id],[id,id-3,id-4],[id,second,id-3]);}
  id=vertices.length-1;faces.push([first,second,id],[first,id,id-1],[first,id-1,id-2]);
 }
 return{vertices,faces};
}
export function nativeConnectorPrimitive({type='plug',style='prism',shape='circle',snapSpace=.3,snapBulge=.15}={}){
 if(!['plug','dowel','snap'].includes(type)||!['prism','frustum'].includes(style)||!Object.hasOwn(CONNECTOR_SHAPES,shape))throw new Error('Unsupported native connector type, style or shape');
 if(!Number.isFinite(snapSpace)||snapSpace<=0||snapSpace>=.5||!Number.isFinite(snapBulge)||snapBulge<0||snapBulge>1)throw new Error('Snap space must be between 0 and 0.5 and bulge between 0 and 1');
 return type==='snap'?snap(snapSpace,snapBulge):style==='prism'?prism(CONNECTOR_SHAPES[shape],1):type==='plug'?prism(CONNECTOR_SHAPES[shape],.5):frustumDowel(CONNECTOR_SHAPES[shape]);
}
export function centeredConnectorPositions(options){
 const{vertices,faces}=nativeConnectorPrimitive(options),center=[0,1,2].map(axis=>(Math.min(...vertices.map(v=>v[axis]))+Math.max(...vertices.map(v=>v[axis])))/2);
 const points=vertices.map(vertex=>vertex.map((value,axis)=>f(value-f(center[axis]))));return faces.flatMap(face=>face.flatMap(index=>points[index]));
}
