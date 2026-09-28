import { processClipboardAvailability } from "../../shared/native-settings-clipboard.js";
import { clearAllSceneObjects } from "../../shared/native-shortcuts.js";
import { MEASURED_CALIBRATION_MODES } from "../../shared/calibration-results.js";

export default function useApplicationMenus({
  requestDiscard,
  newProject,
  modelInput,
  projectInput,
  saveProject,
  exportModel,
  undoEdit,
  canUndo,
  redoEdit,
  canRedo,
  cutModels,
  selected,
  pending,
  copyModels,
  pasteFromClipboard,
  pasteClipboardUnavailable,
  copyProcessSettings,
  multiple,
  pasteProcessSettings,
  listClipboard,
  project,
  setCloneOpen,
  duplicateSelected,
  deleteSelected,
  edit,
  setMode,
  selectAll,
  activeObjects,
  deselectAll,
  primeTowerSelected,
  arrange,
  arranging,
  setPage,
  setWireframe,
  setTheme,
  setCalibrationOpen,
  resolved,
  setCalibrationResultOpen,
  setHelp,
}) {
  const menus = {
    File: [
      ["New project", () => requestDiscard(newProject)],
      ["Open models…", () => modelInput.current.click()],
      ["Open project…", () => projectInput.current.click()],
      ["Recent files"],
      ["Save project", saveProject],
      ["Export STL", () => exportModel("stl")],
      ["Export 3MF", () => exportModel("3mf")],
      ["Export native project (all plates)", () => exportModel("3mf", true)],
    ],
    Edit: [
      ["Undo", undoEdit, !canUndo],
      ["Redo", redoEdit, !canRedo],
      ["Cut", cutModels, !selected || pending],
      ["Copy", copyModels, !selected || pending],
      [
        "Paste",
        pasteFromClipboard,
        pending || Boolean(pasteClipboardUnavailable()),
      ],
      [
        "Copy Process Settings",
        copyProcessSettings,
        !selected || multiple || pending,
      ],
      [
        "Paste Process Settings",
        pasteProcessSettings,
        pending ||
          listClipboard.type !== "process" ||
          Boolean(processClipboardAvailability(project, listClipboard.process)),
      ],
      ["Clone selected…", () => setCloneOpen(true), !selected || pending],
      ["Duplicate", duplicateSelected, !selected],
      ["Delete", deleteSelected, !selected],
      [
        "Delete all objects",
        () => {
          edit(clearAllSceneObjects(project));
          setMode("Select");
        },
        !project.objects.length || pending,
      ],
      ["Select all", selectAll, !activeObjects.length],
      [
        "Deselect all",
        deselectAll,
        !selected && primeTowerSelected !== project.activePlateId,
      ],
      ["Arrange plate", () => arrange(), !activeObjects.length || arranging],
    ],
    View: [
      ["Home", () => setPage("Home")],
      ["Prepare", () => setPage("Prepare")],
      ["Preview", () => setPage("Preview")],
      ["Toggle wireframe", () => setWireframe((value) => !value)],
      ["Light theme", () => setTheme("light")],
      ["Dark theme", () => setTheme("dark")],
    ],
    Calibration: [
      [
        "Generate calibration…",
        () => setCalibrationOpen(true),
        !resolved || pending || project.useEmbeddedSettings,
      ],
      [
        "Save calibration result…",
        () => setCalibrationResultOpen(true),
        !project.calibration ||
          !(
            project.calibrationPlan?.request?.mode === "flow-ratio" ||
            MEASURED_CALIBRATION_MODES.includes(
              project.calibrationPlan?.request?.mode,
            )
          ),
      ],
    ],
    Help: [
      ["Keyboard shortcuts", () => setHelp(true)],
      [
        "About Orca Web",
        () => {
          setHelp(true);
        },
      ],
    ],
  };
  return { menus };
}
