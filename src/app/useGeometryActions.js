import { replaceCutGeometry } from "../../shared/cut-geometry-lifecycle.js";
import { nativeEmbossLossMessage } from "../../shared/native-emboss.js";
import {
  splitDisconnected,
  disassembleMesh,
  assembleMeshes,
  repairMesh,
} from "../../shared/geometry-operations.js";

export default function useGeometryActions({
  edit,
  setCutOpen,
  setNotice,
  project,
  selected,
  setNativeTextAction,
  projectRef,
  nativeTextAction,
  setError,
  multiple,
  visibleObjects,
}) {
  function applyCut(created, { replaceIds, report }) {
    const removed = new Set(replaceIds);
    edit((current) => ({
      ...current,
      objects: [
        ...current.objects
          .filter((object) => !removed.has(object.id))
          .map((object) =>
            report?.cutFamilyUpdate &&
            object.native?.cutId?.id === report.cutFamilyUpdate.id
              ? {
                  ...object,
                  native: {
                    ...object.native,
                    cutId: { ...report.cutFamilyUpdate },
                  },
                }
              : object,
          ),
        ...created,
      ],
      selectedId:
        report?.selectedId ||
        (
          created.find(
            (object) =>
              !object.native?.partType ||
              object.native.partType === "normal_part",
          ) || created[0]
        )?.id ||
        null,
      ...(report?.nativeReset
        ? {
            selectedIds: report.selectedIds,
            selectionScope: "object",
            selectionFrame: null,
          }
        : {}),
    }));
    setCutOpen(false);
    setNotice(
      `Cut produced ${created.length} retained parts with closed cut surfaces.`,
    );
  }

  function replaceGeometry(parts) {
    const replacement = replaceCutGeometry(
      project.objects,
      [selected.id],
      parts,
    );
    edit((current) => ({
      ...current,
      objects: replacement.objects,
      selectedId: replacement.parts[0]?.id || null,
    }));
    return replacement.invalidated
      ? " Cut relationship metadata was cleared because the geometry changed; all meshes remain."
      : "";
  }

  function applyTopologyChange(title, objects, apply) {
    const message = nativeEmbossLossMessage(objects);
    if (message)
      setNativeTextAction({
        title,
        message,
        apply,
        project: projectRef.current.present,
      });
    else apply();
  }

  function confirmNativeTextLoss() {
    const action = nativeTextAction;
    setNativeTextAction(null);
    if (projectRef.current.present !== action.project) {
      setError(
        "The project changed while this operation was awaiting confirmation. Review the current geometry and try again.",
      );
      return;
    }
    try {
      action.apply();
    } catch (problem) {
      setError(problem.message);
    }
  }

  function splitSelected() {
    if (!selected || multiple) return;
    try {
      const parts = splitDisconnected(selected);
      applyTopologyChange("Split shells", [selected], () => {
        const cutNotice = replaceGeometry(parts);
        setNotice(
          `Split into ${parts.length} connected shell${parts.length === 1 ? "" : "s"}.${cutNotice}`,
        );
      });
    } catch (problem) {
      setError(problem.message);
    }
  }

  function disassembleSelected() {
    if (!selected || multiple) return;
    try {
      const parts = disassembleMesh(selected);
      applyTopologyChange("Disassemble", [selected], () => {
        const cutNotice = replaceGeometry(parts);
        if (cutNotice) setNotice(cutNotice.trim());
      });
    } catch (problem) {
      setError(problem.message);
    }
  }

  function assemblePlate() {
    try {
      const assembled = assembleMeshes(visibleObjects);
      const replacement = replaceCutGeometry(
        project.objects,
        visibleObjects.map((object) => object.id),
        [assembled],
      );
      applyTopologyChange("Assemble plate", visibleObjects, () => {
        edit((current) => ({
          ...current,
          objects: replacement.objects,
          selectedId: assembled.id,
        }));
        setNotice(
          "Assembled visible objects while preserving their surfaces and part names." +
            (replacement.invalidated
              ? " Cut relationship metadata was cleared because the object membership changed."
              : ""),
        );
      });
    } catch (problem) {
      setError(problem.message);
    }
  }

  function repairSelected() {
    if (!selected || multiple) return;
    try {
      const { mesh, report } = repairMesh(selected);
      applyTopologyChange("Repair mesh", [selected], () => {
        const cutNotice = replaceGeometry([mesh]);
        setNotice(
          `Mesh repair: removed ${report.removedDegenerateTriangles} degenerate and ${report.removedDuplicateTriangles} duplicate triangles; corrected ${report.flippedTriangles} face orientations. ${report.warnings.join(" ")}${cutNotice}`,
        );
      });
    } catch (problem) {
      setError(problem.message);
    }
  }
  return {
    applyCut,
    replaceGeometry,
    applyTopologyChange,
    confirmNativeTextLoss,
    splitSelected,
    disassembleSelected,
    assemblePlate,
    repairSelected,
  };
}
