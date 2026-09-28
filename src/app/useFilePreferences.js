import { useState } from "react";
import {
  readProjectLoadPreferences,
  saveProjectLoadPreferences,
} from "../../shared/native-project-load.js";
import { useRecentFiles } from "../useRecentFiles.js";
import {
  readNativeStartupPreferences,
  saveNativeStartupPreferences,
  nativeStartupPage,
} from "../../shared/native-startup-preferences.js";
export default function useFilePreferences({}) {
  const [multipartImport, setMultipartImport] = useState(null);
  const [zeroVolumeImport, setZeroVolumeImport] = useState(null);
  const [projectLoadPreferences, setProjectLoadPreferences] = useState(() =>
      readProjectLoadPreferences(window.localStorage),
    ),
    [projectLoadDialog, setProjectLoadDialog] = useState(null);
  function changeProjectLoadPreferences(next) {
    setProjectLoadPreferences(next);
    try {
      saveProjectLoadPreferences(window.localStorage, next);
      return "";
    } catch {
      return "Load behaviour changed for this session, but browser storage could not save it.";
    }
  }
  const recentFiles = useRecentFiles();
  const [startupPreferences, setStartupPreferences] = useState(() =>
    readNativeStartupPreferences(window.localStorage),
  );
  function changeStartupPreferences(next) {
    setStartupPreferences(next);
    try {
      saveNativeStartupPreferences(window.localStorage, next);
      return "";
    } catch {
      return "Startup page could not be saved. Reopening the app will use the previous startup setting.";
    }
  }
  const [page, setPage] = useState(() => nativeStartupPage(startupPreferences)),
    [submitting, setSubmitting] = useState(false),
    [importing, setImporting] = useState(false);
  return {
    multipartImport,
    setMultipartImport,
    zeroVolumeImport,
    setZeroVolumeImport,
    projectLoadPreferences,
    projectLoadDialog,
    setProjectLoadDialog,
    changeProjectLoadPreferences,
    recentFiles,
    startupPreferences,
    changeStartupPreferences,
    page,
    setPage,
    submitting,
    setSubmitting,
    importing,
    setImporting,
  };
}
