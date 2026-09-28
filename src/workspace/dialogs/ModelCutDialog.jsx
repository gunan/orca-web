import CutDialog from "../../CutDialog.jsx";
import React from "react";
export default function ModelCutDialog({
  toolState,
  selection,
  projectState,
  actions,
}) {
  const { cutOpen, setCutOpen } = toolState;
  const { selected, multiple, bed } = selection;
  const { project } = projectState;
  const { applyCut } = actions;
  return (
    cutOpen &&
    selected &&
    !multiple && (
      <CutDialog
        object={selected}
        objects={project.objects}
        selectedId={selected.id}
        bed={bed}
        plates={project.plates}
        onApply={applyCut}
        onClose={() => setCutOpen(false)}
      />
    )
  );
}
