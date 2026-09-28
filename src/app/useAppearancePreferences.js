import { useState } from "react";
import {
  readNativeCameraPreferences,
  saveNativeCameraPreferences,
} from "../../shared/native-camera-preferences.js";
import {
  readNativeGraphicsPreferences,
  saveNativeGraphicsPreferences,
} from "../../shared/native-graphics-preferences.js";
import {
  readNativeDisplayPreferences,
  saveNativeDisplayPreferences,
} from "../../shared/native-display-units.js";
export default function useAppearancePreferences({}) {
  const [cameraPreferences, setCameraPreferences] = useState(() =>
    readNativeCameraPreferences(window.localStorage),
  );
  const [graphicsPreferences, setGraphicsPreferences] = useState(() =>
    readNativeGraphicsPreferences(window.localStorage),
  );
  function changeGraphicsPreferences(next) {
    setGraphicsPreferences(next);
    try {
      saveNativeGraphicsPreferences(window.localStorage, next);
      return "";
    } catch {
      return "Graphics controls changed for this session, but browser storage could not save them.";
    }
  }
  function changeCameraPreferences(next) {
    setCameraPreferences(next);
    try {
      saveNativeCameraPreferences(window.localStorage, next);
      return null;
    } catch {
      return "Camera controls changed for this session, but browser storage could not save them.";
    }
  }
  const [displayPreferences, setDisplayPreferences] = useState(() =>
      readNativeDisplayPreferences(window.localStorage),
    ),
    [preferencesOpen, setPreferencesOpen] = useState(false);
  function changeDisplayPreferences(next) {
    setDisplayPreferences(next);
    try {
      saveNativeDisplayPreferences(window.localStorage, next);
      return null;
    } catch {
      return "Units changed for this session, but browser storage could not save them.";
    }
  }
  return {
    cameraPreferences,
    graphicsPreferences,
    changeGraphicsPreferences,
    changeCameraPreferences,
    displayPreferences,
    preferencesOpen,
    setPreferencesOpen,
    changeDisplayPreferences,
  };
}
