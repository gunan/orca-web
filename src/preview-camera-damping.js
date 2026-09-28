/** Preserve the default 60 Hz damping rate when native toolpath rendering is
 * slow. Pointer handlers keep their normal factor; only scheduled frames use
 * elapsed time. A fresh gesture starts a fresh clock after an idle interval. */
export function createPreviewCameraDamping(controls,{now=()=>performance.now()}={}) {
  const step=1000/60,base=controls.dampingFactor;
  let previous;
  const reset=()=>{previous=now();};
  const drain=()=>{
    const enabled=controls.enableDamping;
    controls.enableDamping=false;
    try { return controls.update(); }
    finally { controls.enableDamping=enabled; }
  };
  const update=()=>{
    const current=now(),elapsed=previous===undefined?step:current-previous;
    previous=current;
    const original=controls.dampingFactor;
    controls.dampingFactor=1-Math.pow(1-base,(elapsed>0?elapsed:step)/step);
    try {
      const moving=controls.update();
      // Clear the sub-threshold remainder so a later data redraw cannot nudge
      // the stopped camera. A final change event schedules its last frame.
      return !moving&&controls.enableDamping?drain():moving;
    }
    finally { controls.dampingFactor=original; }
  };
  const settle=()=>{try { return drain(); }finally { reset(); }};
  return {update,reset,settle};
}
