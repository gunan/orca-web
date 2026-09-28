/** Native GLGizmoPainterBase button and modifier-wheel semantics (2.4.2).
 * Color painting reserves right drag for navigation; fuzzy right erases. */
export function paintButtonState(channel,{button=0,shiftKey=false,state=1}={}){
 if(!['supports','seam','fuzzy','color'].includes(channel))throw new Error('Unknown painting channel');
 if(button!==0&&button!==2||button===2&&channel==='color')return null;
 if(shiftKey)return 0;if(button===2)return channel==='fuzzy'?0:2;return state;
}
const F=Math.fround,clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function paintWheelChange(current,{deltaY,ctrlKey=false,metaKey=false,altKey=false}={}){
 if(!Number.isFinite(deltaY)||deltaY===0)return null;const sign=deltaY<0?1:-1;
 if(ctrlKey||metaKey){
  const spec=current.tool==='height'?['height',.1,8,.2]:['circle','sphere'].includes(current.tool)?['radius',.4,8,.2]:['fill','bucket'].includes(current.tool)?['fillAngle',0,90,1]:current.tool==='gap'?['gapArea',0,5,.2]:null;
  if(!spec)return null;const[key,min,max,step]=spec;if(!Number.isFinite(current[key]))throw new Error('Painting wheel control needs a finite value');return{[key]:clamp(F(F(current[key])+F(sign*step)),F(min),F(max))};
 }
 if(altKey){if(!Number.isFinite(current.clipRatio))throw new Error('Clipping wheel needs a finite ratio');return{clipRatio:clamp(current.clipRatio+sign*.01,0,1)};}
 return null;
}
export function constrainedPaintPosition(previous,current,constraint='none'){
 if(!['none','vertical','horizontal'].includes(constraint)||!Array.isArray(current)||current.length!==2||!current.every(Number.isFinite))throw new Error('Invalid paint screen constraint');
 if(!previous||constraint==='none')return[...current];if(!Array.isArray(previous)||previous.length!==2||!previous.every(Number.isFinite))throw new Error('Invalid previous paint position');return constraint==='vertical'?[previous[0],current[1]]:[current[0],previous[1]];
}
