# Native editor Preview provenance, persistence and active event overview

This M48 package follows M46 Filament/Summary Preview. It uses OrcaSlicer 2.4.2 commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It does not claim full Preview visual parity or a fresh native desktop comparison. The installed Orca CLI was intentionally paused during this package; all native execution used the isolated compiled G-code helper and retained native files.

## Implemented source behavior

- `Plater.cpp:16889,16927` and `GUI_Preview.cpp:681`: editor palettes come from the project filament colors and project ColorChange entries; standalone import palettes come from G-code processor results. The custom-event sentinel is native gray. Original renderer RGB minimums are retained. The immutable job snapshot contains only palette, filament diameter/density/cost, machine time cost and bounded event identity/height/color. It has no account data, host configuration, command body or file paths.
- `GCode.cpp:1904` `DoExport::update_print_estimated_stats`: the helper compiles this exact function with the original `Extruder.cpp` and `PrintConfig` methods. Only the owning output struct is narrowed. Diameter/density/cost remain native double configuration values, distinct from the processor's float arrays. Cost includes normal-mode machine hours times machine time cost. Material and event values are not reconstructed from display-rounded file headers.
- `GCodeViewer.cpp:1348`: automatic mode selection tracks one-versus-multiple used-extruder categories, not exact counts. A user's mode remains selected when a new file stays in the same category. The App-owned viewer preference object preserves mode, role visibility, motion/event visibility, top-layer playback and G-code panel choice across Prepare/Preview remounts and new job loads. This is application-lifetime state, not an invented OS preference. An older helper falls back explicitly when it cannot provide a remembered mode.
- `ViewerImpl::reset:867`: geometry reset leaves the native settings object intact. Explicit user reentry into Feature continues to restore all roles, as implemented in M46; ordinary component remount does not silently invoke that action.
- `GCodeViewer.cpp:4477–4545`: the active Custom G-code overview uses original nearest-layer lookup, the original strict `0.0011` epsilon from `IMSlider.hpp:24`, float accumulation of preceding layer times, and original `Utils.hpp::get_time_dhms/short_time`. Unknown layer displays 0 and time 0. The native switch has no ColorChange case and displays **Unknown** for it; the web preserves that source behavior. No G-code command contents are exposed by this overview.

Editor totals are explicitly described as the original native editor formula applied to reprocessed G-code and frozen job properties. A G-code reprocessing timeline can differ from the original GUI's in-memory slicing timeline; the retained GUI file proves native source calculation agreement, not a newly unlocked desktop timeline comparison.

## Isolation, compatibility and errors

New jobs from browser project, calibration-project and ordinary STL/OBJ routes capture resolved native values before asynchronous slicing. Raw 3MF upload does not claim editor palette provenance because the archive can supply different native settings. Existing jobs without a snapshot remain standalone imports. Valid slices are not rejected merely because the bounded Preview context cannot represent their properties; the job records an explicit unavailable reason instead of fabricated defaults.

The helper advertises `editorContextVersion:1`; `editorStatisticsVersion:1` and `customEventOverviewVersion:1` are additive output capabilities. Old helpers still process the G-code, with a clear unavailable editor-context message. The backend cache includes immutable editor metadata as well as G-code bytes and executable identity, copies context before queueing, rejects in-flight changes, and distinguishes identical G-code owned by different jobs. Temporary context files are mode 0600 and share the existing abort/deadline/cleanup lifecycle. Snapshot arrays are bounded to 256 filaments and 10,000 events, with bounded numeric/string fields and a 2 MiB direct-helper context file limit.

## Verification

- Independent `tests/fixtures/native-editor-reference.cpp` is generated from original functions, compiled separately from production, and hash-bound to four pinned source files. It tests native summary precision, seven smart-default transitions, event lookup/timing and time-format boundaries.
- New native tests process both the retained genuine GUI export (29,021 render vertices) and the two-filament source-command fixture (42 vertices). Exact original editor summary and event values match. Additional tests cover project event palette precedence over conflicting G-code metadata, snapshot/tool-count mismatch rejection, direct-executable fractional-ID rejection, and temp-file cleanup.
- 36 unit/API checks passed: 18 new (8 unit, 6 native-preview service, 4 slice-job API) and 18 existing API/cache regressions. These HTTP tests use only fake slicing and the real native configuration helper. Snapshots are verified in the persisted job index and selected-plate event metadata.
- Six new native-helper checks passed. No installed slicer was launched.
- Four new browser checks passed with real compiled native processing, fake slicing and the real installed default hotend asset fixture. They cover exact editor palette/summary/events, view persistence across remount and same/different filament categories, hidden feature retention, and old-helper provenance. Four existing M46 browser checks also passed. Page and console errors are asserted empty.
- The production web build and isolated native build passed. The editor summary/event screenshot was visually inspected; the native values fit in the scrollable sidebar.

Two test-only corrections are retained in the logs: a browser helper initially shadowed Node's `process`, and the first unavailable-context boundary used `100000001`, which native float normalization correctly rounded to `100000000`. The latter now tests `1000000000`, beyond the helper limit after native normalization. No assertion was weakened.

## Remaining native Preview work

- All-plate statistics require the original `PartPlate::get_extruders(true)` collection (including object/volume/range/support/custom-tool assignments), complete results for every nonempty plate, original double-volume and float time/cost accumulation, and immutable association of jobs with the entire project and configuration. A used-vertex shortcut or unrelated ready-job sum would be incorrect. This is the next isolated package.
- Imported old jobs and raw archive uploads cannot recover editor palette provenance reliably. Their standalone path remains explicit.
- Native imperial-unit preference UI, wider native legend/layout behavior and fresh unlocked desktop visual/timeline comparison remain open. Slider/camera remount persistence is not claimed by this package.
- Correcting the earlier M46 inventory: `GCodeViewer.cpp:4312–4341` comments out the **partial event-time table's** headers, loop and append calls. It is inactive in the pinned source and is not a required UI parity gap. The distinct active Custom G-code overview is implemented above.
- The original Filament Display checkbox remains an inactive callback; no speculative toggle is introduced.
