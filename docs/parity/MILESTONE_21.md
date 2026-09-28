# Milestone 21: linked Cut, compatibility and native Preview

Baseline: installed OrcaSlicer **2.4.2**, original source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Full UI and feature parity remains incomplete. Native preset compatibility is now a separate inventory unit so its remaining import, reselection and account behavior remains explicit.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 831 passed, 0 skipped | `/private/tmp/orca-m21-final-unit.log` |
| `npm run test:e2e` | 259 passed, 0 skipped | `/private/tmp/orca-m21-final-browser.log` |
| Six focused native/helper files listed below | 18 passed, 0 skipped | `/private/tmp/orca-m21-final-focused-native.log` |
| `npm run test:e2e:native` | 56 passed, 1 failed, 0 skipped | `/private/tmp/orca-m21-final-native-browser.log` |
| Corrected `native-svg.spec.js` under the native browser configuration | 1 passed, 0 skipped | `/private/tmp/orca-m21-svg-import-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m21-final-build.log` |

Focused native command: `node --test --test-concurrency=2 tests/native/native-filament-preview.test.js tests/native/native-tool-position.test.js tests/native/native-preview-scalars.test.js tests/native/preset-compatibility.test.js tests/native/native-instance-cut.test.js tests/native/text.test.js`.

The latest complete `npm run test:native` remains M20: **203 passed, 7 failed, 3 cancelled**, not a successful M21 full run. Original native `--export-3mf` waits in an AppKit persistent-state restore dialog while the Mac is locked; [the sampled stack](native-export-restoration-block.txt) documents the blocked path. The Mac was still locked at the latest inspection. Ordinary installed `--slice` works and is exercised here with isolated data directories. No native preference/crash-state reset or retry-until-pass was used. [Translation-only](native-instance-translation-repeatability.json) and [rotated](native-instance-repeatability.json) same-input motion variability remain unresolved.

The ordinary browser suite uses fake slicing/arrangement with the real configuration helper. Native browser cases distinguish actual installed slicing from controlled replay of genuinely processed native reference data. Those paths are not hardware printing or fresh desktop pixel acceptance.

All 57 browser/native cases have passing evidence: 56 in the complete run and the remaining SVG case in a focused run after correcting its import synchronization. Runtime code did not change between those runs. This is combined evidence, not a claim that the initial full command passed.

## Implemented behavior

- [Linked native Cut](NATIVE_LINKED_CUT.md) applies original CutUtils reset and Model bed placement to all linked instances, preserving retained-side families, cut IDs, roles and per-plate coordinates. Eleven independent original C++ cases cover tilted/mirrored instances, selected peers, flip flags, auto-drop, connectors and dowels. The browser's polygon/min/max bed shape is normalized before plate-origin and oversize calculations; the two-plate regression verifies global offsets and local restoration. Actual slicing produces both retained footprints across 25 layers.
- [Native preset compatibility](../native-preset-compatibility.md) compiles original predicates and the boolean parser, with explicit-list precedence, immediate-parent matching, library alias exclusions and native parser-error behavior. Twenty-one independent source cases agree. Printer/process changes and Undo refresh material choices; final admission rechecks effective hardware. The real CORE One expression process is selectable, sliceable and editable.
- [Native Filament and Summary Preview](PREVIEW_FILAMENT.md) uses original color streams and processor model/support/flushed/tower volumes, native counters and precision rules. 58,042 reference vertex colors agree exactly. Summary identifies imported file metadata, and older or unavailable capabilities remain explicit. Editor-bound palettes/statistics and all-plate behavior remain future work.
- Attached native Text/SVG and legacy text now inherit the source ModelObject identity even when the imported project has a single instance. Independent objects detach it. Seven unit regressions cover linked/single geometry, operations, immutability and native export; two real native browser tests cover creation, save, export, Undo/Redo and slicing. Legacy native text verifies raised O counters and engraved cavities without compensating fixture metadata.
- Project restoration no longer loses its catalog request to effects using the old selection. A delayed-response browser regression preserves the imported objects, native settings and original IDs.

## Integration diagnostics

The first focused native browser run passed 7/9. Both new attachment cases exposed a real import race before the attachment dialog: changing the pending catalog's printer caused the selection effect to abort restoration using the old project ID. Pending catalog ownership now prevents that. Both attachment cases then passed with their original assertions. The trace archives are retained under `/private/tmp/orca-implementation/m21-import-race-evidence`.

The first dedicated race regression used the nonexistent accessible name “Printer preset”; the actual selector is “Printer”. Correcting only that selector produced two passing compatibility/import tests. Four linked Cut browser cases pass, including the new production-bed shape regression. Initial and corrected logs remain under `/private/tmp/orca-m21-*`.

The full native browser run passed 56/57. Its existing surface-SVG roundtrip test selected a part on the old project immediately after starting an asynchronous native import. The restored project then reset scope and selection, so the subsequent edit click timed out. The test now dismisses the old notice, waits for the new native restoration notice and completed import, asserts the restored whole-object scope, and then selects the SVG part. All original geometry/source/frame/roundtrip assertions remain; its focused rerun passes. The original failure trace is retained under `/private/tmp/orca-implementation/m21-svg-import-evidence`.

The actual repository received narrow patches and verified paired native helpers from the tested combined stage. Configuration helper SHA-256 is `b40e5bf6c29e34369856eb70693f9948aecd8fc58b7710babe2fe380636ee4a1`; arrangement is `ef730e8c3ac21eeed528cdd7aa96217e410a418ad75c579260707c80aa777d2d`; G-code is `af6f68a6cca6cd1abea618a32ec5635b028a344abf965c13732e0a157f1dcc7c`. Their manifests travel with the binaries. Source and existing native helper constraints remain pinned.

## Running local server

The reviewed M21 runtime is served at `http://localhost:3001` from `/private/tmp/orca-implementation/live-m21`, with its own copied helper binaries/manifests and the existing repository data directory. Startup was checked with no active slicing jobs. Health reports installed2.4.2 and native compatibility; the production page and native preset catalog respond successfully. Later M22 work remains isolated from this served snapshot.

## Remaining acceptance

Linked Cut keep-as-parts, topology-aware native painting restoration, the full native gizmo and all-plate scene selection remain open. Preset dependency import/editing, automatic reselection and account/vendor workflows remain open. Preview editor provenance, all-plate statistics, legend interactions and visual equality remain open. Native export restoration, same-input motion variability, fresh unlocked-desktop comparison and device/hardware acceptance are not resolved by passing focused tests. Earlier M20 failures remain in the inventory history.

The old generic Cut gap mentioned curved surfaces. Pinned `GLGizmoCut.hpp:214–220` enables only planar and tongue-and-groove modes; radial and other modes are commented out. The unsupported curved-surface requirement has been removed, while actual native Cut-to-parts and interaction gaps remain explicit.
