// OrcaSlicer 8500fcd: GLGizmoBrimEars.cpp, Polygon.cpp, MultiPoint.cpp,
// TriangleMeshSlicer.cpp and ClipperUtils.cpp. See docs/parity/BRIM_EAR_TOOLS.md.
import Clipper from 'clipper-lib';
import {meshPointMatrix,brimEarMembers,normalizeBrimEars} from './brim-ears.js';
const F=Math.fround,S=1e6,ct=Clipper.ClipType,pt=Clipper.PolyType,ft=Clipper.PolyFillType;
// Orca's fork rounds toward +infinity, unlike the upstream JS port's negative
// ties. This module is the sole user of clipper-lib; pin both call sites.
const round=value=>value===.49999999999999994?0:Math.floor(value+.5);
Clipper.Clipper.Round=round;Clipper.ClipperOffset.Round=round;
const point=value=>({X:value[0],Y:value[1]}),array=value=>[value.X,value.Y];
const nextUp=value=>{const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,value);view.setBigUint64(0,view.getBigUint64(0)+1n);return view.getFloat64(0);};
export function douglasPeucker(points,tolerance){
 if(!points.length)return[];const output=[points[0]],stack=[points.length-1];let anchor=0,floater=points.length-1;
 if(!floater)return output;
 while(stack.length){let distance=0,furthest=anchor;const a=points[anchor],b=points[floater],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  for(let i=anchor+1;i<floater;i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;if(d>distance){distance=d;furthest=i;}}
  if(distance<=tolerance*tolerance){output.push(points[floater]);anchor=floater;stack.pop();floater=stack.at(-1);}else{floater=furthest;stack.push(floater);}
 }return output.map(p=>[...p]);
}
export function brimCornerPoints(polygon,{detectionRadius=1,maxAngle=125,outer=true}={}){
 if(!Number.isFinite(detectionRadius)||detectionRadius<0||detectionRadius>100)throw new Error('Detection radius must be between 0 and 100 mm');
 if(!Number.isFinite(maxAngle)||maxAngle<0||maxAngle>180)throw new Error('Max angle must be between 0 and 180 degrees');
 let points=polygon.map(p=>[...p]);if(points.length<3)return[];
 if(detectionRadius>0){points=douglasPeucker([...points,points[0]],F(detectionRadius)*S);if(points.length>4)points.pop();}
 const threshold=(180-F(maxAngle))*Math.PI/180,cos=Math.cos(nextUp(threshold)),output=[];
 for(let j=0;j<points.length;j++){const i=(j+points.length-1)%points.length,p=points[i],a=points[(i+points.length-1)%points.length],b=points[j],u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]],cross=u[0]*v[1]-u[1]*v[0];
  if((outer?cross>0:cross<0)&&(threshold<=1e-4||(u[0]/Math.hypot(...u))*(v[0]/Math.hypot(...v))+(u[1]/Math.hypot(...u))*(v[1]/Math.hypot(...v))<cos))output.push([...p]);
 }return output;
}
function execute(subject,clip=[],operation=ct.ctUnion,{tree=false,simple=false}={}){const c=new Clipper.Clipper();c.StrictlySimple=simple;c.AddPaths(subject,pt.ptSubject,true);c.AddPaths(clip,pt.ptClip,true);const result=tree?new Clipper.PolyTree():[];c.Execute(operation,result,ft.pftNonZero,ft.pftNonZero);return result;}
function exPolygons(paths){const result=[];function visit(node){for(const child of node.Childs()){if(!child.IsHole())result.push({contour:child.Contour().map(array),holes:child.Childs().filter(n=>n.IsHole()).map(n=>n.Contour().map(array))});visit(child);}}visit(execute(paths,[],ct.ctUnion,{tree:true}));return result;}
function toPaths(ex){return ex.flatMap(p=>[p.contour,...p.holes].map(path=>path.map(point)));}
function shortestEdges(path,delta){const tolerance=(Math.abs(delta)*.005)**2;let end=path.length-1;while(end>0&&(path[end].X-path[0].X)**2+(path[end].Y-path[0].Y)**2<tolerance)end--;const result=path.slice(0,1);for(let i=1;i<=end;i++)if((path[i].X-result.at(-1).X)**2+(path[i].Y-result.at(-1).Y)**2>=tolerance)result.push(path[i]);return result;}
function offsetPath(path,delta){const offset=new Clipper.ClipperOffset(3,.25),out=[];offset.AddPath(shortestEdges(path,delta),Clipper.JoinType.jtMiter,Clipper.EndType.etClosedPolygon);offset.Execute(out,delta);return out;}
function offsetEx(ex,delta){const paths=[];for(const p of ex){const contours=offsetPath(p.contour.map(point),delta);if(!contours.length)continue;const holes=p.holes.flatMap(h=>offsetPath(h.map(point),-delta));paths.push(...(delta<0?execute(contours,holes,ct.ctDifference):[...contours,...holes.map(h=>h.reverse())]));}return exPolygons(paths);}
/** Integer single-plane section of closed oriented meshes. Native's facet edge
 * ownership, float32 XY transform and integer intersection rounding are kept.
 * Native's heuristic open-chain mesh repair is deliberately rejected. */
export function brimFirstLayerLoops(object){
 const matrix=meshPointMatrix(object).elements.map((v,i)=>F(v*(i%4<2?S:1))),vertices=[],ids=new Map(),facets=[];
 if(object.positions.length/9>2e6)throw new Error('Brim detection exceeds the two-million-triangle limit');
 for(let i=0;i<object.positions.length;i+=3){const p=object.positions.slice(i,i+3).map(F),key=p.join(',');let id=ids.get(key);if(id===undefined){id=vertices.length;ids.set(key,id);vertices.push([0,1,2].map(a=>F(F(F(matrix[a]*p[0])+F(matrix[4+a]*p[1]))+F(F(matrix[8+a]*p[2])+matrix[12+a]))));}facets.push(id);if(vertices.length>2000000)throw new Error('Brim detection exceeds the vertex limit');}
 const mirrored=meshPointMatrix(object).determinant()<0,z=F(.1),lines=[];
 for(let i=0;i<facets.length;i+=3){const index=facets.slice(i,i+3);if(mirrored)[index[1],index[2]]=[index[2],index[1]];const v=index.map(id=>vertices[id]);if(v.every(p=>p[2]===v[0][2]))continue;let low=0;for(let j=1;j<3;j++)if(v[j][2]<v[low][2])low=j;const hits=[];let horizontal=false;
  for(let j=0;j<3;j++){let a=(low+j)%3,b=(a+1)%3;const pa=v[a],pb=v[b];if(pa[2]===z&&pb[2]===z){if(v.some(p=>p[2]<z))lines.push([pb.slice(0,2).map(Math.trunc),pa.slice(0,2).map(Math.trunc)]);horizontal=true;break;}
   if(pa[2]===z||pb[2]===z){const p=(pa[2]===z?pa:pb).slice(0,2).map(Math.trunc);if(!hits.some(h=>h[0]===p[0]&&h[1]===p[1]))hits.push(p);}
   else if((pa[2]<z&&pb[2]>z)||(pb[2]<z&&pa[2]>z)){if(index[a]>index[b])[a,b]=[b,a];const p=v[a],q=v[b],t=(z-q[2])/(p[2]-q[2]);hits.push([0,1].map(axis=>round(q[axis]+(p[axis]-q[axis])*t)));}
  }
  if(!horizontal&&hits.length===2)lines.push([hits[1],hits[0]]);
 }
 const outgoing=new Map(),key=p=>p.join(','),incoming=new Map();for(const [a,b]of lines){if(key(a)===key(b))continue;const k=key(a);if(outgoing.has(k))throw new Error('Brim detection found branching or overlapping facets; repair or separate the mesh');outgoing.set(k,[a,b]);incoming.set(key(b),(incoming.get(key(b))||0)+1);}
 if([...outgoing.keys()].some(k=>incoming.get(k)!==1)||incoming.size!==outgoing.size)throw new Error('Brim detection found an open section; repair the mesh');
 const loops=[];while(outgoing.size){let line=outgoing.values().next().value;const start=key(line[0]),loop=[];do{loop.push(line[0]);outgoing.delete(key(line[0]));const end=key(line[1]);if(end===start)break;line=outgoing.get(end);if(!line)throw new Error('Brim detection could not close the mesh section');}while(true);if(loop.length>=3)loops.push(loop);}
 if(loops.flat().length>100000)throw new Error('Brim detection exceeds the 100,000 section-vertex limit');return loops;
}
export function brimFirstLayerFromLoops(volumes){let positive=[],negative=[];for(const {role='normal_part',loops}of volumes){if(!['normal_part','negative_part'].includes(role))continue;const raw=exPolygons(loops.map(p=>p.map(point)));let ex=offsetEx(offsetEx(raw,F(F(.1)*S)),-F(F(F(.1)-F(.05))*S));const simplified=toPaths(ex).map(path=>douglasPeucker([...path.map(array),array(path[0])],F(.01*S)).slice(0,-1).map(point));ex=exPolygons(execute(simplified,[],ct.ctUnion,{simple:true}));if(role==='normal_part')positive=execute(positive,toPaths(ex));else negative=execute(negative,toPaths(ex));}return exPolygons(execute(positive,negative,ct.ctDifference));}
export function brimFirstLayer(objects,selectedId){return brimFirstLayerFromLoops(brimEarMembers(objects,selectedId).filter(object=>['normal_part','negative_part'].includes(object.native?.partType||'normal_part')).map(object=>({role:object.native?.partType||'normal_part',loops:brimFirstLayerLoops(object)})));}

export function brimDetectionRadiusMax(ex){let max=0;for(const p of ex){const points=[...p.contour,p.contour[0]];let tolerance=0,min=douglasPeucker(points,0).length,repeat=0,loops=0;while(true){tolerance+=10;const count=douglasPeucker(points,tolerance*S).length;if(count===min&&++repeat>1)break;min=count;if(++loops>100)break;}loops=0;while(true){tolerance--;const count=douglasPeucker(points,tolerance*S).length;if(count<=min)min=count;else break;if(++loops>100)break;}max=Math.max(max,tolerance+1);}return max>100||max<=0?100:max;}
export function defaultBrimDiameter(settings={}){let nozzle=settings.nozzle_diameter;nozzle=Number(Array.isArray(nozzle)?nozzle[0]:nozzle);const raw=settings.initial_layer_line_width;const width=typeof raw==='string'&&raw.endsWith('%')?parseFloat(raw)*nozzle/100:Number(raw);return Number.isFinite(width)&&width>=0?F(width*16):null;}
export function addBrimEar(ears,position,diameter){const ear={position:position.map(F),radius:F(diameter/2)};normalizeBrimEars([ear]);const same=ears.some(other=>other.position.every((v,i)=>F(v)===ear.position[i])&&Math.abs(F(F(other.radius)-ear.radius))<F(1e-4));return same?ears:normalizeBrimEars([...ears,ear]);}
export function autoBrimEars(ears,firstLayer,{diameter,maxAngle=125,detectionRadius=1}){let result=normalizeBrimEars(ears);for(const ex of firstLayer){for(const p of brimCornerPoints(ex.contour,{maxAngle,detectionRadius}))result=addBrimEar(result,[p[0]/S,p[1]/S,-.0001],diameter);for(const hole of ex.holes)for(const p of brimCornerPoints([...hole].reverse(),{maxAngle,detectionRadius,outer:false}))result=addBrimEar(result,[p[0]/S,p[1]/S,-.0001],diameter);}return result;}
/** GLGizmoBrimEars::find_single: 24-sided ear polygons may connect through
 * other ears, so iterate unions until no additional ear touches the model. */
export function disconnectedBrimEars(ears,firstLayer){let paths=toPaths(firstLayer),remaining=ears.map((ear,index)=>({index,path:Array.from({length:24},(_,i)=>{const angle=2*Math.PI*i/24,size=Math.trunc(ear.radius*S);return{X:Math.trunc(size*Math.cos(angle))+Math.trunc(F(ear.position[0])*S),Y:Math.trunc(size*Math.sin(angle))+Math.trunc(F(ear.position[1])*S)};})}));let changed=true;while(changed&&remaining.length){changed=false;remaining=remaining.filter(ear=>{if(execute(paths,[ear.path],ct.ctIntersection).length){paths=execute(paths,[ear.path]);changed=true;return false;}return true;});}return remaining.map(ear=>ear.index);}
