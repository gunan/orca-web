# Native Preview scalar modes and data availability

M27 adds **Layer height**, **Line width** and **Flow (mm³/s)** coloring to M25's role filters and source inspector. Values also appear for the selected command. The implementation annotates existing parsed segments without changing G-code geometry, layers, motion classification or estimates. Missing values stay gray and are counted explicitly; a mode with no usable data is disabled.

All native references below use commit `8500fcdccaa10b5099ac20d252af3a7c560046f1` (OrcaSlicer 2.4.2).

## Exact available data

- [GCodeProcessor.cpp3212](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCode/GCodeProcessor.cpp#L3212) reads `;HEIGHT:` and `;WIDTH:` as forced float dimensions. Width is clamped to `max(2mm,4×height)` at line 3947. Untagged dimensions deliberately remain unavailable in this increment, rather than invoking an unvalidated fallback-height/width calculation.
- [GCodeReader.hpp33](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCodeReader.hpp#L33) exposes float words. GCodeProcessor stores double axis positions and deltas, then assigns spatial length and extruded volume to float values; the radius, filament area, extruded volume, spatial length and volume-per-path-length use the pinned operation order at [GCodeProcessor.cpp3830–3947](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCode/GCodeProcessor.cpp#L3830). Flow is the product of commanded feed rate and `mm3_per_mm` in [PathVertex.hpp129](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/include/PathVertex.hpp#L129). This is **commanded volumetric flow**, distinct from Actual Flow.
- Source header/embedded-config filament diameters are used, with the embedded config taking precedence. Missing or invalid diameter data does not silently become 1.75 mm. Leading `Tn` selects a known filament; heater `T` parameters do not. `M221` affects the native motion planner's E-axis limit but does not change the native commanded-flow field, and is tested accordingly.
- Arc flow remains unavailable because native GCodeProcessor uses a different subdivision path. Volumetric-E, unresolved firmware retraction or M1020 filament state, missing feed rate, unknown positions, and the existing geometry interpreter's `G91`/absolute-E disagreement also yield unavailable flow. Native Z-only positive-E moves and wiping are not relabeled as extrusions to provide artificial attributes. Tagged dimensions can remain available when only flow is unsupported.
- Positive finite tags are required. Invalid/non-positive tags clear that attribute instead of retaining stale metadata. Values outside the native float/color-bin domain are not rendered as a fabricated scalar color.

The colors, interpolation, bins, one/two-value behavior and legend order come from [ColorRange.hpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/include/ColorRange.hpp), [ColorRange.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ColorRange.cpp), [Types.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/Types.cpp#L30) and [GCodeViewer.cpp3290](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GCodeViewer.cpp#L3290). Native range binning rounds float products and can differ from ordinary decimal rounding; for example, the 0.6 width bin is `0.5999999642372131`.

Ranges cover the entire loaded file. Hiding ordinary roles or selecting one layer does not change the native scalar range. Hidden Custom excludes its width/flow values, while height continues to include Custom, matching [ViewerImpl.cpp1818](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L1818).

## Native timing and statistics audit

The installed CLI advertises `--export-3mf` and `--export-slicedata`. Source and an actual 2.4.2 run confirm these interfaces do not supply the missing planner data:

- [bbs_3mf.cpp8156](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp#L8156) writes `Metadata/slice_info.config`: total prediction, first-layer time, per-filament totals and other plate information. It does not write per-motion or per-role timing arrays.
- `--export-slicedata` calls [Print::export_cached_data](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Print.cpp#L4652), exporting layer geometry, regions, support and first-layer groups. These are not GCodeProcessor move-time results.
- Native [ViewerImpl.cpp1004](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L1004) accumulates actual move-time arrays into total/role/layer statistics. GCodeProcessor accounts for acceleration, axis limits, junction behavior, pauses and machine-specific commands. Dividing distance by nominal feed rate cannot reproduce those values.
- Native legend role material usage comes from `used_filaments_per_role` in GCodeProcessor/PrintEstimatedStatistics. This increment does not relabel raw E sums as native role material totals.

The acceptance case generated 6,698 known linear flow values and 100 cached geometry layers. It inspected both genuine exports and found the expected total/first-layer and geometry data, with no per-move/per-role timing. An initial probe placed `--export-slicedata` after `--slice`; native completed slicing but created no cache. Moving the export action before `--slice` produced the documented cache. The regression uses the working order.

Actual Flow and both Layer Time modes remain explicitly unavailable while the native processing worker is pending. Per-role time, percentage and material statistics remain absent. They are required parity work, not permanently excluded scope. The M28 native-worker investigation covers the common libslic3r/toolchain prerequisites for a faithful GCodeProcessor entry point.

## Evidence and reproducibility

`tests/fixtures/native-preview-scalars.json` includes the pinned source hashes, 50 reference color cases, 16 float-bin boundaries, six commanded-flow cases, and a binary hash plus sampled rows from **all 6,896 tagged linear extrusion commands** of the genuine GUI export `native-gui-shrink98-2.4.2.gcode`. The independent C++ replay uses float G-code words and source operation order; every row's line, height, clamped width, flow and volume-per-path-length matches exactly as 32-bit values. The GUI fixture's existing provenance and SHA are reused, without duplicating the large G-code file.

`native-preview-scalars-reference.cpp` compiles against **unmodified** pinned `ColorRange.cpp` and `Types.cpp`. The separate attribute reference is a narrow independent replay/formula oracle for this known fixture, not a complete GCodeProcessor. Regenerate the checked fixture with:

```sh
node scripts/generate-preview-scalars.mjs /path/to/flattened-pinned-source-cache > regenerated.json
cmp tests/fixtures/native-preview-scalars.json regenerated.json
```

The generator requires clang++ and the source filenames recorded in the fixture plus `Types.hpp` and `Utils.hpp`. It validates recorded source and GUI hashes, builds in a new temporary directory, and never downloads source or executes G-code. Source ports retain the native AGPL provenance.

Focused verification includes eight new unit cases, one installed-native case and three new browser cases. The combined unit suite passes 28 checks. The eight existing Preview browser checks also pass; two initial new-browser assertions were corrected: the expected native float display is 4.810565 rather than 4.810564, and native `<option disabled>` is asserted by its DOM property because this Playwright version's enabledness matcher reports the enclosing select's state. No runtime correction or weaker value comparison was used to hide those assertion mistakes. The final production build passes; all 11 focused browser cases pass in 12.5 seconds with no skips or retries.

## Subsequent extrusion-volume rendering audit

Current rendering is `THREE.LineSegments`. Native libvgcode does not simply render circular cylinders. [SegmentTemplate.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/SegmentTemplate.cpp) uses eight logical vertices and eight triangles per segment. [Shaders.hpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/Shaders.hpp#L50) constructs width/height offsets in the line frame, chooses horizontal/vertical faces based on the camera, and builds endpoint/junction spikes from signed turn angles. It has vertical-line handling, optional cap/twisting macros, native lighting and wipe/option Z bias.

[ViewerImpl.cpp925](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L925) provides continuity flags and per-endpoint dimensions/turn angles; extrusion centers move down by half their height so the top remains at commanded Z. An accurate next increment needs that source vertex/continuity mapping, the shader behavior, separate native event types, and geometry/pixel references across corners, variable width/height, arcs, travel, wipe, seams and camera views. A generic tube mesh would not establish native parity. No extrusion-volume runtime was added in M27.

Keep the existing Preview feature statuses partial. No printer connection or physical print was used.

## Full native processor precision correction

The later headless GCodeProcessor build exposed a precision error in the original fallback and its independent replay fixture: both rounded `AxisCoords` deltas to float too early. The native type is `std::array<double,4>`. Of 6,896 GUI reference motions, 570 differed by approximately one float ULP. The fallback and the two reference programs now retain double deltas through squared-distance and extruded-volume expressions until the native float assignments. All 6,896 rows then match the compiled full pinned GCodeProcessor exactly for dimensions, linear flow and commanded flow; the existing eight scalar unit tests pass with regenerated references. M33 adds the full-processor comparison as a native test so this shared mistaken assumption cannot recur unnoticed.
