# Milestone 12 — brim tools, painter interactions and native GUI references

Baseline: installed **OrcaSlicer 2.4.2**, source revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Working tree extends `5050dab`. Full parity remains incomplete. No printer was contacted.

## Integrated behavior

- Brim ears now support automatic native-section corner detection, connected/disconnected markers, canvas placement/dragging/removal, visible rectangle selection, diameter wheel controls, clipping and local undo. Eighty-one independent C++ polygon/corner cases cover overlaps, concave holes and float/integer boundaries. Two installed-native comparisons match **22,709 / 53,770** motions with **469 / 526** adhesion segments. Open or branching sections still require manual placement. See [BRIM_EAR_TOOLS.md](BRIM_EAR_TOOLS.md).
- Painting uses native left/right/Shift actions, modifier-wheel increments, default sizes and color stroke constraints. Smart-fill, bucket and subfacet hover show the exact selected leaves, current colors multiplied by 1.25 and white boundaries. Unequal shared subedges do not create false interior outlines. Hover does not mutate painting or history. See [PAINTER_INTERACTIONS.md](PAINTER_INTERACTIONS.md) and [PAINT_FILL_HOVER.md](PAINT_FILL_HOVER.md).
- Variable-layer context resolves every material, includes native material participants across the active plate, and disables editing while material reads are incomplete. Both XY and Z shrinkage must match across used slots before compensation applies. Source-derived schedules agree with a newly captured GUI reference at 98% XY/Z: **102 layers through Z20.4**. Fresh CLI loading still produces 100/Z20; the correction is staged separately and is excluded from this milestone. See [layer-material-context.md](../layer-material-context.md).
- Pressure-advance pattern batches automatically add plates within the supported rectangular grid. Complete and selected exports retain native settings and all four generated command layers. Whole-scene token validation includes inactive plates; imported archive fingerprints permit selection changes while detecting content edits. A native eight-pattern, two-plate case verifies **18,200** generated moves. See [CALIBRATION_MULTIPLATE.md](CALIBRATION_MULTIPLATE.md).
- Fresh GUI projects retain typed `filament_colour_type` and `filament_multi_colour` metadata through strict import/export validation. The schema generator reads their pinned native definitions rather than permitting arbitrary fields. Actual native GUI cube G-code provides **10,989 exact motion matches** after web import, production validation/export and installed-native slicing. See [GUI reference provenance](../../tests/fixtures/native-gui-cube-provenance.md).

## Executed checks

All final checks passed without skips. Fixture-browser and installed-native evidence remain separate.

| Command | Result | Log |
|---|---:|---|
| `npm test` | 507 passed | `/private/tmp/orca-m12b-unit.log` |
| `npm run test:e2e` | 179 passed | `/private/tmp/orca-m12c-browser.log` |
| `npm run test:native` | 96 passed | `/private/tmp/orca-m12c-native.log` |
| `npm run test:e2e:native` | 15 passed | `/private/tmp/orca-m12c-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m12b-build.log` |

## Failure history and corrections

The first full browser/native run exposed a real material-context bug: source-schema defaults for FloatOrPercent are objects, and one native boolean default is numeric. Passing these unconverted into region validation rejected a catalog-based variable-layer project. Defaults are now serialized according to their native type, with a sparse-settings regression. The full unit/API suite increased from 506 to **507 passing** checks.

Two broad runs also encountered unrelated multi-minute timeouts. macOS power logs confirmed repeated maintenance sleep while the desktop was locked, including 470–1,044 second gaps. An idle-sleep assertion did not prevent maintenance sleep. A temporary AC-only system-sleep assertion allowed the subsequent checks to run; no lock, display or permanent power settings were changed. Interrupted browser runs retained 162/179 and 170/179 passes. The first browser/native run retained 12/15 passes, with two interrupted workflows and the real defaults failure. Native processes stalled across sleep were terminated and rerun, not counted as passing. Logs remain `/private/tmp/orca-m12-*.log` and `/private/tmp/orca-m12b-*.log`.

A direct CLI attempt on the unmodified GUI cube export failed239 because customized preset IDs include the imported archive name while compatibility metadata retains base names. The production project service already removes compatibility plumbing from standalone embedded configuration. The final differential reference is the actual GUI-exported G-code, with both reference files hash-bound in the test. No geometry or process setting was removed to obtain the match.

## Remaining work

Desktop access was briefly available for real cube, text and shrinkage fixtures, then macOS relocked. Additional native GUI comparisons await access. These artifacts do not certify full UI pixel equality or native text regeneration. The fresh-CLI shrinkage correction, text metadata preservation and preview inspector are separate staged work, excluded from this milestone's results.

Brim open-chain repair, native polygon nesting for calibration, every degenerate geometry path, broad GUI interaction/pixel acceptance and hardware integrations remain incomplete. The feature inventory remains a tracked set of major units rather than a defensible percentage of the native application's entire functionality.
