import {
  applyAutomaticProcessCorrections,
  acceptProcessCorrectionChoices,
} from "../../shared/process-settings-state.js";
import { filamentSlotCount } from "../../shared/filament-slots.js";

export default function usePrintSettings({
  edit,
  resolved,
  overrides,
  project,
  setError,
  settingsCorrections,
  displayedSelection,
  settingsState,
  setSettingsCorrections,
}) {
  function changeProjectSettings(values) {
    edit((current) =>
      current.useEmbeddedSettings
        ? {
            ...current,
            nativeSettings: { ...current.nativeSettings, ...values },
          }
        : {
            ...current,
            nativeWorkflow: true,
            projectOverrides: { ...current.projectOverrides, ...values },
          },
    );
  }

  function changeSetting(key, value) {
    try {
      const next = applyAutomaticProcessCorrections(
        resolved,
        { ...overrides, [key]: value },
        {
          filamentCount: filamentSlotCount(project),
          projectSettings: project.nativeSettings || project.projectOverrides,
        },
      );
      edit((current) => ({ ...current, overrides: next }));
    } catch (cause) {
      setError(cause.message);
    }
  }

  function applySettingsCorrections(alternative = false) {
    try {
      const decisions = settingsCorrections.map((group) => ({
        id: group.id,
        signature: group.signature,
        choice: alternative ? "alternative" : "apply",
      }));
      const accepted = acceptProcessCorrectionChoices(
        displayedSelection,
        overrides,
        decisions,
        {
          filamentCount: filamentSlotCount(project),
          projectSettings: project.nativeSettings || project.projectOverrides,
          processCorrectionDecisions: settingsState.decisionError
            ? []
            : project.processCorrectionDecisions || [],
        },
      );
      edit((current) => ({
        ...current,
        overrides: accepted.overrides,
        processCorrectionDecisions: accepted.processCorrectionDecisions,
      }));
      setSettingsCorrections(null);
      setError("");
    } catch (cause) {
      setError(cause.message);
    }
  }

  function resetSetting(key) {
    edit((current) => {
      const next = { ...current.overrides };
      delete next[key];
      return { ...current, overrides: next };
    });
  }

  function resetSettings() {
    edit((current) => ({ ...current, overrides: {} }));
  }
  return {
    changeProjectSettings,
    changeSetting,
    applySettingsCorrections,
    resetSetting,
    resetSettings,
  };
}
