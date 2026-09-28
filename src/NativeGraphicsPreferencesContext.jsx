import React,{createContext,useContext,useRef,useEffect} from 'react';
import {NATIVE_GRAPHICS_DEFAULTS,createNativeRenderStats} from '../shared/native-graphics-preferences.js';
export const NativeGraphicsPreferencesContext=createContext(NATIVE_GRAPHICS_DEFAULTS);
export function useNativeGraphics(runtime){const value=useContext(NativeGraphicsPreferencesContext),current=useRef(value),overlay=useRef();current.current=value;useEffect(()=>{runtime.current?.refreshGraphics?.();},[value]);return{value,preferences:current,overlay};}
export function createViewportFrameStats(overlay){const stats=createNativeRenderStats();return{beforeFrame(){const fps=stats.beforeFrame();if(overlay.current)overlay.current.textContent=`FPS: ${fps}`;},didFrame:stats.didFrame};}
export function ViewportFpsOverlay({graphics}){return <output ref={graphics.overlay} className="viewport-fps" aria-label="Viewport FPS" aria-live="off" hidden={graphics.value.opengl_show_fps_overlay!=='true'}>FPS: 0</output>;}
