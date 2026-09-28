import {
  selectSceneIds,
  rectangleSceneSelection,
  transformMultipleSelection,
  removeMultipleSelection,
  centerMultipleSelection,
  dropMultipleSelection,
} from "../../shared/multi-selection.js";
import {
  updateSceneTransform,
  centerSceneSelection,
  dropSceneSelection,
} from "../../shared/scene-object-operations.js";
import { mirrorNativeGroup } from "../../shared/geometry-cut.js";

export default function useModelTransforms({
  update,
  transformScope,
  setError,
  selectionIds,
  multiple,
  selectionAnchor,
  activeObjects,
  setPrimeTowerSelected,
  setPrimeTowerDragLayout,
  selected,
  edit,
  project,
  bed,
  setNotice,
}) {
  function chooseSelection(ids, options = {}) {
    try {
      update(
        (current) =>
          selectSceneIds(current, ids, { scope: transformScope, ...options }),
        { history: false },
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  function selectCanvas(id, event = {}) {
    const toggle = event.ctrlKey || event.metaKey;
    if (!id) {
      if (!toggle) chooseSelection([]);
      return;
    }
    if (!toggle && !event.altKey && selectionIds.includes(id) && multiple) {
      update((current) => ({ ...current, selectedId: id }), { history: false });
      return;
    }
    selectionAnchor.current = id;
    chooseSelection([id], {
      scope: event.altKey ? "part" : transformScope,
      mode: toggle ? "toggle" : "replace",
    });
  }

  function selectRectangle(ids, event = {}) {
    try {
      update((current) =>
        rectangleSceneSelection(current, ids, {
          additive: event.ctrlKey || event.metaKey,
        }),
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  function selectAll() {
    chooseSelection(activeObjects.map((object) => object.id));
  }

  function deselectAll() {
    setPrimeTowerSelected(null);
    setPrimeTowerDragLayout(null);
    chooseSelection([]);
  }

  function changeSelected(patch, options) {
    if (selected) transform(selected.id, patch, options);
  }

  function transform(id, patch, options) {
    try {
      if (
        multiple &&
        selectionIds.includes(id) &&
        Object.keys(patch).every((key) =>
          ["position", "rotation", "scale"].includes(key),
        )
      )
        edit(
          transformMultipleSelection(project, patch, { scope: transformScope }),
          options,
        );
      else {
        const objects = updateSceneTransform(project.objects, id, patch, {
          scope: transformScope,
        });
        edit((current) => ({ ...current, objects }), options);
      }
    } catch (cause) {
      setError(cause.message);
    }
  }

  function mutateSelected(operation) {
    if (selected && !multiple)
      edit((current) => ({
        ...current,
        objects: current.objects.map((object) =>
          object.id === selected.id ? operation(object) : object,
        ),
      }));
  }

  function deleteSelected() {
    if (selected)
      try {
        edit(removeMultipleSelection(project, { scope: transformScope }));
      } catch (cause) {
        setError(cause.message);
      }
  }

  function centerSelected() {
    if (selected)
      try {
        if (multiple)
          edit(
            centerMultipleSelection(project, bed, { scope: transformScope }),
          );
        else
          edit((current) => ({
            ...current,
            objects: centerSceneSelection(current.objects, selected.id, bed, {
              scope: transformScope,
            }),
          }));
      } catch (cause) {
        setError(cause.message);
      }
  }

  function dropSelected() {
    if (selected)
      try {
        if (multiple)
          edit(dropMultipleSelection(project, bed, { scope: transformScope }));
        else
          edit((current) => ({
            ...current,
            objects: dropSceneSelection(current.objects, selected.id, bed, {
              scope: transformScope,
            }),
          }));
      } catch (cause) {
        setError(cause.message);
      }
  }

  function mirrorSelected(axis) {
    if (!selected || multiple) return;
    try {
      const objects = mirrorNativeGroup(project.objects, selected.id, axis);
      edit((current) => ({ ...current, objects }));
      setNotice(
        `Mirrored the selected object group along ${axis.toUpperCase()}.`,
      );
    } catch (problem) {
      setError(problem.message);
    }
  }
  return {
    chooseSelection,
    selectCanvas,
    selectRectangle,
    selectAll,
    deselectAll,
    changeSelected,
    transform,
    mutateSelected,
    deleteSelected,
    centerSelected,
    dropSelected,
    mirrorSelected,
  };
}
