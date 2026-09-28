import WorkspaceDialogs from "./app/WorkspaceDialogs.jsx";
import useWorkspaceStatus from "./app/useWorkspaceStatus.js";
import useWorkspaceTools from "./app/useWorkspaceTools.js";
import { useEffect } from "react";
import { NativeGraphicsPreferencesContext } from "./NativeGraphicsPreferencesContext.jsx";
import { NativeCameraPreferencesContext } from "./NativeCameraPreferencesContext.jsx";
import AppHeader from "./app/AppHeader.jsx";
import AppMenuBar from "./app/AppMenuBar.jsx";
import HomeWorkspace from "./HomeWorkspace.jsx";
import ResizableWorkspace from "./ResizableWorkspace.jsx";
import PrepareSidebar from "./workspace/PrepareSidebar.jsx";
import ModelWorkspace from "./workspace/ModelWorkspace.jsx";
import SelectionInspector from "./workspace/SelectionInspector.jsx";
import ToolpathPreview from "./ToolpathPreview.jsx";
import ProjectWorkspace from "./workspace/ProjectWorkspace.jsx";
import DeviceWorkspace from "./DeviceWorkspace.jsx";
import StatusBar from "./app/StatusBar.jsx";

import useWorkspaceSession from "./app/useWorkspaceSession.js";
import useWorkspaceActions from "./app/useWorkspaceActions.js";
import useFilePreferences from "./app/useFilePreferences.js";
import usePresetState from "./app/usePresetState.js";
import useSettingsSummary from "./app/useSettingsSummary.js";
import useModelSelection from "./app/useModelSelection.js";
import useAppearancePreferences from "./app/useAppearancePreferences.js";
import "./project-load.css";
import "./native-graphics.css";

import React from "react";

import "./styles.css";
import "./editor.css";
import useProjectState from "./app/useProjectState.js";
const accepted = ["stl", "obj", "3mf", "amf", "svg", "step", "stp"];
const emptyCatalog = {
  printers: [],
  processes: [],
  filaments: [],
  defaults: {},
  warnings: [],
};
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const projectState = useProjectState();
  const presets = usePresetState({
    projectState,
    emptyCatalog,
  });
  const session = useWorkspaceSession({
    projectState,
  });
  const appearance = useAppearancePreferences({});
  const files = useFilePreferences({});
  const toolState = useWorkspaceTools({
    projectState,
  });
  useEffect(() => {
    toolState.setPrimeTowerSelected(null);
  }, [projectState.project.activePlateId]);
  const selection = useModelSelection({
    projectState,
    toolState,
    presets,
  });
  const status = useWorkspaceStatus({
    projectState,
    session,
    presets,
    files,
    toolState,
    selection,
  });
  const settings = useSettingsSummary({
    presets,
    projectState,
    session,
    status,
  });
  const actions = useWorkspaceActions({
    status,
    toolState,
    session,
    projectState,
    files,
    selection,
    presets,
    settings,
    appearance,
    emptyCatalog,
    accepted,
    saveBlob,
  });
  return (
    <NativeGraphicsPreferencesContext.Provider
      value={appearance.graphicsPreferences}
    >
      <NativeCameraPreferencesContext.Provider
        value={appearance.cameraPreferences}
      >
        <div className="app editor-app">
          <input
            ref={session.modelInput}
            aria-label="Choose a 3D model"
            hidden
            type="file"
            multiple
            accept=".stl,.obj,.3mf,.amf,.svg,.step,.stp"
            onChange={(event) => {
              actions.choose(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={session.projectInput}
            aria-label="Open Orca Web project"
            hidden
            type="file"
            accept=".json,.3mf"
            onChange={(event) => {
              actions.openProject(event.target.files[0]);
              event.target.value = "";
            }}
          />
          <AppHeader
            files={files}
            status={status}
            actions={actions}
            session={session}
          />
          <AppMenuBar
            actions={actions}
            toolState={toolState}
            files={files}
            appearance={appearance}
            projectState={projectState}
            status={status}
          />
          {settings.activeError && (
            <p role="alert" className="error editor-error">
              {settings.activeError}
              <button
                aria-label="Dismiss error"
                onClick={() => session.setError("")}
              >
                ×
              </button>
            </p>
          )}
          {session.notice && (
            <p className="editor-notice">
              {session.notice}
              <button
                aria-label="Dismiss notice"
                onClick={() => session.setNotice("")}
              >
                ×
              </button>
            </p>
          )}
          {files.page === "Home" ? (
            <HomeWorkspace
              recent={files.recentFiles}
              onRecentOpen={actions.openRecentFile}
              onNew={() => actions.requestDiscard(actions.newProject)}
              onOpen={() => session.projectInput.current.click()}
            />
          ) : files.page === "Prepare" ? (
            <ResizableWorkspace
              selected={
                Boolean(selection.selected) ||
                (toolState.primeTowerSelected ===
                  projectState.project.activePlateId &&
                  toolState.primeTowerDragLayout !== false)
              }
            >
              <PrepareSidebar
                toolState={toolState}
                status={status}
                presets={presets}
                projectState={projectState}
                actions={actions}
                files={files}
                settings={settings}
                selection={selection}
                session={session}
              />
              <ModelWorkspace
                session={session}
                toolState={toolState}
                status={status}
                selection={selection}
                projectState={projectState}
                actions={actions}
                presets={presets}
                files={files}
                appearance={appearance}
              />
              <SelectionInspector
                toolState={toolState}
                projectState={projectState}
                presets={presets}
                selection={selection}
                status={status}
                actions={actions}
                appearance={appearance}
                files={files}
              />
            </ResizableWorkspace>
          ) : files.page === "Preview" ? (
            <ToolpathPreview
              job={session.job}
              viewPreferences={session.previewPreferences}
              imperial={appearance.displayPreferences.use_inches === "1"}
              onSwitchToPrepare={() => files.setPage("Prepare")}
            />
          ) : files.page === "Project" ? (
            <ProjectWorkspace
              open={() => session.projectInput.current.click()}
              selectJob={(next) => {
                session.setJob(next);
                files.setPage("Preview");
              }}
              restoreRecovery={() =>
                actions.requestDiscard(actions.restoreRecoveryProject)
              }
              discardRecovery={() => {
                localStorage.removeItem("orca-web-autosave");
                session.setRecovery(null);
              }}
              projectState={projectState}
              actions={actions}
              session={session}
            />
          ) : (
            <DeviceWorkspace currentJob={session.job} />
          )}
          <StatusBar
            session={session}
            status={status}
            files={files}
            selection={selection}
            settings={settings}
            presets={presets}
            projectState={projectState}
            actions={actions}
          />
          <WorkspaceDialogs
            files={files}
            actions={actions}
            toolState={toolState}
            selection={selection}
            projectState={projectState}
            session={session}
            presets={presets}
            settings={settings}
            appearance={appearance}
          />
        </div>
      </NativeCameraPreferencesContext.Provider>
    </NativeGraphicsPreferencesContext.Provider>
  );
}
