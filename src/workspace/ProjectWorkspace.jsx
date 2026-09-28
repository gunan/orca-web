import React from "react";
import ProjectAttachments from "../ProjectAttachments.jsx";
export default function ProjectWorkspace({
  projectState,
  actions,
  session,
  open,
  selectJob,
  restoreRecovery,
  discardRecovery,
}) {
  const { project } = projectState;
  const {
    edit: update,
    saveProject: save,
    exportModel,
    refreshJobs,
    deleteJob,
    cancelJob,
  } = actions;
  const { jobs, recovery } = session;
  return (
    <section className="project-workspace">
      <h2>Project</h2>
      <div className="project-columns">
        <div>
          <label>
            Project name
            <input
              value={project.name}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Author
            <input
              value={project.metadata.author}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  metadata: {
                    ...current.metadata,
                    author: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={project.metadata.description}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  metadata: {
                    ...current.metadata,
                    description: event.target.value,
                  },
                }))
              }
            />
          </label>
          <div className="project-actions">
            <button onClick={save}>Save project</button>
            <button onClick={open}>Open project</button>
            <button onClick={() => exportModel("3mf")}>
              Export plate as 3MF
            </button>
            <button onClick={() => exportModel("3mf", true)}>
              Export native project
            </button>
            <button onClick={() => exportModel("stl")}>
              Export plate as STL
            </button>
          </div>
          <p>
            Native 3MF exports preserve geometry, plates, parts, filament
            assignments, and validated native settings. Orca Web project files
            also preserve browser editing state.
          </p>
          <div className="project-metadata-grid">
            {[
              ["Copyright", "Copyright"],
              ["Origin", "Origin"],
              ["ProfileTitle", "Print profile title"],
              ["ProfileDescription", "Print profile description"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={project.nativeModelMetadata?.[key] || ""}
                  maxLength={8192}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      nativeModelMetadata: {
                        ...current.nativeModelMetadata,
                        [key]: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ))}
            <label>
              License
              <select
                aria-label="License"
                value={project.nativeModelMetadata?.License || ""}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    nativeModelMetadata: {
                      ...current.nativeModelMetadata,
                      License: event.target.value,
                    },
                  }))
                }
              >
                {[
                  ...new Set([
                    "",
                    "CC0",
                    "BY",
                    "BY-SA",
                    "BY-ND",
                    "BY-NC",
                    "BY-NC-SA",
                    "BY-NC-ND",
                    project.nativeModelMetadata?.License || "",
                  ]),
                ].map((value) => (
                  <option key={value} value={value}>
                    {value || "Not specified"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ProjectAttachments project={project} update={update} />
          {recovery && (
            <div className="recovery">
              <b>A browser autosave is available.</b>
              <button onClick={restoreRecovery}>Restore autosave</button>
              <button onClick={discardRecovery}>Discard autosave</button>
            </div>
          )}
        </div>
        <div>
          <h3>Job history</h3>
          <button onClick={refreshJobs}>Refresh history</button>
          {jobs.length ? (
            <ul className="job-history">
              {jobs.map((job) => (
                <li key={job.id}>
                  <b>{job.filename}</b>
                  <span>
                    {job.status} · {new Date(job.createdAt).toLocaleString()}
                  </span>
                  {job.error && <p>{job.error}</p>}
                  <div>
                    {job.status === "ready" && (
                      <>
                        <button onClick={() => selectJob(job)}>
                          View toolpaths
                        </button>
                        <a href={`/api/jobs/${job.id}/download`}>Download</a>
                      </>
                    )}
                    {["queued", "slicing"].includes(job.status) ? (
                      <button onClick={() => cancelJob(job)}>Cancel job</button>
                    ) : (
                      <button onClick={() => deleteJob(job)}>Delete job</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No jobs recorded.</p>
          )}
        </div>
      </div>
    </section>
  );
}
