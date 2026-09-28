# Native Preview tool position and speed profile

This tranche implements the active OrcaSlicer 2.4.2 sequential-playback hotend marker, ToolPosition properties and actual-speed profile. The installed native default and printer-specific hotends are selected through the [job-bound asset service](NATIVE_HOTEND_ASSETS.md). Full desktop visual certification and the remaining statistics/views listed below are still incomplete.

## Source scope audit

The pinned revision is `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

**Center of gravity is not an active release feature.** [`Types.hpp:8`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/include/Types.hpp#L8) defines `VGCODE_ENABLE_COG_AND_TOOL_MARKERS` as 0. This excludes the libvgcode CoG marker and its separate debug tool-marker controls. It must not be tracked as an unmet normal-release control on the strength of those excluded functions.

The actual release hotend uses [`GCodeViewer::SequentialView::Marker`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GCodeViewer.cpp#L233), independent of that macro. It is loaded through the printer model's hotend resource, with `resources/profiles/hotend.stl` as the normal default. A stylized arrow is only the empty-filename path, so the web does not substitute a generic arrow for the native default hotend.

[`Technologies.hpp:52`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Technologies.hpp#L52) enables `ENABLE_ACTUAL_SPEED_DEBUG` as 1. Despite the macro's name, this makes the expandable actual-speed profile a real supported release control.

## Implemented native behavior

- The 560-triangle default hotend asset is copied unchanged from the installed application. Its flat face normals follow original `face_normal` and `face_normal_normalized`, including both normalization passes. Original `gouraud_light` shader equations, native white color and 0.5 alpha are retained. The marker rotates by pi around X and translates by its native model height plus 0.5 mm above the original selected vertex. Toolpath coordinate conversion happens once after that model transform.
- The marker starts hidden. Moving the native command endpoint below the current full range activates it, and it remains active when returning to the end. Native vertex IDs remain distinct from spatial segment IDs, and changing a color mode never redirects the marker to the property fallback vertex.
- ToolPosition gives native XYZ precision, speed, mode detail, and an expandable table of Type, Line Type, Width, Height, Layer, Speed, Acceleration, Jerk, Flow rate, Fan speed, Temperature, Pressure Advance and Time. Width/height/flow are N/A for nonextruding records. Tool and layer numbers are displayed one-based as in the native panel.
- Outside Feature view, a selected seam uses the immediately preceding native vertex for the properties, matching the original source. The 3D marker stays on the selected seam's position. This intentionally preserves the native separation between geometry identity and displayed properties.
- Estimated elapsed time accumulates native per-vertex times with float32 rounding in order, as `ViewerImpl::get_estimated_time_at` does. The original native elapsed-time format and printf rounding behavior are retained. No machine elapsed time is inferred.
- The speed profile uses original interpolation vertices sharing the selected source-line ID, includes the preceding endpoint, excludes a trailing seam and compresses duplicate speeds after rounding to 0.1 mm/s. It preserves each point's native internal/external flag. The chart/table hover highlights the corresponding two rows, with native internal-point tinting. The source's last-profile cache is retained at full playback; the profile table explicitly names the source line represented by the cached data.
- Missing hotend assets produce an explicit notice and leave position data usable. Older helpers can still supply exact speed-profile samples, but the plot remains unavailable when their whole-file native Actual speed domain is absent. No local substitute domain is presented as native.

Pressure advance before the first explicit determining command stays unavailable, following the existing worker provenance rule. The pinned processor's initial PA field is undefined; reference comparisons account for this deliberate deviation rather than treating nondeterministic memory as evidence.

## Independent evidence

`generate-native-tool-position-reference.py` verifies the original revision and clean source files, hashes the source, and extracts the original profile-update function, native properties/detail blocks, float elapsed-time function, native face-normal functions and marker model-matrix expression into an independent C++ entry point. Rendering/application plumbing is replaced by a minimal data facade. The native calculations themselves are retained. This reference is not generated by the production JavaScript helpers.

The existing genuine GUI export `native-gui-shrink98-2.4.2.gcode` is reused. Its 127 sampled vertices cover early unknown PA, native interpolations, different layers/roles, Travel/Wipe, and seams. Across 13 views:

- **21,463 property rows** and associated detail/elapsed/source identities match the compiled native reference.
- **446 compressed native profile points** match exactly, including their float positions, speed and internal flag.
- All **560 hotend faces** match native normal calculations within `1e-6`; three native model transforms match within `1e-9`.
- The actual production geometry and original installed vertex shader are run through WebGL transform feedback. All **30,240 position/lighting values** match within `1e-6` for three poses, including negative and large coordinates.

The tests also cover initial marker visibility and persistence, seam identity, unknown PA, float accumulation, decimal tie rounding, invalid/truncated assets, actual-native browser scrubber/property/profile interactions, missing-asset behavior and older-helper domain limitations. No printer connection or physical action occurs.

The first browser hover test targeted a plot clipped by the scrollable property panel; the corrected test scrolls the actual plot into view before moving the pointer. A source audit also caught native profile caching at the final endpoint; the implementation preserves that behavior rather than clearing the last profile.

## Remaining Preview gaps

These are retained for subsequent work, not marked complete by this tranche:

1. Native empty-resource arrow fallback and full desktop resource-path/visual acceptance. Printer/vendor lookup and explicitly configured native vendor-resource overrides are implemented in the job-bound asset service; the UI identifies the selected model provenance.
2. Optional realistic/smooth-normal appearance settings and screenshot-level desktop certification. The shipped flat-normal/Gouraud path is checked; the locked desktop prevents current GUI visual acceptance.
3. Native ColorPrint view, color-change ordering/segments and its partial-time/material legend. Native color IDs are already preserved but this mode is not yet presented.
4. Additional native per-extruder model/support/tower/flush accounting, travel distance/move counts, filament/extruder-change summaries, seam gap/scarf statistics and the all-plates statistics view. Existing role and motion timing remain available; these additional processor statistics are not invented from preview segments.
5. Native partial custom-G-code/pause timing statistics and event-detail workflows beyond the already implemented visible event markers and raw command inspector.
6. Native shell visualization and full camera/theme/layout/legend interaction equivalence, including precise plot/window raster layout. The plot's data/behavior is source-backed; full UI pixel parity is not certified.

The compiled-out CoG/debug-marker settings are expressly excluded from that normal-release gap list.
