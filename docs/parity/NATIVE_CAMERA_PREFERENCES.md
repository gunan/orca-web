# Native camera preferences

Baseline: OrcaSlicer 2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

Preferences now exposes the native Orbit speed multiplier, Reverse mouse zoom, and Left/Middle/Right Mouse Drag choices. Defaults are Rotate/Pan/Pan: middle dragging previously dollied the web camera instead of panning. Each button supports None, Pan and Rotate. The orbit field commits on Enter or blur, clamps to 0.05–2 and formats to two decimals. Settings apply immediately to Prepare, Preview and painting canvases, persist separately from project data and do not create geometry or Undo edits. Failed storage saves report that the change is for the current session. Painting retains priority over left-button camera movement. Contextual hints reflect the active button mappings.

## Source and independent reference

`build-camera-preferences-reference.py` extracts the complete original `GLCanvas3D::clicked_button_matches_action`, `is_camera_rotate` and `is_camera_pan` bodies and mouse enums. It compiles them against a small wx-event facade for single-button dragging in default navigation mode. All 27 mapping combinations × 3 buttons produce 81 independent action results. Defaults come directly from `AppConfig.cpp`; source, generator, extracted C++ and compiled binary hashes are retained. The fixture does not exercise native desktop rendering, touchpad mode, chords or camera trajectories.

Seven focused unit tests pass. They exercise actual Three.js OrbitControls against all 81 results with unmodified, Ctrl, Shift and Meta input, measure pan and rotation, check relative orbit speed, verify reverse-wheel isolation from later pinch gestures, storage, formatting, disposal and provenance. Original-source action selection does not imply native rotation-center or motion-matrix equivalence. The source's Ctrl/Cmd pivot selection remains a separate gap.

## Browser and installed-native evidence

[Eleven focused browser checks](M39_CAMERA_BROWSER.log) pass: eight new camera/appearance cases and three existing display-preference cases. They check native default middle pan, None and modifier-key remapping, project/Undo isolation, persistence and remounts, immediate wheel reversal in both projections, input validation, storage failure, actual painting, Preview behavior, and light/dark opacity with compact-window operation. [Light appearance](M39_PREFERENCES_LIGHT.png), [dark appearance](M39_PREFERENCES_DARK.png).

The [installed-native browser case](M39_CAMERA_NATIVE_BROWSER.log) imports the retained native GUI cube, slices with installed OrcaSlicer and renders actual native-processed solids. Camera gestures leave the exact native range and visible-volume count intact, do not submit a new slice, and survive Prepare/Preview transitions. No physical printer is contacted.

The original UI fails all six initial camera cases, including incorrect middle-button behavior and missing controls. The initial runtime fix passed Node event tests but failed four browser checks: a microtask restored wheel direction and modifier compensation before OrbitControls' next DOM listener. The final binding restores those temporary values in listeners registered after OrbitControls, with a timer fallback for tools that consume events. All nine then-existing browser checks passed after the event fix.

Visual review found pre-existing Preferences CSS used undefined surface/border variables, making its panel transparent. Both new appearance regressions fail before the fix and pass afterward. The preferences now use the application's actual theme variables and a properly sized checkbox. An added hint assertion initially used the wrong CSS selector; correcting it to the real hint element yields the final eleven passes. The first unit pinch fixture also omitted page coordinates; adding the actual event fields fixed the fixture, without a production change. [Logs and retained failing traces](M39_CAMERA_DIAGNOSTICS.zip) preserve these distinctions.

## Remaining gaps

Touchpad-style Alt/Shift navigation, zoom to mouse position, free-camera rotation, mouse-button chord priority, native rotation centers, exact native rotation/pan/zoom matrices and limits, auto-projection behavior, remaining Preferences pages, native tab layout and fresh paired desktop acceptance remain open. Orbit speed currently scales the web OrbitControls rate; this is not the native absolute pixels-to-radians mapping. Only the enumerated preferences and action mapping are implemented here. Camera and interface parity remain partial.
