/** Original GLGizmoMove3D::calc_projection, in world coordinates. */
export function primeTowerAxisProjection({center,handle,ray,shift=false,snapStep=1}){
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],subtract=(a,b)=>a.map((v,i)=>v-b[i]);
 if(![center,handle,...(ray||[])].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||ray?.length!==2||!Number.isFinite(snapStep)||snapStep<=0)throw new Error('Invalid native tower move projection');
 const start=subtract(handle,center),length=Math.sqrt(dot(start,start)),vector=subtract(ray[1],ray[0]),rayLength=Math.sqrt(dot(vector,vector));if(!rayLength)throw new Error('Native tower movement needs a nonempty camera ray');
 let projection=0;
 if(length){const direction=vector.map(v=>v/rayLength),distance=dot(subtract(handle,ray[0]),direction),intersection=ray[0].map((v,i)=>v+distance*direction[i]);projection=dot(subtract(intersection,handle),start.map(v=>v/length));}
 // C++ std::round rounds half values away from zero, including negative halves.
 return shift?snapStep*Math.sign(projection)*Math.round(Math.abs(projection/snapStep)):projection;
}
