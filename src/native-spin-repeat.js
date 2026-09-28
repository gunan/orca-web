/** Native SpinInput starts a100ms timer with delta=direction*8.
 * The first three ticks halve delta; later ticks apply one step. */
export function createNativeSpinRepeat({step,setTimer=setInterval,clearTimer=clearInterval}){
 let timer=null,delta=0,disposed=false;
 const stop=()=>{if(timer!==null)clearTimer(timer);timer=null;delta=0;};
 return{start(direction){if(disposed)return;stop();step(direction);delta=direction*8;timer=setTimer(()=>{if(Math.abs(delta)>1){delta/=2;return;}step(delta);},100);},stop,dispose(){stop();disposed=true;}};
}
