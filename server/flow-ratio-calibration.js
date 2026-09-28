import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importNative3MF } from '../shared/native-project.js';
import { emptyProject } from '../shared/project.js';
import { FLOW_RATIO_METHODS, prepareFlowRatioObjects } from '../shared/flow-ratio-calibration.js';
import { createNativeProjectService } from './native-projects.js';

/** Read only a pinned, whitelisted bundled model. No client archive, project
 * setting or resource path is accepted in this preparation path. */
export async function prepareFlowRatioProject({ resourcesDir, plan, selection, bed, signal }) {
  const method = FLOW_RATIO_METHODS[plan.request.method];
  if (!method || plan.model.resource !== `filament_flow/${method.resource}`) throw new Error('Unknown native flow calibration resource');
  signal?.throwIfAborted();
  const bytes = await readFile(path.join(resourcesDir, 'calib', plan.model.resource), { signal });
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Native flow calibration resource is too large');
  const imported = importNative3MF(bytes, { filename: method.resource });
  if (imported.nativeImportWarnings.length) throw new Error('Native flow calibration geometry has unsupported metadata');
  const prepared = prepareFlowRatioObjects(imported.objects, plan, bed), project = emptyProject();
  project.name = `${plan.label} — ${method.label}`; project.ids = { printerId:'calibration-printer',processId:'calibration-process',filamentId:'calibration-filament' };
  project.objects = prepared.objects.map(object => ({...object,plateId:project.activePlateId})); project.selectedId = project.objects[0].id;
  // The project service normalizes complete preset settings and per-object
  // options. Its catalog sees only this already-resolved trusted selection.
  const service = createNativeProjectService({ catalog: { resolveSelection: async () => structuredClone(selection) } });
  const nativeProject = await service.prepare({ project, selection: { ...project.ids, filamentIds:[project.ids.filamentId] }, allPlates:false });
  signal?.throwIfAborted();
  return { calibration:plan.request,plan:{...plan,specimens:prepared.specimens},objects:nativeProject.project.objects,nativeBaseline:plan.source,nativeProject };
}
