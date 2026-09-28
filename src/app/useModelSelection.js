import { useMemo, useEffect } from "react";
import LegacyTextDialog from "../TextDialog.jsx";
import NativeTextDialog from "../NativeTextDialog.jsx";
import {
  selectedSceneIds,
  sceneSelectionCount,
  multipleSelectionObject,
} from "../../shared/multi-selection.js";
import { sceneSelectionObject } from "../../shared/scene-object-operations.js";
export default function useModelSelection({
  projectState,
  toolState,
  presets,
}) {
  const { project } = projectState;
  const { setTextOpen, setSvgOpen, transformScope } = toolState;
  const { resolved } = presets;
  const activeObjects = useMemo(
    () =>
      project.objects.filter(
        (object) => object.plateId === project.activePlateId,
      ),
    [project.objects, project.activePlateId],
  );
  const visibleObjects = useMemo(
    () => activeObjects.filter((object) => object.visible !== false),
    [activeObjects],
  );
  const selected = activeObjects.find(
    (object) => object.id === project.selectedId,
  );
  const TextDialog = selected?.text ? LegacyTextDialog : NativeTextDialog;
  useEffect(() => {
    setTextOpen(false);
    setSvgOpen(false);
  }, [project.selectedId]);
  const selectionIds = useMemo(
    () =>
      selectedSceneIds(project, {
        scope: transformScope,
      }),
    [
      project.objects,
      project.activePlateId,
      project.selectedId,
      project.selectedIds,
      transformScope,
    ],
  );
  const selectionCount = sceneSelectionCount(project, {
      scope: transformScope,
    }),
    multiple = selectionCount > 1;
  const transformObject = useMemo(
    () =>
      selected
        ? multiple
          ? multipleSelectionObject(project, {
              scope: transformScope,
            })
          : sceneSelectionObject(project.objects, selected.id, {
              scope: transformScope,
            })
        : null,
    [
      project.objects,
      selected?.id,
      project.selectedIds,
      project.selectionFrame,
      transformScope,
      multiple,
    ],
  );
  const bed = useMemo(() => {
    const polygon = resolved?.printer?.bedPolygon || [
      [0, 0],
      [250, 0],
      [250, 210],
      [0, 210],
    ];
    const height = resolved?.printer?.bedHeight || 250;
    return {
      polygon,
      height,
      min: [
        Math.min(...polygon.map((p) => p[0])),
        Math.min(...polygon.map((p) => p[1])),
        0,
      ],
      max: [
        Math.max(...polygon.map((p) => p[0])),
        Math.max(...polygon.map((p) => p[1])),
        height,
      ],
    };
  }, [resolved?.printer]);
  return {
    activeObjects,
    visibleObjects,
    selected,
    TextDialog,
    selectionIds,
    selectionCount,
    multiple,
    transformObject,
    bed,
  };
}
