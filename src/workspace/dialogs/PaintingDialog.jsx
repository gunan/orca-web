import PaintDialog from "../../PaintDialog.jsx";
import { filamentSlotCount } from "../../../shared/filament-slots.js";
import React from "react";
export default function PaintingDialog({
  toolState,
  selection,
  projectState,
  actions,
}) {
  const { paintingChannel, setPaintingChannel } = toolState;
  const { selected, multiple, bed } = selection;
  const { project } = projectState;
  const { previewSupports, edit } = actions;
  return (
    paintingChannel &&
    selected &&
    !multiple && (
      <PaintDialog
        objects={project.objects}
        selectedId={selected.id}
        bed={bed}
        filamentColors={
          project.nativeSettings?.filament_colour ||
          project.projectOverrides?.filament_colour ||
          []
        }
        filamentCount={filamentSlotCount(project)}
        initialChannel={paintingChannel}
        onPreviewSupports={previewSupports}
        onApply={(result) =>
          edit((current) => ({
            ...current,
            ...result,
            nativeWorkflow: true,
          }))
        }
        onClose={() => setPaintingChannel(null)}
      />
    )
  );
}
