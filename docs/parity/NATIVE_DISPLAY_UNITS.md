# Native display units and decimal formatting

The Preferences Units selector follows OrcaSlicer 2.4.2 source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`: Metric (mm, g) and Imperial (in, oz), with metric as the default. The browser persists a versioned `use_inches` string and applies it immediately to native Feature usage, Filament rows, editor Summary and all-plate statistics. Geometry and process configuration retain native millimetre values; switching display units does not reslice or rewrite a project.

`shared/native-display-units.js` follows the active `GCodeViewer.cpp` formatting paths and constants in `GizmoObjectManipulation`. Source behavior differs between tables: Feature imperial weight is divided by ounces-to-grams twice by the original implementation, while Filament and Summary convert once. The web keeps that observable native quirk isolated instead of silently changing it. Scalar Preview headers remain in their source units. Legacy standalone file metadata has explicit file-provided mm/g labels.

Preferences opens with Command-comma on macOS or Control-P on other platforms. Text editing, another modal, key repetition and composition prevent shortcut activation. The dialog uses the shared modal focus trap and returns focus on dismissal. Invalid stored data defaults to metric. Storage errors are visible; the chosen units still apply to the current session.

## Independent source reference

`scripts/generate-native-units-reference.py /path/to/pinned/OrcaSlicer` verifies the pinned revision and unchanged source files, extracts original formatting function bodies and compiles a C++ reference. The retained input, C++ and JSON capture are under `tests/fixtures/native-units-*`; captures bind source and reference hashes. Eight formatting cases exercise normal, boundary and imperial behavior. Seventy-six additional `printf` cases cover exact/false decimal ties, signed zero, subnormals and large finite values.

This exposed a defect in the former formatter: multiplying `0.005` by 100 first invents a tie and returned `0.00`, whereas native `printf` returns `0.01`. `shared/native-format.js` now rounds the exact IEEE-754 significand/exponent using integer arithmetic and nearest-even rounding. Existing native legend/statistics fixtures remain unchanged and pass.

## Tests and limits

- `tests/unit/native-display-units.test.js`: original source values, conversions, decimal boundaries, storage and shortcuts.
- `tests/e2e/native-display-preferences.spec.js`: persistence, shortcut/modal guards, focus return and visible storage failure.
- `tests/native-e2e/native-display-units.spec.js`: actual native helper replay with exact metric/imperial/metric material cells, unchanged raw volumes, one Preview processing request, scalar headers, and all-plate API units and table values.

The initial browser run exposed missing focus restoration in the new dialogs; both now use the established modal component and the original focus assertions pass. A native browser assertion initially used “Width (mm)” rather than the existing “Line width (mm)” heading; only that selector was corrected. Diagnostic logs remain `/private/tmp/orca-m23-units-browser.log` and `/private/tmp/orca-m23-units-native-browser.log`.

The original work covered Preview display units. [Milestone38](NATIVE_MANIPULATION_UNITS.md) adds Prepare position-offset editing and dimension display with the original native conversions. Native buffered precision, remaining manipulation/import unit controls, every Preferences page, locale formatting, exact desktop layout and a fresh paired desktop units session remain open. The original travel/option-distance formatter has source-reference tests but is not exposed as UI evidence because the current helper does not yet return those original counters. These limits keep `ui.units` partial.
