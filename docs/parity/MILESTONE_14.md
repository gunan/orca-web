# Milestone14: portable project files and native preview geometry

Baseline: installed OrcaSlicer2.4.2, source8500fcdccaa10b5099ac20d252af3a7c560046f1, repository5050dab plus this working tree. No printer contacted. Full UI/features parity remains incomplete.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 573 passed,0 skipped | `/private/tmp/orca-m14-final-unit.log` |
| `npm run test:e2e` | 198 passed,0 skipped | `/private/tmp/orca-m14-final-browser.log` |
| `npm run test:native` | 126 passed,0 skipped | `/private/tmp/orca-m14-final-native.log` |
| `npm run test:e2e:native` | 17 passed,0 skipped | `/private/tmp/orca-m14-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m14-final-build.log` |

## Scope

- [Native project files](../native-project-attachments.md): exact opaque bytes, categories, Unicode names, covers/attribution, bounded pictures, download, rename, deletion and undo. Three browser workflows pass. Actual native re-export retains files/attribution and10,989 capturedGUI motions. Set-as-cover and broader nativeGUI editing remain open.
- [Raw native3MF shrinkage](../raw-3mf-shrinkage.md): native profile merging plus source archive preservation matches9,217 capturedGUI motions. Actual parts/materials/events, native bed adaptation and monochrome geometry-only placement pass. Remaining property/legacy-format conversion is explicit.
- [Single-volume material assignment](../single-volume-material.md): native source erases the sole volume's extruder override; the parent now reflects the browser's selected material. Four units, an actual native before/after check and browser-native selector/export/layer/slice workflow pass. Multipart overrides remain independent.
- [Preview solids](PREVIEW_VOLUMES.md): production WebGL matches384 independent C++ vertex coordinates over16 cases. Native width/height/caps/junction geometry replaces lines for6,896 supported extrusion paths in the GUI fixture. Unknown paths stay lines; complete event/timing integration remains future work.

## Evidence and remaining work

The first attachment browser run could not locate the License control by exact label text because option text was included by its label query. The control now has an explicit accessible name and the same workflow passes. An initial attachment unit assertion compared equal Buffer and Uint8Array bytes by object type; corrected byte comparison passes. A second unit check caught an unwanted added auxiliary middle-cover relationship; exporter fallback now preserves the original relationship set.

Earlier raw native exporter probes were run inside the graphics sandbox and also supplied an absolute --export-3mf path that Orca prepended to outputdir. A later unsandboxed relative-filename probe succeeded. These probe failures do not establish an installed-native export limitation; a later increment will use that verified export path for remaining3MF forms.

Inventory now has122 major feature units, including new projects.auxiliary-files; expansion is not a parity percentage or a regression. Native text regeneration, native per-event timing/role data and exact cover resizing have running prototypes outside this milestone and are not counted as integrated features. GUI access is still locked; fresh captures and hardware acceptance remain pending. Temporary AC sleep assertions kept tests from maintenance-sleep interruptions without changing display/security preferences.
