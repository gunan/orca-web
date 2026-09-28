# Milestone 39 — Camera preferences and native mouse actions

Prepare, Preview and painting canvases now share persisted native mouse-button mappings, wheel reversal and orbit speed preferences. Default middle dragging pans, and remapped gestures respect tool priority. Camera preferences preserve project data and Undo history. Preferences also has an opaque, legible light/dark surface. [Source baseline, independent action reference, focused tests, screenshots and limits](NATIVE_CAMERA_PREFERENCES.md).

Baseline: installed OrcaSlicer 2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native workers and slicing settings are unchanged.

| Command | Result |
|---|---|
| `npm test` | 1,081 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 340 passed; no failures or skips |
| `npm run test:e2e:native` | 79 passed; no failures or skips |
| Focused camera unit checks | 7 passed, including 81 original-source action cases × four modifier forms |
| Focused camera/appearance and existing preference browser checks | 11 passed |
| Focused installed-native browser check | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

[Unit/API log](UNIT_VALIDATION_M39.log), [browser log](BROWSER_VALIDATION_M39.log), [installed-native browser log](BROWSER_NATIVE_VALIDATION_M39.log). The new native workflow imports and slices a retained GUI project and verifies that camera changes preserve actual native path identity and do not submit another slice. No printer was contacted.

The first browser run exposed a real DOM listener ordering defect not reproduced by Node EventTarget: microtasks restored temporary control values too early. Separate later DOM listeners now restore them, with a fallback for consumed events. Visual checks also reproduced undefined CSS theme variables that made Preferences transparent. Those failed runs, an incorrect hint selector and an incomplete synthetic pinch fixture remain in the [diagnostics](NATIVE_CAMERA_PREFERENCES.md).

The first full native-browser run had78 passes and one Playwright API download ECONNRESET. The trace independently contains the successful browser HTTP200 download,1,047,484 bytes and6,795 tower extrusion moves; the separate API GET began5.954 seconds after its prior request. The revised test clicks the real Download G-code link, checks the correct job URL and successful browser artifact, then parses and verifies its tower paths. It adds no retries and preserves all geometry assertions. [Connection evidence](M39_NATIVE_DOWNLOAD_EVIDENCE.json) and [original failure](BROWSER_NATIVE_INITIAL_M39.log) are retained with traces.

A newly enumerated camera-preferences feature records the full remaining scope. Touchpad mode, free rotation, zoom-to-mouse, chord priority, native absolute motion and rotation centers, automatic projection, remaining Preferences pages and paired native GUI appearance still need implementation or acceptance. The inventory is 132 feature units: 1 missing, 121 partial, 8 implemented, 2 verified. This is not a completeness percentage.

Standalone native slicing was not repeated for this navigation-only change. All 79 actual browser-to-native workflows pass; earlier M32 strict slicing-repeatability failures remain unresolved. The tower browser workflow now reads the actual browser download and keeps its content assertions; this avoids its separate idle Playwright API socket, which reset in the initial full M39 run. It does not establish a production network transport fix.
