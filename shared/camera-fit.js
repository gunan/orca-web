const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=value=>{const length=Math.hypot(...value);return value.map(item=>item/length);};
const views={Top:[0,-.00001,1],Bottom:[0,.00001,-1],Front:[0,-1,0],Back:[0,1,0],Right:[1,0,0],Left:[-1,0,0],Isometric:[1,-1,.8]};
/** Fit all eight world-space bounds corners into the actual camera frustum.
 * Isometric direction is normalized so three axis offsets do not multiply zoom. */
export function fitSceneCamera({bounds,aspect=1,fov=42,view='Isometric',padding=1.1,minExtent=0,orientation}){
  if(!bounds||!['min','max'].every(key=>Array.isArray(bounds[key])&&bounds[key].length===3&&bounds[key].every(Number.isFinite))||bounds.min.some((value,index)=>value>bounds.max[index]))throw new Error('Camera fit needs finite ordered bounds');
  if(!Number.isFinite(aspect)||aspect<=0||!Number.isFinite(fov)||fov<=0||fov>=179||!Number.isFinite(padding)||padding<1||!Number.isFinite(minExtent)||minExtent<0||!views[view])throw new Error('Invalid camera fit options');
  const target=bounds.min.map((value,index)=>(value+bounds.max[index])/2),size=bounds.max.map((value,index)=>value-bounds.min[index]),largest=Math.max(...size),scale=largest>0?Math.max(1,minExtent/largest):1;
  if(orientation&&(!['back','up'].every(key=>Array.isArray(orientation[key])&&orientation[key].length===3&&orientation[key].every(Number.isFinite))||Math.hypot(...orientation.back)<1e-12||Math.hypot(...orientation.up)<1e-12||Math.hypot(...cross(unit(orientation.up),unit(orientation.back)))<1e-12))throw new Error('Camera fit needs independent finite viewing axes');
  const half=size.map(value=>largest>0?value*scale/2:minExtent/2),back=unit(orientation?.back||views[view]),right=unit(cross(orientation?.up||[0,0,1],back)),up=unit(cross(back,right)),tanY=Math.tan(fov*Math.PI/360),tanX=tanY*aspect;
  let distance=1,orthoSpan=1;
  for(const x of [-half[0],half[0]])for(const y of [-half[1],half[1]])for(const z of [-half[2],half[2]]){
    const offset=[x,y,z],px=Math.abs(dot(offset,right)),py=Math.abs(dot(offset,up)),depth=dot(offset,back);
    distance=Math.max(distance,depth+padding*Math.max(px/tanX,py/tanY));
    orthoSpan=Math.max(orthoSpan,2*padding*Math.max(py,px/aspect));
  }
  return{target,position:target.map((value,index)=>value+back[index]*distance),distance,orthoSpan,right,up,back};
}
