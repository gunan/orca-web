import BrimEarsEditor from "../../BrimEarsEditor.jsx";
import React from "react";
export default function BrimDialog({
  toolState,
  selection,
  projectState,
  presets,
  actions,
}) {
  const { brimOpen, setBrimOpen } = toolState;
  const { selected, multiple, bed } = selection;
  const { project, overrides } = projectState;
  const { resolved } = presets;
  const { edit } = actions;
  return (
    brimOpen &&
    selected &&
    !multiple && (
      <BrimEarsEditor
        objects={project.objects}
        selectedId={selected.id}
        bed={bed}
        globalSettings={{
          ...resolved?.printerSettings,
          ...resolved?.nativeProcessSettings,
          ...resolved?.settings,
          ...overrides,
        }}
        onChange={(objects) =>
          edit((current) => ({
            ...current,
            objects,
            nativeWorkflow: true,
          }))
        }
        onClose={() => setBrimOpen(false)}
      />
    )
  );
}
