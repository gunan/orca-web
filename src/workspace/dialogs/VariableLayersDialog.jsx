import VariableLayersEditor from "../../VariableLayersEditor.jsx";
import { filamentSlotCount } from "../../../shared/filament-slots.js";
import React from "react";
export default function VariableLayersDialog({
  toolState,
  selection,
  session,
  projectState,
  presets,
  actions,
}) {
  const { variableLayersOpen, setVariableLayersOpen } = toolState;
  const { selected, multiple } = selection;
  const { health } = session;
  const { project, overrides } = projectState;
  const { resolved } = presets;
  const { edit } = actions;
  return (
    variableLayersOpen &&
    selected &&
    !multiple && (
      <VariableLayersEditor
        nativeShrinkageInitialization={
          health?.capabilities?.nativeShrinkageInitialization === true
        }
        project={project}
        selectedId={selected.id}
        globalSettings={{
          ...resolved?.printerSettings,
          ...resolved?.filamentSettings,
          ...resolved?.nativeProcessSettings,
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
        onClose={() => setVariableLayersOpen(false)}
      />
    )
  );
}
