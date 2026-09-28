import NativeIcon from "../NativeIcon.jsx";
import React from "react";
export default function AppHeader({ files, status, actions, session }) {
  const { page, setPage, submitting } = files;
  const { engineAvailable, healthLabel, canSlice, busy } = status;
  const { submit, cancelJob } = actions;
  const { job } = session;
  return (
    <header className="titlebar">
      <button
        className="brand"
        aria-label="Home"
        title="Home"
        aria-pressed={page === "Home"}
        onClick={() => setPage("Home")}
      >
        <NativeIcon name="tab_home_active" />
        <span className="sr-only">Home</span>
      </button>
      <nav>
        {["Prepare", "Preview", "Device", "Project"].map((name) => (
          <button
            key={name}
            className={page === name ? "active" : ""}
            onClick={() => setPage(name)}
          >
            <NativeIcon
              name={
                {
                  Prepare: "tab_3d_active",
                  Preview: "tab_preview_active",
                  Device: "tab_monitor_active",
                  Project: "tab_auxiliary_active",
                }[name]
              }
            />
            {name}
          </button>
        ))}
      </nav>
      <div className="head-actions">
        <span
          role="status"
          className={`online ${engineAvailable ? "" : "unavailable"}`}
        >
          <i />
          {healthLabel}
        </span>
        <button
          className="slice"
          aria-label="Slice model"
          disabled={!canSlice}
          onClick={submit}
        >
          {busy || submitting ? "Slicing…" : "Slice plate"}
        </button>
        {job?.status === "ready" && (
          <a className="download" href={`/api/jobs/${job.id}/download`}>
            ↓ Download G-code
          </a>
        )}
        {busy && <button onClick={() => cancelJob()}>Cancel slicing</button>}
      </div>
    </header>
  );
}
