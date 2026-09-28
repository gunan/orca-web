import { loadModelFile } from "../model-loader.js";
import {
  projectLoadAction,
  geometryProjectContext,
} from "../../shared/native-project-load.js";
import { extractBoundedZip } from "../../shared/import-limits.js";
import { isPrusaProject } from "../../shared/prusa-format.js";
import { nativeProjectRequest } from "../../shared/native-project-client.js";
import { parseProject, emptyProject } from "../../shared/project.js";
import { strFromU8 } from "fflate";
import {
  prepareNativeImportInspection,
  applyNativeImportInspection,
} from "../../shared/native-import-inspection.js";
import {
  needsNativeMultipartChoice,
  mergeNativeMultipartGeometry,
} from "../../shared/native-multipart-import.js";
import { importNativeGeometry } from "../../shared/native-geometry-import.js";
import { physicalNozzleCount } from "../../shared/purge-volumes.js";

export default function useProjectFiles({
  importRequest,
  importGeneration,
  setImporting,
  setError,
  loadCatalog,
  clearResult,
  saved,
  setPage,
  recovery,
  accepted,
  bed,
  importOptions,
  projectRef,
  edit,
  recentFiles,
  setNotice,
  projectLoadPreferences,
  setProjectLoadDialog,
  requestDiscard,
  setMultipartImport,
  setZeroVolumeImport,
  readJson,
  resolved,
  replace,
  project,
  dirty,
  setUnsavedAction,
}) {
  function beginImport(kind) {
    importRequest.current?.abort();
    const controller = new AbortController(),
      generation = ++importGeneration.current;
    importRequest.current = controller;
    setImporting(kind);
    setError("");
    return { controller, generation };
  }

  function cancelImport() {
    importGeneration.current++;
    importRequest.current?.abort();
    setImporting(false);
  }

  async function restoreProject(next, transaction) {
    const { controller, generation } = transaction;
    const committed = await loadCatalog(
      next.ids.printerId,
      next,
      false,
      "",
      controller.signal,
    );
    if (!committed || generation !== importGeneration.current) return false;
    clearResult();
    saved.current = next;
    setPage("Prepare");
    return true;
  }

  async function restoreRecoveryProject() {
    const transaction = beginImport("project");
    try {
      await restoreProject(recovery, transaction);
    } finally {
      if (transaction.generation === importGeneration.current)
        setImporting(false);
    }
  }

  async function choose(files, { geometryOnly = false } = {}) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (!geometryOnly && list.length === 1 && /\.3mf$/i.test(list[0].name)) {
      routeProjectFile(list[0], "add");
      return;
    }
    const { generation } = beginImport("models");
    try {
      if (
        list.some(
          (file) =>
            !accepted.includes(file.name.split(".").pop()?.toLowerCase()),
        )
      )
        throw new Error("Choose an STL, OBJ, 3MF, AMF, SVG, or STEP model.");
      const batches = await Promise.all(
        list.map((file) =>
          loadModelFile(file, {
            bed,
            ...Object.fromEntries(
              Object.entries(importOptions).map(([key, value]) => [
                key,
                Number(value),
              ]),
            ),
          }),
        ),
      );
      if (generation !== importGeneration.current) return;
      const meshes = batches.flat();
      if (!meshes.length)
        throw new Error("The selected files contain no triangle geometry.");
      const current = projectRef.current.present;
      const placed = meshes.map((object) => ({
        ...object,
        name: object.sourceFormat === "stl" ? object.sourceFile : object.name,
        plateId: current.activePlateId,
      }));
      edit((previous) => ({
        ...previous,
        name: previous.objects.length
          ? previous.name
          : list[0].name.replace(/\.[^.]+$/, ""),
        objects: [...previous.objects, ...placed],
        selectedId: placed[0].id,
      }));
      clearResult();
      setPage("Prepare");
      for (const file of list)
        recentFiles.record(
          file,
          /\.3mf$/i.test(file.name) ? "project" : "model",
        );
      const warnings = [
        ...new Set(meshes.flatMap((mesh) => mesh.importWarnings || [])),
      ];
      if (warnings.length) setNotice(warnings.join(" "));
    } catch (problem) {
      if (generation === importGeneration.current)
        setError(problem.message || "Could not import geometry.");
    } finally {
      if (generation === importGeneration.current) setImporting(false);
    }
  }

  function routeProjectFile(file, entry) {
    const action = projectLoadAction(projectLoadPreferences, {
      entry,
      hasObjects: projectRef.current.present.objects.length > 0,
    });
    const proceed = () =>
      action === "ask"
        ? setProjectLoadDialog({ file, entry })
        : applyProjectLoad(file, entry, action, entry === "open");
    if (entry === "open") requestDiscard(proceed);
    else proceed();
  }

  function openProject(file) {
    if (!file) return;
    if (/\.3mf$/i.test(file.name)) routeProjectFile(file, "open");
    else return importProject(file);
  }

  function applyProjectLoad(file, entry, action, discard = false) {
    if (action === "project") return importProject(file, discard);
    if (entry === "add") return addProjectGeometry(file);
    return openGeometryProject(file);
  }

  function askMultipartImport(signal) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (choice, error) => {
        if (done) return;
        done = true;
        signal.removeEventListener("abort", abort);
        setMultipartImport(null);
        if (error) reject(error);
        else resolve(choice);
      };
      const abort = () =>
        finish(false, new DOMException("Import cancelled", "AbortError"));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      setMultipartImport({ choose: (choice) => finish(choice) });
    });
  }

  function acknowledgeZeroVolumeImport(signal) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        signal.removeEventListener("abort", abort);
        setZeroVolumeImport(null);
        if (error) reject(error);
        else resolve();
      };
      const abort = () =>
        finish(new DOMException("Import cancelled", "AbortError"));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      setZeroVolumeImport({ continue: () => finish() });
    });
  }

  async function readStructuredGeometry(file, controller) {
    if (file.size > 150 * 1024 * 1024)
      throw new Error("Project exceeds the 150 MB limit.");
    const zip = extractBoundedZip(new Uint8Array(await file.arrayBuffer()));
    controller.signal.throwIfAborted();
    const prusa = isPrusaProject(zip);
    if (zip["Metadata/project_settings.config"] || prusa) {
      const body = new FormData();
      body.set("model", file);
      if (prusa) {
        const context = nativeProjectRequest(projectRef.current.present);
        if (context.useEmbeddedSettings)
          body.set(
            "nativeSettings",
            JSON.stringify(context.project.nativeSettings),
          );
        else {
          body.set("selection", JSON.stringify(context.selection));
          body.set("overrides", JSON.stringify(context.overrides));
        }
        if (context.processCorrectionDecisions)
          body.set(
            "processCorrectionDecisions",
            JSON.stringify(context.processCorrectionDecisions),
          );
      }
      return (
        await readJson("/api/projects/import", {
          method: "POST",
          body,
          signal: controller.signal,
        })
      ).project;
    }
    if (zip["Metadata/orca-web.json"])
      return parseProject(strFromU8(zip["Metadata/orca-web.json"]));
    return null;
  }

  async function addProjectGeometry(file) {
    return loadProjectGeometry(file, false);
  }

  async function openGeometryProject(file) {
    return loadProjectGeometry(file, true);
  }

  async function loadProjectGeometry(file, replaceScene) {
    const { generation, controller } = beginImport("project");
    try {
      let source = await readStructuredGeometry(file, controller);
      if (generation !== importGeneration.current) return;
      if (source) {
        const prepared = prepareNativeImportInspection(source),
          inspection = await readJson("/api/geometry/inspect-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: source }),
            signal: controller.signal,
          });
        if (generation !== importGeneration.current) return;
        source = applyNativeImportInspection(prepared, inspection);
        if (inspection.removedCount) {
          await acknowledgeZeroVolumeImport(controller.signal);
          if (generation !== importGeneration.current) return;
        }
        if (!source.objects.length)
          throw new Error(
            "The imported file contains no nonzero-volume objects.",
          );
      }
      let merged = false;
      if (source && needsNativeMultipartChoice(source)) {
        merged = await askMultipartImport(controller.signal);
        if (generation !== importGeneration.current) return;
        if (merged)
          source = mergeNativeMultipartGeometry(source, {
            name: file.name.replace(/\.[^.]+$/, ""),
          });
      }
      const current = projectRef.current.present,
        base = replaceScene
          ? geometryProjectContext(current, emptyProject())
          : current;
      let next;
      if (source)
        next = importNativeGeometry(base, source, bed, {
          nozzles: physicalNozzleCount(
            resolved?.printerSettings || base.nativeSettings || {},
          ),
          centerAllParts: merged,
        });
      else {
        const meshes = await loadModelFile(file, {
          bed,
          ...Object.fromEntries(
            Object.entries(importOptions).map(([key, value]) => [
              key,
              Number(value),
            ]),
          ),
        });
        if (generation !== importGeneration.current) return;
        const placed = meshes.map((object) => ({
          ...object,
          plateId: base.activePlateId,
        }));
        next = {
          ...base,
          objects: [...base.objects, ...placed],
          selectedId: placed[0]?.id || null,
        };
        const warnings = [
          ...new Set(meshes.flatMap((object) => object.importWarnings || [])),
        ];
        if (warnings.length) setNotice(warnings.join(" "));
      }
      if (replaceScene) {
        next.name = file.name.replace(/\.[^.]+$/, "");
        replace(next);
        saved.current = next;
      } else edit(next);
      if (source?.nativeImportWarnings?.length)
        setNotice(source.nativeImportWarnings.join(" "));
      clearResult();
      setPage("Prepare");
      recentFiles.record(
        file,
        "project",
        source?.nativeAssets?.plates?.[0]?.images?.thumbnail || "",
      );
    } catch (problem) {
      if (generation === importGeneration.current) setError(problem.message);
    } finally {
      if (generation === importGeneration.current) setImporting(false);
    }
  }

  async function importProject(file, discard = false) {
    if (!file) return;
    const transaction = beginImport("project"),
      { controller, generation } = transaction;
    try {
      if (file.size > 150 * 1024 * 1024)
        throw new Error("Project exceeds the 150 MB limit.");
      let next;
      if (/\.3mf$/i.test(file.name)) {
        const zip = extractBoundedZip(new Uint8Array(await file.arrayBuffer()));
        const prusaProject = isPrusaProject(zip);
        if (zip["Metadata/project_settings.config"] || prusaProject) {
          const body = new FormData();
          body.set("model", file);
          if (prusaProject) {
            const context = nativeProjectRequest(project);
            if (context.useEmbeddedSettings)
              body.set(
                "nativeSettings",
                JSON.stringify(context.project.nativeSettings),
              );
            else {
              body.set("selection", JSON.stringify(context.selection));
              body.set("overrides", JSON.stringify(context.overrides));
            }
            if (context.processCorrectionDecisions)
              body.set(
                "processCorrectionDecisions",
                JSON.stringify(context.processCorrectionDecisions),
              );
          }
          const imported = await readJson("/api/projects/import", {
            method: "POST",
            body,
            signal: controller.signal,
          });
          next = {
            ...imported.project,
            useEmbeddedSettings: true,
            nativeWorkflow: true,
            filamentIds: imported.selection.filamentIds,
          };
        } else if (zip["Metadata/orca-web.json"])
          next = parseProject(strFromU8(zip["Metadata/orca-web.json"]));
        else {
          if (dirty && !discard) {
            setUnsavedAction(() => () => openGeometryProject(file));
            return;
          }
          await openGeometryProject(file);
          return;
        }
      } else next = parseProject(await file.text());
      if (generation !== importGeneration.current) return;
      if (dirty && !discard) {
        setUnsavedAction(() => () => importProject(file, true));
        return;
      }
      if (await restoreProject(next, transaction))
        recentFiles.record(
          file,
          "project",
          next.nativeAssets?.plates?.[0]?.images?.thumbnail || "",
        );
    } catch (problem) {
      if (generation === importGeneration.current) setError(problem.message);
    } finally {
      if (generation === importGeneration.current) setImporting(false);
    }
  }

  async function openRecentFile(id) {
    const { generation } = beginImport("project");
    try {
      const { file, kind } = await recentFiles.file(id);
      if (generation !== importGeneration.current) return;
      if (kind === "model") await choose([file]);
      else await openProject(file);
    } catch (problem) {
      if (generation === importGeneration.current) setError(problem.message);
    } finally {
      if (generation === importGeneration.current) setImporting(false);
    }
  }
  return {
    beginImport,
    cancelImport,
    restoreProject,
    restoreRecoveryProject,
    choose,
    routeProjectFile,
    openProject,
    applyProjectLoad,
    askMultipartImport,
    acknowledgeZeroVolumeImport,
    readStructuredGeometry,
    addProjectGeometry,
    openGeometryProject,
    loadProjectGeometry,
    importProject,
    openRecentFile,
  };
}
