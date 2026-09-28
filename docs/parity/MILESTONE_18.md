# Milestone18: native arrangement, clipboard and motion solids

Baseline: installed OrcaSlicer2.4.2, source8500fcdccaa10b5099ac20d252af3a7c560046f1. Full UI and feature parity remains incomplete.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 700 passed,0 skipped | `/private/tmp/orca-m18-final-unit.log` |
| `npm run test:e2e` | 239 passed,0 skipped | `/private/tmp/orca-m18-final-browser.log` |
| `npm run test:native` | 189 passed,0 skipped | `/private/tmp/orca-m18-final-native.log` |
| `npm run test:e2e:native` | 32 passed,0 skipped | `/private/tmp/orca-m18-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m18-final-build.log` |

## Implemented and compared

- [Native arrangement](NATIVE_ARRANGEMENT_EVIDENCE.md): original polygon nesting, support/skirt/sequential parameters, rotation, fixed selections, exclusion/wrapping regions and estimated towers. The API handles cancellation, stale edits, bounded queues and temporary-file cleanup. Native placements preserve original geometry and can spill onto new plates.
- [Model clipboard and Clone](NATIVE_CLIPBOARD.md): original nearest-cell and part-frame placement, immutable Copy, bounded Clone, unchanged names, final-batch selection and fresh identities. Auto arrange creates its own Undo step after Clone. Native 3MF imports retain validated indexed geometry and source matrices for ordinary meshes as well as text/SVG.
- [Travel/Wipe solids](NATIVE_PREVIEW_SOLIDS.md): original segment geometry/shader, native endpoint dimensions/turn angles/wipe bias, Tool colors and native visibility/range behavior.

The exported95-entry native shortcut table now records the implemented Object-list Copy/Paste/Clone bindings. Its Global clipboard entries remain distinct from the implemented Prepare model clipboard; settings/layer-row and operating-system interchange are not certified.

## Limits and regression diagnostics

Arrangement's30 native checks cover12 exact original-core captures, four estimated-tower captures, eleven installed-CLI geometry comparisons, identity/provenance, selected-object preservation and bounded malformed requests. The0.00003mm CLI tolerance reflects Float32/3MF serialization. Existing displayed/sliced tower bounding boxes, outside/nonprintable/overheight workspace placement, all multi-plate/custom-bed cases and native GUI appearance remain open. GUI alignment and CLI-derived defaults are deliberately kept distinct.

Clipboard native free-cell collection can retain duplicate candidate cells and overlapping clones; original source behavior is preserved and documented. Current macOS sorting is the comparison baseline. Fill and linked native instance propagation remain separate work. There is no claim that16 original-method cases exhaust every GUI clipboard context.

The initial unit run exposed two manually reconstructed fixtures that retained obsolete native mesh source metadata; the mirrored reference now explicitly verifies rejection before removing that stale carrier, and the legacy generated-pattern fixture retains its historical carrier-free input. The initial native run passed185/189: three independently constructed overhang fixtures retained obsolete single-mesh source carriers, and the mirrored reference inserted a duplicate XML transform attribute after source-frame preservation. Those reference constructions were corrected, all seven focused painting/support checks passed, and the complete native rerun passed189/189. Production stale-source validation was not weakened.

The initial focused browser geometry run passed28/29; an old group workflow started Duplicate before asynchronous Arrange finished. It now waits for completion. Matrix decomposition is checked at1e-10degrees/1e-8mm rather than requiring floating-point90degrees to serialize identically. The three focused group tests pass. Native independent geometry comparisons remain unchanged.

The first full browser-native run passed30/32; both remaining failures constructed the same two-mesh overhang while retaining the original single-mesh carrier. Correcting that independent fixture leaves the actual support/disabled-support assertions intact. Both focused checks and the complete32-check rerun pass.

Initial diagnostics remain at `/private/tmp/orca-m18-initial-unit.log`, `/private/tmp/orca-m18-initial-native.log`, `/private/tmp/orca-m18-geometry-browser.log` and `/private/tmp/orca-m18-object-groups-rerun.log`, and `/private/tmp/orca-m18-initial-native-browser.log`. Final suite totals above refer to complete passing runs. The saved surface-text exact-motion mismatch and fresh GUI capture requirement remain open. No physical printer was contacted.
