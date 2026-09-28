import HeightRangesEditor from "../../HeightRangesEditor.jsx";
import { filamentSlotCount } from "../../../shared/filament-slots.js";
import React from "react";
export default function HeightRangesDialog({
  toolState,
  selection,
  projectState,
  presets,
  actions,
}) {
  const {
    heightRangesOpen,
    treeRangeIndex,
    listClipboard,
    setListClipboard,
    setHeightRangesOpen,
  } = toolState;
  const { selected, multiple } = selection;
  const { project, overrides } = projectState;
  const { resolved } = presets;
  const { edit } = actions;
  return (
    heightRangesOpen &&
    selected &&
    !multiple && (
      <HeightRangesEditor
        initialRangeIndex={treeRangeIndex}
        canPasteClipboard={listClipboard.type === "layers"}
        clipboard={listClipboard.layers}
        onClipboardChange={(layers) =>
          setListClipboard((current) => ({
            ...current,
            type: "layers",
            layers,
          }))
        }
        project={project}
        selectedId={selected.id}
        globalSettings={{
          ...resolved?.printerSettings,
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
        onClose={() => setHeightRangesOpen(false)}
      />
    )
  );
}
