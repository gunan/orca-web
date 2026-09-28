import { getNativeSettingEvents } from './native-setting-events.js';
import { evaluateSettingsState } from './settings-dependencies.js';
import { definitionsByScope, normalizeNativeProfileValues } from './profile-settings.js';
const scopeNames = {machine:'printer',process:'process',filament:'filament'};
const maps=Object.fromEntries(Object.entries(definitionsByScope).map(([scope,definitions])=>[scope,new Map(definitions.map(item=>[item.key,item]))]));
const stable=value=>value===undefined?'null':Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
function checkScope(scope){if(!Object.hasOwn(scopeNames,scope))throw new Error('Unknown native correction scope');}
function currentValue(input,scope,key){
 const definition=maps[scope].get(key);
 let value=input[scopeNames[scope]]?.[key]??definition?.default;
 const vector=['coFloats','coInts','coStrings','coBools','coPercents','coEnums'].includes(definition?.nativeType);
 if(vector&&!Array.isArray(value))value=[value];
 else if(!vector&&!['coPoint','coPoints','coPointsGroups'].includes(definition?.nativeType)&&Array.isArray(value))value=value[0];
 if(definition?.nativeType==='coFloatOrPercent'&&value&&typeof value==='object'&&!Array.isArray(value))value=`${value.value}${value.percent?'%':''}`;
 try{return normalizeNativeProfileValues(scope,{[key]:value})[key];}catch{return structuredClone(value);}
}
function proposalSignature(input,group){
 const keys=[...new Set([...group.changes.map(item=>item.key),...(group.alternative?[group.alternative.key]:[]),...(group.eventKey?[group.eventKey]:[])])];
 // This is an exact canonical value, not an authentication token or lossy hash.
 return stable({id:group.id,scope:group.scope,mode:group.mode,current:Object.fromEntries(keys.map(key=>[key,currentValue(input,group.scope,key)])),changes:group.changes.map(({scope,key,value})=>({scope,key,value})),alternative:group.alternative||null});
}
export function getNativeCorrectionPlan(input,{scope}={}){
 checkScope(scope);
 const evaluated=evaluateSettingsState(input),events=getNativeSettingEvents(input).filter(item=>item.scope===scope),groups=[...events];
 for(const change of (events.length?[]:evaluated.corrections.filter(item=>item.scope===scope))){
  const id=`${scope}:${change.group||change.key}`;
  let group=groups.find(item=>item.id===id);
  if(!group){group={id,scope,mode:change.mode,reason:change.reason,changes:[],...(change.alternative?{alternative:structuredClone(change.alternative)}:{})};groups.push(group);}
  group.changes.push(structuredClone(change));
 }
 for(const group of groups)group.signature=proposalSignature(input,group);
 return {scope,groups,warnings:evaluated.warnings.filter(item=>item.scope===scope),errors:evaluated.errors.filter(item=>item.scope===scope),provenance:evaluated.provenance};
}

/** Validate ordinary editor overrides before calling this helper. Decisions contain
 * no arbitrary setting values: only freshly derived native proposals can be applied. */
export function applyNativeCorrectionDecisions(input,{scope,decisions=[],applyAutomatic=false}={}){
 checkScope(scope);
 if(!Array.isArray(decisions)||decisions.length>128)throw new Error('Native correction decisions must be a bounded array');
 if(typeof applyAutomatic!=='boolean')throw new Error('applyAutomatic must be a boolean');
 const plan=getNativeCorrectionPlan(input,{scope}),byId=new Map(plan.groups.map(group=>[group.id,group])),seen=new Set(),chosen=[];
 for(const decision of decisions){
  if(!decision||typeof decision!=='object'||Array.isArray(decision)||Object.keys(decision).some(key=>!['id','choice','signature'].includes(key)))throw new Error('A native correction decision accepts only id, choice, and signature');
  if(seen.has(decision.id))throw new Error('Duplicate native correction decision');seen.add(decision.id);
  const group=byId.get(decision.id);
  if(!group)throw new Error('Unknown or no longer applicable native correction');
  if(typeof decision.signature!=='string'||decision.signature!==group.signature)throw new Error('Native correction changed; review the current proposal');
  if(!['apply','alternative'].includes(decision.choice))throw new Error('Unknown native correction choice');
  if(decision.choice==='alternative'&&!group.alternative)throw new Error('This native correction has no alternative');
  chosen.push({group,choice:decision.choice});
 }
 if(applyAutomatic)for(const group of plan.groups)if(group.mode==='automatic'&&!seen.has(group.id))chosen.push({group,choice:'apply'});
 const patch={};
 for(const {group,choice} of chosen){
  const changes=choice==='alternative'?[group.alternative]:group.changes;
  for(const change of changes){
   if(change.scope!==scope)throw new Error('Native correction attempted to cross profile scopes');
   const normalized=normalizeNativeProfileValues(scope,{[change.key]:change.value});
   if(Object.hasOwn(patch,change.key)&&stable(patch[change.key])!==stable(normalized[change.key]))throw new Error('Selected native correction choices conflict');
   patch[change.key]=normalized[change.key];
  }
 }
 const result=structuredClone(input),config=result[scopeNames[scope]] ||= {};
 const eventIds=chosen.filter(({group})=>group.event).map(({group})=>group.id);
 if(eventIds.length){result.context ||= {};result.context.acknowledgedSettingEvents=[...new Set([...(result.context.acknowledgedSettingEvents||[]),...eventIds])];}
 for(const [key,value] of Object.entries(patch))config[key]=Array.isArray(value)?value:Array.isArray(config[key])&&maps[scope].get(key)?.nativeType!=='coPoint'?config[key].map(()=>value):value;
 return {selection:result,nativeChanges:structuredClone(patch),applied:chosen.map(({group,choice})=>({id:group.id,choice})),remaining:getNativeCorrectionPlan(result,{scope})};
}
