# Milestone 23 — all-plate Preview and display units

Baseline: installed OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`; repository `5050dab` plus the accepted working tree. Full parity remains incomplete.

## Behavior

[Statistics of all plates](PREVIEW_ALL_PLATES.md) now collects original native plate filament assignments and combines native processed material volumes, time and cost. Each result belongs to the same immutable project, configuration and engine cohort. Missing, stale, failed or deleted plate jobs remain explicitly unavailable; totals are never inferred from filenames or unrelated slices. The service is bounded, serializes helper work and cancels on disconnect or deadline.

[Preferences Units](NATIVE_DISPLAY_UNITS.md) persists metric/imperial display choices and updates Feature, Filament, editor Summary and all-plate statistics without reslicing or changing model dimensions. Native per-table conversions, float accumulation and decimal precision are retained. The generic decimal formatter now matches native printf at binary rounding boundaries, including `0.005` at two decimals. Both new dialogs retain keyboard focus correctly.

The inventory adds separate `preview.all-plates` and `ui.units` acceptance records. They remain partial: the native all-plate view replaces the viewport, while this implementation uses a modal; manipulation/import units, other Preferences pages, full desktop appearance and fresh paired desktop interaction remain open.

## Validation

| Command | Result | Evidence |
|---|---|---|
| `npm test` | 933 passed, no skips | `/private/tmp/orca-m23-units-unit.log` |
| `npm run build` | Passed | `/private/tmp/orca-m23-units-build-fixed.log` |
| `npm run test:e2e` | 269 passed, no skips | `/private/tmp/orca-m23-all-browser.log` |
| `npm run test:native` | 221 passed, 14 failed, 2 cancelled, no skips | [Full log](NATIVE_VALIDATION_M23.log) |
| `npm run test:e2e:native` | 68 passed, no skips | `/private/tmp/orca-m23-all-native-browser.log` |
| `node --test tests/native/native-all-plate-statistics.test.js` | 3 passed, no skips | `/private/tmp/orca-m23-all-plate-native.log` |

The combined isolated stage contains the complete prior milestone. Browser/native checks include installed slicing and actual compiled-helper replay; each test describes its source. The new all-plate native checks compare 84 command-fixture vertices and 58,042 retained native-GUI vertices with independently compiled original accumulation loops. Twelve independent original Model/ModelVolume/TriangleSelector cases cover filament assignment. Units has eight original-source formatting cases and 76 independent printf boundaries. Fake-engine API checks are separate from native evidence.

The initial new modal test found missing focus restoration and passed after using the established modal component. One native browser assertion named an existing header incorrectly; its selector was corrected from “Width (mm)” to “Line width (mm)”. Geometry, native values and other assertions were retained. The initial sandbox-only unit run could not bind localhost; the escalated run completed normally. Diagnostic logs remain available.

## Installed-native full run

The desktop briefly became available during this work. A focused installed-native image export run passed all four checks (`/private/tmp/orca-m22-unlocked-native-images.log`). A complete `npm run test:native` on accepted M22 then finished with **225 passed, six failed, three cancelled, zero skipped, 234 total**. This is a completed failed run, not unavailable or passing evidence. The [full log](NATIVE_VALIDATION_M22.log) is retained.

The unchanged XL physical-nozzle-three rejection case exited with native SIGBUS rather than expected code 188. Five export-related assertions timed out after the desktop locked again, and three raw-3MF tests hit their test deadlines. The earlier native stack identifies macOS persistent-state restoration inside `glfwInit`; no user preferences or native recovery state were reset. Ordinary installed slicing and browser/native replay continue to run. The historical same-input native motion variability remains unresolved even when an individual run passes.

No hardware was contacted or physical print started. These validation results establish the covered behaviors only.

The complete combined M23 native run subsequently finished with **221 passed, 14 failed, two cancelled, zero skipped, 237 total** in 12 minutes. Twelve export assertions timed out, two export-containing variant tests reached their test deadlines, the native XL case again returned SIGBUS, and the strict translation-only four-run comparison reproduced the recorded motion variability. The [M23 log](NATIVE_VALIDATION_M23.log) preserves all failures. Later export cases passed despite the desktop remaining locked, so a locked screen alone does not establish the cause of every individual timeout. No assertions were weakened or rerun until passing. The new all-plate native cases passed in this full run.

## Promotion and local server

All46 promoted source, test and documentation files matched the accepted stage hashes. Post-promotion `npm test` passed933/933 with no skips and the production build passed (`/private/tmp/orca-m23-promoted-unit-accepted.log`, `/private/tmp/orca-m23-promoted-build-accepted.log`). Parity consistency and whitespace checks passed. A promotion preflight identified a file introduced by all-plate work and later modified by Units as new; it stopped before copying any files, and the corrected classification completed normally.

The server at `http://localhost:3001` now runs the immutable `/private/tmp/orca-implementation/live-m23` snapshot with its own paired helper binaries and the existing repository data directory. There were no active jobs at replacement. Health, the production asset hashes and the native preset catalog were checked after startup. Subsequent inheritance and cutting work remains isolated.
