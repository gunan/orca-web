export default function usePresetActions({
  catalogRequest,
  selectionRequest,
  catalogPrinter,
  setCatalogPending,
  setResolved,
  setError,
  readJson,
  projectRef,
  setCatalog,
  emptyCatalog,
  setCatalogRevision,
  replace,
  setRecovery,
  setNotice,
  update,
  clearResult,
  edit,
  ids,
  profileEditor,
  setProfileEditor,
  project,
  setFilamentError,
}) {
  async function loadCatalog(
    printerId = "",
    restored = null,
    preserveIds = false,
    processId = "",
    signal,
  ) {
    catalogRequest.current?.abort();
    selectionRequest.current?.abort();
    const controller = new AbortController(),
      previousPrinter = catalogPrinter.current;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    catalogRequest.current = controller;
    catalogPrinter.current = printerId;
    let committed = false;
    setCatalogPending(true);
    if (!restored) setResolved(null);
    setError("");
    try {
      let next;
      try {
        next = await readJson(
          `/api/presets?${new URLSearchParams({ ...(printerId ? { printerId } : {}), ...(processId ? { processId } : restored?.ids.processId ? { processId: restored.ids.processId } : preserveIds && projectRef.current.present.ids.processId ? { processId: projectRef.current.present.ids.processId } : {}) })}`,
          { signal: controller.signal },
        );
      } catch (problem) {
        if (!restored || controller.signal.aborted) throw problem;
        next = await readJson("/api/presets", { signal: controller.signal });
      }
      if (controller.signal.aborted) return false;
      setCatalog({ ...emptyCatalog, ...next });
      setCatalogRevision((value) => value + 1);
      const chosen = {
        printerId: printerId || next.defaults.printerId || "",
        processId: next.defaults.processId || "",
        filamentId: next.defaults.filamentId || "",
      };
      if (restored) {
        const missing = [
          ["printerId", "printers"],
          ["processId", "processes"],
          ["filamentId", "filaments"],
        ].filter(
          ([key, list]) =>
            !next[list].some((item) => item.id === restored.ids[key]),
        );
        replace(restored);
        setRecovery(null);
        setNotice(
          restored.useEmbeddedSettings
            ? [
                "Native project loaded with embedded settings.",
                ...(restored.nativeImportWarnings || []),
              ].join(" ")
            : missing.length
              ? "Project loaded with unavailable presets. Select compatible replacements before slicing; original IDs and overrides were preserved."
              : "Project loaded with its original presets and settings.",
        );
        catalogPrinter.current = restored.ids.printerId;
      } else if (!preserveIds) {
        update((current) => ({ ...current, ids: chosen, overrides: {} }), {
          history: false,
        });
        catalogPrinter.current = chosen.printerId;
      }
      committed = true;
      return true;
    } catch (problem) {
      if (!controller.signal.aborted) {
        setError(problem.message || "Could not load native presets.");
        if (!restored) setCatalog(emptyCatalog);
      }
      return false;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (catalogRequest.current === controller) {
        if (restored && !committed) catalogPrinter.current = previousPrinter;
        setCatalogPending(false);
      }
    }
  }

  function changePreset(key, value) {
    clearResult();
    setError("");
    setResolved(null);
    edit((current) => ({
      ...current,
      ids: { ...current.ids, [key]: value },
      ...(key === "printerId"
        ? { filamentIds: undefined, projectOverrides: {} }
        : {}),
      ...(key === "filamentId" && current.filamentIds
        ? { filamentIds: [value, ...current.filamentIds.slice(1)] }
        : {}),
      overrides: {},
    }));
    if (key === "printerId") loadCatalog(value);
    else if (key === "processId") loadCatalog(ids.printerId, null, true, value);
  }

  function useInstalledPresets() {
    const ids = projectRef.current.present.ids;
    const matched = ids.printerId && ids.processId && ids.filamentId;
    edit((current) => ({
      ...current,
      useEmbeddedSettings: false,
      overrides: {},
      ...(matched ? {} : { filamentIds: undefined }),
    }));
    if (!matched) loadCatalog();
    else loadCatalog(ids.printerId, null, true);
    setNotice(
      "Project now uses installed presets. Review all filament slots and part assignments before slicing.",
    );
  }

  async function savedPreset({ id, type, deleted }) {
    const filamentIndex =
      type === "filament" ? profileEditor?.filamentIndex || 0 : 0;
    setProfileEditor(null);
    clearResult();
    if (deleted) {
      if (type === "filament") {
        const current = projectRef.current.present,
          choices = await readJson(
            `/api/presets?printerId=${encodeURIComponent(current.ids.printerId)}`,
          ),
          available = new Set(choices.filaments.map((item) => item.id));
        const replacement = available.has(current.ids.filamentId)
          ? current.ids.filamentId
          : choices.defaults.filamentId;
        edit((value) => ({
          ...value,
          ids: { ...value.ids, filamentId: replacement },
          ...(value.filamentIds && {
            filamentIds: value.filamentIds.map((item) =>
              available.has(item) ? item : replacement,
            ),
          }),
        }));
        await loadCatalog(current.ids.printerId, null, true);
      } else
        await loadCatalog(
          type === "machine" ? "" : projectRef.current.present.ids.printerId,
        );
      setNotice(
        "Custom preset deleted. Compatible presets have been selected.",
      );
      return;
    }
    if (type === "machine") {
      edit((current) => ({
        ...current,
        useEmbeddedSettings: false,
        filamentIds: undefined,
        projectOverrides: {},
      }));
      await loadCatalog(id);
      setNotice(
        "Printer saved and selected. Choose a filament and load your model.",
      );
      return;
    }
    const key = {
      machine: "printerId",
      process: "processId",
      filament: "filamentId",
    }[type];
    const nextIds = {
      ...projectRef.current.present.ids,
      ...(type !== "filament" || filamentIndex === 0 ? { [key]: id } : {}),
    };
    edit((current) => ({
      ...current,
      ids: nextIds,
      ...(type === "process" ? { overrides: {} } : {}),
      ...(type === "filament" && current.filamentIds
        ? {
            filamentIds: current.filamentIds.map((value, index) =>
              index === filamentIndex ? id : value,
            ),
          }
        : {}),
    }));
    await loadCatalog(nextIds.printerId, null, true);
    setNotice("Custom preset saved and selected.");
  }

  function editFilaments(operation) {
    try {
      const next = operation(project);
      setFilamentError("");
      edit(next);
    } catch (cause) {
      setFilamentError(cause.message);
    }
  }

  function changeFilamentSlot(index, value) {
    editFilaments((current) => {
      const filamentIds = [
        ...(current.filamentIds || [current.ids.filamentId]),
      ];
      filamentIds[index] = value;
      return {
        ...current,
        nativeWorkflow: true,
        filamentIds,
        ids: { ...current.ids, filamentId: filamentIds[0] },
      };
    });
  }
  return {
    loadCatalog,
    changePreset,
    useInstalledPresets,
    savedPreset,
    editFilaments,
    changeFilamentSlot,
  };
}
