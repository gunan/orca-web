# Milestone17: native SVG, nozzle purge tables and Preview ranges

Baseline: installed OrcaSlicer2.4.2, source8500fcdccaa10b5099ac20d252af3a7c560046f1. Full UI and feature parity remains incomplete.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 678 passed,0 skipped | `/private/tmp/orca-m17-final-unit.log` |
| `npm run test:e2e` | 228 passed,0 skipped | `/private/tmp/orca-m17-final-browser.log` |
| `npm run test:native` | 155 passed,0 skipped | `/private/tmp/orca-m17-final-native.log` |
| `npm run test:e2e:native` | 29 passed,0 skipped | `/private/tmp/orca-m17-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m17-final-build.log` |

## Implemented and compared

- [Native SVG](NATIVE_SVG.md): pinned NanoSVG, NSVGUtils and native planar/surface emboss kernels; source/frame preservation, creation, explicit regeneration, unchanged-session no-op, paint-loss consent and Undo. Browser-native export remains editable.
- [Physical-nozzle purge tables](../multi-nozzle-purge.md): independent nozzle matrices and multipliers, original rounding/clamping, slot remapping and Prusa expansion. Real native slicing isolates the changed nozzle while leaving model-wall motions unchanged.
- [Preview ranges and events](NATIVE_PREVIEW_RANGE.md):94 independently compiled native transition cases, seven GUI-file captures, all seven stationary event types, original marker geometry/shader arithmetic, hidden ticks and top-layer-only playback. Native shortcut coverage notes are updated.

## Limits and retained diagnostics

The surface SVG ring intersects a native cube triangulation diagonal and retains eight zero-area faces. These are reported visibly and preserved for comparison; the mesh has no boundary/nonmanifold edges, retains the analytic volume and slices with920 raised deposition moves and an empty center. This is not evidence that every SVG or surface case is exact. Native SVG subpath selection, drag/style workflows and fresh GUI checks remain open.

The multi-nozzle test project is derived from the genuine saved GUI cube plus explicit nozzle identity/material vectors; it is not a GUI-saved J1/XL project. Sparse bundled J1/XL CLI probes crashed and are retained in the investigation stage. Native preset-variant resolution is a separate open task.

Native travel/wipe solid rendering and additional Preview views remain open. Source-only Preview retains its stated limitations. Arrangement, clipboard/Clone and remaining feature inventory continue separately. The saved surface-text exact-motion mismatch remains unresolved. The Mac remains locked for fresh GUI capture, and no physical printer was contacted.

The first browser-native run passed28/29 and had an isolated ECONNRESET while downloading a completed flow-calibration job. No runtime or test assertion was changed. All four calibration browser-native tests passed on a focused rerun; a complete rerun then passed29/29. Diagnostics remain at `/private/tmp/orca-m17-initial-native-browser-failure.log` and `/private/tmp/orca-m17-native-browser-calibration-rerun.log`. Final validation totals above come from the complete passing rerun.
