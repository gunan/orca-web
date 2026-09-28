import{layerHeightProfileFromRanges}from'./layer-height-profile.js';
// OrcaSlicer 2.4.2 / 8500fcd Slicing.cpp:807,903. Native GUI passes false for
// precise-Z adjustment; these are display layers, not a replacement slicer.
const PALETTE=[[26,152,80],[102,189,99],[166,217,106],[217,241,235],[254,230,235],[253,174,97],[244,109,67],[215,48,39]],clamp=(v,min,max)=>Math.min(max,Math.max(min,v)),lerp=(a,b,t)=>(1-t)*a+t*b;
function parameters(context){
 if(!context||!['objectHeight','firstLayerHeight','layerHeight','minLayerHeight','maxLayerHeight'].every(key=>Number.isFinite(context[key])&&context[key]>0)||context.minLayerHeight>context.maxLayerHeight)throw new Error('Layer preview needs valid native slicing parameters');
 const shrink=context.shrinkageCompensationZ??1;if(!Number.isFinite(shrink)||shrink<=0||shrink>1000)throw new Error('Invalid native Z shrinkage compensation');return{...context,shrink,printHeight:context.objectHeight*shrink};
}
export function generateObjectLayers(value,context){
 const p=parameters(context),profile=value.length?value:layerHeightProfileFromRanges(context,{editable:false});if(!Array.isArray(profile)||profile.length<4||profile.length%2||profile.length>200000)throw new Error('Layer preview needs a valid native profile');
 for(let i=0;i<profile.length;i+=2)if(!Number.isFinite(profile[i])||profile[i]<0||i&&profile[i]<profile[i-2]||!Number.isFinite(profile[i+1])||profile[i+1]<=0)throw new Error('Invalid layer preview profile');
 let printZ=0,index=0;const out=[];if(p.firstLayerFixed){out.push(0);printZ=p.firstLayerHeight;out.push(printZ);}let sliceZ=printZ+.5*p.minLayerHeight;
 while(sliceZ<p.printHeight){if(out.length>=400000)throw new Error('Layer preview exceeds the 200000-layer resource limit');let height=p.minLayerHeight;if(index<profile.length){let next=index+2;while(next<profile.length&&sliceZ>=profile[next]*p.shrink){index=next;next+=2;}const z1=profile[index]*p.shrink,h1=profile[index+1];height=h1;if(next<profile.length)height=lerp(h1,profile[next+1],(sliceZ-z1)/(profile[next]*p.shrink-z1));}
  if(!Number.isFinite(height)||height<=0)throw new Error('Layer preview produced an invalid height');sliceZ=printZ+.5*height;if(sliceZ>=p.printHeight)break;out.push(printZ);printZ+=height;sliceZ=printZ+.5*p.minLayerHeight;out.push(printZ);
 }
 return out;
}
export function generateLayerHeightTexture(value,context,{width=1024,height=1024}={}){
 const p=parameters(context);if(![width,height].every(n=>Number.isInteger(n)&&n>=8&&n<=2048&&n%2===0))throw new Error('Layer texture dimensions must be even values from 8 to 2048');
 const layers=generateObjectLayers(value,context),cells=Math.min((width-1)*height,Math.ceil(16*p.printHeight/p.minLayerHeight)),cells1=Math.floor(cells/2),width1=width/2,height1=height/2;
 // Native reserves a quarter-sized second LOD but can overrun it for extremely
 // tall/thin-layer objects. Reject this unsafe case rather than mimic overflow.
 if(cells<4||cells1>(width1-1)*height1)throw new Error('Layer preview exceeds the native two-level texture capacity');
 const data=new Uint8Array(width*height*4),lod=new Uint8Array(width1*height1*4),scale=2*Math.max(p.maxLayerHeight-p.layerHeight,p.layerHeight-p.minLayerHeight)||p.layerHeight;
 for(let layer=0;layer<layers.length;layer+=2){const lo=layers[layer],hi=Math.min(layers[layer+1],p.printHeight),h=layers[layer+1]-lo,mid=.5*(lo+layers[layer+1]),colorIndex=(.5*scale+(h-p.layerHeight))*7/scale,index=clamp(Math.floor(colorIndex),0,7),next=Math.min(7,index+1),t=colorIndex-index,color=PALETTE[index].map((v,axis)=>lerp(v,PALETTE[next][axis],t));
  for(const[target,n,cols,stripes]of [[data,cells,width,true],[lod,cells1,width1,false]]){const zToCell=(n-1)/p.printHeight,cellToZ=p.printHeight/(n-1),first=clamp(Math.ceil(lo*zToCell),0,n-1),last=clamp(Math.floor(hi*zToCell),0,n-1);
   for(let cell=first;cell<=last;cell++){const row=Math.floor(cell/(cols-1)),col=cell-row*(cols-1),offset=(row*cols+col)*4,intensity=stripes?Math.cos(Math.PI*.7*(mid-cellToZ*cell)/h):1;for(let axis=0;axis<3;axis++)target[offset+axis]=clamp(Math.floor(intensity*color[axis]+.5),0,255);target[offset+3]=255;if(col===0&&row>0)target.set(target.subarray(offset,offset+4),offset-4);}
  }
 }
 return{data,lod,width,height,cells,layerCount:layers.length/2,printHeight:p.printHeight};
}
// Bilinear sample matches native color-bar base texture; 3D shader blends LOD
// by screen derivatives exactly as the pinned variable_layer_height shader.
export function sampleLayerHeightTexture(texture,z,{lod=false}={}){
 const{width,height,cells,printHeight}=texture,grid=lod?texture.lod:texture.data,w=lod?width/2:width,h=lod?height/2:height,rowValue=(cells-1)/(width*printHeight)*z,row=Math.floor(rowValue);if(row<0)return[64,64,64,255];
 const u=rowValue-row,v=(lod?row*2+1:row+.5)/height,x=u*w-.5,y=v*h-.5,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
 const read=(ix,iy,channel)=>grid[(clamp(iy,0,h-1)*w+clamp(ix,0,w-1))*4+channel];return[0,1,2,3].map(channel=>lerp(lerp(read(x0,y0,channel),read(x0+1,y0,channel),fx),lerp(read(x0,y0+1,channel),read(x0+1,y0+1,channel),fx),fy));
}
export function layerCursorBlend(z,cursorZ,bandWidth){return cursorZ==null?0:.25*Math.cos(Math.min(Math.PI,Math.abs(Math.PI*(z-cursorZ)*1.8/bandWidth)))+.25;}
