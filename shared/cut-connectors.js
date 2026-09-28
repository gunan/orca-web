import{Quaternion,Vector3}from'three';
import{centeredConnectorPositions,nativeConnectorPrimitive,CONNECTOR_SHAPES}from'./cut-connector-geometry.js';
import{normalizeCutId,cutInformationForParts}from'./cut-metadata.js';
import{cutMesh,cutNativeGroup,nativeCutMembers}from'./geometry-cut.js';
import{createMesh,sceneBounds,meshBounds,translateMesh,transformPositions}from'./geometry.js';
// Native: GLGizmoCut.cpp:3164,3420,3462,4007; CutUtils.cpp:16,87.
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,i)=>v-b[i]);
export function cutPlaneFrame(normal=[0,0,1],offset=0){
 if(!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||Math.hypot(...normal)<1e-12||!Number.isFinite(offset))throw new Error('Invalid connector plane');
 const n=new Vector3(...normal).normalize(),q=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),n),u=new Vector3(1,0,0).applyQuaternion(q).toArray(),v=new Vector3(0,1,0).applyQuaternion(q).toArray();
 return{normal:n.toArray(),u,v,offset,origin:n.toArray().map(value=>value*offset)};
}
export function normalizeConnectorPlans(value=[]){
 if(!Array.isArray(value)||value.length>128)throw new Error('At most 128 cut connectors are supported');
 return value.map((item,index)=>{
  if(!item||!['plug','dowel','snap'].includes(item.type)||!['prism','frustum'].includes(item.style)||!Object.hasOwn(CONNECTOR_SHAPES,item.shape))throw new Error(`Connector ${index+1}: choose a native type, style and shape`);
  const number=(key,min,max,{open=false}={})=>{const v=item[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||open&&v===min)throw new Error(`Connector ${index+1}: invalid ${key}`);return v;};
  const result={type:item.type,style:item.type==='snap'?'prism':item.style,shape:item.type==='snap'?'circle':item.shape,u:number('u',-1e7,1e7),v:number('v',-1e7,1e7),diameter:number('diameter',0,1e7,{open:true}),depth:number('depth',0,1e7,{open:true}),radiusTolerance:number('radiusTolerance',0,1e7),heightTolerance:number('heightTolerance',0,1e7),rotation:number('rotation',-36000,36000),snapSpace:item.snapSpace??.3,snapBulge:item.snapBulge??.15};
  nativeConnectorPrimitive(result);if(result.type==='snap'&&result.depth<result.diameter)throw new Error(`Connector ${index+1}: snap depth must be at least its diameter`);return result;
 });
}
function pointOnPlane(plan,frame){return frame.origin.map((value,i)=>value+plan.u*frame.u[i]+plan.v*frame.v[i]);}
function transformedPrimitive(plan,frame,{hole=false,standalone=false}={}){
 const radius=Math.fround(plan.diameter/2),depth=Math.fround(plan.depth),dowel=plan.type==='dowel',baseHeight=dowel&&plan.style==='prism'?Math.fround(depth*2):depth;
 const actual=hole&&plan.type==='snap'?{...plan,type:'plug',style:'prism',shape:'circle'}:plan,positions=centeredConnectorPositions(actual),point=pointOnPlane(plan,frame),angle=-plan.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const scale=[radius+(hole?Math.fround(plan.radiusTolerance):0),radius+(hole?Math.fround(plan.radiusTolerance):0),baseHeight+(hole?Math.fround(plan.heightTolerance):0)];
 const shift=(dowel?0:depth/2)+(hole?Math.fround(plan.heightTolerance)/2-(dowel?0:.05):0);
 for(let i=0;i<positions.length;i+=3){let x=positions[i]*scale[0],y=positions[i+1]*scale[1],z=positions[i+2]*scale[2]+shift;if(standalone){positions[i]=x+point[0];positions[i+1]=y+point[1];positions[i+2]=z;continue;}[x,y]=[c*x-s*y,s*x+c*y];for(let axis=0;axis<3;axis++)positions[i+axis]=point[axis]+x*frame.u[axis]+y*frame.v[axis]+z*frame.normal[axis];}
 return positions;
}
function capTriangles(objects,frame){
 const result=[];for(const object of objects){const points=transformPositions(object);for(let i=0;i<points.length;i+=9){const triangle=[0,3,6].map(offset=>Array.from(points.slice(i+offset,i+offset+3)));if(triangle.every(point=>Math.abs(dot(point,frame.normal)-frame.offset)<1e-4))result.push(triangle);}}
 return result;
}
function within(point,triangles){
 return triangles.some(([a,b,c])=>{const v0=sub(b,a),v1=sub(c,a),v2=sub(point,a),d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),d20=dot(v2,v0),d21=dot(v2,v1),den=d00*d11-d01*d01;if(Math.abs(den)<1e-20)return false;const u=(d11*d20-d01*d21)/den,v=(d00*d21-d01*d20)/den;return u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8;});
}
function validatePlacement(plans,result,members,frame){
 const positive=capTriangles(result.upper.filter(o=>(o.native?.partType||'normal_part')==='normal_part'),frame),negative=capTriangles(result.upper.filter(o=>o.native?.partType==='negative_part'),frame),bounds=sceneBounds(members.filter(o=>(o.native?.partType||'normal_part')==='normal_part'));
 for(const[order,plan]of plans.entries()){
  const point=pointOnPlane(plan,frame),count=plan.shape==='circle'?60:CONNECTOR_SHAPES[plan.shape],samples=[point];
  // Native conflict checks sample 60 points for a circle (3/4/6 for polygons),
  // before applying axial rotation or clearances. This preserves that rule.
  for(let i=0;i<count;i++){const a=2*Math.PI*i/count,r=plan.diameter/2;samples.push(point.map((value,axis)=>value-r*Math.sin(a)*frame.u[axis]+r*Math.cos(a)*frame.v[axis]));}
  if(samples.some(sample=>!within(sample,positive)||within(sample,negative)))throw new Error(`Connector ${order+1} is outside the cut contour or intersects a negative volume`);
  const nominal=meshBounds(createMesh({positions:transformedPrimitive(plan,frame)}));if([0,1,2].some(axis=>nominal.min[axis]<bounds.min[axis]-.0001||nominal.max[axis]>bounds.max[axis]+.0001))throw new Error(`Connector ${order+1} extends outside the object bounds`);
  for(let i=0;i<order;i++)if(Math.hypot(plan.u-plans[i].u,plan.v-plans[i].v)<(plan.diameter+plans[i].diameter)/2)throw new Error(`Connectors ${i+1} and ${order+1} overlap`);
 }
}
function newIdentity(){const words=new Uint32Array(2);crypto.getRandomValues(words);return((BigInt(words[0])<<32n)|BigInt(words[1])||1n).toString();}
function increment(value,count){return(BigInt(value)+BigInt(count)).toString();}
function asPart(template,positions,name,native,plan){return createMesh({name,plateId:template.plateId,filamentSlot:template.filamentSlot||1,positions,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],native:{...native,partSettings:{},groupTransform:undefined},cutConnectorPlan:{...plan}});}
/** Native processed connectors are separate solids and negative volumes. No
 * approximate Boolean or facet-index transfer is used for new connector faces. */
export function cutNativeGroupWithConnectors(objects,selectedId,options={}){
 const plans=normalizeConnectorPlans(options.connectors||[]),members=nativeCutMembers(objects,selectedId),frame=cutPlaneFrame(options.normal,options.offset),existing=cutInformationForParts(members)?.cutId;
 if(plans.length&&(options.keep||'both')!=='both')throw new Error('Connectors require both cut sides');
 const result=cutNativeGroup(objects,selectedId,options);if(plans.length&&(!result.upper.length||!result.lower.length))throw new Error('Connectors require a normal part on both cut sides');
 if(plans.length)validatePlacement(plans,result,members,frame);
 const dowelCount=plans.filter(plan=>plan.type==='dowel').length,cutId=plans.length||existing?normalizeCutId({id:existing?.id||newIdentity(),checkSum:increment(existing?.checkSum||'1',(options.keep||'both')==='both'?1+dowelCount:0),connectorsCount:increment(existing?.connectorsCount||'0',plans.length)}):null;
 result.dowels=[];
 if(cutId){for(const object of result.created)object.native.cutId={...cutId};result.report.cutFamilyUpdate={...cutId};}
 for(const[index,plan]of plans.entries()){
  const connectorName=`Connector-${increment(existing?.connectorsCount||'0',index+1)}`,cutConnector={type:plan.type,radiusTolerance:Math.fround(plan.radiusTolerance),heightTolerance:Math.fround(plan.heightTolerance)},metadata=side=>({...side[0].native,cutId:{...cutId},cutConnector,partType:'negative_part'}),upperMeta=metadata(result.upper),lowerMeta=metadata(result.lower);
  const hole=asPart(result.upper[0],transformedPrimitive(plan,frame,{hole:true}),connectorName,upperMeta,plan);
  if(plan.type==='dowel'){
   const halves=cutMesh(hole,{normal:frame.normal,offset:frame.offset});
   const upper=translateMesh({...halves.upper,name:`${connectorName}_A`,native:upperMeta},frame.normal.map(value=>-.05*value)),lower=translateMesh({...halves.lower,name:`${connectorName}_B`,native:lowerMeta},frame.normal.map(value=>.05*value));result.upper.push(upper);result.lower.push(lower);result.created.push(upper,lower);
   let dowel=asPart(result.lower[0],transformedPrimitive(plan,frame,{standalone:true}),connectorName,{...lowerMeta,partType:'normal_part'},plan);dowel.native.groupId=dowel.id;dowel.native.objectName=`${members[0].native?.objectName||members[0].name} dowel ${index+1}`;dowel=translateMesh(dowel,[0,0,-meshBounds(dowel).min[2]]);result.dowels.push(dowel);result.created.push(dowel);
  }else{
   const solid=asPart(result.lower[0],transformedPrimitive(plan,frame),connectorName,{...lowerMeta,partType:'normal_part'},plan);result.upper.push(hole);result.lower.push(solid);result.created.push(hole,solid);
  }
 }
 // Native invalidates a variable profile whose endpoint no longer matches the
 // cut object's height. Clear it explicitly instead of silently rejecting later.
 let resetProfiles=0;for(const object of result.created)if(object.native?.layerHeightProfile?.length){object.native.layerHeightProfile=[];resetProfiles++;}
 result.objects=[...objects.filter(object=>!result.replaceIds.includes(object.id)).map(object=>cutId&&object.native?.cutId?.id===cutId.id?{...object,native:{...object.native,cutId:{...cutId}}}:object),...result.created];
 if(result.created.length>10000||result.created.reduce((sum,object)=>sum+object.positions.length/9,0)>2000000)throw new Error('Connector cut exceeds the project geometry limit');
 result.report.connectors=plans.length;result.report.dowels=dowelCount;result.report.resetLayerProfiles=resetProfiles;return result;
}
