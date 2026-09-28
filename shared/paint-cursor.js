import {meshBounds} from './geometry.js';
import {clippingSection} from './paint-clipping.js';
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>v.map(n=>n/Math.hypot(...v));
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
/** Pure cursor geometry in world millimetres. The circle is perpendicular to
 * the actual brush ray; the sphere remains isotropic after model scaling. */
export function paintCursorGeometry(mesh,{tool,point,frontDirection,radius=2,height=1,heightStart,atPointer=true}={}){
 if(!vector(point))throw new Error('Cursor needs a finite surface hit');
 if(tool==='sphere'||tool==='circle'){
  if(!Number.isFinite(radius)||radius<.4||radius>8)throw new Error('Native brush radius must be between 0.4 and 8');
  if(tool==='sphere')return{tool,center:[...point],radius};
  if(!vector(frontDirection)||Math.hypot(...frontDirection)<1e-12)throw new Error('Cursor needs a camera ray');const normal=unit(frontDirection),u=unit(cross(Math.abs(normal[2])<.9?[0,0,1]:[0,1,0],normal)),v=cross(normal,u),positions=[];
  for(let i=0;i<96;i+=2)for(const angle of [i*2*Math.PI/96,(i+1)*2*Math.PI/96])positions.push(...point.map((value,axis)=>value+radius*(u[axis]*Math.cos(angle)+v[axis]*Math.sin(angle))));
  return{tool,center:[...point],radius,normal,positions};
 }
 if(tool==='height'){
  if(!Number.isFinite(height)||height<.1||height>1000)throw new Error('Height range must be between 0.1 and 1000');
  const bounds=meshBounds(mesh),start=atPointer?Math.max(bounds.min[2],Math.min(bounds.max[2],point[2])):heightStart;
  if(!Number.isFinite(start))throw new Error('Height cursor needs a finite starting height');const range=[start,Math.min(bounds.max[2],start+height)],positions=[];
  for(const z of range){if(z<=bounds.min[2]||z>=bounds.max[2])continue;for(const loop of clippingSection(mesh,{normal:[0,0,1],offset:z}).contours)for(let i=0;i<loop.length;i++)positions.push(...loop[i],...loop[(i+1)%loop.length]);}
  return{tool,center:[...point],range,positions};
 }
 return null;
}
