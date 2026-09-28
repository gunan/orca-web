# Native G-code processing and preview

The web preview can now run the pinned OrcaSlicer 2.4.2 native imported-G-code pipeline. This advances preview parity; it does not certify the entire native viewer UI.

## Source and implementation

Authoritative source is [OrcaSlicer commit 8500fcd](https://github.com/SoftFever/OrcaSlicer/tree/8500fcdccaa10b5099ac20d252af3a7c560046f1): `src/libslic3r/GCode/GCodeProcessor.cpp`, `GCodeReader.cpp`, `src/slic3r/GUI/LibVGCode/LibVGCodeWrapper.cpp`, and original `src/libvgcode` Layers, ExtrusionRoles, PathVertex, ColorRange, ViewerImpl geometry/range functions. The build manifest pins hashes; extraction refuses modified source. Native normal/available stealth timing, role time/material, acceleration-aware actual flow, layer time/log colors and arc/phantom render vertices come directly from those compiled functions.

The worker uses `process_file` rather than a replacement parser or an approximate planner. CLI slice-info metadata was audited earlier and only supplied totals; it did not provide the required native per-layer/per-role timing. This helper closes that data gap by running the actual processing pipeline.

The UI maps each displayed segment to explicit native start/end vertex IDs and a native source-line ID. Native IDs are never interpreted as indices into the older source-only spatial parser. Endpoint colors and solid geometry use native vertex IDs, including acceleration subdivisions and arcs. File bytes are SHA-256 checked against the downloaded raw source before the UI accepts processed output. Layer filtering, feature visibility, playback and raw-command inspection retain that mapping.

Native role rows show seconds, percentage of viewer motion time, filament meters and grams. Processor total, viewer accumulated total, preparation, first layer and selected layer are shown separately; original file-header estimates are labeled separately too. Layer-time colors and logarithmic legend values are emitted by C++, avoiding JavaScript `log`/float differences. The existing source-only preview remains usable with an explicit reason when the helper is missing, fails or is bounded out. Native timing options remain disabled in that fallback.

## Evidence

The existing fixture `tests/fixtures/native-gui-shrink98-2.4.2.gcode` is a genuine native GUI export with its retained provenance and 3MF. SHA-256: `79399a156dc3cc43279242e832db5a74dd5426228303ed3a6eeef8bcc220337e`.

| Check | Native result |
| --- | --- |
| Processor moves / render vertices | 21,543 / 29,021 |
| Displayed native spatial paths / solid extrusion paths | 21,026 / 18,776 |
| Retained stationary events / layers | 513 / 102 |
| Processor normal time | 2,538.206298828125 s, matching the 42m18s file header |
| Viewer float-accumulated time | 2,538.174072265625 s; retained separately |
| Native layer 50, Z10 | 8.769728660583496 s |
| Per-role material sum | 1,423.12 mm / 4.24 g after header precision rounding |
| Full-engine versus source-only known scalar rows | All 6,896 match exactly after the double-delta correction |

A synthetic native-processed arc fixture verifies real subdivisions, stationary retract/unretract events, source IDs, deterministic reruns and pressure-advance availability. A real-worker HTTP test checks owned-ready source hashing, cache and deletion. Browser tests generate native output at test time, then check actual-flow/solid paths, native vertex cursor/source synchronization, layer-time values/log ranges, role statistics and explicit mismatch/missing-helper fallback. Existing source-only parser/inspector/solid-renderer tests explicitly select that fallback and remain meaningful.

The durable build was compiled separately from the original prototype and passed the same native acceptance. No printer was contacted or physically exercised.

## Negative evidence and boundaries

The first full-engine comparison exposed a shared error in the earlier JavaScript helper and its small C++ scalar replay: native `AxisCoords` deltas are double, not float. Premature rounding caused 570 of 6,896 rows to differ by roughly one float ULP. Both fallback implementation and replay were corrected against the full native processor; the permanent acceptance comparison catches this class of mistake.

The source processor leaves pressure advance uninitialized before the first explicit setter. The helper zero-initializes static storage to prevent undefined C++ behavior, and reports the value as unavailable before the first valid native-recognized setter. For the genuine fixture, all rows before line 428 are null, then native 0.026 float values are available. This deliberate availability difference is documented rather than presented as fabricated source data.

Stationary events are retained but their viewport markers are still missing. Native travel/wipe paths are currently lines, while extrusion paths use the native solid shader. Native speed, fan, temperature, pressure, acceleration/jerk and other GUI views/visibility commands are not all exposed by this UI yet. Full native preview shortcut/layout/slider/marker parity remains open. This pipeline models native imported G-code behavior; firmware macros, physical machine behavior and leveling are not independently simulated.

An independent reloaded native GUI timing capture is still pending because the desktop was locked. The genuine GUI-export header, compiled-source functions, real worker, shader and browser checks above are completed evidence; no unperformed GUI or hardware comparison is claimed.

## API and resource limits

`GET /api/jobs/native-preview/capabilities` reports real helper availability and identity without requiring a job. `GET /api/jobs/:id/native-preview` accepts only an owned ready job and reads its owned regular output file without following symlinks. The response binds native output to source SHA-256/byte length and binary identity. Files are not rewritten.

One active worker plus four queued jobs, bounded source/output bytes, vertex/move counts, a whole worker-operation deadline including queue wait, subprocess console output, cancellation and shutdown prevent unbounded work. Coalesced subscribers share processing; aborting one leaves others alive, aborting all stops the subprocess. Eight-entry/64 MiB LRU caching is keyed by actual bytes and executable identity; a changed helper during work rejects the result. Deletion cancels matching work and invalidates cache. Every success/error/timeout/cancellation path removes private temporary files.
