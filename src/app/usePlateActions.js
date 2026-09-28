import { emptyProject } from "../../shared/project.js";
import {
  normalizeArrangeOptions,
  applyNativeArrangement,
} from "../../shared/native-arrangement.js";
import { readJson } from "../lib/http.js";
import { nativeProjectRequest } from "../../shared/native-project-client.js";

export default function usePlateActions({
  setRecovery,
  cancelImport,
  catalogRequest,
  setCatalogPending,
  ids,
  replace,
  clearResult,
  setError,
  setNotice,
  saved,
  setPage,
  edit,
  arrangeOptions,
  arranging,
  projectRef,
  arrangeController,
  setArranging,
  setArrangeOptions,
  setArrangeOpen,
  setCameraCommand,
  undo,
  redo,
}) {
  function newProject() {
    localStorage.removeItem("orca-web-autosave");
    setRecovery(null);
    cancelImport();
    catalogRequest.current?.abort();
    setCatalogPending(false);
    const next = { ...emptyProject(), ids };
    replace(next);
    clearResult();
    setError("");
    setNotice("New project");
    saved.current = next;
    setPage("Prepare");
  }

  function addPlate() {
    const id = crypto.randomUUID();
    edit((current) => ({
      ...current,
      plates: [
        ...current.plates,
        { id, name: `Plate ${current.plates.length + 1}` },
      ],
      activePlateId: id,
      selectedId: null,
      selectedIds: [],
      selectionFrame: null,
    }));
  }

  async function arrange(options = arrangeOptions) {
    if (arranging) return;
    const snapshot = projectRef.current.present,
      controller = new AbortController();
    arrangeController.current = controller;
    setArranging(true);
    setError("");
    setNotice("Arranging objects…");
    try {
      options = normalizeArrangeOptions(options);
      setArrangeOptions(options);
      localStorage.setItem(
        "orca-web:arrange-options-v1",
        JSON.stringify(options),
      );
      setArrangeOpen(false);
      const response = await readJson("/api/geometry/arrange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          projectRequest: nativeProjectRequest(snapshot),
          options,
        }),
      });
      if (controller.signal.aborted) return;
      if (projectRef.current.present !== snapshot)
        throw new Error(
          "The project changed while arranging. Review the current objects and try again.",
        );
      const next = applyNativeArrangement(
        snapshot,
        response.request,
        response.result,
      );
      edit(next);
      setCameraCommand((value) => ({
        view: "Isometric",
        sequence: (value?.sequence || 0) + 1,
      }));
      setNotice(
        `Arranged ${response.result.objects.length} object groups using native polygon nesting.`,
      );
    } catch (problem) {
      if (problem.name !== "AbortError") setError(problem.message);
      else setNotice("Arrangement cancelled.");
    } finally {
      if (arrangeController.current === controller) {
        arrangeController.current = null;
        setArranging(false);
      }
    }
  }

  function switchPlate(id) {
    edit(
      (current) => ({
        ...current,
        activePlateId: id,
        selectedId: null,
        selectedIds: [],
        selectionFrame: null,
      }),
      { history: false },
    );
  }

  function undoEdit() {
    undo();
    clearResult();
  }

  function redoEdit() {
    redo();
    clearResult();
  }
  return { newProject, addPlate, arrange, switchPlate, undoEdit, redoEdit };
}
