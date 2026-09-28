# Native process setting metadata

The generated [schema](../../shared/native-process-schema.json) covers all **355 FFF process preset keys** declared in OrcaSlicer 2.4.2's `Preset.cpp`. Of those, **342** have controls in `TabPrint::build()`. Native pages, section names and control order are preserved. This is process metadata; printer and filament schemas are separate work.

The source is the official [OrcaSlicer repository](https://github.com/OrcaSlicer/OrcaSlicer/tree/8500fcdccaa10b5099ac20d252af3a7c560046f1), pinned to commit `8500fcdccaa10b5099ac20d252af3a7c560046f1` (tag `v2.4.2`). File paths and SHA-256 digests are recorded in [the source manifest](../../scripts/native-schema-sources.json). The upstream [AGPL-3.0 license](ORCASLICER-LICENSE.txt) accompanies the derived metadata.

## Reproduction

Fetch the pinned sources, validate every hash, and regenerate:

```sh
node scripts/generate-native-schema.js --download
```

For sources already downloaded into one directory, use its absolute or relative path:

```sh
node scripts/generate-native-schema.js --source-dir /path/to/source-files
node scripts/generate-native-schema.js --source-dir /path/to/source-files --check
```

Regeneration never reads preset unions to infer a type, range, label or default. It extracts literal C++ option definitions, enum maps, the authoritative process membership list, and native UI layout. It fails on missing members or source hash changes. Unsupported metadata expressions remain explicit under `unresolved`; all 355 current process definitions have zero unresolved metadata expressions.

## Runtime contract

[native-settings.js](../../shared/native-settings.js) exports:

- `settingDefinitions`: all 355 source definitions, with native type, label, tooltip, mode, bounds, default, source location and dependency references. Enum `options` are native strings, with `optionLabels` mapping to native labels.
- `editableSettingDefinitions`: the 342 native UI controls in native order. The 13 internal/profile metadata entries are excluded from runtime editing.
- `settingGroups`: native page names mapped to ordered rows. Each row's `ui.group` is the native section title.
- `normalizeOverrides(values, { allowPostProcess = false })`: native scalar serialization, closed enum validation, integer/range validation, percent and float-or-percent support, vector preservation and bounded text. Profile plumbing is rejected. Host post-processing scripts are rejected unless a caller explicitly opts in; the HTTP server must leave that opt-in disabled until its origin/authentication and host-command authorization behavior is implemented.
- `displayedSettings(preset, { includeDefaults = false })`: sparse display values by default, preserving the original helper's behavior. `includeDefaults: true` fills absent editable values from authoritative native defaults. Native vectors stay arrays; scalar options represented as extruder variant arrays show the first value as before.

For native vector overrides, the preset resolver must replace the vector with the normalized array. It must not repeat the whole array into every existing element. Scalar overrides can continue updating every existing extruder variant.

Zero layer heights and bridge flow ratios are rejected according to `FullPrintConfig` validation, with explicit validation source locations. Numeric bounds otherwise follow the source; earlier arbitrary web-only bounds are not retained.

## Remaining behavior

This metadata export does **not** implement native conditional visibility, enablement, cross-setting corrections or all context-sensitive validation. `ConfigManipulation.cpp` references are attached per setting as evidence for that work. For example, spiral vase mode imposes constraints on walls, infill, top layers and support; line width validation depends on the selected nozzle. Those relationships must be ported before claiming complete settings parity.

The installed engine remains the final validator for a resolved slicing configuration. Its errors must continue to surface as failed jobs with diagnostics.
