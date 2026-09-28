import {createContext,useContext} from 'react';
import {NATIVE_CAMERA_DEFAULTS} from '../shared/native-camera-preferences.js';
export const NativeCameraPreferencesContext=createContext(NATIVE_CAMERA_DEFAULTS);
export const useNativeCameraPreferences=()=>useContext(NativeCameraPreferencesContext);
