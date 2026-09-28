# Milestone 11 — dovetails, multiple selection and object painting

Baseline: installed **OrcaSlicer 2.4.2**, source revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Working tree extends `5050dab`. Full parity remains incomplete. No printer was contacted.

## Integrated behavior

- Dovetail cutting implements native depth slabs, flap/taper cuts, repeated grooves and separate depth/width clearances. Closed fragments retain native object grouping, helpers and cut-family metadata. Independent C++ plane references match within the documented float-trigonometry bound; three installed-native cases match all **17,139 / 17,809 / 17,139** reference motions. See [DOVETAIL_CUTTING.md](DOVETAIL_CUTTING.md).
- Multiple selection supports tree toggles/ranges, native-style rectangle selection with depth-tested IDs, select/deselect shortcuts, object/part scope, joint numeric/gizmo transforms and batch duplicate/delete. Selection frames survive save/load and reject stale/cross-plate input. Two installed-native transformed scenes match **40,835 / 42,350** reference motions. See [MULTI_SELECTION.md](MULTI_SELECTION.md).
- Painting targets every visible normal part in the selected native object. Ordinary brushes use the actual hit part; native height painting applies one world-Z interval across the object with the native **0.1–8 mm** UI bounds. Group-local stroke undo and applied project undo preserve other paint channels. A two-part native comparison matches **800** outer-wall paths and material assignments. See [OBJECT_GROUP_PAINTING.md](OBJECT_GROUP_PAINTING.md).
- Sliced support preview runs the current draft through the real job pipeline and renders only support/support-interface extrusion paths. It supports layer filtering, cancellation of its owned job and bounded downloads, and retains the draft after errors. Enabled support produces **1,207** paths over **33** layers in the native reference; disabled support correctly produces zero. It remains distinct from Orca's internal pre-slice support-volume mesh. See [support preview](../sliced-support-preview.md).
- Status details wrap at narrow viewport sizes and transform controls stay within the inspector. The existing resize regression still checks a 250-pixel minimum scene, no document overflow and restored panel preference.

## Executed checks

All final checks passed with zero skips; browser fixture tests and installed-native evidence are separate.

| Command | Result | Log |
|---|---:|---|
| `npm test` | 472 unit/API checks | `/private/tmp/orca-m19-unit.log` |
| `npm run build` | passed | `/private/tmp/orca-m19c-build.log` |
| `npm run test:e2e` | 163 browser checks | `/private/tmp/orca-m19c-browser.log` |
| `npm run test:native` | 87 installed-native checks | `/private/tmp/orca-m19-native.log` |
| `npm run test:e2e:native` | 15 browser/native checks | `/private/tmp/orca-m19-native-browser.log` |

The first browser run passed 161 tests and exposed two failures: a final export timeout in the remapping scenario, and 14 pixels of real narrow-window overflow introduced by selection details. Browser workers are now bounded to four and the remapping scenario has a 60-second budget with every correctness assertion unchanged. The second run passed 162 tests, confirming that the layout failure was independent of load. Wrapping the status details and constraining inspector selects fixed that regression; the third full run passed. Earlier logs remain `/private/tmp/orca-m19-browser.log` and `/private/tmp/orca-m19b-browser.log`.

Enabled and disabled native support-preview screenshots were visually inspected. They prove rendering of the measured native paths; no desktop pixel comparison is claimed.

## Remaining work

Native GUI and hardware acceptance remain unverified. The Mac's locked session prevents direct GUI comparison. Dovetail cutting currently requires one filament and no part-specific overrides, nonnegative groove spacing, and bounded geometry; its initial depth uses the native geometry fallback rather than live camera zoom. Multiple-selection commands and large-scene performance still require broader native GUI acceptance.

Pre-slice support-volume generation is not exposed by the installed CLI. Painter button/modifier shortcuts, fill hover feedback and detailed native control layout remain open. Material shrinkage context, automatic/interactive brim ears and multi-plate PA patterns staged for the next batch are excluded from the check totals above. The inventory is a tracked set of feature units, not a defensible percentage of the entire native application.
