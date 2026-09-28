/** Workflow integrity only, not authentication: custom G-code remains user data.
 * A snapshot catches accidental edits after importing fixed absolute PA paths. */
export const GENERATED_PATTERN_GUIDANCE = 'This generated PA pattern contains fixed absolute layer commands. Restore the imported geometry, settings and plates, or regenerate the calibration before slicing/exporting.';
const fail = () => { throw new Error(GENERATED_PATTERN_GUIDANCE); };
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key,stable(value[key])])) : value;
function fingerprint(value) {
  const text=JSON.stringify(stable(value));let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);}
  return `${text.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
export function generatedPatternStructure(project) {
  const marked=[];
  for(const plate of project.plates||[]){
    const items=plate.layerEvents?.items||[],hasMarker=items.some(event=>/ORCA_WEB_PA_PATTERN_(?:START|END)/.test(event.extra||''));if(!hasMarker)continue;
    const layers=items.filter(event=>/ORCA_WEB_PA_PATTERN_(?:START|END)/.test(event.extra||''));if(layers.length!==4)fail();
    let ids,previousZ=-Infinity;
    for(const layer of layers){
      if(layer.type!=='Custom'||!Number.isFinite(layer.printZ)||layer.printZ<=previousZ)fail();previousZ=layer.printZ;
      const source=layer.extra,starts=[...source.matchAll(/^; ORCA_WEB_PA_PATTERN_START (\d+) Z([\d.]+)\r?$/gm)],ends=[...source.matchAll(/^; ORCA_WEB_PA_PATTERN_END (\d+) Z([\d.]+)\r?$/gm)];
      if(!starts.length||starts.length>16||ends.length!==starts.length)fail();
      const current=starts.map((start,index)=>{const end=ends[index];if(start[1]!==String(index)||start[1]!==end[1]||start[2]!==end[2]||Math.abs(Number(start[2])-layer.printZ)>.00001||end.index<=start.index||(index+1<starts.length&&end.index>=starts[index+1].index))fail();return Number(start[1]);});
      if(ids&&JSON.stringify(ids)!==JSON.stringify(current))fail();ids=current;
    }
    marked.push({plateId:plate.id,patternCount:ids.length,layers:4});
  }
  return marked;
}
function snapshot(project,settings=project.nativeSettings,version=2){
  return {geometry:fingerprint((project.objects||[]).map(object=>Object.fromEntries(['id','positions','position','rotation','scale','plateId','visible','printable','filamentSlot','native','painting','brimEars','text'].filter(key=>object[key]!==undefined).map(key=>[key,object[key]])))),settings:fingerprint(settings||{}),plates:fingerprint({...(version===1?{activePlateId:project.activePlateId}:{}),plates:(project.plates||[]).map(plate=>({id:plate.id,native:plate.native,layerEvents:plate.layerEvents}))})};
}
/** Use only at archive import, or after source-backed pattern generation. */
export function bindGeneratedPatternProject(project){
  const structure=generatedPatternStructure(project);if(!structure.length)return project;
  return {...project,generatedPatternBinding:{version:2,kind:'pressure-advance-pattern',...snapshot(project),structure},nativeImportWarnings:[...new Set([...(project.nativeImportWarnings||[]),GENERATED_PATTERN_GUIDANCE])]};
}
export function assertGeneratedPatternProjectUnchanged(project,{settings=project.nativeSettings,useEmbeddedSettings,plateId=project.activePlateId}={}){
  const structure=generatedPatternStructure(project),binding=project.generatedPatternBinding;if(!structure.length&&!binding)return false;
  if(!structure.length||!binding||![1,2].includes(binding.version)||binding.kind!=='pressure-advance-pattern'||useEmbeddedSettings===false||!project.plates.some(plate=>plate.id===plateId)||!project.plates.some(plate=>plate.id===project.activePlateId))fail();
  if(JSON.stringify(structure)!==JSON.stringify(binding.structure))fail();const current=snapshot(project,settings,binding.version);for(const key of['geometry','settings','plates'])if(current[key]!==binding[key])fail();return true;
}

/** Check a proposed browser edit without rebinding fixed absolute paths. */
export function assertGeneratedPatternEdit(current,next,{settings=next.nativeSettings}={}) {
  if(current.generatedPatternBinding&&!next.generatedPatternBinding)fail();
  return assertGeneratedPatternProjectUnchanged(next,{settings,useEmbeddedSettings:next.useEmbeddedSettings});
}
