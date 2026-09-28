import NativePartsEditor from "../../NativePartsEditor.jsx";
import { filamentSlotCount } from "../../../shared/filament-slots.js";
import React from "react";
export default function PartsDialog({
  toolState,
  projectState,
  presets,
  actions,
}) {
  const { partsEditorOpen, treeEditorScope, setPartsEditorOpen } = toolState;
  const { project, overrides } = projectState;
  const { resolved } = presets;
  const { edit } = actions;
  return (
    partsEditorOpen && (
      <NativePartsEditor
        initialScope={treeEditorScope}
        project={project}
        selectedId={project.selectedId}
        globalSettings={{
          ...resolved?.settings,
          ...overrides,
        }}
        filamentCount={filamentSlotCount(project)}
        onChange={(objects) =>
          edit((current) => ({
            ...current,
            objects,
            nativeWorkflow: true,
          }))
        }
        onClose={() => setPartsEditorOpen(false)}
      />
    )
  );
}
