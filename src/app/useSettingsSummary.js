import { displayedSettings } from "../../shared/settings.js";
import { useMemo } from "react";
import { filamentSlotCount } from "../../shared/filament-slots.js";
import { processSettingsState } from "../../shared/process-settings-state.js";
export default function useSettingsSummary({
  presets,
  projectState,
  session,
  status,
}) {
  const { resolved, catalog } = presets;
  const { ids, project, overrides } = projectState;
  const { error, job, health } = session;
  const { engineAvailable } = status;
  const processName =
    resolved?.process?.name ||
    catalog.processes.find((item) => item.id === ids.processId)?.name ||
    "Select a process";
  const displayedSelection =
    project.calibrationPlan && resolved
      ? {
          ...resolved,
          settings: displayedSettings({
            ...resolved.settings,
            ...project.calibrationPlan.overrides.process,
          }),
        }
      : resolved;
  const settingsState = useMemo(() => {
    const context = {
      filamentCount: filamentSlotCount(project),
      projectSettings: project.nativeSettings || project.projectOverrides,
    };
    try {
      return processSettingsState(displayedSelection, overrides, {
        ...context,
        processCorrectionDecisions: project.processCorrectionDecisions || [],
      });
    } catch (cause) {
      return {
        ...processSettingsState(displayedSelection, overrides, context),
        decisionError: `Previous native setting choices need review: ${cause.message}`,
      };
    }
  }, [
    displayedSelection,
    overrides,
    project.filamentIds,
    project.nativeSettings,
    project.projectOverrides,
    project.processCorrectionDecisions,
  ]);
  const effectiveLayerHeight =
    overrides.layer_height ?? displayedSelection?.settings?.layer_height;
  const activeError =
    error ||
    (job?.status === "failed" ? job.error : "") ||
    (health && !engineAvailable
      ? health.engine?.error || "The engine is unavailable."
      : "");
  return {
    processName,
    displayedSelection,
    settingsState,
    effectiveLayerHeight,
    activeError,
  };
}
