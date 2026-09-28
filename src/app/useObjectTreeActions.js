import {
  selectNativeTreeNode,
  nativeTreeSelectionIds,
  resetNativeTreeSettings,
  setNativeTreeVisible,
  setNativeTreePrintable,
} from "../../shared/native-object-tree.js";
import { selectSceneIds } from "../../shared/multi-selection.js";

export default function useObjectTreeActions({
  update,
  setError,
  projectRef,
  setTreeRangeIndex,
  setHeightRangesOpen,
  setTreeEditorScope,
  setPartsEditorOpen,
  edit,
  resolved,
  overrides,
  setPaintingChannel,
  setVariableLayersOpen,
}) {
  function selectTreeNode(node, { mode = "replace", range } = {}) {
    try {
      update(
        (current) => {
          let next = selectNativeTreeNode(current, node, { mode });
          if (range?.length)
            for (const item of range)
              next = selectNativeTreeNode(next, item, { mode: "add" });
          return next;
        },
        { history: false },
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  function selectTreeInstance(node) {
    const current = projectRef.current.present,
      ids = nativeTreeSelectionIds(current, node),
      first = current.objects.find((object) => object.id === ids[0]);
    if (!first) throw new Error("Select an object first");
    update(
      selectSceneIds({ ...current, activePlateId: first.plateId }, [first.id], {
        scope: "object",
      }),
      { history: false },
    );
  }

  function treeSettings(node) {
    try {
      selectTreeInstance(node);
      if (node.kind === "layer" || node.kind === "layers") {
        setTreeRangeIndex(node.rangeIndex || 0);
        setHeightRangesOpen(true);
      } else {
        if (node.kind === "volume") selectTreeNode(node);
        setTreeEditorScope(node.kind === "volume" ? "part" : "object");
        setPartsEditorOpen(true);
      }
    } catch (cause) {
      setError(cause.message);
    }
  }

  function resetTreeSettings(node) {
    try {
      edit((current) =>
        resetNativeTreeSettings(current, node, {
          globalSettings: { ...resolved?.settings, ...overrides },
        }),
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  function treeVisibility(node, value) {
    try {
      edit((current) => setNativeTreeVisible(current, node, value));
    } catch (cause) {
      setError(cause.message);
    }
  }

  function treePrintability(node, value) {
    try {
      edit((current) => setNativeTreePrintable(current, node, value));
    } catch (cause) {
      setError(cause.message);
    }
  }

  function treePainting(node, channel) {
    try {
      selectTreeInstance(node);
      setPaintingChannel(channel);
    } catch (cause) {
      setError(cause.message);
    }
  }

  function treeVariableLayers(node) {
    try {
      selectTreeInstance(node);
      setVariableLayersOpen(true);
    } catch (cause) {
      setError(cause.message);
    }
  }
  return {
    selectTreeNode,
    selectTreeInstance,
    treeSettings,
    resetTreeSettings,
    treeVisibility,
    treePrintability,
    treePainting,
    treeVariableLayers,
  };
}
