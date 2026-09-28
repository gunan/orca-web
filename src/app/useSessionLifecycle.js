import { useEffect } from "react";
import { parseProject, serializeProject } from "../../shared/project.js";
import { hasExpandedNativeVariants } from "../../shared/native-variants.js";
import { readJson } from "../lib/http.js";

export default function useSessionLifecycle({
  setHealth,
  setRecovery,
  setNotice,
  loadCatalog,
  mounted,
  importGeneration,
  importRequest,
  catalogRequest,
  selectionRequest,
  catalogPending,
  ids,
  catalogPrinter,
  catalog,
  project,
  setSelectionPending,
  setResolved,
  setError,
  catalogRevision,
  job,
  setJob,
  recovery,
  theme,
}) {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted) setHealth(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setHealth({
            engine: {
              available: false,
              error: "Could not reach the slicing server.",
            },
          });
      });
    try {
      const stored = localStorage.getItem("orca-web-autosave");
      if (stored) setRecovery(parseProject(stored));
    } catch {
      setNotice("The previous browser autosave could not be read.");
    }
    loadCatalog();
    mounted.current = true;
    return () => {
      mounted.current = false;
      importGeneration.current++;
      importRequest.current?.abort();
      controller.abort();
      catalogRequest.current?.abort();
      selectionRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    // A project import owns its catalog request until the restored project and
    // its presets commit together. Old selection IDs must not abort that load.
    if (catalogPending) return;
    if (ids.printerId && ids.printerId !== catalogPrinter.current)
      loadCatalog(ids.printerId, null, true);
    else if (
      catalog.compatibility?.native &&
      ids.processId !== catalog.compatibility.processId &&
      catalog.processes.some((item) => item.id === ids.processId)
    )
      loadCatalog(ids.printerId, null, true, ids.processId);
  }, [
    ids.printerId,
    ids.processId,
    catalogPending,
    catalog.compatibility?.processId,
  ]);

  useEffect(() => {
    const embeddedVariants =
      project.useEmbeddedSettings &&
      hasExpandedNativeVariants(project.nativeSettings || {});
    if (
      catalogPending ||
      (!embeddedVariants && project.useEmbeddedSettings) ||
      (!project.useEmbeddedSettings &&
        (!ids.printerId || !ids.processId || !ids.filamentId))
    ) {
      setSelectionPending(false);
      return;
    }
    const controller = new AbortController();
    selectionRequest.current?.abort();
    selectionRequest.current = controller;
    setSelectionPending(true);
    setResolved(null);
    (embeddedVariants ||
    project.filamentIds?.length > 1 ||
    Object.keys(project.projectOverrides || {}).length
      ? readJson("/api/presets/configuration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            embeddedVariants
              ? { nativeSettings: project.nativeSettings }
              : {
                  selection: {
                    ...ids,
                    filamentIds: project.filamentIds?.length
                      ? project.filamentIds
                      : [ids.filamentId],
                  },
                  overrides: { project: project.projectOverrides || {} },
                },
          ),
          signal: controller.signal,
        })
      : readJson(`/api/presets/selection?${new URLSearchParams(ids)}`, {
          signal: controller.signal,
        })
    )
      .then((result) => {
        if (!controller.signal.aborted) setResolved(result);
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectionPending(false);
      });
    return () => controller.abort();
  }, [
    ids.printerId,
    ids.processId,
    ids.filamentId,
    catalogPending,
    catalogRevision,
    project.useEmbeddedSettings,
    project.nativeSettings,
    project.projectOverrides,
    project.filamentIds,
  ]);

  useEffect(() => {
    if (!job || !["queued", "slicing"].includes(job.status)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await readJson(`/api/jobs/${encodeURIComponent(job.id)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setJob((current) => (current?.id === next.id ? next : current));
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem.message);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job]);

  useEffect(() => {
    if (!project.objects.length || recovery) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("orca-web-autosave", serializeProject(project));
      } catch {
        setNotice(
          "Browser autosave storage is full. Save the project to a file.",
        );
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [project, recovery]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("orca-web-theme", theme);
  }, [theme]);
}
