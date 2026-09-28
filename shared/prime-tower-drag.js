/** Selection::translate / WipeTower::move_box_inside_box (OrcaSlicer 2.4.2).
 * Native containment deliberately uses the unrotated shell, Float32 points,
 * truncated scaled coordinates, and no correction when either axis is too big.
 * Bounds and margin come from the request-owned native helper. */
export function constrainPrimeTowerDrag(result,displacement) {
 const c=result?.dragContext;
 if(!result?.visible||c?.version!==1||c.space!=='native-world')throw new Error('Native tower drag context is unavailable.');
 if(!Array.isArray(displacement)||displacement.length!==2||displacement.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw new Error('Invalid prime tower displacement.');
 const unit=c.scalingFactor,scalePoint=v=>Math.trunc(Math.fround(Math.fround(v)/Math.fround(unit)));
 const start=result.position.map((v,i)=>v+c.origin[i]),world=start.map((v,i)=>displacement[i]+v);
 const lower=world.map(scalePoint),upper=world.map((v,i)=>scalePoint(v+result.size[i]));
 const box=c.plateBounds.map(point=>point.map(scalePoint)),margin=Math.trunc(c.margin/unit),offset=[0,0];
 if(upper.every((v,i)=>v-lower[i]<box[1][i]-box[0][i]-2*margin))for(let i=0;i<2;i++){
  const delta=upper[i]>box[1][i]-margin?box[1][i]-margin-upper[i]:lower[i]<box[0][i]+margin?box[0][i]+margin-lower[i]:0;
  offset[i]=Math.fround(Math.fround(delta)*Math.fround(unit));
 }
 // Native adds the correction to the displacement before the starting origin.
 return start.map((v,i)=>(v+(displacement[i]+offset[i]))-c.origin[i]);
}
