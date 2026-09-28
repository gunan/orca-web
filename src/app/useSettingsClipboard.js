import {
  captureProcessClipboard,
  prepareProcessSettingsPaste,
  applyProcessSettingsPaste,
  pasteLayerClipboard,
} from "../../shared/native-settings-clipboard.js";
import { filamentSlotCount } from "../../shared/filament-slots.js";

export default function useSettingsClipboard({
  projectRef,
  project,
  setListClipboard,
  setNotice,
  setError,
  clipboardRequest,
  listClipboard,
  resolved,
  overrides,
  setClipboardTask,
  setClipboardBusy,
  readJson,
  edit,
}) {
  function copyProcessSettings() {
    try {
      const process = captureProcessClipboard(projectRef.current.present, {
        filamentCount: filamentSlotCount(project),
      });
      setListClipboard((current) => ({ ...current, type: "process", process }));
      setNotice(
        "Copied process settings. Destination filament assignments are retained when pasting.",
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function pasteProcessSettings() {
    const snapshot = projectRef.current.present,
      controller = new AbortController();
    clipboardRequest.current?.abort();
    clipboardRequest.current = controller;
    try {
      const prepared = prepareProcessSettingsPaste(
        snapshot,
        listClipboard.process,
        {
          ...resolved?.nativeProcessSettings,
          ...resolved?.settings,
          ...overrides,
        },
        { filamentCount: filamentSlotCount(snapshot) },
      );
      setClipboardTask("process settings");
      setClipboardBusy(true);
      setError("");
      const result = await readJson("/api/presets/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepared.request),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (projectRef.current.present !== snapshot)
        throw new Error(
          "The project changed during process settings Paste. Paste again.",
        );
      edit(applyProcessSettingsPaste(snapshot, prepared, result));
      setNotice(
        "Pasted native process settings; destination filament assignments are unchanged.",
      );
    } catch (cause) {
      if (cause.name !== "AbortError") setError(cause.message);
    } finally {
      if (clipboardRequest.current === controller) {
        clipboardRequest.current = null;
        setClipboardBusy(false);
      }
    }
  }

  function pasteCopiedLayers() {
    try {
      const snapshot = projectRef.current.present;
      edit({
        ...snapshot,
        objects: pasteLayerClipboard(
          snapshot.objects,
          snapshot.selectedId,
          listClipboard.layers,
          filamentSlotCount(snapshot),
          { printer: resolved?.printerSettings },
        ),
        nativeWorkflow: true,
      });
      setNotice(
        "Pasted height ranges. Existing ranges with identical bounds retain their settings.",
      );
    } catch (cause) {
      setError(cause.message);
    }
  }
  return { copyProcessSettings, pasteProcessSettings, pasteCopiedLayers };
}
