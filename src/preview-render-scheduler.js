import {nativeFrameWait} from '../shared/native-graphics-preferences.js';
/** Demand rendering with the native frame-start pacing rule. The delay uses
 * whole milliseconds rounded up, so expensive rendering consumes the frame
 * budget. An idle canvas keeps neither a frame request nor a timer alive. */
export function createPreviewRenderScheduler({render,update=()=>false,request=requestAnimationFrame,cancel=cancelAnimationFrame,readFpsCap=()=>0,now=()=>performance.now(),delay=setTimeout,clearDelay=clearTimeout}){
 let pending=null,waiting=null,disposed=false,lastStart=-Infinity;
 const invalidate=()=>{if(!disposed&&pending===null&&waiting===null)pending=request(frame);};
 const frame=()=>{
  pending=null;if(disposed)return;
  const cap=readFpsCap(),current=now(),wait=nativeFrameWait(lastStart,current,cap);
  if(wait){waiting=delay(()=>{waiting=null;invalidate();},wait);return;}
  if(cap>0)lastStart=current;
  const moving=update();render();if(moving)invalidate();
 };
 return{invalidate,refresh(){if(waiting!==null){clearDelay(waiting);waiting=null;}invalidate();},dispose(){disposed=true;if(pending!==null)cancel(pending);if(waiting!==null)clearDelay(waiting);pending=waiting=null;}};
}
