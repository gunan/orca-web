# Native preset configuration helper

This read-only process uses OrcaSlicer 2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It compiles the original `Preset.cpp`, `Config.cpp`, `PrintConfig.cpp` and their dependencies. The build extracts the original `PresetBundle` constructor and `full_config`, `full_fff_config`, `full_sla_config` functions to avoid unrelated GUI/device/model dependencies. The extractor checks the source commit, clean tracked source and pinned hashes before generating files.

The service supplies trusted system inheritance chains or a web custom preset snapshot. System chains follow the `load_config_bundle` sequence: apply parent/child configuration, `extend_default_config_length`, normalize instantiated profiles (including the native Template exception), and remove misplaced keys. This is distinct from native user-preset diff inheritance; native account/user presets are not read. The helper runs the original JSON deserializer and reports native unknown-key removal and forward substitutions.

Each material slot has an internal independent preset identity so two slots may select the same preset and have different edits. Returned material names and filament IDs use the actual profile metadata. Active-value edits select native indices with `get_index_for_extruder`, then use native `ConfigOptionVector::set_at`, following the indices selected by `Tab::switch_excluder`. Complete explicitly supplied variant vectors are retained.

Outputs:

- `archiveSettings`: exact `PresetBundle::full_config(false)` configuration, retaining inactive variants and `filament_self_index`.
- `effectiveSettings`: exact `full_config(true)` values for the current physical nozzle selections and material map.
- `scopes`: normalized source scope values; `reports`: native deserialization diagnostics.

The embedded-settings operation resolves variant fields using the same four native methods called by `Print::apply`. It does not normalize unrelated geometry or invent missing variants.

Build explicitly with `python3 native/config-worker/scripts/build.py`. It uses the same verified dependency cache/bootstrap as the emboss helper, and writes the binary plus build manifest to `native/build/config`. Supported overrides: `ORCA_NATIVE_CACHE_DIR`, `ORCA_SOURCE_DIR`, `ORCA_NATIVE_PREFIX`, `ORCA_NATIVE_DEPENDENCIES`, `ORCA_CONFIG_BUILD_DIR`, `CMAKE`. The runtime override is `ORCA_CONFIG_WORKER_BIN`. The web server never compiles a helper during a request.

Protocol: `orca-config-worker request.json result.json`; version probe `--version`. Each request uses an isolated temporary directory, at most 8 MiB input/16 MiB output, 64 material slots, 64 ancestors per scope, 1,024 ordinary vector entries, 262,144 purge cells, 30 seconds CPU. The process never invokes post-processing scripts or printer/network functions. A shared one-active/four-pending server queue applies one wall-clock deadline including queue wait and cancellation. Completed-result cache is bounded to 32 entries/32 MiB. Connections, scripts and external asset paths are handled by existing server validation before settings can be used for slicing.

AGPL-3.0: see `LICENSE.txt`; dependencies/provenance in `dependency-manifest.json` and `native-source-manifest.json`. The adjacent build manifest pairs the binary hash with compiler, architecture, source and dependency metadata.
