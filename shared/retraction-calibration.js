import {nativeFeature,isNativeWipeStart,isNativeWipeEnd} from './native-gcode-tags.js';
import { displayedSettings } from './settings.js';
import { displayedProfileSettings } from './profile-settings.js';
import { removeCorneringTimeEstimate } from './cornering-calibration.js';
export const RETRACTION_MODE={id:'retraction',label:'Retraction',supported:true,defaults:{start:0,end:2,step:.1},unit:'mm'};
const first=v=>Array.isArray(v)?v[0]:v;
const numeric=(v,label)=>{if(v==null||v===''||!['number','string'].includes(typeof v)||!Number.isFinite(Number(v)))throw new Error(`${label} must be a finite number`);return Number(v)};
const truth=v=>v===true||v==='1';const fixed=v=>String(Number(v.toFixed(6)));
// Native layer height is float32 while exported Z is rounded. Recover its
// fixed-height index before evaluating the source double-precision floor.
export function retractionLength(plan,z){const height=plan.retraction.layerHeight;const nativeZ=Math.round(z/height)*height;return plan.request.start+Math.floor(Math.max(0,nativeZ-.4))*plan.request.step;}
export function createRetractionPlan(input,selection,nozzle){
 const params={mode:'retraction',start:numeric(input.start??0,'Start'),end:numeric(input.end??2,'End'),step:numeric(input.step??.1,'Step')};
 if(params.start<0||params.end>20||params.step<=0||params.end<params.start+params.step)throw new Error('Retraction requires 0 ≤ Start, End ≤ 20 mm, Step > 0 and End ≥ Start + Step');
 const height=1.4+(params.end-params.start)/params.step-1e-4;if(height>80.4)throw new Error('Retraction range exceeds the native 80.4 mm tower; increase the step');
 const layerHeight=Math.fround(Math.fround(nozzle)<=Math.fround(.1)?.05:Math.fround(nozzle)<=Math.fround(.2)?.1:.2);
 const printer=displayedProfileSettings('machine',selection.printer),filament=displayedProfileSettings('filament',selection.filament),process=displayedSettings(selection.process,{includeDefaults:true});
 const effective=key=>first(filament[`filament_${key}`])??first(printer[key]);
 const initialLength=numeric(effective('retraction_length'),'Native retraction length'),hop=numeric(effective('z_hop'),'Native Z hop'),before=Math.min(1,Math.max(0,numeric(effective('retract_before_wipe'),'Native retract-before-wipe percentage')/100));
 if(initialLength<0||initialLength>20)throw new Error('Retraction requires a native initial length from 0 through 20 mm');
 if((params.start===0||initialLength===0)&&hop>0)throw new Error('Zero-length retraction with active Z hop is not supported yet; disable Z hop or use a positive start and native initial length');
 if(truth(first(filament.slow_down_for_layer_cooling))&&numeric(first(filament.slow_down_layer_time),'Native cooling layer time')>0)throw new Error('Retraction currently requires layer-cooling slowdown disabled or a zero minimum layer time');
 if(Number(process.max_volumetric_extrusion_rate_slope)!==0)throw new Error('Retraction currently requires pressure equalizer disabled');
 if(truth(first(filament.enable_pressure_advance))&&truth(first(filament.adaptive_pressure_advance)))throw new Error('Retraction currently requires adaptive pressure advance disabled');
 if(numeric(effective('retract_restart_extra'),'Native extra restart length')!==0)throw new Error('Retraction currently requires zero extra length on restart');
 if(Number(process.raft_layers)!==0||truth(process.spiral_mode))throw new Error('Retraction requires no raft and spiral vase disabled');
 for(const text of [selection.printer.before_layer_change_gcode,selection.printer.layer_change_gcode,selection.process.before_layer_change_gcode,selection.process.layer_change_gcode].flat().filter(Boolean))if(/^(?!\s*G92\b)[^;\n]*\bE[-+\d{[]/m.test(String(text)))throw new Error('Retraction cannot combine with custom layer-change extrusion commands');
 const maxLayer=numeric(first(printer.max_layer_height),'Native maximum layer height'),baseLength=Math.max(initialLength,params.start+Math.floor(height+layerHeight)*params.step);
 return{params,model:{resource:'retraction/retraction_tower.drc',minZ:0,maxZ:height,scale:1},retraction:{initialLength,baseLength,layerHeight,beforeWipe:before,hop,wipe:truth(effective('wipe'))},
  printer:{resonance_avoidance:'0',use_firmware_retraction:'0',retraction_length:[fixed(baseLength)],max_layer_height:[String(Math.max(maxLayer,layerHeight))]},filament:{filament_retraction_length:[fixed(baseLength)]},
  process:{enable_wrapping_detection:'0',wall_loops:'2',top_shell_layers:'0',bottom_shell_layers:'3',sparse_infill_density:'0%',initial_layer_print_height:String(layerHeight),layer_height:String(layerHeight),alternate_extra_wall:'0',seam_position:'aligned',wall_sequence:'inner wall/outer wall',overhang_reverse:'0',precise_z_height:'0',gcode_comments:'1'},
  limitations:['Uses the native retraction tower and start + floor(max(0, layer Z − 0.4)) × step schedule. Retraction commands change only after native layer-change code.', 'Changes actual retraction, wipe extrusion and matching unretraction; firmware retraction is disabled. Native geometry, deposited extrusion and travel remain unchanged for supported settings.', 'Zero lengths with active Z hop, layer-cooling slowdown, pressure equalizer, adaptive PA, nonzero extra restart length and layer-change extrusion macros are unsupported.', 'Printing-time estimates are unavailable after extrusion changes. Inspect the physical printed strings before choosing a measured length; the chosen length can be saved explicitly as a new filament override.']};
}
const wordPattern=/\b([XYZEF])([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/gi;
const ePattern=/\bE[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/i;
const fmt=v=>String(Number(v.toFixed(5)));
/** Reconstruct the native writer's retracted state. Wipe path XY is independent
 * of retraction length; its native negative-E capacity limits the amount during
 * wiping, with excess moved before wiping. G92 changes coordinates, not state. */
export function applyRetractionSchedule(lines,layers,plan){
 const text=lines.join('\n');for(const[key,value]of Object.entries({retraction_length:plan.retraction.baseLength,use_firmware_retraction:0,gcode_comments:1,retract_restart_extra:0})) {const match=text.match(new RegExp(`^; ${key} = (.+)$`,'m'));if(!match||Number(match[1])!==value)throw new Error(`Native retraction setting ${key} does not match the generated calibration`);}
 if(/^\s*G(?:10|11|20|93)\b/m.test(text))throw new Error('Retraction requires native millimetre extrusion and explicit E commands');
 const starts=new Map(layers.map((layer,index)=>[layer.start,index])),anchors=new Map(layers.map((layer,index)=>[layer.anchor,index]));
 let e=0,relative=false,active=false,current=plan.retraction.initialLength;const parsed=[];
 for(let row=0;row<lines.length;row++){
  const line=lines[row],semicolon=line.indexOf(';'),command=(semicolon<0?line:line.slice(0,semicolon)).trim(),comment=semicolon<0?'':line.slice(semicolon);
  if(starts.has(row))active=true;if(active&&nativeFeature(line)==='Custom'&&row>layers.at(-1).anchor)active=false;
  if(anchors.has(row))current=retractionLength(plan,layers[anchors.get(row)].z);
  if(/^M83\b/.test(command))relative=true;if(/^M82\b/.test(command))relative=false;
  const values=Object.fromEntries([...command.matchAll(wordPattern)].map(match=>[match[1].toUpperCase(),Number(match[2])]));
  if(/^G92\b/.test(command)&&values.E!==undefined)e=values.E;
  const motion=/^G[0123]\b/.test(command),delta=motion&&values.E!==undefined?(relative?values.E:values.E-e):0;
  const kind=active&&motion?( /;\s*(?:;\s*)?unretract\s*$/.test(comment)?'unretract':/;\s*wipe and retract\s*$/.test(comment)?'wipe':/;\s*retract\s*$/.test(comment)?'retract':null):null;
  parsed.push({line,command,comment,values,delta,relative,active,kind,target:current});if(motion&&values.E!==undefined)e=relative?e+values.E:values.E;
 }
 for(const [index,layer] of layers.entries())if(Math.abs(layer.z-(index+1)*plan.retraction.layerHeight)>.00002)throw new Error('Retraction requires the native fixed layer-height schedule');
 const grouped=new Map(),wipeEnds=new Map();
 for(let row=layers[0].start;row<lines.length;row++)if(isNativeWipeStart(lines[row])&&parsed[row].active){
  let end=row+1;while(end<lines.length&&!isNativeWipeEnd(lines[end])){if(isNativeWipeStart(lines[end]))throw new Error('Native retraction wipe block is incomplete');end++;}if(end===lines.length)throw new Error('Native retraction wipe block is incomplete');
  const moves=[];let capacity=0;for(let i=row+1;i<end;i++)if(parsed[i].kind==='wipe'){if(parsed[i].delta>1e-6)throw new Error('Native wipe unexpectedly deposits extrusion');moves.push(i);capacity-=parsed[i].delta;}
  if(!moves.length)throw new Error('Native wipe block is missing its command markers');const target=parsed[row].target,during=Math.min(target*(1-plan.retraction.beforeWipe),capacity),before=target-during;
  const prior=parsed[row-1];if(prior.kind==='retract'){grouped.set(row-1,{before});}else if(before>1e-5)throw new Error('Native retraction is missing its pre-wipe command');
  for(const index of moves)grouped.set(index,{wipe:capacity>0?parsed[index].delta*during/capacity:0});wipeEnds.set(end,target);row=end;
 }
 let outputE=0,retracted=0,cycles=0,wipeMoves=0,changed=0;const lengths=new Set(),output=[];
 for(let row=0;row<parsed.length;row++){
  const item=parsed[row];let line=removeCorneringTimeEstimate(item.line);if(line===null)continue;
  if(/^G92\b/.test(item.command)&&item.values.E!==undefined){outputE=item.values.E;}
  if(/^G[0123]\b/.test(item.command)&&item.values.E!==undefined){
   let delta=item.delta;
   if(item.kind==='retract'){const requested=grouped.get(row)?.before??item.target;delta=-Math.max(0,requested-retracted);retracted-=delta;lengths.add(Number(item.target.toFixed(8)));}
   else if(item.kind==='wipe'){delta=grouped.get(row)?.wipe;if(delta===undefined)throw new Error('Unbound native wipe command');retracted-=delta;wipeMoves++;}
   else if(item.kind==='unretract'){delta=retracted;retracted=0;cycles++;}
   else if(item.active&&item.delta<0)throw new Error('Unknown extrusion retraction in the native object body');
   outputE+=delta;
   const value=item.relative?delta:outputE;if(Math.abs(delta-item.delta)>1e-7)changed++;
   if(item.kind||Math.abs(value-item.values.E)>1e-7)line=item.command.replace(ePattern,`E${fmt(value)}`)+(item.comment?` ${item.comment}`:'');
  }
  if(wipeEnds.has(row)){const target=wipeEnds.get(row);if(retracted+1e-5<target)throw new Error('Native wipe did not complete the calibrated retraction');}
  output.push(line);if(anchors.has(row)){const z=layers[anchors.get(row)].z;output.push(`; Calib_Retraction_tower: Z_HEIGHT: ${z}, length:${fixed(retractionLength(plan,z))}`);}
 }
 if(!cycles||!changed||lengths.size<2)throw new Error('Native output has no effective varying retraction cycles');
 return{lines:output,summary:{mode:'retraction',cycles,wipeMoves,changedExtrusionCommands:changed,lengths:[...lengths].sort((a,b)=>a-b),timeEstimate:'unavailable-after-retraction-calibration'}};
}
