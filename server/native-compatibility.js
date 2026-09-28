const clone = value => structuredClone(value);
const strings = value => Array.isArray(value) ? value : value ? [value] : [];
export function compatibilityBudget(options={}) { const deadline=Date.now()+(options.timeoutMs??30000);return()=>{options.signal?.throwIfAborted();const remaining=deadline-Date.now();if(remaining<=0)throw Object.assign(new Error('Native compatibility resolution timed out'),{status:504});return{...options,timeoutMs:remaining};}; }
const fail = message => Object.assign(new Error(message), {status:400});
/** Trusted catalog metadata only. No paths or macro-generation entry point. */
export function compatibilityMetadata({id,type,name,vendor='',config={},leaf=config,isSystem=true,parent='',alias}) {
  const bounded = (value,label,limit=1000) => { if(typeof value!=='string'||value.length>limit)throw fail(`Invalid native compatibility ${label}`);return value; };
  const list = (value,label) => { const result=strings(value);if(result.length>10000)throw fail(`Native compatibility ${label} exceeds10000 entries`);return result.map(item=>bounded(item,label)); };
  const result={id,type,name:bounded(name,'name'),vendor:bounded(vendor,'vendor'),isSystem,parent:bounded(parent,'parent'),alias:bounded(alias??leaf.alias??'','alias')};
  for(const key of ['compatible_printers','compatible_prints'])result[key]=list(config[key],key);
  for(const key of ['compatible_printers_condition','compatible_prints_condition'])result[key]=bounded(config[key]??'',key,16384);
  return result;
}
/** The native method resolves library alias exclusions over the same bundled
 * registry shown by this web catalog; no account or user installation is read. */
export async function nativeCompatibilityRegistry(catalog,run,options={}) {
  if(!catalog.compatibilityCandidates)return {candidates:[],exclusions:{}};
  const candidates=catalog.compatibilityCandidates(),filaments=candidates.filter(item=>item.type==='filament').map(item=>item.metadata);
  if(candidates.length>30000||filaments.length>12000)throw fail('Native compatibility catalog exceeds its bound');
  const {exclusions}=await run({operation:'filament-library-exclusions',candidates:filaments},options);
  return{candidates,exclusions};
}
export async function nativeCompatibilitySources(catalog,run,options={}) {
  const registry=await nativeCompatibilityRegistry(catalog,run,options);
  return{...registry,source(id,type){
    const source=catalog.getPresetSource(id,type),metadata=source.metadata||catalog.compatibilityMetadata?.(id,type);
    return{...source,...(metadata?{metadata:{...metadata,...(registry.exclusions[id]?{excludedFrom:registry.exclusions[id]}:{})}}:{})};
  }};
}
export async function listNativeCompatiblePresets({catalog,run,printerId,processId,signal}) {
  const initial=catalog.list({printerId}),selectedId=printerId||initial.defaults.printerId;
  if(!catalog.compatibilityCandidates||!catalog.getPresetSource)return initial;
  const remaining=compatibilityBudget({signal}),boundedRun=(request)=>run(request,remaining()),options={signal},registry=await nativeCompatibilitySources(catalog,boundedRun,options),printer=registry.source(selectedId,'machine'),config=catalog.getPreset(selectedId,'machine');
  const nativeResults=[];
  async function evaluate(candidates,process){
    const checked=[];
    for(let offset=0;offset<candidates.length;offset+=512){signal?.throwIfAborted();const slice=candidates.slice(offset,offset+512),result=await boundedRun({operation:'preset-compatibility',printer,...(process?{process}:{}),candidates:slice.map(item=>({...item.metadata,...(registry.exclusions[item.id]?{excludedFrom:registry.exclusions[item.id]}:{})}))},options);
      if(result.compatibility.length!==slice.length||result.compatibility.some((item,index)=>item.id!==slice[index].id||typeof item.compatible!=='boolean'||!Array.isArray(item.diagnostics)||item.diagnostics.length>2||item.diagnostics.some(message=>typeof message!=='string'||message.length>4096)))throw new Error('Native compatibility result does not match request');
      nativeResults.push(...result.compatibility);checked.push(...slice.filter((_,index)=>result.compatibility[index].compatible));}
    return checked;
  }
  const processes=await evaluate(registry.candidates.filter(item=>item.type==='process'));
  const chosenProcess=processes.find(item=>item.id===processId)||processes.find(item=>item.summary.name===config.default_print_profile)||processes[0];
  if(processId&&!processes.some(item=>item.id===processId))throw fail('Selected process is incompatible with this printer');
  const filaments=await evaluate(registry.candidates.filter(item=>item.type==='filament'),chosenProcess?registry.source(chosenProcess.id,'process'):undefined);
  const preferred=filaments.find(item=>strings(config.default_filament_profile).includes(item.summary.name))||filaments.find(item=>item.summary.type==='PLA')||filaments[0];
  return{...initial,processes:processes.map(item=>clone(item.summary)),filaments:filaments.map(item=>clone(item.summary)),defaults:{printerId:selectedId,processId:chosenProcess?.id||null,filamentId:preferred?.id||null},compatibility:{native:true,sourceRevision:'8500fcdccaa10b5099ac20d252af3a7c560046f1',processId:chosenProcess?.id||null},warnings:[...(initial.warnings||[]),...nativeResults.flatMap(item=>item.diagnostics.map(message=>`Native compatibility expression error in ${registry.candidates.find(value=>value.id===item.id)?.summary.name||item.id}; OrcaSlicer treats that expression as compatible: ${message}`))],limitations:(initial.limitations||[]).filter(text=>!text.includes('compatibility expressions')&&!text.includes('expression evaluation'))};
}
