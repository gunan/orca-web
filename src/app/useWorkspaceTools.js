import { useState, useRef, useEffect } from "react";
import {
  normalizeArrangeOptions,
  ARRANGE_DEFAULTS,
} from "../../shared/native-arrangement.js";
import {
  selectSceneIds,
  sceneSelectionCount,
  selectedSceneIds,
} from "../../shared/multi-selection.js";
export default function useWorkspaceTools({ projectState }) {
  const { project, update } = projectState;
  const [rotationSnap, setRotationSnap] = useState(true);
  const [rotationPreview, setRotationPreview] = useState(null);
  const [cameraCommand, setCameraCommand] = useState(null);
  const [arrangeOpen, setArrangeOpen] = useState(false),
    [arranging, setArranging] = useState(false),
    [arrangeOptions, setArrangeOptions] = useState(() => {
      try {
        return normalizeArrangeOptions(
          JSON.parse(
            localStorage.getItem("orca-web:arrange-options-v1") || "{}",
          ),
        );
      } catch {
        return {
          ...ARRANGE_DEFAULTS,
        };
      }
    });
  const arrangeController = useRef(null);
  useEffect(() => () => arrangeController.current?.abort(), []);
  const cameraFrame = useRef(null),
    arrowGesture = useRef(null),
    keyboardContext = useRef(null),
    filamentSequence = useRef(null);
  const [mode, setMode] = useState("Select"),
    [wireframe, setWireframe] = useState(false),
    [menu, setMenu] = useState(null),
    [help, setHelp] = useState(false);
  const [compare, setCompare] = useState(false);
  const [profileEditor, setProfileEditor] = useState(null);
  const [addPrinterOpen, setAddPrinterOpen] = useState(false);
  const [settingsCorrections, setSettingsCorrections] = useState(null);
  const [textOpen, setTextOpen] = useState(false);
  const [svgOpen, setSvgOpen] = useState(false);
  const [modelClipboard, setModelClipboard] = useState(null),
    [cloneOpen, setCloneOpen] = useState(false),
    [clipboardBusy, setClipboardBusy] = useState(false);
  const [listClipboard, setListClipboard] = useState({
      type: null,
      process: null,
      layers: null,
    }),
    [clipboardTask, setClipboardTask] = useState("models");
  const clipboardRequest = useRef(null);
  useEffect(() => () => clipboardRequest.current?.abort(), []);
  const [brimOpen, setBrimOpen] = useState(false);
  const [heightRangesOpen, setHeightRangesOpen] = useState(false);
  const [variableLayersOpen, setVariableLayersOpen] = useState(false);
  const [cutClipboardDialog, setCutClipboardDialog] = useState(null);
  const [paintingChannel, setPaintingChannel] = useState(null);
  const [flushOpen, setFlushOpen] = useState(false);
  const [primeTowerOpen, setPrimeTowerOpen] = useState(false);
  const [primeTowerSelected, setPrimeTowerSelected] = useState(null);
  const [primeTowerDragLayout, setPrimeTowerDragLayout] = useState(null);
  useEffect(() => {
    if (project.selectedId) setPrimeTowerSelected(null);
  }, [project.selectedId]);
  const [filamentError, setFilamentError] = useState("");
  const [partsEditorOpen, setPartsEditorOpen] = useState(false);
  const [treeEditorScope, setTreeEditorScope] = useState("object"),
    [treeRangeIndex, setTreeRangeIndex] = useState(0);
  const [cutOpen, setCutOpen] = useState(false);
  const transformScope = project.selectionScope || "object";
  const selectionAnchor = useRef(null);
  function setTransformScope(scope) {
    update(
      (current) =>
        selectSceneIds(
          current,
          sceneSelectionCount(current, {
            scope: current.selectionScope || "object",
          }) > 1
            ? selectedSceneIds(current, {
                scope: current.selectionScope || "object",
              })
            : current.selectedId
              ? [current.selectedId]
              : [],
          {
            scope,
          },
        ),
      {
        history: false,
      },
    );
  }
  const [layerEventsOpen, setLayerEventsOpen] = useState(false);
  const [filamentSequenceOpen, setFilamentSequenceOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibrationResultOpen, setCalibrationResultOpen] = useState(false);
  const [unsavedAction, setUnsavedAction] = useState(null);
  const [nativeTextAction, setNativeTextAction] = useState(null);
  const [importOptionsOpen, setImportOptionsOpen] = useState(false),
    [importOptions, setImportOptions] = useState({
      svgDepth: 10,
      svgScale: 1,
      stepLinearDeflection: 0.1,
      stepAngularDeflection: 0.5,
    });
  const [theme, setTheme] = useState(
    () => localStorage.getItem("orca-web-theme") || "light",
  );
  return {
    rotationSnap,
    setRotationSnap,
    rotationPreview,
    setRotationPreview,
    cameraCommand,
    setCameraCommand,
    arrangeOpen,
    setArrangeOpen,
    arranging,
    setArranging,
    arrangeOptions,
    setArrangeOptions,
    arrangeController,
    cameraFrame,
    arrowGesture,
    keyboardContext,
    filamentSequence,
    mode,
    setMode,
    wireframe,
    setWireframe,
    menu,
    setMenu,
    help,
    setHelp,
    compare,
    setCompare,
    profileEditor,
    setProfileEditor,
    addPrinterOpen,
    setAddPrinterOpen,
    settingsCorrections,
    setSettingsCorrections,
    textOpen,
    setTextOpen,
    svgOpen,
    setSvgOpen,
    modelClipboard,
    setModelClipboard,
    cloneOpen,
    setCloneOpen,
    clipboardBusy,
    setClipboardBusy,
    listClipboard,
    setListClipboard,
    clipboardTask,
    setClipboardTask,
    clipboardRequest,
    brimOpen,
    setBrimOpen,
    heightRangesOpen,
    setHeightRangesOpen,
    variableLayersOpen,
    setVariableLayersOpen,
    cutClipboardDialog,
    setCutClipboardDialog,
    paintingChannel,
    setPaintingChannel,
    flushOpen,
    setFlushOpen,
    primeTowerOpen,
    setPrimeTowerOpen,
    primeTowerSelected,
    setPrimeTowerSelected,
    primeTowerDragLayout,
    setPrimeTowerDragLayout,
    filamentError,
    setFilamentError,
    partsEditorOpen,
    setPartsEditorOpen,
    treeEditorScope,
    setTreeEditorScope,
    treeRangeIndex,
    setTreeRangeIndex,
    cutOpen,
    setCutOpen,
    transformScope,
    selectionAnchor,
    setTransformScope,
    layerEventsOpen,
    setLayerEventsOpen,
    filamentSequenceOpen,
    setFilamentSequenceOpen,
    calibrationOpen,
    setCalibrationOpen,
    calibrationResultOpen,
    setCalibrationResultOpen,
    unsavedAction,
    setUnsavedAction,
    nativeTextAction,
    setNativeTextAction,
    importOptionsOpen,
    setImportOptionsOpen,
    importOptions,
    setImportOptions,
    theme,
    setTheme,
  };
}
