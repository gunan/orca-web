import PresetSelect from "../PresetSelect.jsx";
import React from "react";
export default function StatusBar({
  session,
  status,
  files,
  selection,
  settings,
  presets,
  projectState,
  actions,
}) {
  const { job, recovery } = session;
  const { busy } = status;
  const { submitting, importing, setPage } = files;
  const { activeObjects } = selection;
  const { processName, effectiveLayerHeight } = settings;
  const { catalogPending, resolved, catalog } = presets;
  const { project, ids } = projectState;
  const { changePreset, saveProject } = actions;
  return (
    <footer className="actionbar">
      <div className="estimate">
        <b>
          {job?.status === "ready"
            ? "✓ Ready to print"
            : busy || submitting
              ? "Slicing…"
              : job?.status === "failed"
                ? "Slicing failed"
                : job?.status === "cancelled"
                  ? "Slicing cancelled"
                  : importing
                    ? "Importing…"
                    : activeObjects.length
                      ? "Models ready"
                      : "No model loaded"}
        </b>
        <span>
          {processName}
          {effectiveLayerHeight ? ` · ${effectiveLayerHeight} mm layer` : ""}
        </span>
      </div>
      <div className="grow" />
      {recovery && (
        <button onClick={() => setPage("Project")}>
          Restore available autosave
        </button>
      )}
      <PresetSelect
        label="Print profile"
        loading={catalogPending}
        embeddedName={
          project.useEmbeddedSettings
            ? resolved?.process?.name ||
              project.nativeSettings?.print_settings_id ||
              "Embedded process"
            : undefined
        }
        options={catalog.processes}
        value={ids.processId}
        onChange={(value) => changePreset("processId", value)}
        disabled={catalogPending || submitting || project.useEmbeddedSettings}
      />
      <button onClick={saveProject}>Save project</button>
    </footer>
  );
}
