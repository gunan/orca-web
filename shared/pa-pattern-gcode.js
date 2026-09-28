import {nativeLayerZ} from './native-gcode-tags.js';
import {generatePAPatternEvents} from './pa-pattern-calibration.js';
const n=(v,p=5)=>String(Number(v.toFixed(p)));
function accelerationCommand(config,value){const f=config.flavor;return f==='klipper'?`SET_VELOCITY_LIMIT ACCEL=${value}${config.accelToDecel?` ACCEL_TO_DECEL=${n(value*config.accelToDecelFactor/100)}`:''}`:f==='repetier'?`M201 X${value} Y${value}`:`M204 ${['marlin2','reprapfirmware'].includes(f)?'P':'S'}${value}`;}
export function serializePAPatternLayer(layer,pattern,index){
 const out=[`; ORCA_WEB_PA_PATTERN_START ${index} Z${n(layer.printZ)}`,';TYPE:Custom'];let width=null;
 for(const e of layer.events){if(e.type==='pa')out.push(e.command);else if(e.type==='acceleration')out.push(accelerationCommand(pattern.config,e.value));else if(e.type==='resetE')out.push('G92 E0 ; reset extrusion distance');else if(e.type==='speed')out.push(`G1 F${n(e.feed,3)}`);else if(e.type==='travel')out.push(`G1${e.x===undefined?'':` X${n(e.x,3)} Y${n(e.y,3)}`}${e.z===undefined?'':` Z${n(e.z,3)}`} F${n(e.feed,3)} ; ${e.comment||'native calibration travel'}`);else if(e.type==='retract'||e.type==='unretract')out.push(`G1 E${n(e.e)} F${n(e.feed,3)} ; ${e.type}`);else if(e.type==='extrude'){if(width!==e.width){width=e.width;out.push(`;WIDTH:${n(e.width,6)}`);}out.push(`G1 X${n(e.x,3)} Y${n(e.y,3)} E${n(e.e)} ; ${e.comment}`);}}
 out.push(`; ORCA_WEB_PA_PATTERN_END ${index} Z${n(layer.printZ)}`);return out.join('\n');
}
export function patternLayerEvents(plan){
 if(new Set(plan.paPatterns.map(pattern=>pattern.plateId)).size>1)throw new Error('Select one generated pattern plate before merging its layer commands');
 const generated=plan.paPatterns.map(pattern=>generatePAPatternEvents({request:plan.request,pattern}));
 return{mode:'SingleExtruder',items:generated[0].layers.map((layer,i)=>({type:'Custom',printZ:layer.printZ,extruder:1,color:'',extra:generated.map((value,j)=>serializePAPatternLayer(value.layers[i],plan.paPatterns[j],j)).join('\n')}))};
}
/** Native processing removes redundant feed-only commands and inserts M73.
 * Compare effective XYZ/E/F and calibration state commands, not whitespace. */
export function normalizePAPatternCommands(text,{initialFeed=null}={}){
 const result=[];let feed=initialFeed;
 for(const line of text.split(/\r?\n/)){const code=line.split(';')[0].trim();if(!code||/^M73\b/.test(code))continue;
  if(/^G1\b/.test(code)){const words=Object.fromEntries([...code.matchAll(/\b([XYZEF])([-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?)/g)].map(m=>[m[1],Number(m[2])]));if(words.F!==undefined)feed=words.F;delete words.F;if(Object.keys(words).length){if(feed===null)throw new Error('PA pattern motion has no known feedrate');result.push({motion:words,feed});}}
  else if(/^(?:G92 E0|M900 K|M572 D0 S|M233 X|M20[14] [XPS]|SET_PRESSURE_ADVANCE ADVANCE=|SET_VELOCITY_LIMIT ACCEL=)/.test(code))result.push({command:code});
  else throw new Error('Unexpected command inside generated PA pattern: '+code);
 }
 return result;
}
export function verifyPAPatternGcode(gcode,plan){
 const source=patternLayerEvents(plan),blocks=[...gcode.matchAll(/^; ORCA_WEB_PA_PATTERN_START (\d+) Z([\d.]+)\r?\n([\s\S]*?)^; ORCA_WEB_PA_PATTERN_END \1 Z\2\r?$/gm)];
 if(blocks.length!==plan.paPatterns.length*4||(gcode.match(/^; ORCA_WEB_PA_PATTERN_START /gm)||[]).length!==blocks.length)throw new Error('Native PA pattern output has missing or duplicate calibration layers');
 let blockIndex=0;
 for(let i=0;i<4;i++)for(const[index,pattern]of plan.paPatterns.entries()){
  const layer=generatePAPatternEvents({request:plan.request,pattern}).layers[i],expected=normalizePAPatternCommands(serializePAPatternLayer(layer,pattern,index)),block=blocks[blockIndex++];
  if(Number(block[1])!==index||Math.abs(Number(block[2])-layer.printZ)>1e-5)throw new Error('Native PA pattern layer identity changed');
  const precedingFeed=[...gcode.slice(0,block.index).matchAll(/^\s*G[0123]\b[^;\r\n]*?\bF([-+\d.]+)/gm)].at(-1);
  if(JSON.stringify(normalizePAPatternCommands(block[3],{initialFeed:precedingFeed?Number(precedingFeed[1]):null}))!==JSON.stringify(expected))throw new Error('Native output changed source-generated PA pattern motion, extrusion, speed or calibration commands');
 }
 const nativeLayers=gcode.split('\n').map(nativeLayerZ).filter(z=>z!==undefined),expectedZ=source.items.map(e=>e.printZ);if(nativeLayers.length!==4||nativeLayers.some((z,i)=>Math.abs(z-expectedZ[i])>1e-5))throw new Error('Native PA pattern needs its exact four native handle layers');
 return{mode:plan.request.mode,layers:4,patternCount:plan.paPatterns.length,paValues:plan.paPatterns[0].count,firstCommand:`PA ${plan.request.start}`,lastCommand:`PA ${plan.request.start}`,combinations:plan.paPatterns.map(p=>({speed:p.speed,acceleration:p.acceleration})),sourceGeneratedMoves:plan.paPatterns.reduce((sum,pattern)=>sum+generatePAPatternEvents({request:plan.request,pattern}).events.filter(e=>['travel','extrude','retract','unretract'].includes(e.type)).length,0)};
}
