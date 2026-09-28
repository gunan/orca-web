# Native graphics preferences — FPS controls

The web Preferences dialog now exposes the native FPS cap (0–240; 0 removes the application cap) and Show FPS overlay. They persist separately from model state and apply immediately to Prepare, native/source Preview and painting canvases. Capped demand rendering coalesces changes, includes render time in the frame-start interval and cancels pending timers on disposal. Idle viewports retain no frame or timer loop.

Baseline: installed OrcaSlicer 2.4.2 and source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. [Reference fixture](../../tests/fixtures/native-graphics-preferences-reference.json) records original source, extracted C++, generator and binary SHA256 hashes. [Generator](../../scripts/reference/build-graphics-preferences-reference.py) compiles the unchanged native cap parser, on_idle pacing block and RenderStats class with deterministic clocks. Fourteen cap values cover numeric prefixes, ASCII/nonbreaking whitespace and signed overflow; seven pacing and seven frame-counter samples cover whole-millisecond rounding, idle gaps and the strict elapsed >1000 boundary. Browser rendering remains requestAnimationFrame-bound when the application cap is zero.

Rebuild with `python3 scripts/reference/build-graphics-preferences-reference.py PATH_TO_PINNED_SOURCE OUTPUT_BUILD_DIR`. Reference source extraction is independent of the web functions. The deterministic clock replaces clock types, not the arithmetic. The web overlay counts completed renderer submissions; it does not certify physical screen presentation rate. Native RenderStats counts SwapBuffers calls.

## Regression evidence

- Twelve focused units pass, including eight new functional graphics/scheduler tests and one inventory integrity test. The inventory test validates metadata, not feature behavior.
- Four new browser regressions fail against the preceding build. Fifteen focused graphics/camera/display checks pass, followed by nine graphics/calibration/camera harness checks on the final build.
- Real WebGL clear timestamps demonstrate cap intervals, redraw, idle behavior and cleanup. The graphics input commits, invalid values, normalization, storage failure and model Undo independence are covered.
- The actual installed-native workflow imports a native project, slices once, pans real processed toolpaths at the selected cap, preserves the native path/range identity and changes the layer range after disabling the cap. It passes without a fake engine or physical printing.
- The first broad browser run was stopped after discovering a missing React import in the classic-JSX calibration harness. Adding the import fixes all three affected harness tests. The next full run reached347 passes but a stylesheet import in the graphics context prevented the standalone camera harness from building (one failure and one not run). Moving the stylesheet to the app entry point fixes both camera cases without weakening their assertions. A following invocation could not start because the interrupted server retained its test port; the confirmed orphan was terminated.
- The initial native graphics run exhausted its 120-second test deadline at the final redraw check while the broad browser suite was also running. Its earlier GPU pacing and native-path assertions passed. The input trace recorded multi-second browser commands during that overlap. The isolated rerun uses the same assertions and timeout. Original failure and traces remain in this report's diagnostics.

[Focused units](M41_GRAPHICS_UNIT.log), [baseline failures](M41_GRAPHICS_BEFORE.log), [focused browser](M41_GRAPHICS_BROWSER.log), [final harness checks](M41_GRAPHICS_BROWSER_FINAL.log), [native workflow](M41_GRAPHICS_NATIVE_BROWSER.log), [initial native timeout](M41_GRAPHICS_NATIVE_INITIAL.log), [diagnostics](M41_GRAPHICS_DIAGNOSTICS.zip).

## Detailed Preferences inventory

[JSON](native-preferences.json) and [CSV](native-preferences.csv) export **71 candidate control declarations** from the pinned PreferencesDialog::create_items source. Eight have partial implementation/test references; 63 remain missing. A separate JSON collection preserves one explicitly disabled #if0 declaration. These are source candidates, not 71 verified visible controls on macOS. Platform and build conditions are retained; runtime availability and visibility are unverified. Uncalled pane internals are outside this extraction.

Every candidate has a stable ID, source location/call, status, parent feature, existing test references where applicable and at least two planned acceptance tests. [Progress overrides](native-preferences-progress.json) are maintained explicitly. Regenerate using `python3 scripts/export-native-preferences.py PATH_TO_PINNED_SOURCE`; source and generator hashes are retained. Regeneration does not execute those tests or upgrade status.

## Remaining gaps

Native spin-button geometry, held-button repeat and mouse-wheel behavior, exact platform typography/tab layout, localization and paired desktop screenshots remain open. The other six Graphics declarations and most other Preferences controls remain missing. The overlay uses a web renderer completion checkpoint and is not a hardware presentation benchmark. Exact native camera and GPU pipeline behavior remains partial. These results do not establish 100% parity.
