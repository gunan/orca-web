# Native settings dependencies

The dependency evaluator is transcribed from OrcaSlicer 2.4.2 commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It does not modify input or silently accept a native confirmation dialog. See the bundled OrcaSlicer license and schema provenance.

```js
import { evaluateSettingsState } from './shared/settings-dependencies.js';
const state = evaluateSettingsState({
  printer: selection.printer,
  process: { ...selection.process, ...normalizedProcessOverrides },
  filament: selection.filament,
  context: {
    ...selection.context,
    isGlobal: true,
    isPlate: false,
    filamentCount: project.filaments.length,
    projectSettings: project.nativeSettings,
    extruderIndex: 0,
    variantIndex: 0,
    supportOverhangsAlreadyQueried: false,
  },
});
const supportStyle = state.fields.process.support_style;
// supportStyle: enabled, visible, reasons, sources, evaluated, optional options
```

Pass resolved native configurations with overrides already applied. Defaults are read from the authoritative schema only when a key is absent. `isGlobal` defaults true; `isPlate` defaults false. The support-overhang query flag belongs to the current editing session: native code asks once during each support-enable cycle. `filamentCount` and project support-filament values are required for support-filament fallback validation. `projectSettings.curr_bed_type` controls filament bed-temperature row visibility; `projectSettings.nozzle_volume_type` selects printer extruder variants. Missing bed selection intentionally shows all temperatures, matching native behavior.

`fields` is keyed by scope (`process`, `machine`, `filament`) and native setting key. Each value has `enabled`, `visible`, `reasons`, `sources`, and `evaluated`. Dynamic menus use `options`. Hidden and disabled settings retain their values. An unevaluated field has no dependency rule applied; it is not a claim of verified full parity. `coverage.unresolved` identifies rules that cannot be evaluated without native context.

Machine extrusion fields also expose `indices[physicalExtruderIndex]`, including `variantIndex` resolved from native `printer_extruder_id`, `printer_extruder_variant`, `extruder_variant_list`, `extruder_type`, and project nozzle-volume selection. Incomplete ID maps use the native generated-map fallback. A variant mismatch remains unresolved. Scalar field flags reflect `context.extruderIndex` (default 0). Motion-limit arrays use native common enablement across normal/silent motion modes.

Nullable filament retraction/ironing fields expose `indices[variantIndex]` with `overrideEnabled` (checkbox enabled), `overrideChecked`, and `inheritedValue` when the unchecked control displays a printer/process value. Scalar flags reflect `context.variantIndex` (default 0). Inheritance display is presentation only: never save `inheritedValue` as an explicit override. Other filament controls follow native index 0, except the volumetric-fit and EC-retraction controls which follow the selected variant.

Corrections contain scope/key/value/reason/source plus a mode:

- `automatic`: native code changes this setting without asking.
- `acknowledge`: native code shows a warning before resetting the setting.
- `confirmation`: native code offers a choice. Related corrections share a `group`; `alternative` is the change used when the user declines the group.

A caller must explicitly apply accepted values and reevaluate. Do not treat a correction as an error or apply confirmation/acknowledgment groups silently. These source methods currently return GUI warnings and correction proposals; the `errors` array is reserved. Slicing validation remains the responsibility of the native engine and the schema validators. Some corrections target native non-UI fields, such as `enforce_support_layers`, and need the native scoped validator rather than the UI-only override whitelist.

## Implemented source rules

- [ConfigManipulation.cpp:594–1014](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/ConfigManipulation.cpp#L594): every process control toggle, preserving native overwrite order. This includes supports, ironing, infill patterns/rotation, vase, walls/line widths, accelerations/jerk, skirts/brims, prime towers, smoothing, fuzzy skin, Arachne, scarf, interlocking, and vendor/capability conditions.
- [ConfigManipulation.cpp:220–568](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/ConfigManipulation.cpp#L220): active process correction branches; the disabled preprocessor block is omitted. Native EPSILON is `1e-4` from `libslic3r.h:52`.
- [Tab.cpp:4279–4387](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Tab.cpp#L4279) and 3773–3889: filament cooling, PA/adaptive PA, chamber/pellet/capability gates, bed selection, multimaterial, variant EC controls, and nullable retraction/ironing override checkboxes.
- [Tab.cpp:5330–5664](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Tab.cpp#L5330): machine setting toggles, per-extruder retraction and firmware/wipe confirmation, motion limits, firmware-specific input-shaping menus and reset. The nozzle edit callback at `Tab.cpp:5095–5119` also supplies the explicit SEMM synchronization confirmation. Native `retract_length` misspellings reference no actual setting and are preserved as no-ops; they do not disable `retraction_length`.
- `ConfigManipulation.cpp:57–207` plus [MaterialType.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/MaterialType.cpp): configured nozzle-range warnings, native material range/chamber warnings, volumetric speed and chamber-minimum resets. Material lookup is exact and unknown materials use native nozzle defaults; unknown materials produce no chamber-temperature warning.

With ordinary native context, 257 process, 57 machine, and 58 filament fields have evaluated dependencies. Counts vary with branch/context. They are coverage of these source methods, not percentages of the full product.

## Native selection context

The catalog reads native `machine_model` records without making them selectable printer presets. `getSettingsContext(printer)` follows `PresetBundle.cpp:612`: match `printer_model` to a native model name, then compare the vendor map key with `BBL`. An unrecognized model yields native Unknown/false when the index was readable. It does not inspect marketing names or the selected preset's folder. The method returns source filenames and vendor/model IDs for review. `listMachineModels()` returns defensive metadata copies.

`Preset.cpp:889` supplies the model ID. `DevConfigUtil.h:98,106–129` loads `Resources/printers/<model_id>.json`, selecting `00.00.00.00.support_wrapping_detection`. Missing file/property means false in native code. Malformed data, unsafe model IDs, or an unavailable resource root remain unresolved (`null`) with a warning. Custom printer snapshots retain this lookup through their effective `printer_model`; the wrapper recomputes context after overrides.

## Remaining coverage

SEMM nozzle-diameter synchronization is evaluated only when `context.changedSetting` is `{scope:"machine",key:"nozzle_diameter",index:0}` (use the actual edited zero-based index). It preserves the native EPSILON comparison, synchronization choice, and decline alternative. The additional native change events and structural validation now implemented are documented in [NATIVE_CORRECTIONS.md](NATIVE_CORRECTIONS.md). Virtual extruder-count resizing, dependent group reconstruction, GUI page/group layout, geometry-specific validation, object/part correction scopes, and multi-plate cross-setting dialogs remain separate work. Exact native physical hardware behavior is not tested here.

## Verification and regeneration

`tests/unit/settings-dependencies.test.js` covers condition matrices and numeric boundaries, explicit confirmation alternatives, immutable input, variant mapping and inheritance, dynamic firmware menus, material ranges, and missing-context reporting. `tests/unit/preset-context.test.js` covers native model/capability lookup, malformed and absent resources, path handling, custom context, and defensive copies. Tests use local fixture files and never contact printer hardware.

Regenerate the material table from the same SHA-verified sources used by profile schema extraction:

```sh
node scripts/generate-native-material-ranges.js --source-dir /path/to/pinned/sources
node scripts/generate-native-material-ranges.js --source-dir /path/to/pinned/sources --check
```

## Preset editor integration

`ProfileEditor` accepts optional `printerConfig`, `processConfig`, `filamentConfig`, and `nativeContext` props. Its current scope uses the loaded native preset plus the editable draft; other scopes come from these props. Pass complete effective native configs, not the short selection summaries used for display. Native context comes from the preset selection endpoint.

The component applies visibility, enabled state, firmware menus and nullable per-variant override controls. Inherited values are displayed but never silently materialized. The editor uses the server preparation API described in [NATIVE_CORRECTIONS.md](NATIVE_CORRECTIONS.md). Native automatic corrections, acknowledgment groups and choices are verified on the server before saving. Users can keep editing or select the native alternative. Material warnings require acknowledgment. All modal CRUD behavior, empty vectors, initial overrides, and request-race handling are preserved. No component path connects to printer hardware.

Process corrections that target non-UI keys (notably `enforce_support_layers` while enabling vase mode) now use the trusted correction API. The client submits exact native proposal decisions; the server recomputes them and stores derived hidden values in the frozen source snapshot. Arbitrary hidden override edits remain prohibited. A dedicated browser test verifies this distinction.
