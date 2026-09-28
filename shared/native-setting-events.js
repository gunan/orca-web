import { definitionsByScope } from './profile-settings.js';
const commit='8500fcdccaa10b5099ac20d252af3a7c560046f1';
const definitions=Object.fromEntries(Object.entries(definitionsByScope).map(([scope,items])=>[scope,new Map(items.map(item=>[item.key,item]))]));
const names={machine:'printer',process:'process',filament:'filament'};

// Event-specific choices from Tab::on_value_change. Clear acknowledged events when
// the user makes another edit; keep returned acknowledgments during one review flow.
export function getNativeSettingEvents(input={}){
 const context=input.context||{},changed=context.changedSetting;
 if(!changed||!Object.hasOwn(names,changed.scope)||typeof changed.key!=='string')return [];
 const scope=changed.scope,key=changed.key,groups=[];
 const raw=(name,which=scope)=>input[names[which]]?.[name]??definitions[which].get(name)?.default;
 const first=(name,which)=>{const value=raw(name,which);return Array.isArray(value)?value[0]:value;};
 const bool=(name,which)=>[true,1,'1'].includes(first(name,which));
 const num=(name,which)=>parseFloat(first(name,which));
 const str=(name,which)=>String(first(name,which)??'');
 const acknowledged=new Set(context.acknowledgedSettingEvents||[]);
 const event=(suffix,reason,changes,line,{mode='confirmation',alternative,applyLabel='Apply native change',alternativeLabel='Keep current value'}={})=>{
  const id=`${scope}:event-${suffix}`;if(acknowledged.has(id))return;
  const source={file:'Tab.cpp',line,commit};
  groups.push({id,scope,event:true,eventKey:key,mode,reason,changes:Object.entries(changes).map(([key,value])=>({scope,key,value,mode,reason,source})),...(alternative?{alternative:{scope,...alternative},applyLabel,alternativeLabel}:{}),source});
 };
 const restore=(suffix,reason,name,value,line,labels)=>event(suffix,reason,{[name]:value},line,{alternative:{key:name,value:raw(name)},...labels});
 if(scope==='process'){
  const tower=bool('enable_prime_tower'),smooth=str('timelapse_type')==='1';
  if(key==='enable_prime_tower'&&!tower&&smooth){
   const firstId='process:event-disable-tower-smooth';
   if(!acknowledged.has(firstId))restore('disable-tower-smooth','Smooth timelapse requires a prime tower; disabling it may leave flaws.','enable_prime_tower',true,1573,{applyLabel:'Restore prime tower',alternativeLabel:'Keep prime tower disabled'});
   else if(bool('enable_wrapping_detection'))restore('disable-tower-wrapping','Clumping detection requires a prime tower; disabling it may leave flaws.','enable_prime_tower',true,1583,{applyLabel:'Restore prime tower',alternativeLabel:'Keep prime tower disabled'});
  }
  if(key==='enable_prime_tower'&&tower&&bool('precise_z_height'))restore('tower-precise-z','Enabling both precise Z height and a prime tower may cause slicing errors.','enable_prime_tower',false,1597,{applyLabel:'Disable prime tower',alternativeLabel:'Keep prime tower enabled'});
  if(key==='enable_wrapping_detection'&&bool(key)&&!tower)restore('wrapping-without-tower','Clumping detection without a prime tower may leave flaws.','enable_wrapping_detection',false,1621,{applyLabel:'Disable clumping detection',alternativeLabel:'Keep clumping detection enabled'});
  if(key==='precise_z_height'&&bool(key)&&tower)restore('precise-z-tower','Enabling precise Z height with a prime tower may cause slicing errors.','precise_z_height',false,1638,{applyLabel:'Disable precise Z height',alternativeLabel:'Keep precise Z height enabled'});
  if(key==='timelapse_type'&&smooth&&!tower)restore('smooth-needs-tower','Smooth timelapse requires a prime tower.','enable_prime_tower',true,1653,{applyLabel:'Enable prime tower',alternativeLabel:'Keep prime tower disabled'});
  if(key==='print_sequence'&&str(key)==='by object'&&str('printer_structure','machine')==='i3')restore('object-printing-timelapse','This printer does not support traditional timelapse when printing by object.','print_sequence','by layer',1672,{applyLabel:'Print by layer',alternativeLabel:'Keep printing by object'});
  if(key==='support_type'&&context.mode==='Simple'&&str('support_style')!=='default')event('simple-support-style','Native Simple mode resets support style when the support type changes.',{support_style:'default'},1687,{mode:'automatic'});
  if(key==='make_overhang_printable'&&bool(key))restore('geometry-changing-overhang','This option changes model geometry and can affect dimensions and assemblies.','make_overhang_printable',false,1757,{applyLabel:'Cancel geometry change',alternativeLabel:'Enable geometry change'});
  const safeRotation=['rectilinear','line','zigzag','crosszag','lockedzag'].includes(str('sparse_infill_pattern'));
  if(key==='sparse_infill_rotate_template'&&str(key)!==''&&!safeRotation&&changed.previousValue==='')restore('infill-rotation','Rotating this infill pattern may provide insufficient support. Check the sliced paths.','sparse_infill_rotate_template','',1787,{applyLabel:'Cancel infill rotation',alternativeLabel:'Enable infill rotation'});
  if(key==='layer_height'){
   const values=name=>{const value=raw(name,'machine');return(Array.isArray(value)?value:[value]).map(Number);};
   const lower=Math.min(...values('min_layer_height')),upper=Math.max(...values('max_layer_height')),height=num('layer_height');
   if(height<lower||height>upper){
    if(height<1e-4)event('layer-too-small','Native layer height is too small and resets to the printer minimum.',{layer_height:String(lower)},1813,{mode:'acknowledge'});
    else restore('layer-limit','Layer height exceeds the printer limits and may reduce print quality.','layer_height',String(height>upper?upper:lower),1823,{applyLabel:'Adjust to printer limits',alternativeLabel:'Ignore printer limits'});
   }
  }
 }
 if((scope==='machine'&&key==='long_retractions_when_cut')||(scope==='filament'&&key==='filament_long_retractions_when_cut')){
  const value=raw(key),index=Math.max(0,changed.index||0),enabled=Array.isArray(value)?value[index]??value[0]:value;
  if([true,1,'1'].includes(enabled))event('long-retraction-risk','Long cut retractions are experimental and can reduce flushing while increasing clogging or printing problems.',{},scope==='machine'?1845:1858,{mode:'acknowledge'});
 }
 return groups;
}
