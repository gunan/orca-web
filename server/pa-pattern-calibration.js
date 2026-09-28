import {bindGeneratedPatternProject} from '../shared/generated-pattern-binding.js';
import {nativeSettingsFromSelection} from '../shared/native-project.js';
import {BoxGeometry} from 'three';
import {createMesh} from '../shared/geometry.js';
import {emptyProject} from '../shared/project.js';
import {paPatternPlanForPlate} from '../shared/pa-pattern-calibration.js';
import {patternLayerEvents} from '../shared/pa-pattern-gcode.js';
import {createNativeProjectService,normalizeProjectSettings} from './native-projects.js';
/** Native Plater builds 5 mm generic handle cubes, not the old bundled
 * pa_pattern.3mf. Only source-derived geometry/events enter this path. */
export async function preparePAPatternProject({plan,selection,signal}){
 signal?.throwIfAborted();if(plan.model.resource!=='pressure_advance/generated-pattern-handle')throw new Error('Unknown native PA pattern handle');
 const project=emptyProject();project.name=plan.label;project.ids={printerId:'calibration-printer',processId:'calibration-process',filamentId:'calibration-filament'};
 project.plates=plan.patternPlates.map(({id,name})=>({id,name}));project.activePlateId=project.plates[0].id;
 project.objects=plan.paPatterns.map((p,index)=>{const h=p.handle,g=new BoxGeometry(h.size,h.size,h.height);g.translate(h.x+h.size/2,h.y+h.size/2,h.height/2);const expanded=g.toNonIndexed();try{const id=`pa-pattern-${index}`;return createMesh({id,name:`pa_pattern_${Math.trunc(p.speed)}_${Math.trunc(p.acceleration)}`,positions:expanded.attributes.position.array,plateId:p.plateId,sourceFormat:'native-calibration',sourceFile:plan.model.resource,filamentSlot:1,native:{groupId:id,objectName:`pa_pattern_${Math.trunc(p.speed)}_${Math.trunc(p.acceleration)}`,partType:'normal_part',objectSettings:{outer_wall_speed:String(p.speed),outer_wall_acceleration:String(p.acceleration)},partSettings:{}}});}finally{expanded.dispose();g.dispose();}});
 project.selectedId=project.objects[0].id;for(const plate of project.plates)plate.layerEvents=patternLayerEvents(paPatternPlanForPlate(plan,plate.id));project.nativeSettings=normalizeProjectSettings(nativeSettingsFromSelection(selection)).settings;Object.assign(project,bindGeneratedPatternProject(project));
 const service=createNativeProjectService({catalog:{resolveSelection:async()=>structuredClone(selection)}}),nativeProject=await service.prepare({project,useEmbeddedSettings:true,allPlates:true});signal?.throwIfAborted();
 nativeProject.plateProjects=Object.create(null);
 for(const plate of project.plates){signal?.throwIfAborted();const prepared=project.plates.length===1?nativeProject:await service.prepare({project,useEmbeddedSettings:true,allPlates:false,plateId:plate.id});
  const {project:plateProject,bytes,settings,summary,warnings}=prepared;nativeProject.plateProjects[plate.id]={project:plateProject,bytes,settings,summary,warnings,plan:paPatternPlanForPlate(plan,plate.id)};
 }
 return{calibration:plan.request,plan,objects:nativeProject.project.objects,plates:project.plates.map(({id,name})=>({id,name})),activePlateId:project.activePlateId,nativeBaseline:plan.source,nativeProject};
}
