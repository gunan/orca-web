import {normalizeLayerHeightProfile} from './variable-layers.js';
import {layerHeightProfileFromRanges} from './layer-height-profile.js';

// Source: OrcaSlicer 2.4.2 / 8500fcd, Slicing.cpp:adjust_layer_height_profile.
// Native double arithmetic and six-pass band smoothing; native UI float strength.
const EPSILON=.0001, MAX_POINTS=100000;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const lerp=(a,b,t)=>(1-t)*a+t*b;
export const LAYER_BRUSH_ACTIONS=['increase','decrease','reduce','smooth'];

export function adjustLayerHeightProfile(value,context,{z,strength=Math.fround(.005),bandWidth=2,action='decrease'}={}) {
  if(!context||!['objectHeight','firstLayerHeight','layerHeight','minLayerHeight','maxLayerHeight'].every(key=>Number.isFinite(context[key])&&context[key]>0)||context.minLayerHeight>context.maxLayerHeight)throw new Error('Layer brush needs valid native slicing limits');
  if(!Number.isFinite(z)||!Number.isFinite(strength)||strength<=0||strength>1||!Number.isFinite(bandWidth)||bandWidth<1.5||bandWidth>10||!LAYER_BRUSH_ACTIONS.includes(action))throw new Error('Layer brush needs finite Z, positive strength, a 1.5–10 mm band and a supported action');
  const original=normalizeLayerHeightProfile(value,context);
  const profile=original.length?original:normalizeLayerHeightProfile(layerHeightProfileFromRanges(context),context);
  const first=context.firstLayerFixed?context.firstLayerHeight:0,top=context.objectHeight;
  if(z<first||z>top)return profile;
  let current=context.layerHeight;
  for(let i=0;i<profile.length;i+=2) {
    if(i+2===profile.length){current=profile[i+1];break;}
    if(profile[i+2]>z){current=lerp(profile[i+1],profile[i+3],(z-profile[i])/(profile[i+2]-profile[i]));break;}
  }
  for(const range of context.ranges||[])if(z>=range.minZ-current&&z<=range.maxZ+current)return profile;
  let delta=action==='decrease'?-strength:strength;
  if(action==='increase'||action==='decrease') {
    if(delta>0){if(current>=context.maxLayerHeight-EPSILON)return profile;delta=Math.min(delta,context.maxLayerHeight-current);}
    else{if(current<=context.minLayerHeight+EPSILON)return profile;delta=Math.max(delta,context.minLayerHeight-current);}
  }else{
    delta=Math.min(Math.abs(delta),Math.abs(context.layerHeight-current));
    if(delta<EPSILON)return profile;
  }
  const low=Math.max(first,z-bandWidth/2),high=z+bandWidth/2;
  // Pinned native source decrements an unsigned index before the first point.
  // Do not reproduce that unsafe boundary for a raft's unprotected Z=0 band.
  if(low===0)throw new Error('A layer brush band must stay above Z=0 when a raft leaves the first layer unfixed. Move the brush higher or reduce its width.');
  let index=0;
  while(index<profile.length&&profile[index]<low)index+=2;
  index-=2;
  const result=profile.slice(0,index+2),start=result.length;
  let sample=low;
  while(sample<high) {
    if(result.length>=MAX_POINTS*2-2)throw new Error('Layer brush exceeds the variable-profile point limit');
    const next=index+2,z1=profile[index],h1=profile[index+1];
    let height=next<profile.length?lerp(h1,profile[next+1],(sample-z1)/(profile[next]-z1)):h1;
    const weight=Math.abs(sample-z)<bandWidth/2?.5+.5*Math.cos(2*Math.PI*(sample-z)/bandWidth):0;
    if(action==='increase'||action==='decrease')height+=weight*delta;
    else if(action==='reduce'){
      const difference=height-context.layerHeight,step=weight*delta;
      height+=Math.abs(difference)>step?(difference>0?-step:step):-difference;
    }
    height=clamp(height,context.minLayerHeight,context.maxLayerHeight);
    if(sample===top) {
      if(result.at(-2)+EPSILON>sample)result.splice(-2);
      result.push(sample,height);index=profile.length;break;
    }
    if(result.at(-2)+EPSILON<sample)result.push(sample,height);
    sample=Math.min(sample+.1,top);
    index=next;
    while(index<profile.length&&profile[index]<sample)index+=2;
    index-=2;
  }
  index+=2;
  let end=result.length;
  if(index<profile.length)for(let i=index;i<profile.length;i++)result.push(profile[i]);
  else if(result.at(-2)+EPSILON*.5<top)result.push(...profile.slice(-2));
  if(action==='smooth') {
    let begin=start===0?1:start;
    if(end===result.length)end-=2;
    for(let pass=0;pass<6;pass++){
      const source=[...result];
      for(let i=begin;i<end;i+=2){
        const at=source[i],weight=Math.abs(at-z)<bandWidth/2?.25+.25*Math.cos(2*Math.PI*(at-z)/bandWidth):0;
        result[i+1]=(1-weight)*source[i+1]+(i===0?weight*source[i+3]:i+1===source.length?weight*source[i-1]:.5*weight*(source[i-1]+source[i+3]));
      }
    }
  }
  return normalizeLayerHeightProfile(result,context);
}
