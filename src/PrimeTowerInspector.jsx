import React from 'react';
import {primeTowerState} from '../shared/prime-tower.js';
export default function PrimeTowerInspector({project,process,onEdit}) {
 let state;try{state=primeTowerState(project,process);}catch{return null;}
 return <section aria-label="Selected prime tower"><h3>Prime tower</h3><p>Drag the tower to move it on this plate.</p><dl><dt>X</dt><dd>{state.x.toLocaleString(undefined,{maximumFractionDigits:3})} mm</dd><dt>Y</dt><dd>{state.y.toLocaleString(undefined,{maximumFractionDigits:3})} mm</dd><dt>Width</dt><dd>{state.width.toLocaleString(undefined,{maximumFractionDigits:3})} mm</dd></dl><button onClick={onEdit}>Edit prime tower settings</button></section>;
}
