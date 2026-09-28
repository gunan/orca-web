import {
  assignSelectedFilament,
  createFilamentKeySequence,
  cameraRelativeNudge,
  toggleSelectedPrintable,
} from "../../shared/prepare-keyboard.js";
import { useEffect } from "react";
import { nativePreferencesShortcut } from "../../shared/native-display-units.js";
import {
  editorShortcut,
  clearAllSceneObjects,
} from "../../shared/native-shortcuts.js";

export default function useKeyboardCommands({
  keyboardContext,
  page,
  pending,
  projectRef,
  edit,
  filamentSequence,
  arrowGesture,
  menu,
  setMenu,
  setPreferencesOpen,
  selected,
  requestDiscard,
  newProject,
  projectInput,
  modelInput,
  saveProject,
  canSlice,
  submit,
  job,
  setHelp,
  cutModels,
  copyModels,
  pasteClipboardUnavailable,
  pasteFromClipboard,
  setCloneOpen,
  canUndo,
  undoEdit,
  canRedo,
  redoEdit,
  selectAll,
  setMode,
  deselectAll,
  project,
  deleteSelected,
  primeTowerSelected,
  multiple,
  setCutOpen,
  setTextOpen,
  setBrimOpen,
  setPaintingChannel,
  transformObject,
  cameraFrame,
  selectionIds,
  changeSelected,
  setCameraCommand,
}) {
  keyboardContext.current = {
    page,
    pending,
    apply(slot) {
      const current = projectRef.current.present,
        next = assignSelectedFilament(current, slot);
      if (next !== current) edit(next);
    },
  };
  if (!filamentSequence.current)
    filamentSequence.current = createFilamentKeySequence((slot) => {
      const context = keyboardContext.current,
        focus = document.activeElement;
      if (
        context.page !== "Prepare" ||
        context.pending ||
        document.querySelector("dialog[open]") ||
        /INPUT|TEXTAREA|SELECT/.test(focus?.tagName) ||
        focus?.isContentEditable
      )
        return;
      context.apply(slot);
    });
  useEffect(() => {
    const reset = () => {
      arrowGesture.current = null;
    };
    const release = (event) => {
      if (event.key.startsWith("Arrow")) reset();
    };
    document.addEventListener("keyup", release);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("keyup", release);
      window.removeEventListener("blur", reset);
      filamentSequence.current.clear();
    };
  }, []);
  useEffect(() => {
    arrowGesture.current = null;
    filamentSequence.current.clear();
  }, [page]);

  useEffect(() => {
    const keydown = (event) => {
      const editing =
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
        event.target.isContentEditable;
      if (event.key === "Escape" && menu) {
        event.preventDefault();
        setMenu(null);
        return;
      }
      if (
        nativePreferencesShortcut(event, {
          editing,
          modal: Boolean(document.querySelector("dialog[open]")),
          platform: navigator.platform,
        })
      ) {
        event.preventDefault();
        setMenu(null);
        setPreferencesOpen(true);
        return;
      }
      const shortcut = editorShortcut(event, {
        page,
        editing,
        modal: Boolean(document.querySelector("dialog[open]")),
      });
      if (!shortcut) return;
      event.preventDefault();
      if (event.repeat && !["nudge", "camera"].includes(shortcut.action))
        return;
      const activeSelection = selected && !pending;
      switch (shortcut.action) {
        case "new":
          requestDiscard(newProject);
          break;
        case "openProject":
          projectInput.current.click();
          break;
        case "importModels":
          modelInput.current.click();
          break;
        case "save":
        case "saveAs":
          saveProject();
          break;
        case "slice":
          if (canSlice) submit();
          break;
        case "exportGcode":
          if (job?.status === "ready") {
            const link = document.createElement("a");
            link.href = `/api/jobs/${job.id}/download`;
            link.click();
          }
          break;
        case "help":
          setHelp(true);
          break;
        case "cutModels":
          if (activeSelection) cutModels();
          break;
        case "copyModels":
          if (activeSelection) copyModels();
          break;
        case "pasteModels":
          if (!pending && !pasteClipboardUnavailable()) pasteFromClipboard();
          break;
        case "cloneModels":
          if (activeSelection) setCloneOpen(true);
          break;
        case "undo":
          if (!pending && canUndo) undoEdit();
          break;
        case "redo":
          if (!pending && canRedo) redoEdit();
          break;
        case "selectAll":
          selectAll();
          break;
        case "deselectAll":
          setMode("Select");
          deselectAll();
          break;
        case "deleteAll":
          if (!pending && project.objects.length) {
            edit(clearAllSceneObjects(project));
            setMode("Select");
          }
          break;
        case "deleteSelection":
          if (activeSelection) deleteSelected();
          break;
        case "move":
          if (
            !pending &&
            (activeSelection || primeTowerSelected === project.activePlateId)
          )
            setMode("Move");
          break;
        case "rotate":
        case "scale":
          if (activeSelection)
            setMode(
              { move: "Move", rotate: "Rotate", scale: "Scale" }[
                shortcut.action
              ],
            );
          break;
        case "placeFace":
          if (activeSelection && !multiple) setMode("Place on face");
          break;
        case "cut":
          if (activeSelection && !multiple) setCutOpen(true);
          break;
        case "text":
          if (!multiple && !pending && !project.calibration) setTextOpen(true);
          break;
        case "brim":
          if (activeSelection && !multiple && !project.calibration)
            setBrimOpen(true);
          break;
        case "seam":
        case "fuzzy":
          if (
            activeSelection &&
            !multiple &&
            !project.calibration &&
            (selected.native?.partType || "normal_part") === "normal_part"
          )
            setPaintingChannel(shortcut.action);
          break;
        case "nudge":
          if (activeSelection && transformObject) {
            if (shortcut.cameraSpace && !cameraFrame.current) break;
            const delta = shortcut.cameraSpace
              ? cameraRelativeNudge(shortcut.delta, cameraFrame.current)
              : shortcut.delta;
            if (delta.some((value) => Math.abs(value) > 1e-12)) {
              const gesture = event.key + ":" + selectionIds.join(",");
              const history = !event.repeat || arrowGesture.current !== gesture;
              arrowGesture.current = gesture;
              changeSelected(
                {
                  position: transformObject.position.map(
                    (value, index) => value + delta[index],
                  ),
                },
                { history },
              );
            }
          }
          break;
        case "filamentDigit":
          if (activeSelection) filamentSequence.current.push(shortcut.digit);
          break;
        case "togglePrintable":
          if (activeSelection) {
            const next = toggleSelectedPrintable(project);
            if (next !== project) edit(next);
          }
          break;
        case "camera":
          setCameraCommand((value) => ({
            view: shortcut.view,
            bedOnly: shortcut.bedOnly,
            sequence: (value?.sequence || 0) + 1,
          }));
          break;
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });
}
