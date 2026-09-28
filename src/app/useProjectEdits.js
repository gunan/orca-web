import { useEffect } from "react";
import { reconcileNativeInstanceEdits } from "../../shared/native-instance-edits.js";
import { assertGeneratedPatternEdit } from "../../shared/generated-pattern-binding.js";
import { normalizeOverrides } from "../../shared/settings.js";
import { emptyProject } from "../../shared/project.js";

export default function useProjectEdits({
  dirty,
  setUnsavedAction,
  setJob,
  submitGeneration,
  update,
  setError,
  importGeneration,
  setImporting,
  replace,
  ids,
  setRecovery,
  setPage,
  setNotice,
}) {
  function requestDiscard(action) {
    if (dirty) setUnsavedAction(() => action);
    else action();
  }
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  function clearResult() {
    setJob(null);
    submitGeneration.current++;
  }
  function edit(action, options) {
    update((current) => {
      let next = typeof action === "function" ? action(current) : action;
      if (
        next.objects !== current.objects &&
        next.selectionFrame === current.selectionFrame
      )
        next = { ...next, selectionFrame: null };
      try {
        next = reconcileNativeInstanceEdits(current, next, options);
        assertGeneratedPatternEdit(current, next, {
          settings: next.generatedPatternBinding
            ? { ...next.nativeSettings, ...normalizeOverrides(next.overrides) }
            : next.nativeSettings,
        });
      } catch (cause) {
        queueMicrotask(() => setError(cause.message));
        return current;
      }
      if (
        next.processCorrectionDecisions ===
          current.processCorrectionDecisions &&
        [
          "ids",
          "overrides",
          "nativeSettings",
          "projectOverrides",
          "filamentIds",
          "useEmbeddedSettings",
        ].some((key) => next[key] !== current[key])
      )
        next = { ...next, processCorrectionDecisions: [] };
      if (
        current.calibration &&
        (next.objects !== current.objects ||
          next.ids !== current.ids ||
          next.overrides !== current.overrides ||
          next.plates !== current.plates ||
          next.nativeSettings !== current.nativeSettings ||
          next.projectOverrides !== current.projectOverrides ||
          next.filamentIds !== current.filamentIds)
      )
        return { ...next, calibration: null, calibrationPlan: null };
      return next;
    }, options);
    clearResult();
  }
  function createCalibration(result) {
    requestDiscard(() => {
      importGeneration.current++;
      setImporting(false);
      clearResult();
      const next = emptyProject(),
        plates = result.plates?.length ? result.plates : next.plates,
        activePlateId = result.activePlateId || plates[0].id;
      replace({
        ...next,
        plates,
        activePlateId,
        name: result.plan.label,
        ids,
        objects: result.objects.map((object) => ({
          ...object,
          plateId: result.plates?.length ? object.plateId : activePlateId,
        })),
        selectedId: result.objects[0]?.id || null,
        calibration: result.calibration,
        calibrationPlan: result.plan,
      });
      setRecovery(null);
      setPage("Prepare");
      setNotice(
        "Calibration model prepared. Slicing applies its native settings and layer schedule. Geometry or preset changes exit calibration.",
      );
    });
  }
  return { requestDiscard, clearResult, edit, createCalibration };
}
