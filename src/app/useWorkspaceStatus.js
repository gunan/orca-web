import { projectHasChanges } from "../../shared/project-state.js";
import { usePrimeTowerPreview } from "../usePrimeTowerPreview.js";
import { useEffect } from "react";
export default function useWorkspaceStatus({
  projectState,
  session,
  presets,
  files,
  toolState,
  selection,
}) {
  const { project } = projectState;
  const { saved, job, health } = session;
  const { catalogPending, selectionPending, resolved, catalogRevision } =
    presets;
  const { submitting, importing, page } = files;
  const { clipboardBusy, setPrimeTowerSelected, setPrimeTowerDragLayout } =
    toolState;
  const { visibleObjects } = selection;
  const dirty = projectHasChanges(project, saved.current);
  const busy = Boolean(job && ["queued", "slicing"].includes(job.status));
  const pending =
    catalogPending ||
    selectionPending ||
    submitting ||
    importing ||
    clipboardBusy;
  const primeTowerPreview = usePrimeTowerPreview(
    project,
    resolved?.nativeProcessSettings || resolved?.settings,
    {
      active: page === "Prepare" && !pending,
      revision: catalogRevision,
    },
  );
  const engineAvailable = health?.engine?.available === true;
  const canSlice = Boolean(
    visibleObjects.length && resolved && engineAvailable && !pending && !busy,
  );
  const healthLabel = !health
    ? "Checking engine…"
    : engineAvailable
      ? health.engine.version || "OrcaSlicer available"
      : "Engine unavailable";
  useEffect(() => {
    if (["idle", "error"].includes(primeTowerPreview.status)) {
      setPrimeTowerSelected(null);
      setPrimeTowerDragLayout(null);
    }
  }, [primeTowerPreview.status]);
  return {
    dirty,
    busy,
    pending,
    primeTowerPreview,
    engineAvailable,
    canSlice,
    healthLabel,
  };
}
