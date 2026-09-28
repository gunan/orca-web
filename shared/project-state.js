const equal = (left, right) => left === right || JSON.stringify(left) === JSON.stringify(right);
// Selection is transient. Saved geometry arrays are immutable and shared by the
// undo stack, so comparing metadata does not serialize an entire model per render.
export function projectHasChanges(project, saved) {
  if (!saved) return Boolean(project.objects.length || project.plates.length > 1 || Object.keys(project.overrides).length || project.name !== 'Untitled' || project.metadata?.author || project.metadata?.description);
  const { objects, selectedId: _selection, selectedIds: _ids, selectionScope: _scope, selectionFrame: _frame, ...data } = project;
  const { objects: savedObjects, selectedId: _savedSelection, selectedIds: _savedIds, selectionScope: _savedScope, selectionFrame: _savedFrame, ...savedData } = saved;
  if (!equal(data, savedData) || objects.length !== savedObjects.length) return true;
  return objects.some((object, index) => {
    const previous = savedObjects[index];
    if (object === previous) return false;
    const { positions, ...properties } = object, { positions: oldPositions, ...oldProperties } = previous;
    if (!equal(properties, oldProperties)) return true;
    return positions !== oldPositions && (positions.length !== oldPositions.length || positions.some((value, offset) => value !== oldPositions[offset]));
  });
}
