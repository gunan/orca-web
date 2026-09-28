# Native height-range settings

Status: partial parity. Browser editing, native 3MF import/export, bounded server validation and local OrcaSlicer 2.4.2 slicing are implemented and tested. Native desktop interaction and visual equivalence are not certified. No printer was contacted.

## Native contract and precedence

Each model object carries `native.layerConfigRanges: [{minZ, maxZ, settings}]`. All parts in one object group carry the same list. Settings use native serialized values; `layer_height` is required and `extruder` defaults to `"0"` (inherit). The editor exposes 148 source-backed controls (147 region controls plus layer height). Filament selection is an additional dedicated control. Global-only options, machine options, support object options, and host post-processing scripts are rejected.

The native file is `Metadata/layer_config_ranges.xml`. Object IDs in this file are one-based model-object indices in first build-target order, independent of component/resource IDs and repeated instances. Export rebuilds the indices after plate filtering. Group members must agree; regrouping adopts the target object's ranges, while making a separate object copies the range values.

Ranges sort lexicographically by start and end. Earlier ranges trim later overlapping ranges; settings are not merged across overlaps. Exact duplicate bounds are rejected by the web boundary rather than silently losing one configuration. Gaps use ordinary settings. For ordinary parts, precedence is global → object → part → material → height range; modifiers subsequently override their parent region. Region selection uses layer slice Z (the layer midpoint), not the top-of-layer display height. Range coordinates are relative to object Z=0, without raft lift. Native layer-height generation preserves its fixed first layer, clips to object height, and uses normal layer height for gaps. Ranges above the object remain stored but have no effect.

Source-backed normalizers preserve scalar/vector and float-or-percent semantics. Range layer height must be positive and respect the selected nozzle's minimum/maximum. A zero native maximum falls back to 75% of nozzle diameter. Missing vector indices use the first value, matching `ConfigOptionVector::get_at`. Application limits additionally cap an object at 1,024 ranges, coordinates at 10,000,000 mm, and range XML at 16 MiB. Structural slicing checks evaluate effective ranges after ordinary part settings; native slicing remains authoritative for geometry-dependent restrictions, including incompatible spiral regions and support scheduling.

The browser provides add/remove, exact start/end bounds, filament selection, search/category selection, required layer height, per-setting inheritance, overlap explanation, cancel, and ordinary project undo/redo. Applying enables the native project pipeline and invalidates previous slicing results through the parent history transaction. Both browser JSON projects and native 3MF retain the ranges.

## Source provenance

Pinned OrcaSlicer 2.4.2 commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- [bbs_3mf.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp#L2886): range XML parsing at 2886; object-index attachment at 2092; writing at 7517.
- [PrintApply.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintApply.cpp#L342): overlap trimming and gaps in `LayerRanges`.
- [PrintObject.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintObject.cpp#L3664): region override precedence, including modifiers.
- [Slicing.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Slicing.cpp#L232): layer-height profile generation, first-layer preservation and object-top clipping.
- [GUI_ObjectList.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GUI_ObjectList.cpp#L3366): required default layer height and extruder; nozzle bounds at 4507–4524. Existing process/region schema provenance remains in `native-object-schema.json` and `native-settings-schema.json`.

## Verification and negative evidence

Focused staged verification: 41 unit/service/parser regressions, 3 browser scenarios, and 4 installed-native tests passed, zero skips. The production build passed. These are focused counts, not a full integrated repository run.

- `tests/unit/height-ranges.test.js`: 10 checks cover source membership, normalization, overlap ordering, fully covered ranges, invalid/duplicate bounds, missing layer heights, unsupported/host settings, nozzle bounds, XML safety, component/resource index separation, multiple instances, selected-plate remapping, group adoption/conflict, server preparation and structural preflight.
- `tests/e2e/height-ranges.spec.js`: 3 scenarios cover editing all grouped parts, native export roundtrip, overlap display, invalid bounds/nozzle heights, inheritance, cancellation, remove, undo and redo.
- `tests/native/height-ranges.test.js`: 4 actual OrcaSlicer cases. All 400 outer-wall moves match independently sliced 30/55/70 mm/s references in XYZ/extrusion and feed within 0.002 mm/min across overlap/gap boundaries. Layer-height bands produce 135 layers with a fixed 0.2 mm first layer, 0.1/0.25 mm bands, and 0.2 mm gaps. A modifier case yields 152 ranged wall segments at 30/45 mm/s and excludes the ordinary part's 90 mm/s setting. Two-filament output uses slot 2 for 80 wall segments inside 4–8 mm and slot 1 for 320 outside segments; native consumption is 1125.15/236.43 mm.
- The first two-filament preview assertion failed because the existing G-code parser treated the `T3000` parameter in native `M204 P… T3000` acceleration commands as a tool-selection command. The native G-code already contained correct `T1`/`T0` selections. A separate parser fix recognizes a leading `T` command, including numbered lines, while preserving tool state for M104/M204/G10 parameters and text commands. `tests/unit/gcode-tool-commands.test.js` captures that regression; the unchanged real-native material assertion now passes.

Remaining parity work: native height-range tree/selection visuals, native automatic gap-fill/split insertion controls, clipboard workflow, adaptive/painted variable-layer-height profile editing, and a desktop-reference acceptance run. Physical print outcomes are unverified. Imported variable-layer profiles are still explicitly reported unsupported in this milestone; they must not be mistaken for height-range XML support.
