# Native extrusion geometry in Preview

This increment replaces zero-width lines with instanced solid geometry for linear extrusion paths whose height, width and linear volumetric flow are available. It uses OrcaSlicer 2.4.2's native eight-vertex/eight-triangle segment template and source shader, including camera-dependent faces, closest-endpoint orientation, pointy caps, corner joins, endpoint dimensions and lighting. Existing feature, layer and move visibility controls retain original segment identities. Unknown paths, arcs and travel remain lines.

This is partial preview parity. It does not assert desktop framebuffer equality, complete native GCodeProcessor vertex/event equivalence, native motion timing, per-role statistics, arc volume rendering, or retract/seam/tool-change markers.

## Pinned source and regeneration

All source references use OrcaSlicer commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- [LibVGCodeWrapper.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/LibVGCode/LibVGCodeWrapper.cpp), conversion around lines 191–264: native phantom vertices when extrusion type, role or mm³/mm changes.
- [ViewerImpl.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/ViewerImpl.cpp), `extract_pos_and_or_hwa` around lines 911–981: float coordinates, valid adjacent lines, half-height Z offset and signed planar turn angle.
- [SegmentTemplate.cpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/SegmentTemplate.cpp): native eight triangles.
- [Shaders.hpp](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libvgcode/src/Shaders.hpp): desktop `Segments_Vertex_Shader`, with `POINTY_CAPS` and `FIX_TWISTING` enabled. Original Prusa Research contributors; AGPLv3 or later.

The generator requires the exact pinned `Shaders.hpp` SHA-256 `b477608ae44b93b1423bf8807976bec3c0cd30308737519449c7fff197d22068` and fails on changed structure. It preserves the native geometric and lighting arithmetic, replacing buffer texture lookups with WebGL instance attributes, applying the existing web Z-up coordinate mapping, and changing `float == 0` to `float == 0.0` for GLSL ES. Native 24 indexed entries are rendered as eight logical vertices with instancing. No new package is required.

```sh
node scripts/generate-preview-volume-shader.mjs /path/to/pinned/src/libvgcode/src/Shaders.hpp src/preview-volume-shader.js
clang++ -std=c++17 -O0 -ffp-contract=off tests/fixtures/native-preview-volume-reference.cpp -o /tmp/orca-preview-volume-reference
/tmp/orca-preview-volume-reference > tests/fixtures/native-preview-volume-reference.json
```

## Evidence

- Four unit tests exercise native topology, connected turns, role/flow phantom endpoints, variable endpoint dimensions, missing values, arcs and omitted stationary extrusion events. Input parser data remains unchanged.
- An independent C++ float32 translation of the original shader produces 16 reference cases: horizontal/vertical/sloping/short segments, opposite camera directions, positive/negative/cusp turns, endpoint width/height changes, closest-endpoint selection and large coordinates.
- A browser test compiles the **production** GLSL and reads its actual GPU vertices with WebGL2 transform feedback. All 384 coordinates match the C++ reference within 0.0001 mm or two float32 ULPs at large coordinates. The tolerance accounts for GPU `sin`/`cos`/normalization differences; exact branch-boundary camera ties are inherently sensitive to signed floating-point roundoff in the native algorithm too.
- Three more browser tests exercise solid/fallback rendering, role and layer filtering, move scrubbing, playback and missing metadata. They fail on browser or shader console errors.
- The unchanged, provenance-recorded actual native GUI export `tests/fixtures/native-gui-shrink98-2.4.2.gcode` supplies 6,896 solid paths out of 6,900 extrusion paths. Four paths lack height/width metadata and retain lines. Layer 50 has 31 displayed solid segments/248 triangles. Browser screenshots verify the rendered layer after fitting and scalar coloring.
- Targeted run: 18 combined preview unit tests; seven combined scalar/volume browser tests; Vite build pass. These do not replace the parent integration/full-suite check.

A meaningful failed check was retained in the work record: desktop GLSL's `height_width_angle.z == 0` initially failed to compile under GLSL ES. The old scalar UI tests passed despite an empty canvas; the new shader-error and transform-feedback tests caught it. The generator now converts the literal explicitly.

## Boundaries

The existing parser and the source-backed attribute reader are unchanged. Solid eligibility requires finite positive height, width and mm³/mm, finite distinct float32 endpoints, a non-arc extrusion, and no missing segment data. Continuous joins require adjacent spatial segments with the same role and mm³/mm. Explicit E-only movements and recognized tool/color/pause/custom events break continuity. Missing intermediate spatial paths break continuity too.

The native processor also inserts events and seam vertices not represented by the current parser. This implementation therefore does not certify all native event joins. A headless native GCodeProcessor result is still needed for complete vertex/event, timing and per-role statistics parity. No length/feed timing estimate was introduced. Existing commanded-coordinate and unsupported-firmware limitations remain visible.

Native source shader comparisons are a geometry proof, not a claim that the web camera, background, antialiasing, lighting coordinate frame, UI layout or GPU output is pixel-identical to the desktop. Unknown geometry is visibly reported rather than assigned a nominal nozzle width.
