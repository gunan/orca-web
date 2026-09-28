# Native Filament and Summary Preview — M46

This tranche is **partial Preview parity** with pinned OrcaSlicer 2.4.2 commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It adds native Filament (`ColorPrint`) and Summary views, native material categories and change counts, and the native Feature-view visibility reset. It does not certify the complete native legend or its pixels. No desktop unlock, printer connection or physical print was used.

## Implemented source contracts

- `libvgcode/ViewerImpl.cpp::get_vertex_color` and `Layers.cpp`: Summary and ColorPrint use native `color_id` modulo the native palette. Travel uses the same palette. Wipe and stationary option markers retain their original colors. A layer containing PausePrint or CustomGCode is gray; ColorChange by itself does **not** gray the layer.
- `Plater.cpp::get_extruder_colors_from_plater_config` / `get_colors_for_color_print`, `GUI_Preview.cpp` lines 681–688, and `LibVGCodeWrapper.cpp`: the standalone-import provider uses `result.extruder_colors`, appends original ColorChange colors, then adds the gray sentinel if any custom G-code item exists. Native conversion includes its minimum-channel brightness of 48. The additive helper field `colorPaletteSource: "native-standalone-import"` names this path.
- `GCodeProcessorResult::print_statistics`: the helper exports native model, support, flushed, tower and total volume maps, plus filament and tool-change counts. These are actual processor values, not inferred scene volume. `materialStatisticsVersion: 1` gates the new data.
- `GCodeViewer.cpp` material loops and `get_used_filament_from_volume`: only used extrusion tool IDs become rows. A native map entry controls category visibility, including an explicit zero entry. Length uses diameter and volume; grams use density. Missing entries for an otherwise displayed row are zero. Native per-row totals accumulate in **float32**; column totals accumulate in **double**. Both metric and imperial calculations are independently tested; the current UI follows the existing metric Preview.
- `Plater.cpp::load_gcode_file`: imported G-code cost sums native total-volume entries, density and filament cost, including entries not associated with a displayed extrusion row. It is distinct from summing the visible table cells.
- `GCodeViewer.hpp::reset_visible`: returning to Feature view restores all extrusion roles. Other view changes keep current role visibility.
- `GCodeViewer.cpp::load`: the initial category is Filament for more than one used extruder, otherwise Feature. See the view-persistence limitation below.

## Data provenance and limits

The Summary shows length and weight explicitly as **file metadata**. Native GUI editor Summary normally reads the current plate's `PrintStatistics`; the worker's independent G-code import does not have that editor object. We retain existing header metadata when present and show Unavailable when absent. Cost follows the native imported-G-code loop. Total time comes directly from the native processor's selected time mode. No guessed mass, duration or missing price is substituted.

Material maps and tool/filament IDs are bounded to 256 entries / IDs 0–255, volume to finite 0–1e12 mm³, and change counts to uint32. The helper rejects a color-change palette exceeding 256 colors before serializing it. Existing native input, move, vertex, runtime and output-size limits still apply. An older helper without the optional material capability keeps Filament colors, shows explicit unavailable accounting, and disables Summary. The source-only fallback exposes neither new native view. Unknown filament properties remain unknown.

The native editor's palette provider uses `project_config.filament_colour`; the standalone importer may retain its native default orange despite a differing embedded configuration color. This implementation deliberately preserves the standalone provider and labels it. Binding a validated editor palette to a ready job remains a parity gap; silently reading native account or project state is not a substitute.

Native amounts use separate length/weight lines when additional categories are present; change counters use the original truncating K/M/B format. The six-column material table expands its desktop sidebar when needed and remains horizontally scrollable on narrower windows. Counts and usage describe the whole file; changing visible layers, roles or command range does not recompute those native totals.

## Independent evidence

`scripts/generate-native-filament-reference.py` verifies the pinned checkout and hashes the original files. It compiles the original vertex-color function, layer flags, material conversion and accumulation loops, compact-weight/count formatting, imported-cost loop, and ColorPrint palette provider. Small adapters supply native-shaped inputs and serialize outputs. Original source snapshots are retained in `tests/fixtures/native-filament-reference.cpp`, with source hashes and outputs in its paired JSON.

- The retained genuine GUI export `native-gui-shrink98-2.4.2.gcode` keeps its existing provenance and SHA-256. All **58,042** Filament/Summary native vertex colors match the compiled original RGB streams exactly. Native material amount, float row totals, double category totals and imported cost match the compiled source.
- `native-filament-commands.gcode` is explicitly a **synthetic command fixture**, not a slicer export. Its helper supplies the retained GUI file's full real configuration because Orca correctly rejects a suspiciously incomplete configuration. The real processor handles two filament diameters/densities, model/support/tower/flushing commands, one filament change, a ColorChange and a pause. All category volumes also match independently counted commanded E lengths within 2e-5 mm³; rendered colors and UI values match the original source outputs.
- Separate provider cases cover no custom items, pause-only, and color-change/custom items. A 260-event case confirms explicit palette-bound rejection.
- Browser cases replay the actual native-processor outputs, complete the owned ready-job fixture with the real installed default hotend, and enforce both page-error and console-error checks. They verify native automatic initial mode, every material cell, whole-file totals after scrubbing, Feature reentry visibility, genuine-GUI-file Summary, older capability handling, and source-only fallback. The table is checked for desktop overflow. Existing tool-position/actual-speed/seam browser regressions also passed.

Focused validation at handoff: **16 unit tests + 4 native tests = 20 passed**; **4 new browser cases passed**, and **3 existing native tool-position browser regressions passed**. Native helper rebuild and web build passed. These are staged focused results, not a new full-repository milestone. Browser replay is not fresh side-by-side native GUI certification.

## Remaining native Preview gaps

- Editor project-palette binding; preserving a manually chosen view across same-category file loads and Prepare/Preview remounts.
- Native pause/color-change partial-time sections, all-plate Summary, editor PrintStatistics totals, and all other legend sections/actions not implemented here.
- Imperial unit preference wiring, complete legend folding/layout/hover behavior, screenshots and pixel comparison against an unlocked native desktop.
- Existing documented shell/bed/editor-object and other Preview gaps remain. Current row rendering is not a claim that all native Preview controls are complete.
- The pinned Filament Display row is **not** a required visibility-toggle feature: the original call passes `checkbox=false`, `visible=true`, and an empty callback. No extruder-visibility API exists in this libvgcode path. An invented toggle would not establish parity.

## Reproduction

Build the helper with `ORCA_GCODE_BUILD_DIR` pointing at an isolated output directory and the existing pinned source/dependency environment. Run the tests with `ORCA_GCODE_WORKER_BIN` pointing at that binary and `ORCA_RESOURCES_DIR` at the installed resource directory. The paired build manifest must travel with the binary.

For fresh source captures, run the worker on the retained GUI fixture and on the result of `nativeFilamentTestInput()`, then call:

```sh
python3 scripts/generate-native-filament-reference.py "$ORCA_SOURCE_DIR" /path/gui-native.json /path/commands-native.json
node --test tests/unit/native-filament-preview.test.js tests/native/native-filament-preview.test.js
```

Run the new browser file through the real-native browser configuration. It requires the actual native G-code helper; no fake native fallback or test skip is used.
