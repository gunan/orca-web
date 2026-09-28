# Milestone16: native preview, keyboard behavior, text creation and Prusa import

Baseline: installed OrcaSlicer2.4.2, source8500fcdccaa10b5099ac20d252af3a7c560046f1. Full UI and feature parity remains incomplete.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 655 passed,0 skipped | `/private/tmp/orca-m16-final-unit.log` |
| `npm run test:e2e` | 220 passed,0 skipped | `/private/tmp/orca-m16-final-browser.log` |
| `npm run test:native` | 146 passed,0 skipped | `/private/tmp/orca-m16-final-native.log` |
| `npm run test:e2e:native` | 26 passed,0 skipped | `/private/tmp/orca-m16-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m16-final-build.log` |

## Scope and evidence

- [Native G-code processor](NATIVE_GCODE_PROCESSOR.md): actual native vertex/scalar/timing/role data, owned-ready HTTP, bounded queue/deadlines/cache and explicit source-only fallback. Native processor and viewer-summed timing remain distinct.
- [Keyboard inventory](NATIVE_SHORTCUTS.md), [Prepare](NATIVE_PREPARE_KEYS.md) and [Preview](PREVIEW_SHORTCUTS.md):95 native-help entries exported,44 original-C++ slider transition cases, actual source-command grouping, camera projection, native material digit timing/scopes and undoable printable state.
- [Native text creation](NATIVE_TEXT_CREATION.md): new text uses native kernels, including curved per-glyph contour layout. Unchanged editor sessions preserve original native geometry, paint and history. Explicit regeneration remains independently tested.
- [Surface-text investigation](NATIVE_TEXT_SURFACE_INVESTIGATION.md): 24 repeated native outputs retain identical vertices, manifold topology and cap boundaries, while coplanar cap triangulation varies. Controlled geometry comparisons retain the saved-GUI motion mismatch; fresh GUI regeneration is still required.
- [Prusa import](../prusa-project-import.md): actual GUI importer preserves roles, painting, materials and local frames;29,750 reference motions match. Current settings remain active. Native-ignored source settings are reported and retained as inactive bytes.

## Limits and retained diagnostics

The saved surface-text exact-motion mismatch remains in the tracker; identical command counts do not prove parity. Native Preview event markers, complete native slider ranges, remaining scalar views/geometry and fresh GUI capture remain open. Clipboard, Clone/Fill, all-plate selection and many native UI details remain open. Prusa tests use synthetic source-format fixtures; multi-physical-nozzle slot expansion and independent GUI reopening remain pending.

The keyboard source audit corrected two legacy bindings:CmdD means Delete All, andCmdShiftA means select across all plates; the latter is now unbound until its native behavior is supported. The initial full browser run had two obsolete expectations for ShiftCmdA deselection and Undo through an open confirmation dialog; both tests now verify the native behavior, cancellation and retained Undo history. That failure log remains at `/private/tmp/orca-m16-initial-browser-failures.log`. Initial keyboard tests assumed an origin Y or explicit default filament field; corrected tests compare actual displacement/effective material. Preview source indices remain distinct from native render vertex IDs. Integration resolved shared import/help patch contexts without replacing unrelated edits.

The Mac remained locked for fresh GUI checks. No physical printer was contacted or print started. Source/build scripts and manifests are retained; native helpers are ignored generated binaries. Feature counts describe the tracked inventory, not a defensible parity percentage.
