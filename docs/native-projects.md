# Native OrcaSlicer projects

The 3MF implementation follows OrcaSlicer 2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- [bbs_3mf.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp): native metadata filenames, object/part settings, plate membership and layer-event XML.
- [Model.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Model.cpp): exact volume-type strings (`normal_part`, `negative_part`, `modifier_part`, `support_enforcer`, `support_blocker`).
- [PartPlate.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/PartPlate.cpp) and [PartPlate.hpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/PartPlate.hpp): plate origins use `ceil(sqrt(count))` columns and 1.2 times the bed width/depth; maximum 36 plates.
- [CustomGCode.hpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/CustomGCode.hpp): layer-event kinds, modes and field meanings.
- [PrintConfig.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintConfig.cpp): purge-matrix defaults.

## Shared module contract

`importNative3MF(bytes, { filename, limits })` returns the existing Orca Web project shape plus:

- `nativeSettings`: serialized native global settings.
- `nativePresetNames`: printer/process names and ordered filament names.
- `nativeImportWarnings`: unsupported or omitted metadata.
- Each part has `filamentSlot` (one based), `printable` and `native` metadata: group/object/part/instance identifiers, native object name, part role, object settings and part settings. Object/part setting values use native serialized scalar representations.
- Plates retain native metadata and `layerEvents = { mode, items }`. Event items contain `printZ`, source enum `type`, `extruder`, `color`, `extra`, and optional informational `gcode`.

Geometry is baked into editable plate-local surfaces. Source component transforms and instance placement survive, though their original decomposed transform representation is not retained. `exportNative3MF(project, { settings, allPlates, includeWebProject })` rebuilds native object components and metadata. Native settings are project data; callers must validate them before execution. `validateNativeArchiveSafety` rejects embedded host post-processing hooks in every supported settings carrier before raw 3MF reaches the slicer. Layer event text is only serialized printer G-code, never executed as a host command.

`nativeSettingsFromSelection` merges resolved printer/process presets and ordered filament profiles. Each filament profile must contain one value per vector option. Per-extruder-variant profile vectors need explicit future mapping and are rejected rather than truncated. New filament selections receive the source default 140 mm³ load/unload volumes and 280 mm³ off-diagonal purge matrix, sized to the actual slot count for each physical nozzle; imported projects retain their own purge values and per-nozzle multipliers. See [physical nozzle purge tables](multi-nozzle-purge.md).

## Evidence

The native acceptance tests use an isolated data directory, real installed version 2.4.2, and no external settings when slicing exported native projects:

- A fresh native-exported cube and its web roundtrip produce **10,989 identical motion commands** with embedded 0.16 mm layer height and 70 mm/s outer-wall speed.
- Two plates retain all five part roles and placements, including a through-hole negative volume and an infill modifier. Native re-export retains object wall count, part speed and modifier density. Plate 1 consumes both filament slots; plate 2 consumes only slot 2. Its G-code uses plate-local coordinates.
- Pause, custom, template and color-change event metadata survives native re-export. Pause/custom/template printer commands appear in G-code, with tested custom/template heights. Native 2.4.2 has its ColorChange command branch disabled in GCode.cpp; metadata preservation is verified without claiming a missing native command is emitted.

## Remaining limits

Painted triangle segmentation, variable layer-height profiles, height-range settings, brim ears, cut connectors, auxiliary assets and filament sequence metadata are not yet edited or re-exported. Import reports these limitations. Assemblies with separate editable parts are preserved by native group identifiers; this does not constitute CAD Boolean editing. Multi-plate exports are supported, while a slicing job should select one plate until the job store supports multiple independent outputs.

## Headless and GUI-dependent acceptance

`tests/native/native-project.test.js` verifies server preparation with pure installed-native slicing: embedded settings retain identical motion commands, explicit catalog edits reach G-code, each selected plate produces one output, negative volumes remain holes, a density modifier changes filament use, and two filament slots remain assigned. The reference fixture was created by native 2.4.2.

`tests/native-gui/` contains fresh native 3MF export and native re-export checks because the macOS CLI initializes Cocoa/OpenGL for archive thumbnails. The three project re-export tests passed before a later native export crash triggered macOS crash recovery. The latest rerun is blocked by a persistent-state recovery dialog while the Mac is locked; it is not counted as a current pass or silently skipped. Headless slicing continues to pass.
