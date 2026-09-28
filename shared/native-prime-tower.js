import {nativeBed,nativePlateOrigin} from './native-project.js';
import {nativeObjectModel,nativeObjectFrame} from './native-clipboard.js';
import {instanceGroups,instanceFamily,assertInstanceFamilies} from './native-instances.js';
import {normalizePainting} from './facet-codec.js';
import {ARRANGE_REVISION} from './native-arrangement.js';

export const TOWER_LIMITS=Object.freeze({objects:256,parts:4096,instances:10000,vertices:500000,triangles:500000,inputBytes:64*1024*1024});
const settingKeys=['enable_prime_tower','print_sequence','timelapse_type','enable_wrapping_detection','layer_height','prime_tower_width','prime_volume','prime_tower_infill_gap','wipe_tower_wall_type','wipe_tower_rib_width','wipe_tower_extra_rib_length','filament_change_length','filament_diameter','nozzle_diameter'];
const assignmentKeys=['extruder','enable_support','raft_layers','support_filament','support_interface_filament','outer_wall_filament_id','inner_wall_filament_id','sparse_infill_filament_id','internal_solid_filament_id','top_surface_filament_id','bottom_surface_filament_id'];
const identity=(value)=>{if(typeof value!=='string'||!value.length||value.length>256||value.includes('\0'))throw new Error('Invalid prime tower identity');return value;};
// Worker names are transport identities only. Preserve short existing names,
// but allocate unique bounded ASCII names when a composite or UTF-8 token is
// too large, or when a family token aliases another model's display identity.
function workerIdentity(preferred,used,prefix){
 let value=preferred;
 if(new TextEncoder().encode(value).length>256||used.has(value)){
  let index=used.size;do{value=`tower-${prefix}-${index++}`;}while(used.has(value));
 }
 used.add(value);return value;
}
const numeric=(value,label,min=-1e6,max=1e6)=>{if(value==null||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(`Invalid prime tower ${label}`);return Number(value);};
function assignments(source={}){return Object.fromEntries(assignmentKeys.filter(k=>Object.hasOwn(source,k)).map(key=>{const value=source[key]===true?1:source[key]===false?0:numeric(source[key],key,0,2147483647);if(!Number.isInteger(value)||key==='enable_support'&&value>1)throw new Error(`Invalid prime tower ${key}`);return[key,String(value)];}));}
function points(value,origin,empty=false){if(!Array.isArray(value)||value.length>1024||(!empty&&value.length<3))throw new Error('Invalid native tower printable area');return value.map(raw=>{const p=typeof raw==='string'?raw.split('x'):[];if(p.length!==2)throw new Error('Invalid native tower printable point');return p.map((n,i)=>numeric(n,'plate point')+origin[i]);});}

/** Accepts a server-normalized complete project. Containment, tool collection and
 * size are computed by the pinned native worker, never supplied by the browser. */
export function prepareNativePrimeTower(project,settings,{includeDragContext=false}={}){
 if(settings.printer_technology&&settings.printer_technology!=='FFF')throw new Error('Prime tower preview requires an FFF printer');
 const plateIndex=project.plates.findIndex(p=>p.id===project.activePlateId),plate=project.plates[plateIndex];if(!plate)throw new Error('Prime tower plate is missing');
 const bed=nativeBed(settings);if(!bed)throw new Error('Prime tower requires a native printable area');
 const count=settings.filament_colour?.length;if(!Array.isArray(settings.filament_colour)||count<1||count>256)throw new Error('Prime tower requires a native filament palette');
 const origins=new Map(project.plates.map((p,i)=>[identity(p.id),nativePlateOrigin(i,project.plates.length,bed)])),origin=origins.get(plate.id),shape=points(settings.printable_area,origin),excluded=points(settings.bed_exclude_area||[],origin,true);
 const areas=settings.extruder_printable_area||[],heights=settings.extruder_printable_height||[];
 if(!Array.isArray(areas)||areas.length>256||!Array.isArray(heights)||heights.length>256||heights.length<areas.length)throw new Error('Invalid native extruder printable regions');
 const area=shape.reduce((sum,p,i)=>{const q=shape[(i+1)%shape.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(Math.abs(area)<1e-9)throw new Error('Native tower printable area is degenerate');if(area<0)shape.reverse();
 const nativeSettings=Object.fromEntries(settingKeys.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));
 const sequence=plate.native?.metadata?.print_sequence;if(sequence&&sequence!=='by default'&&sequence!=='2')nativeSettings.print_sequence=sequence;
 assertInstanceFamilies(project.objects);const models=new Map(),modelIds=new Set(),instanceIds=new Set(),paintBudget={nodes:0};let triangles=0,vertices=0,partsCount=0,instances=0;
 // Project insertion order is native Model / instance order. Regrouping by plate
 // would change the native collector's intentional instance-zero behavior.
 for(const[id,parts]of instanceGroups(project.objects)){
  const first=parts[0],location=origins.get(first.plateId);if(!location)throw new Error('Prime tower object refers to a missing plate');
  const family=instanceFamily(parts),key=JSON.stringify(family?["family",family]:["instance",id]);
  if(!models.has(key)){
   const source=nativeObjectModel(parts,location),objectSettings=assignments(first.native?.objectSettings),firstSlot=Number(first.filamentSlot)||Number(objectSettings.extruder)||1;
   objectSettings.extruder=String(parts.length===1?firstSlot:Number(objectSettings.extruder)||firstSlot);
   const nativeParts=source.parts.map((part,index)=>{const original=parts[index],config=assignments(original.native?.partSettings);config.extruder=String(Number(original.filamentSlot)||Number(config.extruder)||Number(objectSettings.extruder)||1);
    triangles+=part.triangles.length;vertices+=part.vertices.length;partsCount++;
    const color=normalizePainting(original.painting,part.triangles.length,{filamentCount:count,budget:paintBudget})?.color||{};
    return{...part,settings:config,color};
   });
   models.set(key,{id:workerIdentity(family||id,modelIds,"model"),settings:objectSettings,parts:nativeParts,ranges:(first.native?.layerConfigRanges||[]).map(r=>assignments(r.settings)),instances:[]});
  }
  models.get(key).instances.push({id:workerIdentity(id,instanceIds,"instance"),plateId:first.plateId,printable:first.printable!==false,matrix:nativeObjectFrame(parts,location).toArray()});instances++;
 }
 if(models.size>TOWER_LIMITS.objects||partsCount>TOWER_LIMITS.parts||instances>TOWER_LIMITS.instances||vertices>TOWER_LIMITS.vertices||triangles>TOWER_LIMITS.triangles)throw new Error('Native prime tower geometry exceeds limits');
 const coordinate=key=>numeric(settings[key]?.[plateIndex]??settings[key]?.[0]??0,key);
 const request={format:'orca-prime-tower-request',version:1,sourceRevision:ARRANGE_REVISION,operation:'prime-tower-preview',plateId:plate.id,filamentCount:count,settings:nativeSettings,assignments:assignments(settings),plate:{origin,shape,excluded,height:numeric(settings.printable_height,'printable height',.001),extruderAreas:areas.map(a=>points(typeof a==='string'?a.split(','):a,origin)),extruderHeights:heights.map(h=>h==='nil'?null:numeric(h,'extruder height',0))},placement:[coordinate('wipe_tower_x'),coordinate('wipe_tower_y'),numeric(settings.wipe_tower_rotation_angle??0,'rotation')],objects:[...models.values()],events:(plate.layerEvents?.items||[]).filter(e=>e.type==='ToolChange').map(e=>({type:e.type,extruder:numeric(e.extruder,'tool event',1,count)}))};
 if(includeDragContext)request.dragContext={brimWidth:numeric(settings.prime_tower_brim_width??3,'brim width',0,1000)};
 if(new TextEncoder().encode(JSON.stringify(request)).length>TOWER_LIMITS.inputBytes)throw new Error('Native prime tower input exceeds 64 MiB');return request;
}
export function validateNativePrimeTowerResult(result,request){
 const bad=()=>{throw new Error('Invalid native prime tower result');};
 if(result?.format!=='orca-native-prime-tower'||result.version!==1||result.sourceRevision!==ARRANGE_REVISION||result.plateId!==request.plateId||typeof result.visible!=='boolean'||result.alpha!==Math.fround(.66))bad();
 if(!Array.isArray(result.extruders)||result.extruders.length>request.filamentCount||result.extruders.some((n,i)=>!Number.isInteger(n)||n<1||n>request.filamentCount||i>0&&n<=result.extruders[i-1]))bad();
 if(!Array.isArray(result.containedFirstInstances)||result.containedFirstInstances.length!==request.objects.length||result.containedFirstInstances.some(v=>typeof v!=='boolean'))bad();
 if(!Number.isInteger(result.printableInstanceCount)||result.printableInstanceCount<0||result.printableInstanceCount>request.objects.reduce((n,o)=>n+o.instances.filter(i=>i.plateId===request.plateId&&i.printable).length,0))bad();
 if(!Array.isArray(result.position)||result.position.length!==2||result.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2e6)||!Number.isFinite(result.rotation)||Math.abs(result.rotation)>20000)bad();
 if(result.visible){if(!result.extruders.length||!Array.isArray(result.size)||result.size.length!==3||result.size.some(v=>!Number.isFinite(v)||v<=0||v>1e6)||result.size[1]<Math.fround(.01)||!Array.isArray(result.estimatedSize)||result.estimatedSize.length!==3||result.estimatedSize.some(v=>!Number.isFinite(v)||v<0||v>1e6))bad();}
 else if(result.size!==null)bad();
 if(result.dragContext){const c=result.dragContext;if(c.version!==1||c.space!=='native-world'||!Array.isArray(c.origin)||c.origin.length!==2||c.origin.some(v=>!Number.isFinite(v)||Math.abs(v)>2e8)||!Array.isArray(c.plateBounds)||c.plateBounds.length!==2||c.plateBounds.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>2e8))||c.plateBounds[0].some((v,i)=>v>=c.plateBounds[1][i])||!Number.isFinite(c.margin)||c.margin<.5||c.margin>1000.5||c.scalingFactor!==.000001)bad();}
 return result;
}
