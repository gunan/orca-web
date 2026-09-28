# Native surface-text regeneration investigation

The pinned native surface engine can produce different cap triangulations for identical serialized input. This is observed in the headless source build, not yet independently reproduced through the installed GUI. Exact toolpath equivalence to the saved GUI fixture remains open. No production geometry algorithm or dependency was changed during these probes.

Baseline: OrcaSlicer **2.4.2**, source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`; the captured `tests/fixtures/native-text-surface-2.4.2.3mf` contains Helvetica “A & B”, native line height 13 mm and depth 1 mm. [Machine-readable evidence](native-text-surface-invariants.json) records the fixture hash, all output hashes, canonical geometry hashes and metrics. The source worker, font resolver and import frame are the same as the integrated native text implementation.

## Repeated identical requests

Each probe launches eight separate worker requests using the same saved request and trusted Helvetica font. The first uses unchanged production code; the others are isolated diagnostic executables. Canonical geometry comparison uses exact coordinate strings, cyclic orientation-preserving triangle rotations, and sorted sets. It performs no coordinate snapping or triangle substitution.

| Probe | Exact vertex sets | Oriented triangle sets | Maximum changed cap triangles |
| --- | ---: | ---: | ---: |
| Unmodified source, TBB limit 2 | 1 | 3 | 20 |
| Diagnostic TBB limit 1 | 1 | 3 | 20 |
| Diagnostic explicit CGAL box IDs, TBB limit 1 | 1 | 5 | 58 |

All 24 outputs contain 288 vertices, 858 edges and 572 triangles, with two connected components and Euler characteristic 2. Every edge has exactly two oppositely oriented incident faces. Every changed triangle lies on a planar cap and has the corresponding cap’s facing. Changed regions have identical oriented boundary edges and exactly equal independently summed signed cap areas. Surface area is 115.56212391023742–115.56212391023743 mm² and signed volume is 29.249874825395473–29.24987482539548 mm³; these tiny range differences reflect floating-point summation order. No claim of general self-intersection certification is made.

These checks are implemented directly using cross products, determinant volume, edge incidence and graph traversal in `invariants.mjs`; they do not call the application’s geometry validation code. They distinguish alternate triangulations of the same cap coverage from changed material boundaries. They do not establish equal native G-code.

## Controlled native toolpath differences

The earlier controlled archive experiment preserves the original GUI mesh transforms and settings, with only the six documented stale preset-compatibility fields removed consistently from reference and variants. It replaces triangulation and vertex coordinates separately. All variants contain 12,030 normalized motion commands, but equality fails:

| Replacement | First differing command, zero-based | Reference | Regenerated |
| --- | ---: | --- | --- |
| Triangulation only | 10,979 | `G1 X105.319 Y111.798 Z20.6 F18000` | `G1 X105.396 Y111.85 Z20.6 F18000` |
| Coordinates only | 11,337 | `G1 X110.055 Y105.839 E.01681` | `G1 X110.054 Y105.838 E.01678` |
| Both | 10,979 | Same as triangulation-only row | Same as triangulation-only row |

Thus cap topology alone reproduces the first difference, and sub-micron regenerated coordinates independently alter a later rounded move. Matching command counts must not be presented as an exact match. These particular differences cannot be attributed to web-export transforms or preset drift because those inputs are held fixed.

The regenerated vertex set is at most 2.4715155586691807e-7 mm from the saved GUI vertices in world coordinates. The loaded canonical frame has Z 20.0000003 mm. A separate hypothetical pre-save Z=20 probe still differs by 2.466793017138268e-7 mm. That probe is diagnostic only; production preserves the saved frame. The native cube source is already centered, so no omitted source-centering step explains this case.

## Source and diagnostic conclusions

Pinned `CutSurface.cpp` invokes CGAL corefinement, then enumerates the resulting surface mesh. CGAL 5.6.3 `intersection_impl.h` and `intersection_callbacks.h` use `ID_FROM_BOX_ADDRESS`; `Box_d.h` derives that ID from the object address. Address-dependent traversal was therefore a plausible hypothesis. Changing all four matching typedefs to `ID_EXPLICIT` in an isolated include overlay did not stabilize the output. The first attempt changed only the implementation typedef and correctly failed compilation because callback box types no longer matched; the matching overlay compiled successfully. Both build logs and header hashes are retained. This altered dependency is not a candidate production patch.

The one-thread probe also retains multiple triangle sets. Parallel execution is therefore not necessary for the observed variability in this fixture. Neither experiment proves a unique internal cause. Pinned production behavior remains unchanged.

## Required independent follow-up

When the installed GUI is available, load a copy of the original captured surface fixture, record the original text/font/transform settings, force an actual native regeneration by changing and restoring a geometry-affecting control, save separately, and repeat in fresh app sessions. Preserve the original fixture. Compare source meshes, transforms, text settings, canonical vertex sets, oriented cap boundaries and area/topology invariants before comparing sliced commands. Also capture native per-glyph regeneration independently.

An unchanged editor close already preserves the original mesh and history without submitting a worker request; that no-op has separate passing tests. It must not replace the explicit regeneration comparison. A saved triangulation may not be a unique expected result if the GUI demonstrates the same native variability, but that conclusion has not yet been established.

## Preserved local research artifacts

`/private/tmp/orca-implementation/native-text-exactness-probes` contains exact requests, all 24 mesh outputs, `repeat-and-load.mjs`, `single-thread-repeat.mjs`, `address-independent-repeat.mjs`, `invariants.mjs`, diagnostic build scripts, compiler/link commands, logs, header overlay and binaries. The controlled slicing artifacts are under `/private/tmp/orca-implementation/native-text-next/test-results/surface-isolation`, with the driver `test-results/isolate-surface.mjs`. These are research artifacts; only this report and its evidence JSON are intended for documentation integration.
