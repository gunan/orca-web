# Milestone 24 — native user preset inheritance

Baseline: installed OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`, repository `5050dab` plus this working tree. Full UI and feature parity remains incomplete.

[Native user preset inheritance](NATIVE_PRESET_INHERITANCE.md) now preserves parent-relative native documents through import, edit, export and restart. Original native save/load/reload semantics retain inactive nozzle variants, nullable differences and the distinction between an immediate root-child reload and a later complete user-file reload. The editor resets to the parent. Child update failures roll back the entire persisted transaction, and parent rename/delete conflicts remain explicit.

## Validation

| Command | Result | Log |
|---|---|---|
| `npm test` | 946 passed, zero skipped | `/private/tmp/orca-m24-all-unit-fixed.log` |
| `npm run build` | Passed | `/private/tmp/orca-m24-build.log` |
| `npm run test:e2e` | 271 passed, zero skipped | `/private/tmp/orca-m24-all-browser.log` |
| `npm run test:native` | 238 passed, zero failures/cancellations/skips | [Full native log](NATIVE_VALIDATION_M24.log) |
| `node --test tests/native/native-preset-inheritance.test.js` | One passed, zero skipped | `/private/tmp/orca-m24-inheritance-native-layer-check.log` |
| `node --test tests/unit/custom-preset-corrections.test.js` | Five passed, zero skipped; includes strengthened active-editor hidden-correction assertions | `/private/tmp/orca-m24-hidden-editor-test.log` |

`npm run test:e2e:native` completed **67 passed, one failed, zero skipped** ([full log](BROWSER_NATIVE_VALIDATION_M24.log)). The failed test imposed a10-second UI deadline across native preparation and save: the trace records6.05seconds in preparation, and the server persisted the preset after the assertion deadline. The corrected test awaits and asserts the201save response, native parent and selected child before checking the closed editor. Both focused compatibility workflows then passed2/2 (`/private/tmp/orca-m24-native-save-response.log`). The failure trace is retained; this is not represented as a clean full browser/native run.

Eight independently captured native user-file reference cases compare full original load results and saved differences. The reference-only executable calls the complete original `PresetCollection::load_presets`; the generator validates source/build provenance and never replaces the production helper. Actual installed slicing produces166 layers for the imported0.12mm child and100 layers after0.2mm parent reset and restart, with material deposited on every native layer.

Initial integration testing caught three regressions: accepted hidden native corrections were lost, metadata-only rename unnecessarily required a compatible material, and an intermediate fix collapsed inactive nozzle values. The implementation now preserves full inactive alternatives and trusted hidden corrections while permitting metadata-only edits; the original assertions and strengthened restart/edit/export checks pass.

Two old native-browser assertions required contract corrections: resetting every variant to its parent omits that unchanged option from the native difference export; both resolved25/40 values are still checked through reopened variant controls. The additional parent notice also required the existing machine-motion notice locator to identify its intended text. No runtime behavior was changed to satisfy these selectors.

The new native slicing test initially compared a serialized string to a number and used an arbitrary minimum count of G1 commands. Its final checks use typed source equality and parsed deposition on every native layer, preserving the actual parent/child layer-height and restart assertions. Earlier diagnostics are retained in the temporary logs.

## Remaining acceptance

Native tab appearance, parent-switch/detach and migration dialogs, preset packages/accounts/vendors, alias-based automatic reselection and fresh paired native GUI comparison remain partial. Mac desktop inspection was still locked during this run. No physical printer was contacted.

This full native run passed without retries or weakened existing regression assertions. Prior M22/M23 export timeouts, native XL SIGBUS and strict same-input motion differences remain historical unresolved failures; one clean run does not establish their root cause or resolution. The separate cut-to-parts development stage also retains a strict identical-reference motion failure and is not included in this milestone.

## Repository promotion

All29 promoted source, test, documentation and helper files matched the accepted stage hashes. The repository subsequently passed946 unit/API checks without skips and built successfully (`/private/tmp/orca-m24-promoted-unit.log`, `/private/tmp/orca-m24-promoted-build.log`). Parity consistency and whitespace checks passed.
