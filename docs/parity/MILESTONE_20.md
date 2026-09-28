# Milestone 20: linked editing, clipboard, variants and Preview

Baseline: installed OrcaSlicer **2.4.2**, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Full UI and feature parity remains incomplete. Four detailed inventory units now separately track Fill, linked edits, settings/range clipboards and native tool-position preview; inventory counts do not represent a parity percentage.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 797 passed, 0 skipped | `/private/tmp/orca-m20-final-unit.log` |
| `npm run test:e2e` | 254 passed, 0 skipped | `/private/tmp/orca-m20-final-browser.log` |
| `npm run test:native` | 203 passed, 7 failed, 3 cancelled, 0 skipped | `/private/tmp/orca-m20-final-native.log` |
| `npm run test:e2e:native` | 48 passed, 0 skipped | `/private/tmp/orca-m20-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m20-final-build.log` |

The ordinary browser suite uses fake slicing/arrangement and the real native configuration helper. Native browser cases explicitly exercise the installed helpers/engine, or feed original processed native reference files to browser rendering through controlled routes. These distinct test paths are identified in their individual reports; none is a physical printing test.

## Implemented and compared

- [Fill bed](NATIVE_FILL_BED.md) invokes original FillBedJob semantics, including its polygon/grid threshold, native placement quirks and subsequent Arrange transaction. The real browser produces one native object with four instances and slices four labels across 125 layers.
- [Linked edits](NATIVE_INSTANCE_EDITS.md) preserve shared part geometry, settings, paint, names, height metadata, text/SVG frames and brim ears while retaining instance placement. Original C++ matrix cases agree to `1e-12`. Rotated/mirrored archives match independent XML edits byte-for-byte. Fixed repeated-input motion assertions remain strict; the final native run fails on translation-only geometry too, so native motion determinism remains unresolved.
- [Settings and height-range clipboard](NATIVE_SETTINGS_CLIPBOARD.md) uses original typed configuration operations and independently compiled unchanged ObjectList method references. Twelve cases cover native replacement, inheritance, parent compensation and destination filaments. Height-range accumulation and equal-bound destination priority survive export and actual slicing. A combined browser case verifies one Paste/Undo across all linked instances.
- [Custom preset variants](../custom-preset-variants.md) retain inactive alternatives across save, reset, cloning, reload and native re-export. Physical-nozzle/volume labels and fixed Normal/Silent dimensions describe stored editor values. Original slicing resolution stays unchanged where the native editor and `full_config` differ. Complete archive material limits `[27,43,27,43]` yield selected G-code limits `[27,43]`.
- [Tool position](NATIVE_TOOL_POSITION.md) reproduces 21,463 native property rows, 446 actual-speed profile points, default hotend normals/transforms and original shading. [Hotend assets](NATIVE_HOTEND_ASSETS.md) bind immutable printer identity to ready jobs and use native vendor/model selection. The browser switches between 560-face default and 3,208-face Vzbot models, and clears unavailable assets without stale geometry.
- [Preview performance](PREVIEW_PERFORMANCE.md) stops idle rendering after camera damping and redraws on data, camera, size, visibility and playback changes. Tests preserve 812,588 exact original native colors. Reduced contention is an inference; the test directly proves frame scheduling and responsive redraw behavior.

The native configuration helper was rebuilt from the combined clipboard and preset-editor headers through the durable build script. Its paired manifest records both headers, pinned original GUI method sources and binary SHA. The native arrangement helper includes Fill; the G-code helper remains the previously validated scalar-capable build.

## Integration diagnostics

Initial Fill identity enforcement found four unit fixtures/runtime paths retaining a linked-family token on newly independent objects. Duplicate and independent Cut outputs now detach intentionally; independent test fixtures explicitly clear that token. The legacy generated-pattern fixture excludes metadata fields that did not exist in its historical fingerprint. Production binding and identity validation were retained. Initial counts and logs are in `/private/tmp/orca-m20-first-unit.log`, `/private/tmp/orca-m20-instance-lifecycle-rerun.log` and `/private/tmp/orca-m20-first-native.log`; the affected native arrangement/clipboard/Fill/scalar/position rerun passed 38 checks.

The first complete unit/API run passed 794/795. Its old strict part-export assertion rejected `layer_height`, but original native settings Paste can produce that compensation key in part metadata. The regression now separately verifies source-native compensation roundtrip and rejection of executable `post_process` values; the part editor still restricts ordinary edits to region settings.

The first full browser run passed 250/254. Three failures came from independent multi-selection/cut fixtures copying a newly retained linked-family token; those fixtures now explicitly represent independent ModelObjects, retaining all original assertions. The fourth exposed a real catalog-project Paste bug: compatibility metadata in resolved settings reached the native override validator. Paste now uses the existing native scope filter, with a dedicated full-catalog API regression and combined linked-instance browser acceptance. Failure traces are preserved under `/private/tmp/orca-implementation/m20-first-browser-failures`.

The first full native-browser run passed 42/48. Six existing Preview fixtures mocked ready jobs but omitted the new job-scoped hotend metadata endpoint, causing expected missing-job HTTP 404s to fail their strict console checks. Their complete fixture now obtains actual installed hotend bytes/provenance through the same native asset service and retains the console assertions. The production API and old-server fallback were unchanged. Initial traces remain under `/private/tmp/orca-implementation/m20-first-native-browser-failures`.

An integrated rotated linked-instance probe produced different toolpaths from identical native-readable archive contents. A fixed reference/reference/web/web control then confirmed that the *same saved web input* can produce the alternate output. [The durable record](native-instance-repeatability.json) and [compressed original inputs/outputs](native-instance-repeatability.zip) retain every failed/control run. The subsequent full rerun also failed the translation-only fixed repeated-input assertion: the exact same web archive produced11,223 and11,057 commands. This remains a failing test; no translation-only determinism claim survives that later evidence. Rotated/mirrored archive equality and original matrix tests remain strict. No retry-until-pass or relaxed numeric tolerance is used to claim native motion equality.

## Remaining scope

Linked geometry Cut/reset/ensure-on-bed, exact prime-tower arrangement footprint, per-extruder printable regions, native object-tree structure/action icons and complete settings clipboard selection modes remain open. Original native compatibility expressions and additional Preview material/statistics views are being implemented separately. They are not counted in this milestone. Native account/user preset synchronization and full tab/layout behavior remain incomplete.

Fresh native desktop capture is still unavailable while the Mac is locked. Saved surface-text exact-motion mismatch and rotated native slicer repeatability remain unresolved. No physical printer was contacted or print started. Hardware acceptance, platform coverage and complete visual parity remain pending.

The initial full installed-native run passed209/213; four older tests constructed independent objects or a new part by copying imported linked-instance identity directly. Their explicit independent/shared identity setup was corrected while retaining the slicing, connector, material and engraved/raised text assertions. The initial failure log is `/private/tmp/orca-m20-native-before-fixture-fixes.log`. The corrected four files then passed all9 focused native checks without changing their assertions. The final native results above come from the full rerun, not a sum of selected passes.

Review also found that creating a new text/SVG volume on a single imported native object does not yet inherit its shared-object identity. This is a known M20 limitation; a staged fix already has seven identity/export regressions, and full integration/native-browser verification belongs to the next milestone. Existing creation acceptance uses independent source meshes and does not certify this imported-object path.

## Latest native verification failure

The final full run produced203 passes,7 failures and3 cancelled tests. The translation-only repeatability test failed, an XL validation probe exited withSIGBUS instead of its expected native rejection, and eight export-dependent cases failed or timed out. A one-second sample of an owned stalled export proves `glfwInit → NSApplication → NSPersistentUIRestorer::promptToIgnorePersistentStateWithCrashHistory → NSAlert::runModal`. The Mac is locked and cannot be inspected or unlocked by the UI tool; an unlock request is pending. No native user preferences, crash state or restoration data were modified. No test assertion or timeout was relaxed.

[Translation-only failing run metadata](native-instance-translation-repeatability.json), [all four native inputs and outputs](native-instance-translation-repeatability.zip), and [sanitized export stack excerpt](native-export-restoration-block.txt) preserve the evidence. The failing full-run log is `/private/tmp/orca-m20-final-native.log`. Original native export acceptance must be rerun after desktop recovery. The live server remains on the earlier validated M19 snapshot while M21 is tested separately.
