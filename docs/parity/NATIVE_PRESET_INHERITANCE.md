# Native user preset inheritance

Baseline: OrcaSlicer **2.4.2**, original source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

Native-mode presets now retain the original user document, resolved full settings and explicit parent name. The original `Preset::save` computes differences from the parent, including nullable nozzle-variant `nil` entries. JSON export preserves that difference document. Import and startup resolve parents using the pinned native user-file loading sequence; cycles, missing parents and helper failure reject without rewriting the file.

The editor displays the parent and resets values to it. Full inactive material/nozzle alternatives survive active-variant editing, saved automatic corrections survive reopening and renaming, and metadata-only edits do not require a compatible material selection. Root updates reload direct children through original `Preset::reload`; derived-child updates do not eagerly reload grandchildren. Restart follows the original complete user-file loading path, including its different nullable-value behavior. This distinction is intentional and covered by independent native references.

Persistence is one transaction. If a child reload fails, neither the parent nor children are saved. Parent rename/deletion is explicitly refused while descendants reference its name. Legacy snapshot records retain their existing representation until imported or saved through the native editor.

## Source and independent reference

The production helper calls original `Preset::save` and `Preset::reload`, and preserves the `PresetCollection::load_presets` user-file sequence in `native/config-worker/worker/user-preset.hpp`. The independent oracle compiles the complete original `PresetCollection::load_presets` entry point behind a reference-only macro. Eight captured cases cover native roots, parent differences, variant vectors, nullable values and legacy material compatibility repair. The reference compares full resolved native values as well as saved difference documents.

Reproduce with `python3 scripts/generate-native-user-preset-reference.py native/build/config` after the normal native configuration build. The generator validates the pinned source and build manifest, compiles an isolated reference executable using the verified native objects, and records source, input, generator and helper hashes. It never replaces the production binary with its reference executable.

Production config helper SHA-256: `a24866bf2856119240270f399fda384b8bc8642e9596f711003a8dbb719359ac`.

## Tests

- `tests/integration/user-preset-projection.test.js`: independent original save/load fixtures and provenance.
- `tests/integration/native-preset-inheritance.test.js`: import, source reset, root/child/restart differences, ancestry, compatibility and atomic failures.
- `tests/unit/native-user-preset-boundary.test.js`: scope, metadata, parent and helper boundary validation.
- `tests/unit/custom-preset-corrections.test.js`: accepted hidden corrections survive active edits, restart, export and metadata-only rename.
- `tests/e2e/preset-inheritance.spec.js`: real API/helper editor harness checks parent reset, native correction review and parent rename/delete conflicts. Its catalog and slicing environment is the explicit fixture environment.
- `tests/native-e2e/custom-preset-variants.spec.js`: production browser/native material and printer variants, parent reset and second material slot.
- `tests/native/native-preset-inheritance.test.js`: installed CLI slices the imported 0.12 mm child into 166 layers, then the parent-reset 0.2 mm child into 100 after restart; every native layer has actual deposition.

See the milestone report for executed suite results. Test definitions alone are not completed evidence.

## Remaining parity

Full native preset package/account/vendor workflows, alias-based automatic reselection, parent switching/detaching and rename/delete migration dialogs remain open. Native desktop tab layout and fresh paired GUI interaction remain unverified. The file representation and tested inheritance paths do not establish complete preset UI parity.
