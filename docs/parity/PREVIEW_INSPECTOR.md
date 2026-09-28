# Native Preview legend and G-code inspection

This staged increment implements native line-type colors and role visibility, plus a G-code source window synchronized with the existing interpreted motion and layer range. Preview remains partial. It is not a replacement for the native GCodeProcessor, and it does not certify complete native rendering or timing equivalence.

## Pinned source

All references are OrcaSlicer commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`, the pinned 2.4.2 source:

- [libvgcode ViewerImpl.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L283): the normal Preview's 20 default role RGB values and role order; travel color at line 307. Layer/range changes and visibility updates are at lines 1329,1442,1728.
- [ExtrusionEntity.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/ExtrusionEntity.cpp#L583): role labels used in native G-code and the legend.
- [GCodeViewer.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GCodeViewer.cpp#L764): numbered source window, selected command context and token colors. The current vertex's original `gcode_id` is passed at line 1601; role checkboxes are at line 3885.
- [GCodeProcessor.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCode/GCodeProcessor.cpp#L3838): a spatial negative-E move is Travel, while stationary retraction is a separate event. Existing web moving-retraction segments therefore use native travel blue. No new event classification was added.

`tests/fixtures/native-preview-palette.json` was extracted from the C++ RGB declarations and role labels independently of the runtime constants. It includes source SHA-256 values. Regenerate it with `node scripts/extract-preview-palette.mjs /path/ViewerImpl.cpp /path/ExtrusionEntity.cpp`; the generated JSON must byte-match the fixture. The brighter hard-coded colors in `GCodeViewer::load_as_preview` are a distinct preparation/thumbnail path; the normal Preview resets to the libvgcode palette at GCodeViewer.cpp:1271.

## Implemented behavior

- Every actual extrusion role present in the loaded G-code gets a checkbox and its native RGB value, in native enum order. Unknown external role labels retain their names and use the native Undefined color. Show-all and hide-all operate on actual present roles.
- Filters apply in all existing color modes. Each filtered segment retains its original parsed index. Toggling a role during a scrubbed range cannot advance the selected command to an unrelated later command; restoring the role restores its former position. A cursor at the full extent follows all selected roles. Layer-range changes reset to the full selected range, and visibility changes pause playback.
- The raw source window follows the last displayed motion's original one-based source line. Arc subdivisions retain the same original command line. Source context includes non-motion commands, all semicolon comments and original whitespace; React text rendering prevents embedded markup from executing.
- Empty files, fully hidden selections and ranges without visible motions have no invented active line. Raw source context can still be inspected when the file has no spatial motion.
- The parser retains source only when `includeSource: true` is requested. Its output otherwise remains unchanged. Source retention adds `source.lines`, `source.complete`, and `source.processedThroughLine`; it does not alter positions, extrusion, arcs, tools, metrics or native header estimates.
- The source pane is adjacent to the viewport and sidebar at desktop widths, keeping the selected line visible while the legend scrolls. Smaller viewports stack the panes. This layout has been visually inspected, not certified as pixel-identical to the native GUI.

Counts beside role names are explicitly **parsed extrusion segments**, not native role times, percentages or material usage. Only estimates actually present in G-code headers are displayed.

## Bounds

The existing browser download remains capped at 25,000,000 bytes; parser defaults remain 25,000,000 characters, 1,000,000 lines and 200,000 segments. Retained source follows the existing line/character limits. A segment limit can stop interpretation before the retained raw source ends; `processedThroughLine` records that boundary and unparsed context is never selected as a motion.

The visible source window defaults to 25 rows and is bounded to 1–81 rows. Each line displays at most 4,096 characters (helper maximum 16,384), with a visible truncation notice. Downloading G-code retains access to the complete artifact. Short files and beginning/end windows use explicit clamping. Unlike the native 55-character display truncation, the web inspector preserves longer source text and every semicolon comment; this is an intentional presentation difference, not a parsing expansion.

## Evidence

The reused fixture `tests/fixtures/native-gui-shrink98-2.4.2.gcode` is a genuine export from the installed 2.4.2 GUI, captured by the root agent on 2026-09-27. See `tests/fixtures/native-gui-shrink98-provenance.md` for its paired 3MF and capture details. G-code SHA-256 is `79399a156dc3cc43279242e832db5a74dd5426228303ed3a6eeef8bcc220337e`.

It contains 102 printed layers ending at Z20.4, 8,022 parsed spatial segments, 13,746 source lines and eight rendered native roles. Tests verify every parsed motion references an actual G0/G1/G2/G3 source line; layer 50's final rendered command is source line 6360. The include-source result, after removing only the new source metadata, deep-equals the previous parser result. The known GUI-versus-CLI shrinkage/layer-count discrepancy documented with the fixture is unchanged by this work.

Focused verification:

- 20/20 unit checks: six new Preview tests plus 13 existing G-code tests and one existing tool-command regression. These cover extracted palette agreement, source preservation, geometry-output identity, native GUI fixture mapping, arcs, role filtering, raw comments, invalid bounds and source/display caps.
- 8/8 browser checks: four new inspector/filter cases plus four existing Preview workflows. They verify actual canvas draw-count/source-line state, source escaping, layer/playback synchronization, native fixture roles and commands, empty output, missing estimates, failed downloads and cancelled jobs. The browser uses a fake job adapter to serve the genuine fixture; it does not claim to have performed a new native slice.
- Production Vite build passes. Existing OCCT browser externalization and large-chunk warnings remain.
- An earlier two-worker run had two timeouts during initial model loading, before Preview assertions. The parent reported system idle sleep and enabled a temporary idle-sleep inhibitor. The subsequent serial focused run passed all eight cases in 18.5 seconds with no skips or retries; it did not weaken assertions.

The staged screenshot `test-results/preview-browser/preview-inspector-actual-n-ebeaa-act-selected-layer-commands/native-preview-inspector.png` shows the real fixture at layer 50 with the highlighted command and exact role colors.

## Remaining native parity gaps

Keep `preview.toolpath`, `preview.layers`, `preview.color-modes`, `preview.legend`, `preview.playback`, `preview.estimates` and `preview.gcode` partial. This increment does not add native extrusion-width geometry, all native scalar color modes, independent wipe/retract/unretract/seam event markers and visibility, native per-role time/material/percentage statistics, a second move-range endpoint, native machine envelope/marker overlays, persisted GUI visibility preferences, or complete native framebuffer/pixel equivalence. G-code inspection is read-only and follows spatial motions; selecting arbitrary non-motion commands to control playback is not implemented. No printer or physical print was used.
