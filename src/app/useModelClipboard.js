import {
  captureNativeClipboard,
  prepareNativePaste,
  applyNativePaste,
} from "../../shared/native-clipboard.js";
import { cutNativeClipboard } from "../../shared/native-cut-clipboard.js";
import { flushSync } from "react-dom";
import { nativeProjectRequest } from "../../shared/native-project-client.js";
import { applyNativeFillBed } from "../../shared/native-fill-bed.js";

export default function useModelClipboard({
  projectRef,
  setListClipboard,
  setModelClipboard,
  bed,
  setCutClipboardDialog,
  edit,
  setNotice,
  setError,
  cutClipboardDialog,
  modelClipboard,
  setClipboardTask,
  clipboardRequest,
  setClipboardBusy,
  readJson,
  arrange,
  arrangeOptions,
}) {
  function cutModels() {
    try {
      const snapshot = projectRef.current.present;
      setListClipboard({ type: null, process: null, layers: null });
      setModelClipboard(captureNativeClipboard(snapshot, bed));
      const cut = cutNativeClipboard(snapshot, bed);
      if (cut.confirmation) {
        setCutClipboardDialog({ snapshot, confirmation: cut.confirmation });
        return;
      }
      edit(cut.project);
      setNotice(
        cut.warnings.join(" ") ||
          "Cut selected model parts to the application clipboard.",
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  function resolveCutClipboard(decision) {
    try {
      const { snapshot } = cutClipboardDialog;
      if (projectRef.current.present !== snapshot)
        throw new Error("The project changed. Select the parts and cut again.");
      const cut = cutNativeClipboard(snapshot, bed, { decision });
      if (cut.project !== snapshot) edit(cut.project);
      setNotice(
        cut.warnings.join(" ") ||
          (decision === "cancel"
            ? "Cut cancelled; model clipboard retained."
            : "Cut selected objects to the application clipboard."),
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setCutClipboardDialog(null);
    }
  }

  function copyModels() {
    try {
      const source = captureNativeClipboard(projectRef.current.present, bed);
      setListClipboard({ type: null, process: null, layers: null });
      setModelClipboard(source);
      setNotice(
        `Copied ${source.entries.reduce((n, e) => n + e.parts.length, 0)} model parts to the application clipboard.`,
      );
      return source;
    } catch (cause) {
      setError(cause.message);
      return null;
    }
  }

  async function pasteModels(
    source = modelClipboard,
    { copies = 1, signal } = {},
  ) {
    setClipboardTask("models");
    const current = projectRef.current.present,
      prepared = prepareNativePaste(current, source, bed, { copies }),
      controller = new AbortController();
    clipboardRequest.current?.abort();
    clipboardRequest.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    setClipboardBusy(true);
    setError("");
    try {
      const result = await readJson("/api/geometry/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepared.request),
        signal: controller.signal,
      });
      if (controller.signal.aborted)
        throw new DOMException("Clipboard operation cancelled", "AbortError");
      if (projectRef.current.present !== current)
        throw new Error(
          "The project changed during native placement. Copy or paste again.",
        );
      const next = applyNativePaste(current, prepared, result);
      flushSync(() => edit(next.project));
      setNotice(
        next.warnings.join(" ") ||
          `Pasted ${next.project.objects.length - current.objects.length} model parts.`,
      );
      return projectRef.current.present;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (clipboardRequest.current === controller) {
        clipboardRequest.current = null;
        setClipboardBusy(false);
      }
    }
  }

  function duplicateSelected() {
    const source = copyModels();
    if (source)
      pasteModels(source).catch((cause) => {
        if (cause.name !== "AbortError") setError(cause.message);
      });
  }

  async function cloneModels(options) {
    const source = captureNativeClipboard(projectRef.current.present, bed);
    setModelClipboard(source);
    await pasteModels(source, options);
    if (options.autoArrange && !options.signal?.aborted)
      void arrange({ ...arrangeOptions, scope: "plate" });
  }

  async function fillBed({ signal } = {}) {
    const current = projectRef.current.present,
      controller = new AbortController(),
      abort = () => controller.abort();
    clipboardRequest.current?.abort();
    clipboardRequest.current = controller;
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    setClipboardBusy(true);
    setError("");
    try {
      const response = await readJson("/api/geometry/fill-bed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectRequest: nativeProjectRequest(current, { allPlates: true }),
          options: arrangeOptions,
        }),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (projectRef.current.present !== current)
        throw new Error(
          "The project changed during native Fill. Review the current object and try again.",
        );
      const next = applyNativeFillBed(
        current,
        response.request,
        response.result,
      );
      if (next !== current) {
        flushSync(() => edit(next));
        setNotice(
          `Native Fill added ${response.result.added} instances. Arranging the plate…`,
        );
        void arrange({ ...arrangeOptions, scope: "plate" });
      } else
        setNotice("Native Fill could not add another instance on this plate.");
    } finally {
      signal?.removeEventListener("abort", abort);
      if (clipboardRequest.current === controller) {
        clipboardRequest.current = null;
        setClipboardBusy(false);
      }
    }
  }
  return {
    cutModels,
    resolveCutClipboard,
    copyModels,
    pasteModels,
    duplicateSelected,
    cloneModels,
    fillBed,
  };
}
