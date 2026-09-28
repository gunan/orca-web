# Native travel and wipe solids

OrcaSlicer 2.4.2, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This extends `preview.toolpath` and the geometry portion of `preview.playback`/`preview.color-modes`; the broad features remain partial.

The worker already exported native Travel/Wipe positions, dimensions, turn angles, depth bias, and valid-line IDs. The web adapter previously emitted solid geometry only for extrusion. Its segment shader transport also replaced the fourth HWA component with zero. Travel and wipe therefore appeared as lines and wipe lost the native eye-space bias.

All native valid motion paths now use the original eight-vertex/eight-triangle segment template and native shader. The adapter keeps `(height, width, angle, bias)` at both original native endpoints. Travel and wipe use the native default HWA dimensions of `0.1f`; they remain at their native commanded Z. Extrusion retains its native half-height Z correction. Wipe retains its `0.05f` eye-space bias. This follows native naming and math; it does not reinterpret the dimension as a newly calculated physical cylinder radius.

The native Tool view uses the tool color for travel; wipe remains its original yellow. That fixes a related observed adapter branch that previously forced every non-extrusion path to the travel color. Existing native modes and source fallback are otherwise unchanged. Source-only travel remains line-rendered, and three-component fallback extrusion data receives an explicit zero fourth component.

## Source audit

| Native behavior | Result |
|---|---|
| `ViewerImpl::extract_pos_and_or_hwa` dimensions, Z, turn angle, valid line, bias | Original worker values preserved through adapter and instance buffers. |
| `SegmentTemplate` topology, pointy caps | Original template retained. |
| `Segments_Vertex_Shader` closer-endpoint anti-twist, vertical branch, corner/cusp geometry, lighting | Original shader math retained; four-component input transport fixed. |
| `render_segments` disables face culling | Existing double-sided web segment material already matches; retained. |
| Tool color for travel; yellow wipe in Tool view | Corrected to original `get_vertex_color`. |
| Adjustable Travel/Wipe radii | Debug-only native UI, gated by `ENABLE_NEW_GCODE_VIEWER_DEBUG`, defined as **0** in `libslic3r/Technologies.hpp`; not added as a normal web control. |

The source audit found no separate missing corner-join primitive: native renders the view-dependent segment template using endpoint turn angles. Adding another tube/join algorithm would change native behavior.

## Evidence

- **19 compiled original C++ geometry captures** cover positive/negative corners, vertical travel lifts, non-planar paths, reverse cusps, zero-length rejection, and motion/event/type boundaries for Travel, Wipe, and Extrude. Original `extract_pos_and_or_hwa`, PathVertex, and vector helpers produce the reference buffers.
- **37 native segment GPU probes** compare all eight vertices' eye-space positions and RGB lighting with original native GLSL: **1,776 values**. Reference buffer access is represented by equivalent attributes; original geometry/light arithmetic remains unchanged and native coordinates receive the corresponding view matrix. Wipe's nonzero bias is part of the comparison. Existing 16 independent C++ shader cases remain passing.
- The real worker processes the existing genuine GUI export into **21,026 solid motion paths**: **18,776 extrusion, 1,820 travel, and 430 wipe** paths. Every adapter endpoint is compared with the original native position, four HWA values, and vertex ID; vertical lifts and nonzero corner angles are exercised.
- **12 unit/native checks** pass (11 unit, including 3 new; 1 new real-native test). **5 browser checks** pass (1 new shader check + 4 existing geometry regressions). **7 distinct native-browser checks** pass (1 new + 6 existing range/inspector cases). Production build passes.
- The new native browser case enables real Travel/Wipe paths, verifies exact solid counts without fallback lines, narrows to a layer, changes to Tool view, scrubs to a real wipe command, and independently toggles wipe visibility. Positive screenshot is retained under the isolated run's `test-results/solids-native-browser/.../native-travel-wipe-solids.png`.

An initial browser assertion expected preceding travel at the layer's first wipe tick. Native order placed that wipe before travel, so the test now chooses the last real wipe tick to exercise both already-present path types. It retains the assertion that hiding wipe leaves actual travel visible. Runtime behavior was correct.

## Reproduction and limits

```sh
python3 scripts/generate-native-motion-geometry.py /path/to/pinned/OrcaSlicer
node --test tests/unit/native-motion-solids.test.js
node --test tests/native/native-motion-solids.test.js
```

The generator verifies the pinned Git revision and rejects modifications to its source inputs. Source SHA-256 hashes and original shader text are retained in `tests/fixtures/native-motion-geometry-reference.json`. Original Prusa Research/libvgcode portions remain AGPLv3 or later. Normal tests use committed captures and add no dependency.

The change adds no worker schema, server route, G-code mutation, printer connection, or physical action. Existing native input/output/vertex bounds remain. Native GUI screenshot certification remains pending; this is source/worker/browser evidence. Native speed and other remaining view modes, native tool-head/center-of-gravity markers, event statistics, viewport shell behavior, camera/UI layout, and pixel-level parity remain separate work. The earlier M38 documentation's Travel/Wipe-tube gap is resolved by this change.
