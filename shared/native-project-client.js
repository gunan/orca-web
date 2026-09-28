import { serializeProject } from './project.js';
import { displayedSettings, normalizeOverrides } from './settings.js';
import { displayedProfileSettings } from './profile-settings.js';

export function embeddedProjectSelection(project) {
  if (!project.useEmbeddedSettings || !project.nativeSettings) return null;
  const settings = project.nativeSettings;
  const polygon = (settings.printable_area || []).map(point => String(point).split('x').map(Number));
  if (polygon.length < 3 || polygon.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))) return null;
  const width = Math.max(...polygon.map(point => point[0])) - Math.min(...polygon.map(point => point[0]));
  const depth = Math.max(...polygon.map(point => point[1])) - Math.min(...polygon.map(point => point[1]));
  return {
    context: project.nativeContext,
    nativeProcessSettings: structuredClone(settings),
    settings: displayedSettings(settings, { includeDefaults: true }),
    printerSettings: displayedProfileSettings('machine', settings),
    filamentSettings: displayedProfileSettings('filament', settings),
    printer: { name: settings.printer_settings_id, bedPolygon: polygon, bedHeight: Number(settings.printable_height), bedSize: `${width} × ${depth} mm`, nozzle: settings.nozzle_diameter?.[0] },
    process: { name: settings.print_settings_id }, filament: { name: settings.filament_settings_id?.[0] }
  };
}

export function nativeProjectRequest(project, { allPlates = false } = {}) {
  const snapshot = JSON.parse(serializeProject(project));
  const request = { project: snapshot, plateId: snapshot.activePlateId, allPlates, useEmbeddedSettings: snapshot.useEmbeddedSettings === true };
  if (snapshot.processCorrectionDecisions?.length) request.processCorrectionDecisions = snapshot.processCorrectionDecisions;
  if (request.useEmbeddedSettings) {
    snapshot.nativeSettings = { ...snapshot.nativeSettings, ...normalizeOverrides(snapshot.overrides) };
    snapshot.overrides = {};
  } else {
    request.selection = { printerId: snapshot.ids.printerId, processId: snapshot.ids.processId, filamentIds: snapshot.filamentIds?.length ? snapshot.filamentIds : [snapshot.ids.filamentId] };
    request.overrides = { process: normalizeOverrides(snapshot.overrides), ...(snapshot.projectOverrides && { project: snapshot.projectOverrides }) };
  }
  return request;
}

export function needsNativeProjectPipeline(project) {
  return Boolean(project.plates.length>1 || project.nativeWorkflow || project.useEmbeddedSettings || project.filamentIds?.length > 1 || project.objects.some(object => object.native || Number(object.filamentSlot) > 1) || project.plates.some(plate => plate.layerEvents?.items?.length));
}
