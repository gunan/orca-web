# Native arrangement evidence — OrcaSlicer 2.4.2

This evidence covers the staged native arrangement kernel, its project adapter, and selected limits. It does **not** establish complete arrangement UI parity, all printer bed types, a native GUI visual comparison, or physical-print validation. Source is pinned to `8500fcdccaa10b5099ac20d252af3a7c560046f1`. All calls use temporary local files; no printer is contacted.

## Verified results

`tests/native/native-arrangement.test.js`: **30/30 pass, zero skips**, recorded in `/private/tmp/orca-m39-native-arrangement-final.log`.

| Checks | Evidence |
| --- | --- |
| 12 original-core captures | Exact native transforms, translation, rotation, footprint inflation, bed index, minimum distance and bed shrink for fixed selection, 7.5/30 mm spacing, normal/tree support, sequential short/tall objects, GUI Y alignment, allowed rotation, central exclusion, concave wrapping, and a combined skirt. |
| 4 original tower-estimate captures | Exact original `PartPlate::estimate_wipe_tower_size/polygon` output and resulting placements for rib/rectangle, ignored configured rotation, automatic brim and clamped position. These are **estimated-tower** semantics only. |
| 11 installed-native CLI comparisons | Fresh genuine GUI cube, three cubes, rotated rectangles with rotation disabled/enabled, baked reflections, a native group containing a normal part plus negative/modifier parts outside its footprint, skirt, normal support, excluded region, wrapping region, and sequential clearance. Every named part's transformed triangle corners and world bounds match the native-exported 3MF within **0.00003 mm**. The arranged result also survives a web-native 3MF export/reload at that tolerance. |
| 1 identity/provenance check | Installed engine release, helper release/revision, binary SHA-256 against the paired build manifest, source-file SHA-256 against the fixture provenance, and capture C++ SHA-256. |
| 1 selected-object adapter check | Unselected parts and objects on another plate remain byte-identical; original project/history is not mutated. |
| 1 bounded-input check | Eleven malformed or out-of-scope requests reject without producing output: nonaffine/singular matrices, huge coordinates, invalid triangle indices/roles, no normal part, duplicate IDs, empty selection, nonprintable objects, overheight objects and more than 256 objects. A subsequent valid invocation succeeds. |

The real-native comparison uses the existing `native-gui-cube-2.4.2.3mf` fixture and its recorded provenance; it does not fabricate a native screenshot or duplicate the fixture. Original triangle topology remains unchanged after arrangement. Grouped negative/modifier parts retain roles and group membership. Placement tests prove the normal footprint drives arrangement even when helper geometry extends beyond it.

## Independent compiled-source captures

`native-arrangement-reference.cpp` is a separate native entry point. It constructs native `its_make_cube` primitives and original `Model` objects, obtains native footprints through `get_instance_arrange_poly`, and invokes the original `Arrange.cpp` functions. It does not call the production worker's parser, settings filter, project adapter, validation, or `main.cpp`. The output records explicit input geometry/transforms/settings alongside native expected results.

`native-arrangement-reference-tower.cpp` contains the two original pinned PartPlate estimation bodies, with only their class qualifier changed to a headless fixture class. The fixture supplies its own native `Model` and `PrintConfig`; original WipeTower depth/automatic-brim functions remain linked. It does not call the production `NativeArrangePlate` facade. Its four captures include original estimated contour coordinates, not merely the returned dimensions.

Both fixtures were compiled and run using the pinned native dependency cache. They link the original source object files read-only from the arrangement build; the only generated Model source difference is the separately documented removal of the unused STEP reader. Source hashes and C++ fixture hashes are retained in the two JSON capture files and checked in the native test. This is independent facade/parameter evidence, not a claim that two different arrangement algorithms were compared.

For reproduction, the staged `probe-arrange-reference.py` and `probe-arrange-tower-reference.py` read `ninja -C native/build/arrange -t commands orca-arrange-worker`, compile the separate fixture entry point with identical native flags, replace only the production main object in the link command, and write captures from that executable. `/private/tmp/orca-arrangement-reference-build.log` and `/private/tmp/orca-arrangement-tower-reference.log` record successful builds. Production runtime/build paths and the shared source/dependency cache were not modified by the evidence work.

Relevant original source: `Arrange.cpp:85–158` (skirt, sequential spacing, inflation, axis alignment), `ModelArrange.cpp:119–193` (temperature/support margins), `Model.cpp:3370` (normal-part footprint/materials), and `ArrangeJob.cpp:759–804` (GUI parameter construction).

## CLI and GUI defaults are distinct

Native GUI Y alignment is an explicit arrangement setting. CLI `OrcaSlicer.cpp:5229` derives it from `printer_structure == psI3`. The genuine GUI cube fixture serializes `printer_structure=undefine`; installed CLI therefore leaves Y alignment off. The eleven CLI comparisons deliberately set `alignY:false`; independent compiled-source captures verify the true GUI option. Treating a CLI export as an oracle for an explicitly different GUI option would produce a false regression.

Automatic-rotation comparisons contain Float32/3MF rounding differences below 0.00001 mm. The 0.00003 mm vertex tolerance reflects those serialization differences; original source transform comparisons are exact.

Pinned `PrintConfig.cpp:11580 get_real_skirt_dist` uses raw `opt_float(initial_layer_line_width)`. Thus `120%`, three loops and 6 mm skirt distance produce native bed shrink **367 mm**, in both the kernel and installed CLI. The meaningful skirt-spacing test uses explicit width **0.48 mm**, yielding native Float32 bed shrink **8.440000534057617 mm**. The source quirk is recorded rather than silently “corrected” to a different algorithm.

## Existing native tower geometry remains a gap

There are two native arrangement paths:

1. **Estimated tower:** `PartPlate::estimate_wipe_tower_polygon` uses nominal `prime_tower_width` in X, estimated depth in Y, configured or automatic brim once, and clamps its position. Configured rotation is commented out. For the rib fixture, nominal width is **25 mm**, returned estimated size is **26.19645015593611 × 26.19645015593611 mm**, and its original estimated contour still uses the nominal X width. The four captures verify this exact behavior.
2. **Already displayed tower:** `ArrangeJob.cpp:24–63` uses `WipeTower::get_arrange_polygon` fed by `GLCanvas3D::get_wipe_tower_info` at **5380**. The latter obtains the native GLVolume's local bounding box, offsets it by configured/automatic brim **twice**, and clamps project XY against the inflated bbox size. Its rotation assignment is explicitly commented out (“don't support rotation”); `WipeTowerInfo::m_rotation` defaults to zero. Do not infer native arrangement rotation support merely because the displayed volume itself is rotated.

The displayed geometry provider is `GLCanvas3D.cpp:2887–2925`. Before a completed wipe-tower step, `3DScene.cpp:832 load_wipe_tower_preview` creates a native cube using `estimate_wipe_tower_size`'s actual width/depth/height. After slicing, `load_real_wipe_tower_preview` at **879** merges the native tower mesh and brim mesh, obtains their convex hull, and stores it in the GLVolume. The same double-brim bounding-box expansion then applies when arrangement requests its info. The current web arrangement estimate is not evidence for either existing-volume path.

Exploratory CLI probes expose a third distinction: export-only global arrangement had an empty `used_filament_set` and inserted no tower obstacle. That output is **not** parity evidence. Running `--slice 1 --arrange 1` uses the CLI's per-plate tower rectangle with the actual estimated width, moving the test cubes **1.19645 mm** farther in X than the nominal-width estimate. Logs and temporary models are under `/private/tmp/orca-arrangement-audit/prime-tower`; this deliberate source-path difference is not hidden by loosening the test tolerance. Existing displayed/sliced tower parity requires its native bbox provider and remains open.

## Limits and negative evidence

The initial validation build rejected a valid empty `wrapping_exclude_area` vector from the fresh GUI fixture. The implementation owner fixed empty bed/wrapping vectors before the final passing run. A native CLI launch initially aborted under the filesystem sandbox; rerunning the authorized local native executable outside that sandbox succeeded. No wrapping-kernel failure was established.

The test harness initially supplied a volume-center transform alongside already uncentered native cube input, double-applying native `add_volume` centering. Correcting the independent fixture's input frame to identity yielded exact original transform matches. The production implementation was unchanged. A reflection probe initially used a negative browser scale, which the project's existing validator correctly rejects; the accepted comparison uses the actual baked-reflection helper with positive scales and reversed triangle winding.

Nonprintable and overheight objects currently reject explicitly because native outside-plate workspace placement is not implemented. Failed-to-fit negative bed IDs also reject. Locked/outside objects, all multi-plate edge cases, circular/custom beds, calibration-region behavior across printer families, existing rendered/sliced tower geometry, native GUI layout and visual parity still need additional acceptance. These results support a **partial** arrangement feature status, not a 100% parity claim.
