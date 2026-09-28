import { nativeProjectRequest } from "../../shared/native-project-client.js";
import { exportSTL } from "../../shared/geometry.js";
import { serializeProject } from "../../shared/project.js";

export default function useProjectExport({
  project,
  saveBlob,
  visibleObjects,
  setError,
  recentFiles,
  saved,
  setNotice,
}) {
  async function exportModel(format, allPlates = false) {
    try {
      if (format === "3mf") {
        const calibrationProject =
          project.calibration && project.calibrationPlan?.inputFormat === "3mf";
        const response = await fetch(
          calibrationProject
            ? "/api/calibrations/project"
            : "/api/projects/export",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              calibrationProject
                ? {
                    calibration: project.calibration,
                    ids: project.ids,
                    objects: project.objects,
                    plateId: project.activePlateId,
                    allPlates,
                  }
                : nativeProjectRequest(project, { allPlates }),
            ),
          },
        );
        if (!response.ok)
          throw new Error(
            (await response.json()).error || "Native project export failed.",
          );
        saveBlob(await response.blob(), `${project.name || "Project"}.3mf`);
      } else
        saveBlob(
          new Blob([exportSTL(visibleObjects)], {
            type: "application/octet-stream",
          }),
          `${project.name || "model"}.stl`,
        );
    } catch (problem) {
      setError(problem.message);
    }
  }

  function saveProject() {
    try {
      const text = serializeProject(project);
      const file = new File(
        [text],
        `${project.name || "Untitled"}.orca-web.json`,
        { type: "application/json", lastModified: Date.now() },
      );
      saveBlob(file, file.name);
      recentFiles.record(file, "project");
      saved.current = project;
      setNotice(
        project.calibrationPlan?.inputFormat === "3mf"
          ? "Project saved. Export native 3MF now to preserve calibration layer commands; after the 24-hour token expires or the server restarts, regenerate the calibration before slicing or native export."
          : "Project saved.",
      );
      return true;
    } catch (problem) {
      setError(problem.message);
      return false;
    }
  }
  return { exportModel, saveProject };
}
