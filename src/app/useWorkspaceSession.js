import { useState, useRef, useEffect } from "react";
import { createNativePreviewPreferences } from "../../shared/native-preview-preferences.js";
export default function useWorkspaceSession({ projectState }) {
  const { project } = projectState;
  const [health, setHealth] = useState(null),
    [error, setError] = useState(""),
    [job, setJob] = useState(null);
  const previewPreferences = useRef(createNativePreviewPreferences());
  const [jobs, setJobs] = useState([]),
    [recovery, setRecovery] = useState(null),
    [notice, setNotice] = useState("");
  const modelInput = useRef(),
    projectInput = useRef(),
    catalogRequest = useRef(),
    selectionRequest = useRef(),
    submitGeneration = useRef(0),
    importGeneration = useRef(0),
    importRequest = useRef();
  const saved = useRef(null),
    mounted = useRef(false),
    catalogPrinter = useRef("");
  const previousCalibration = useRef(null);
  useEffect(() => {
    if (previousCalibration.current && !project.calibration)
      setNotice(
        "Calibration cleared after project changes. The model now uses ordinary slicing settings; regenerate calibration to apply a layer schedule.",
      );
    previousCalibration.current = project.calibration;
  }, [project.calibration]);
  return {
    health,
    setHealth,
    error,
    setError,
    job,
    setJob,
    previewPreferences,
    jobs,
    setJobs,
    recovery,
    setRecovery,
    notice,
    setNotice,
    modelInput,
    projectInput,
    catalogRequest,
    selectionRequest,
    submitGeneration,
    importGeneration,
    importRequest,
    saved,
    mounted,
    catalogPrinter,
  };
}
