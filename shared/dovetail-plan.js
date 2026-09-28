import{cutPlaneFrame}from'./cut-connectors.js';
const f=Math.fround,dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
export const DOVETAIL_SOURCE={version:'2.4.2',revision:'8500fcdccaa10b5099ac20d252af3a7c560046f1',path:'src/libslic3r/CutUtils.cpp',line:557};
export function normalizeDovetail(value={}){
 const defaults={depth:2,width:8,flapAngle:60,grooveAngle:0,depthTolerance:.1,widthTolerance:.1,count:1,gap:10,rotation:0};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(defaults,key)))throw new Error('Unknown dovetail parameter');
 const p={...defaults,...value};for(const[key,n]of Object.entries(p))if(typeof n!=='number'||!Number.isFinite(n))throw new Error(`Dovetail ${key} must be finite`);
 if(p.depth<=0||p.width<=0||p.depth>10000||p.width>10000||p.flapAngle<30||p.flapAngle>120||p.grooveAngle<0||p.grooveAngle>15||!Number.isInteger(p.count)||p.count<1||p.count>100||p.gap<0||p.gap>10000||Math.abs(p.rotation)>360)throw new Error('Dovetails require positive depth/width, flap 30–120°, groove angle 0–15°, count 1–100 and nonnegative gap');
 for(const[clearance,dimension]of[['depthTolerance','depth'],['widthTolerance','width']])if(p[clearance]<Math.fround(-.1)||p[clearance]>Math.min(.3*p[dimension],1.5))throw new Error(`Dovetail ${clearance} must be between −0.1 and min(30% of ${dimension}, 1.5 mm)`);
 return p;
}
// Native fixed grabber uses inverse viewport zoom; absent that context, use
// the source's geometry-size fallback rather than invent a zoom value.
export function dovetailDefaults(bounds,{inverseZoom}={}){if(inverseZoom!==undefined&&(!Number.isFinite(inverseZoom)||inverseZoom<=0))throw new Error('Dovetail inverse zoom must be positive');const depth=inverseZoom===undefined?Math.max(1,bounds.size.reduce((a,b)=>a+b,0)/60):Math.max(1,f(.5*f(32*f(inverseZoom))));return normalizeDovetail({depth,width:4*depth});}
/** Source CutUtils.cpp performs these ordered half-space intersections. Each
 * resulting cell is a closed solid fragment assigned to one cut family side. */
export function createDovetailPlan({dovetail={},normal=[0,0,1],offset,center,radius}){
 const p=normalizeDovetail(dovetail),frame=cutPlaneFrame(normal,offset);if(!Array.isArray(center)||center.length!==3||!center.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0)throw new Error('Dovetail needs valid model bounds');
 const rotation=p.rotation*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation),u=frame.u.map((v,i)=>v*c+frame.v[i]*s),v=frame.v.map((n,i)=>n*c-frame.u[i]*s),origin=center.map((n,i)=>n+(offset-dot(center,frame.normal))*frame.normal[i]);
 const width=f(p.width),depth=f(p.depth),a=f(p.flapAngle*Math.PI/180),b=f(p.grooveAngle*Math.PI/180),half=depth/2,depthTolerance=f(p.depthTolerance),widthTolerance=f(p.widthTolerance),gap=f(p.gap),r=f(radius);
 if(-2*depth/Math.tan(a)>width)throw new Error('Dovetail flap width exceeds its groove width');
 const flap=f(depth/f(Math.sin(a))),outer=Math.max(.5*(width+2*flap*f(Math.cos(a))),f(.5*width))+f(.5*f(1.5*f(1.5*r)))*f(Math.tan(b)),grooveWidth=f(2*outer),shift=.5*f(width+f(depth/f(Math.tan(a))));
 const world=n=>u.map((x,i)=>x*n[0]+v[i]*n[1]+frame.normal[i]*n[2]);
 const plane=(n,point,keep)=>{const normal=world(n),position=origin.map((o,i)=>o+u[i]*point[0]+v[i]*point[1]+frame.normal[i]*point[2]);return{normal,offset:dot(normal,position),keep};};
 const z=(height,keep)=>plane([0,0,1],[0,0,height],keep),x=(position,keep)=>plane([1,0,0],[position,0,0],keep);
 const left=[-Math.sin(a)*Math.cos(b),Math.sin(a)*Math.sin(b),Math.cos(a)],right=[Math.sin(a)*Math.cos(b),Math.sin(a)*Math.sin(b),Math.cos(a)];
 const slab=[z(half,'lower'),z(-half,'upper')],cells=[{side:'upper',kind:'base',planes:[z(half,'upper')]},{side:'lower',kind:'base',planes:[z(-half,'lower')]}],grooves=[];
 for(let i=0;i<p.count;i++){
  const at=f(f(-.5*(p.count-1)+i)*f(gap+grooveWidth)),region=[...slab];if(i)region.push(x(f(f(f(-gap/2)-f(grooveWidth/2))+at),'upper'));if(i<p.count-1)region.push(x(f(f(f(gap/2)+f(grooveWidth/2))+at),'lower'));
  const L=plane(left,[at-shift,0,0],'lower'),R=plane(right,[at+shift,0,0],'lower'),Lt=plane(left,[at-shift+widthTolerance/2,0,0],'lower'),Rt=plane(right,[at+shift-widthTolerance/2,0,0],'lower');
  cells.push({side:'lower',kind:'left-flap',groove:i,planes:[...region,{...L,keep:'upper'}]},{side:'lower',kind:'right-flap',groove:i,planes:[...region,L,{...R,keep:'upper'}]},{side:'upper',kind:'tongue',groove:i,planes:[...region,L,R,z(-half+depthTolerance,'upper'),Lt,Rt]});grooves.push({center:at,left:L,right:R});
 }
 const hh=f(.5*f(1.5*f(1.5*r))),neck=f(.5*width),mouth=f(.5*f(width+f(f(2*flap)*f(Math.cos(a))))),taper=f(hh*f(Math.tan(b))),mouthOuter=f(neck+taper),neckOuter=f(mouth+taper),mouthInner=f(mouth-taper),outerMax=Math.max(mouthOuter,neckOuter),probes=[];
 for(let i=0;i<p.count;i++){const x=f(f(-.5*(p.count-1)+i)*f(gap+f(2*outerMax)));for(const pair of[[[-neckOuter,-hh,half],[-mouthInner,hh,half]],[[-mouthOuter,-hh,-half],[-neckOuter,hh,-half]],[[neckOuter,-hh,half],[mouthInner,hh,half]],[[mouthOuter,-hh,-half],[neckOuter,hh,-half]]])probes.push(pair.map(pt=>{const local=[f(pt[0]+x),pt[1],pt[2]];return origin.map((n,j)=>n+u[j]*local[0]+v[j]*local[1]+frame.normal[j]*local[2]);}));}
 return{source:DOVETAIL_SOURCE,parameters:p,probes,frame:{normal:frame.normal,u,v,origin},radius,grooveWidth,cells,grooves,halfDepth:half};
}
