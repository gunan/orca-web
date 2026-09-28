# Native shrinkage initialization (OrcaSlicer 2.4.2)

The installed 2.4.2 CLI freshly loading a single-plate project fails to apply positive filament XY/Z shrinkage to its initial model transform. The GUI applies it. This change uses a source-backed second native configuration application, without scaling model geometry in JavaScript.

Pinned source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- `PrintApply.cpp:1534` computes transformed print instances using `shrinkage_compensation()` before fresh `m_objects` is installed at 1593. `Print.cpp:3851–3890` returns unity when `extruders()` is empty. This ordering is consistent with the observed first-apply discrepancy.
- `OrcaSlicer.cpp:5634–5638,6103,6296` makes `--slice 0` perform a pre-check application followed by its normal application when there is more than one populated plate. Repeated `--slice` arguments are deduplicated and do not help; an empty second plate fails validation.

For exact version `OrcaSlicer-2.4.2`, the server derives the used-filament compensation from sanitized active-plate objects and complete settings. Unity compensation—including mismatched used materials—keeps the existing one-plate path. Nonunity compensation creates a private second build instance on a second plate, referencing the **same geometry resources**. Original plate 1 geometry, orientation, plate membership, painted facets, part overrides, height ranges and brim auxiliaries remain unchanged. The internal second plate receives equivalent material order/layer-event configuration. It never becomes a browser project or an additional queued print job.

The adapter requires precisely two nonempty output files, returns `plate_1.gcode`, and removes the second output and all temporary data. Unknown/missing outputs fail instead of guessing a download. Working/config/output directories remain isolated. Cancellation and one job deadline cover automatic native placement and slicing; no printer action occurs.

Legacy STL/OBJ jobs are also covered. The existing bounded Three loaders join uploaded file submeshes at their original relative coordinates into one native file object. Native raw import drops Z to the bed; the conversion preserves that behavior and requested XY. If automatic placement is requested, a headless native `--export-stl` with the same settings supplies native packing first. A native differential proves 100% and 98% export exactly the same 20 × 20 × 20 mm raw vertices (bounds [115,95,0] .. [135,115,20]); compensation occurs in the later native slice. The 19.6mm outer-wall-centerline width is the 0.2mm nozzle offset on both sides, not scaling of the 20 mm mesh.

## Evidence

- 12 unit/adapter checks cover geometry-resource identity, instance/metadata preservation, source/version activation, bounded STL/OBJ conversion, native-placement delegation, malformed inputs, output selection and cancellation/cleanup.
- 16 installed-native/API checks cover the captured GUI reference, XY-only, Z-only, unused mismatches, paint/range/support material participation, painted brims, mixed-material neutral output, both legacy formats and placement modes, export scaling, and end-to-end downloads/cleanup.
- Both native-project and legacy preserved-STL paths match **all 9,217 G0/G1/G2/G3 motions** in the captured GUI XY98%/Z98% reference. Each yields 102 layers ending at Z20.4; the intentionally cold direct CLI still yields 100 layers ending at Z20.
- GUI captures for the additional XY-only/Z-only/material/paint/range/brim variants are pending desktop access. Their installed CLI/source-derived geometry tests pass; they are not described as GUI comparisons.

The old multipart raw 3MF endpoint still requires the native project endpoint for nonunity material compensation: resolving embedded multi-material/part settings correctly is necessary before selecting participants. This remaining raw 3MF compatibility gap is explicit. Native project import/slicing already handles the corresponding 3MF workflow. No whole-engine parity claim follows from these fixtures.
