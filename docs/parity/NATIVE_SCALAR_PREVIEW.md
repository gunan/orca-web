# Native Preview scalar modes

This addition implements Speed, Actual speed, Fan speed, Temperature, Pressure advance, Acceleration and Jerk using OrcaSlicer 2.4.2 native processor values and original native ranges/colors. The existing Width, Height, Flow, Actual flow and Layer time modes remain intact. These checks establish source/data/GPU parity for this scope; desktop GUI visual certification remains pending.

## Authoritative behavior

Pinned commit: `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

- [`ViewerImpl::update_color_ranges`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L1817) collects the native scalar domains. Speed, Actual speed, Acceleration and Jerk include Travel and Wipe exactly when their option is visible. These seven ranges do not change with selected layers, the Custom role visibility, or timing mode.
- [`ViewerImpl::get_vertex_color`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp#L1467) selects colors. Travel uses scalar colors for Speed, Actual speed, Acceleration and Jerk, tool color in Tool view, and the native blue option color otherwise. Wipe uses scalar colors for those four motion modes and the native yellow option color otherwise. Stationary events retain their own native colors.
- [`ColorRange`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ColorRange.cpp) supplies its original palette, singleton/two-value/eleven-value legend behavior, float arithmetic, interpolation and byte truncation. There is no independently estimated thermal, acceleration, PA or motion value.

The worker adds `scalarRangesVersion: 1` and `scalarRanges`, with `travelHiddenWipeHidden`, `travelVisibleWipeHidden`, `travelHiddenWipeVisible` and `travelVisibleWipeVisible`. Each contains the seven named ranges with `{min,max,count,values,palette}`. Native preview schema version 1, the vertex column layout and the six older range families are unchanged. The adapter rejects malformed additions. Older helper results remain usable, with the seven unsupported scalar modes explicitly unavailable. Source-only preview keeps its existing parser and Speed fallback; it does not advertise these native capabilities.

Pressure advance has one deliberate provenance rule. The pinned processor contains an uninitialized PA member before a determining command. Nondeterministic native memory is not a valid value to reproduce. The existing worker returns `null` before its first explicit supported PA command; the new range collector excludes those vertices, and the renderer shows them gray. Determined PA values retain original source arithmetic and coloring. The original-source oracle substitutes `-1` for unknown PA so the original collector's existing negative-value predicate excludes it. It substitutes gray only for unknown PA display. This is an explicit deviation for undefined source values, not a claim that native GUI output has the same initial PA color.

## Independent references and regression evidence

`tests/fixtures/native-scalar-reference.cpp` is a separate entry point containing unmodified original range/color functions and native palette constants. `scripts/generate-native-scalar-reference.py` checks the pinned revision and clean original inputs, records source SHA-256s, compiles the native range/types/path helpers, and generates the reference JSON. It does not invoke the production scalar adapter or worker range helper.

The synthetic fixture spans extrusion, Custom, Travel, Wipe, every stationary event type, Noop, unknown PA, varied scalar values, and all four Travel/Wipe combinations. Its 448 RGB values match the JS adapter exactly.

The existing genuine GUI export `native-gui-shrink98-2.4.2.gcode` is reused, not duplicated. SHA-256 is `79399a156dc3cc43279242e832db5a74dd5426228303ed3a6eeef8bcc220337e`. Its 29,021 native vertices produce 28 mode/visibility RGB streams: **812,588 colors match the independent original C++ byte-for-byte**, together with every range object. Separate native tests verify a file without any PA command has no PA domain, and a later explicit command begins the determined domain.

The GPU fixture combines original C++ colors and the original native segment vertex shader with actual production instanced buffers. It compares 112 visible segments, eight vertices each and six position/RGB channels: **5,376 values**, tolerance `1e-6`. The first check identified Three's sRGB round-trip altering native channels by approximately `2e-6`. Native instance attributes now recover the original 8-bit channels before writing `/255`; the source-only renderer is unchanged. The original tolerance passes after this correction.

Actual-native browser tests load the genuine GUI G-code through the rebuilt helper, test all 28 mode/visibility domains, confirm the selected raw command retains native vertex/source-line identity and exact scalar values, and confirm old helper output cannot silently enable new modes. The visible layer is narrowed for repeated GPU updates while ranges remain whole-file native ranges. The earlier full-file native solids regression still covers all 21,026 rendered motion solids.

## Reproduction

Build the helper using the existing durable recipe, with the source/dependency cache configured for this machine:

```sh
ORCA_NATIVE_CACHE_DIR=/path/to/native-cache python3 native/gcode-worker/scripts/build.py
```

The built binary must stay paired with its `build-manifest.json`; worker identity/cache invalidation includes the executable identity. Rebuild after integrating the two native worker source changes. For the oracle, first retain JSON from this helper's processing of the GUI fixture, then run:

```sh
python3 scripts/generate-native-scalar-reference.py /path/to/pinned/source /path/to/gui-native-output.json
```

Focused checks: `tests/unit/native-preview-scalars.test.js`, `tests/unit/native-preview-data.test.js`, `tests/native/native-preview-scalars.test.js`, `tests/e2e/native-scalar-shader.spec.js`, and `tests/native-e2e/native-preview-scalars.spec.js`. The existing source fallback, native motion shader, volume renderer and real-native motion-solid tests are also part of the staged regression run. No physical printer is contacted.
