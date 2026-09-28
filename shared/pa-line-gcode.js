import {isNativeLayerChange,nativeFeature} from './native-gcode-tags.js';
import {generatePALineEvents} from './pa-line-calibration.js';
const number=(value,digits=5)=>String(Number(value.toFixed(digits)));
function motionSettings(p){
 const flavor=p.config.flavor,lines=[];let acceleration=Math.floor(p.outerAcceleration+.5);
 if(p.maxAcceleration>0)acceleration=Math.min(acceleration,p.maxAcceleration);
 if(acceleration>0)lines.push(flavor==='klipper'?`SET_VELOCITY_LIMIT ACCEL=${acceleration}${p.accelToDecel?` ACCEL_TO_DECEL=${number(acceleration*p.accelToDecelFactor/100)}`:''}`:flavor==='repetier'?`M201 X${acceleration} Y${acceleration}`:`M204 ${['marlin2','reprapfirmware'].includes(flavor)?'P':'S'}${acceleration}`);
 if(p.outerJerk>=.01){const [x,y]=p.maxJerk.map(limit=>limit>0?Math.min(limit,p.outerJerk):p.outerJerk);lines.push(flavor==='klipper'?`SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=${number(Math.min(x,y))}`:flavor==='repetier'?`M207 X${number(Math.min(x,y))}`:`M205 X${number(x)} Y${number(y)}`);}
 return lines;
}
/** Native calibration has no CLI switch. Keep the engine-expanded preamble and
 * end templates, and replace only the trusted preview-asset body with the
 * source generator's commands. The session layer verifies the asset/presets. */
export function applyPALineGcode(gcode,plan){
 const lines=gcode.split(/\r?\n/),start=lines.findIndex(isNativeLayerChange),lastObject=lines.findLastIndex(line=>/^; stop printing object /.test(line)),end=lines.findIndex((line,index)=>index>lastObject&&nativeFeature(line)==='Custom'),finish=lines.indexOf('; EXECUTABLE_BLOCK_END'),configStart=lines.indexOf('; CONFIG_BLOCK_START');
 if(start<0||end<=start||finish<=end||configStart<=finish)throw new Error('Native PA line carrier boundaries are missing');
 if(!lines.slice(start,end).some(line=>/^; stop printing object /.test(line)))throw new Error('Native PA line carrier object labels are missing');
 if(lines.slice(0,start).some(line=>/^(?:G20|G91)\b/.test(line)))throw new Error('PA line start G-code requires absolute millimetre coordinates');
 const relative=plan.paLine.config.relative,mode=lines.slice(0,start).filter(line=>/^M8[23]\b/.test(line)).at(-1);
 if(!mode?.startsWith(relative?'M83':'M82'))throw new Error('PA line extrusion mode does not match the native preamble');
 if(lines.slice(0,start).some(line=>/^(?:G92\s+.*[XYZ]|G5[4-9]|G10\b|G11\b|T[1-9])/.test(line)))throw new Error('PA lines do not support coordinate transforms or extruder changes in the native start template');
 const generated=generatePALineEvents(plan),p=plan.paLine,body=['; ORCA_WEB_PA_LINE_BODY_START',...motionSettings(p),'G92 E0 ; source generator extrusion origin'];
 const bambu=lines[start].trim()==='; CHANGE_LAYER';
 let layer=0,z=null,width=null;
 for(const e of generated.events){
  if(e.type==='travel'&&e.z!==undefined&&e.z!==z){z=e.z;layer++;body.push(bambu?'; CHANGE_LAYER':';LAYER_CHANGE',`${bambu?'; Z_HEIGHT: ':';Z:'}${number(z-p.config.zOffset,6)}`,`${bambu?'; LAYER_HEIGHT: ':';HEIGHT:'}${number(p.layerHeight,6)}`,bambu?'; FEATURE: Outer wall':';TYPE:Outer wall');}
  if(e.type==='pa')body.push(e.command);
  else if(e.type==='speed')body.push(`G1 F${number(e.feed,3)}`);
  else if(e.type==='travel')body.push(`G1${e.x===undefined?'':` X${number(e.x,3)} Y${number(e.y,3)}`}${e.z===undefined?'':` Z${number(e.z,3)}`} F${number(e.feed,3)} ; ${e.comment||'native calibration travel'}`);
  else if(e.type==='retract'||e.type==='unretract')body.push(`G1 E${number(e.e)} F${number(e.feed,3)} ; ${e.type}`);
  else if(e.type==='extrude'){
   if(width!==e.width){width=e.width;body.push(`${bambu?'; LINE_WIDTH: ':';WIDTH:'}${number(width,6)}`);}
   body.push(`G1 X${number(e.x,3)} Y${number(e.y,3)} E${number(e.e)} ; ${e.comment}`);
  }
 }
 // Native GCode::retract(false,true) has no wipe path in PA_Line. It retracts
 // and resets absolute E; lazy lift emits no move before the custom end code.
 const retract=Math.max(0,p.config.retractionLength-generated.retracted);
 if(retract>1e-7)body.push(`G1 E${number(relative?-retract:generated.extrusionCoordinate-retract)} F${number(p.config.retractionSpeed*60,3)} ; final calibration retract`);
 if(!relative)body.push('G92 E0 ; native end extrusion origin');
 body.push('M106 S0 ; disable fan','; ORCA_WEB_PA_LINE_BODY_END');
 const clean=line=>!/^M73\b/.test(line)&&!/^; (?:estimated (?:printing|first layer printing) time|filament used|filament cost|total filament used|total filament cost|external perimeters extrusion width|perimeters extrusion width|infill extrusion width|solid infill extrusion width|top infill extrusion width|first layer extrusion width|_GP_)/.test(line);
 const output=[...lines.slice(0,start),...body,...lines.slice(end)].filter(clean).map(line=>line.replace(/^; total layer number:\s*\d+$/,`; total layer number: ${layer}`).replace(/^; total layers count = \d+$/,`; total layers count = ${layer}`).replace(/^; max_z_height: .+$/,`; max_z_height: ${number(generated.lastPosition[2],6)}`));
 const summary={mode:plan.request.mode,layers:layer,lineCount:p.count,requestedLines:p.requestedCount,firstCommand:`PA ${plan.request.start}`,lastCommand:`PA ${p.actualEnd}`,actualEnd:p.actualEnd,fastSpeed:p.fast/60,slowSpeed:p.slow/60,generatedMoves:generated.events.filter(e=>['travel','extrude','retract','unretract'].includes(e.type)).length,generatedFilamentMM:generated.material,estimates:'Native carrier timing and material estimates removed; generated filament length excludes start/end purges and restart extras.'};
 return{gcode:`; ORCA_WEB_CALIBRATION ${JSON.stringify({...plan.request,nativeVersion:plan.source.version,sourceRevision:plan.source.revision})}\n; PA lines generated from pinned native source; GUI export equivalence unverified\n${output.join('\n')}`,summary};
}
