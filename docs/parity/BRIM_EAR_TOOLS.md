# Native brim-ear tools

Reference: OrcaSlicer2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This extends the existing native brim-ear metadata, grouped coordinate conversion, native export and explicit Apply/Cancel editor. The feature remains **partial** until native GUI visual/interaction comparison is available. No physical adhesion outcome has been tested.

## Implemented behavior

- Auto-generate operates on the selected native object group, unioning normal volumes and subtracting negative volumes. Modifier/support volumes do not change its outline. It appends ears and avoids native-equal duplicates; it does not replace manually placed ears.
- The section is at native `Z=0.1f`: integer XY units of1µm after a float32 transform; nonzero polygon filling; per-volume closing radius0.1mm; additional offset0.05mm; miter joins/limit3; short-edge filtering at0.005 times each offset; native0.01mm outline simplification. Separate normal/negative unions precede subtraction. Reversed hole contours use the native concave-corner predicate.
- Max angle defaults to125°, detection radius to1mm. **Detection radius is Douglas–Peucker outline simplification tolerance**, not minimum ear spacing. Max angle90° deliberately excludes exact right-angle turns because native uses a strict predicate with `nextafter`. The detection-radius maximum follows the source search.
- Initial head diameter is16 times the global initial-layer line width (percent widths resolve against the first nozzle). An unavailable width leaves the diameter blank. The native slider and Ctrl/Cmd-wheel range is5–20mm; numeric editing retains the broader bounded metadata range. The wheel changes diameter by0.1mm.
- Click a normal-part surface to add at build-plate Z=-0.0001; drag ears using normal-part ray hits; right-click removes the hit ear. Normal-part occlusion controls marker picking. Shift/Alt rectangles select/deselect visible centers, testing both the point and its source1mm visibility allowance. Ctrl/Cmd+A selects all; Delete removes selected ears. Ctrl/Cmd dragging retains camera interaction. A selected ear supplies the current diameter; changing diameter affects selected/hovered ears.
- Native-size16-sided cylindrical markers, hover preview, selected/hover colors and disconnected warnings. Connectivity uses native24-sided ear polygons and repeated union, so chains of ears may connect to the model through other ears.
- Section-view position/Alt-wheel, reset, local undo/redo, immutable scene edits and one project-history commit on Apply. Cancel leaves the project unchanged. World positions rebase through the existing native-group anchor; ear diameters remain independent of object scale.

## Source and dependency provenance

Primary pinned sources:

- [GLGizmoBrimEars.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoBrimEars.cpp): gestures, generation951, section969, maximum radius1032, native diameter1158, connectivity1165.
- [GLGizmoBrimEars.hpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoBrimEars.hpp): defaults.
- [TriangleMeshSlicer.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/TriangleMeshSlicer.cpp): facet ownership/rounding156, make_expolygons1738, float32 scaling1830, slice_mesh_ex2003.
- [MultiPoint.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/MultiPoint.cpp), [Polygon.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Polygon.cpp), [ClipperUtils.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/ClipperUtils.cpp): simplification, corner predicates and polygon offsets.
- [BrimEarsPoint.hpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/BrimEarsPoint.hpp): exact float32 positions and radius epsilon duplicate equality.

`clipper-lib` is pinned to npm version6.4.2 (its JS source declares6.4.2.2), published from [junmer/clipper-lib](https://github.com/junmer/clipper-lib). Its underlying Angus Johnson6.4.2 polygon engine and Timo JavaScript translation use the Boost Software License; bundled JSBN retains Tom Wu's permissive notice. Notices ship in `public/licenses/CLIPPER-{BOOST,JSBN}-LICENSE.txt` and `CLIPPER-NOTICES.txt`. The lock records the registry tarball SHA512 integrity. The JS module wrapper changes both rounding entry points to Orca's positive-tie rule and explicitly ports Orca's short-edge filtering and per-hole offset handling. It does not claim every predicate/repair path in the modified native fork is identical. Orca-derived application algorithms retain the repository's existing native-source AGPL provenance.

## Verification

`tests/unit/brim-ear-auto.test.js` checks81 independent C++ polygon/corner cases, exact angle boundaries, default percent widths, duplicate behavior, transformed/reflected grouped meshes, modifier exclusion, damaged sections, and transitive ear connectivity. The committed JSON comes from **the unchanged pinned Orca Clipper C++ implementation**, compiled with simple Eigen-vector and allocator shims; those shims replace data containers/allocation, not clipping logic. Portable source adapters implement native Douglas–Peucker, polygon filtering, per-hole offsets and generation. The cases include concave outlines, rectangular and concave holes, overlapping positive/negative volumes, sharp miter limits and sub-micron edges. `scripts/generate-brim-ear-reference.py` verifies the two pinned source SHA256 hashes and recompiles the fixture with `clang++`; ordinary tests need no compiler/network.

Two real installed-Orca acceptance cases compare every motion command against separately sliced C++ reference ear positions:

| Geometry | Ears | Native adhesion segments | Exact motion matches |
|---|---:|---:|---:|
| Overlapping native-group normal volumes |6|469|22,709|
| Mirrored concave negative hole |6|526|53,770|

The existing native brim test separately proves localized adhesion changes with ear position and no adhesion from ears above the plate. Browser tests exercise automatic append/dedup, native angle boundary, selection diameter, local undo/Cancel, canvas placement, modified wheel, keyboard deletion, visible rectangles, dragging, right-click removal, section view, project undo and native export.

Negative evidence/fixes: the section-view browser test caught a bounds proxy with two vertices, which the geometry validator correctly rejected; the proxy now contains a complete degenerate triangle solely for bounding-box calculation. A camera-toggle test initially expected the previous camera orientation, but projection changes intentionally reset the view; it now explicitly sets Top after choosing orthographic projection. No test bypasses geometry validation.

## Remaining bounds

- Native's heuristic open-chain joining/mesh repair is not ported; open or branching plane sections fail visibly, leaving manual editing available. Automatic detection is bounded to2million triangles/vertices and100,000 section vertices; project metadata bounds limit ears to1,024.
- Native section initialization uses the current native instance/volume representation. The browser canonicalizes geometry through its world/object anchor. Arbitrary transformed meshes can differ at float32/FMA or integer predicate boundaries beyond the proven fixtures; no universal bit-for-bit kernel equivalence is claimed.
- The browser section-view control uses the existing shared view clipping/cap implementation. Full native GUI camera/section behavior, marker rasterization, layout/pixels, fine-grained native undo grouping, and every degenerate mesh path remain unverified.
- No connected printer actions, print jobs or physical adhesion measurements were performed.
