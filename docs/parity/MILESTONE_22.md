# Milestone 22: native object hierarchy, preset dependencies and editor Preview

Baseline: installed OrcaSlicer **2.4.2**, original source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Full UI and feature parity remains incomplete. The 127-unit inventory continues to distinguish limited implemented behavior from complete native acceptance.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 872 passed, 0 skipped | `/private/tmp/orca-m22-all-unit.log` |
| `npm run test:e2e` | 266 passed, 0 skipped | `/private/tmp/orca-m22-all-browser.log` |
| Eight focused native/helper files below | 25 passed, 0 skipped | `/private/tmp/orca-m22-all-focused-native.log` |
| `npm run test:e2e:native` | 62 passed, 0 skipped | `/private/tmp/orca-m22-all-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m22-all-build.log` |

Focused command: `node --test --test-concurrency=2 tests/native/native-filament-preview.test.js tests/native/native-tool-position.test.js tests/native/native-preview-scalars.test.js tests/native/preset-compatibility.test.js tests/native/native-instance-cut.test.js tests/native/text.test.js tests/native/native-preview-context.test.js tests/native/native-object-tree.test.js`.

These combined checks ran in an isolated stage. Every promoted source, test and asset file was subsequently hash-compared with that tested stage. Post-promotion `npm test` also passed872/872 with0 skips (`/private/tmp/orca-m22-promoted-unit.log`), and `npm run build` passed (`/private/tmp/orca-m22-promoted-build.log`). All100 promoted source/test/asset files matched the accepted stage. Fake-engine browser checks, compiled native-helper replay, installed native slicing and desktop interaction remain distinct evidence types.

The latest complete `npm run test:native` remains M20: **203 passed, 7 failed, 3 cancelled**. The Mac remains locked, and original native `--export-3mf` enters the [macOS persistent-state restoration dialog](native-export-restoration-block.txt). Ordinary installed slicing continues to work with isolated data directories. No native preference reset, export retry-until-pass, or hardware print was performed. The recorded translation-only and rotated same-input native motion variability remains unresolved.

## Implemented behavior

- [Native object hierarchy](NATIVE_OBJECT_TREE.md) replaces flat per-mesh rows with ModelObject families, parts, Layers and Instances. Native visibility and printability are independent. Settings actions reset only original scope-eligible keys; explicit editor actions and double-click select the corresponding part/range. The original active tree uses action icons rather than legacy settings child rows. Native icons and 726 independent original-method reference cases cover hierarchy, category and label behavior. Native slicing verifies 1,146 deposition segments in only the printable instance footprint.
- [Preset dependency import and editing](../native-preset-dependencies.md) retains native lists, conditions, inherited versus explicit-empty metadata, dormant conditions and unknown literal names. Filament Dependencies exposes original All/Set/Condition behavior and first system-derived save restrictions. Incompatible presets remain editable through a trusted inspection path while ordinary configuration and job admission continue enforcing compatibility. Native expression groups survive project normalization and 3MF. Process dependencies remain read-only because the original process editor controls are commented out.
- [Editor Preview context](PREVIEW_EDITOR_CONTEXT.md) binds job colors, filament diameter/density/cost, machine time cost and safe custom-event metadata to the exact job output. Native formulas operate on reprocessed G-code with frozen double properties; project palettes remain distinct from standalone file palettes. Original active Custom G-code overview performs native nearest-layer lookup and accumulated timing. Preview display preferences persist across application-lifetime remounts and matching filament categories; native category changes restore the smart default.

The previous partial event-time table requirement was source-audited: its rendering code is commented out in the pinned native baseline. The separate active Custom G-code overview is implemented. This corrects the inventory rather than inventing an inactive native feature.

## Integration diagnostics and provenance

The first combined unit run passed 859/860. An older CRUD test supplied both native JSON dependencies and legacy printer IDs, which the preserved-dependency contract deliberately rejects. Its regression now verifies the rejection and atomic unchanged storage, then imports native JSON alone and checks exact dependency export/reopening. Runtime behavior was unchanged for this correction. The subsequent full unit run passed all 872 cases. Historical log: `/private/tmp/orca-m22-combined-unit.log`; corrected focused log: `/private/tmp/orca-m22-crud-fixed.log`.

Object-tree browser assertions were adapted semantically from mesh rows to object/volume/instance rows. Geometry, selection, printability, Undo, source metadata and archive assertions remain. M21's pending catalog ownership and completed SVG import synchronization are preserved. Preview preferences remain attached through the shared main component merge.

Durably built configuration helper SHA-256: `e79ef3e57e7d7f06f8b3dbc4f92c2f17ea469610038a008abd0a5938927726f9`. G-code helper: `e032792faa5f8414abed6c68e75dbf607ab74abc4970a4c023d06ad2530fed17`. Each binary is paired with its manifest; the agent's temporary configuration probe executable is not used. Original native source stays pinned.

## Running local server

The accepted M22 runtime is served at `http://localhost:3001` from `/private/tmp/orca-implementation/live-m22`, with copied helper binaries/manifests and the existing repository data directory. Startup followed a check that no slicing jobs were active. Health reports installed OrcaSlicer2.4.2, the production page returns200, and the default native catalog returns968 printers,7 processes and293 materials. Subsequent feature work remains isolated.

## Remaining acceptance

The object tree still uses saved plate assignments, with incomplete geometric Outside classification, full context menus, drag/reparent/reorder, editable filament badges and cross-plate viewport selection. Exact native layout and fresh desktop interaction remain open.

Native parent-diff preset serialization, nullable inheritance, parent-edit reload, detach, parent-relative reset, automatic incompatible preset reselection and account/vendor workflows remain open. Editor Preview still needs all-plate aggregation, units/preferences coverage, broader legend/layout work and fresh native desktop timeline comparison. Older jobs and raw archive uploads explicitly remain standalone Preview inputs because their editor provenance cannot be recovered safely.

Native export restoration, same-input motion variability and actual device/hardware acceptance remain unresolved. Passing the checks above does not certify 100% parity.

A subsequent independent Units formatting probe found an inherited display-boundary defect: `nativeFixed(0.005,2)` returns0.00 while native `sprintf` returns0.01. The separate Units package is correcting binary tie handling with native reference tests. It does not change the numeric accumulation results recorded above; rare decimal display equality remains unverified in this milestone.
