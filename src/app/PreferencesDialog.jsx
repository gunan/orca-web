import NativePreferencesDialog from "../NativePreferencesDialog.jsx";
import React from "react";
export default function PreferencesDialog({ appearance, files }) {
  const {
    preferencesOpen,
    graphicsPreferences,
    changeGraphicsPreferences,
    cameraPreferences,
    changeCameraPreferences,
    displayPreferences,
    changeDisplayPreferences,
    setPreferencesOpen,
  } = appearance;
  const {
    projectLoadPreferences,
    changeProjectLoadPreferences,
    recentFiles,
    startupPreferences,
    changeStartupPreferences,
  } = files;
  return (
    preferencesOpen && (
      <NativePreferencesDialog
        projectLoad={projectLoadPreferences}
        onProjectLoadChange={changeProjectLoadPreferences}
        recent={recentFiles.preferences}
        recentLoading={recentFiles.loading}
        onRecentChange={recentFiles.configure}
        startup={startupPreferences}
        onStartupChange={changeStartupPreferences}
        graphics={graphicsPreferences}
        onGraphicsChange={changeGraphicsPreferences}
        camera={cameraPreferences}
        onCameraChange={changeCameraPreferences}
        value={displayPreferences}
        onChange={changeDisplayPreferences}
        onClose={() => setPreferencesOpen(false)}
      />
    )
  );
}
