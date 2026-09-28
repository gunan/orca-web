import { readJson } from "../lib/http.js";
import {
  nativeProjectRequest,
  needsNativeProjectPipeline,
} from "../../shared/native-project-client.js";
import { sceneBounds, exportSTL } from "../../shared/geometry.js";
import { normalizeOverrides } from "../../shared/settings.js";

export default function useSlicing({
  projectRef,
  canSlice,
  settingsState,
  project,
  setSettingsCorrections,
  setError,
  setSubmitting,
  submitGeneration,
  ids,
  setJob,
  setPage,
  visibleObjects,
  update,
  setNotice,
  overrides,
  setJobs,
  job,
}) {
  async function previewSupports(draftObjects) {
    const current = projectRef.current.present;
    return readJson("/api/jobs/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        nativeProjectRequest({
          ...current,
          objects: draftObjects,
          nativeWorkflow: true,
        }),
      ),
    });
  }

  async function submit() {
    if (!canSlice) return;
    const required = settingsState.correctionPlan.groups.filter(
      (item) => item.mode !== "automatic",
    );
    if (required.length && !project.calibration) {
      setSettingsCorrections(required);
      return;
    }
    if (settingsState.decisionError && !project.calibration) {
      setError(settingsState.decisionError);
      return;
    }
    const invalid = [
      ...document.querySelectorAll(
        ".setting-list input, .setting-list textarea",
      ),
    ].find((input) => !input.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setError("");
    setSubmitting(true);
    const generation = ++submitGeneration.current;
    try {
      if (
        project.calibration &&
        project.calibrationPlan?.inputFormat === "3mf"
      ) {
        const next = await readJson("/api/jobs/calibration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calibration: project.calibration,
            ids,
            objects: project.objects,
            plateId: project.activePlateId,
          }),
        });
        if (generation === submitGeneration.current) {
          setJob(next);
          setPage("Preview");
        }
        return;
      }
      if (needsNativeProjectPipeline(project) && !project.calibration) {
        const next = await readJson("/api/jobs/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nativeProjectRequest(project)),
        });
        if (generation === submitGeneration.current) {
          setJob(next);
          setPage("Preview");
        }
        return;
      }
      const minimumZ = sceneBounds(visibleObjects).min[2];
      const slicingObjects =
        Math.abs(minimumZ) > 0.00001
          ? visibleObjects.map((object) => ({
              ...object,
              position: [
                object.position[0],
                object.position[1],
                object.position[2] - minimumZ,
              ],
            }))
          : visibleObjects;
      if (slicingObjects !== visibleObjects) {
        const replacements = new Map(
          slicingObjects.map((object) => [object.id, object]),
        );
        update((current) => ({
          ...current,
          objects: current.objects.map(
            (object) => replacements.get(object.id) || object,
          ),
        }));
        setNotice(
          "Placed the scene on the bed before slicing, matching native OrcaSlicer placement.",
        );
      }
      const bytes = exportSTL(slicingObjects);
      const name =
        visibleObjects.length === 1
          ? visibleObjects[0].name.replace(/\.[^.]+$/, "")
          : `${project.name}-${project.plates.find((plate) => plate.id === project.activePlateId)?.name || "plate"}`;
      const body = new FormData();
      body.set(
        "model",
        new Blob([bytes], { type: "model/stl" }),
        `${name}.stl`,
      );
      for (const [key, value] of Object.entries(ids)) body.set(key, value);
      body.set("settings", JSON.stringify(normalizeOverrides(overrides)));
      body.set("preservePosition", "true");
      if (project.calibration)
        body.set("calibration", JSON.stringify(project.calibration));
      else if (project.processCorrectionDecisions?.length)
        body.set(
          "processCorrectionDecisions",
          JSON.stringify(project.processCorrectionDecisions),
        );
      const next = await readJson("/api/jobs", { method: "POST", body });
      if (generation === submitGeneration.current) {
        setJob(next);
        setPage("Preview");
      }
    } catch (problem) {
      if (generation === submitGeneration.current) setError(problem.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshJobs() {
    try {
      setJobs(await readJson("/api/jobs"));
    } catch (problem) {
      setError(problem.message);
    }
  }

  async function cancelJob(target = job) {
    if (!target) return;
    try {
      const cancelled = await readJson(`/api/jobs/${target.id}/cancel`, {
        method: "POST",
      });
      if (job?.id === target.id) setJob(cancelled);
      await refreshJobs();
    } catch (problem) {
      setError(problem.message);
    }
  }

  async function deleteJob(target) {
    try {
      const response = await fetch(`/api/jobs/${target.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error((await response.json()).error);
      if (job?.id === target.id) setJob(null);
      await refreshJobs();
    } catch (problem) {
      setError(problem.message);
    }
  }
  return { previewSupports, submit, refreshJobs, cancelJob, deleteJob };
}
