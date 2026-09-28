# Native Fill bed foundation

Native baseline: OrcaSlicer 2.4.2, source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This implements the active Clone dialog’s **Fill** instance workflow. It is not a claim of complete native UI, arbitrary-printer, or linked-instance editing parity.

## Native behavior retained

`CloneDialog.cpp` calls `Plater::fill_bed_with_instances()`, independently of the copy count and Auto arrange checkbox. `Plater.cpp` takes an Arrange snapshot and dispatches `FillBedJob(true)`. The helper uses the same native Model, instance hulls, offset calculations, arrangement parameters and packing kernels.

The selected native ModelObject’s printable instances are candidates, including instances on other plates. Other instances on the selected plate are obstacles; off-plate instances are locked. Exclusions, spacing, sequential clearance, material compatibility, rotations, Bambu final-alignment choice and the native early-stop rule participate. Candidate count derives from bed and inflated footprint area. Up to 100 candidates use native polygon packing; above 100, the source explicitly uses `Plater::get_empty_cells`, with float arithmetic, strict loop endpoints, X-major order, expanded native build-volume bounds and excluded bounding boxes. The grid branch’s behavior is preserved even where it differs from polygon nesting.

Two notable source quirks are intentionally retained and covered by independent reference cases:

* Each accepted new-instance setter applies its transform to **all** instances of that ModelObject after appending. The intermediate Fill result may therefore overlap.
* The non-grid multi-plate path adds/subtracts unscaled bed-stride doubles directly to scaled integer translations. On a 100 mm plate, a 120 mm stride changes the stored coordinate by 0.00012 mm. The adapter does not silently correct this arithmetic.

After a successful Fill, native code invokes a separate Arrange job. The browser likewise commits the exact Fill result and then runs its native Arrange workflow, producing two Undo steps. A no-addition result does not alter geometry/history. Cancelling Fill discards its result; if the subsequent Arrange fails or is cancelled, the Fill snapshot remains available for Undo.

## Identity and data preservation

Native import assigns an explicit archive-local `native.instanceFamily` token to each source ModelObject. Historical numeric object IDs are not used as global identity. Fill updates existing instance transforms and appends fresh scene IDs in the same family; the original selection remains selected. Clone creates independent objects and clears their family token.

Geometry and metadata are preserved through rigid instance placement, including retained precise meshes, painting, object/part settings, native text regeneration frames, and brim ears. Native export emits one shared object resource with multiple build items and correct per-plate instance IDs when members remain equivalent. JSON save retains the family token. Brim and text metadata are compared in the shared model frame. Conflicting geometry, painting or settings reject explicitly rather than replacing one member with another’s data.

[Linked-instance edit reconciliation](NATIVE_INSTANCE_EDITS.md) now propagates shared part geometry, settings and metadata before the history transaction. Linked Cut/reset/grounding and complete native GUI placement remain separate open work; divergent unvalidated families still reject explicitly.

## API and bounds

`POST /api/geometry/fill-bed` accepts `{projectRequest, options}`. The server validates all project plates and native settings, uses effective physical-nozzle settings, requires source-backed printer-vendor context, and prepares `{operation:'fill-bed', mode:'instances', objects:[{parts,instances}], selectedObjectId, selectedInstanceId, plate, settings, options, isBbl}`. Arbitrary client-created native plans are not accepted as validated server geometry. Generated calibration binding guards remain active.

The worker returns existing and added instance frames, count, whether Arrange must follow, and diagnostic candidate placements. The shared validator checks identities, counts, finite rigid transforms, and project geometry budgets before any browser history mutation. The route aborts expensive preparation/queued work on disconnect. The existing worker provides one active job, bounded queue, end-to-end deadline, process termination, console/output limits and temporary-file cleanup.

Limits are explicit: 64 MiB worker input, 2 MiB output, 500,000 unique input vertices/triangles, two million expanded project triangles, 256 resulting instances, 4,096 candidates, eight million transformed-vertex checks, and two million grid visits. Rejections do not return a truncated Fill result. Transformed world coordinates are checked before native scaled-polygon construction.

The pre-slice prime tower now supplies the exact original viewport obstacle; see [tower footprint evidence](NATIVE_FILL_TOWER.md). Per-extruder printable-region geometry is still rejected. The actual post-slice tower mesh in Prepare remains separate open work. Whole-object-copy Fill is separate from the active Clone instance button and is not exposed. The existing arrangement outside-plate/non-printable workflow limitations also remain. No printer or physical calibration was contacted.

## Evidence

* `tests/native/native-fill-bed.test.js`: two tests. Twelve exact frame/placement reference cases cover ordinary packing, a fixed obstacle, grid placement, exclusion boxes, a second plate, existing instances, a non-printable peer, Bambu alignment, sequential clearance, rotation, circular bed and no-addition behavior. Bounds, malformed transforms and unsupported inputs reject explicitly.
* The independent oracle extracts **unchanged** original `FillBedJob::prepare/process/finalize` and `Plater::get_empty_cells` methods. It replaces GUI ownership/progress with shims and shares the bounded mesh/config loader. It is source-derived evidence, not a captured desktop Fill run. Rebuild with `native/arrange-worker/scripts/build-fill-reference.py`; hashes are pinned in `fill-source-hashes.json`.
* Nine Fill unit tests, one worker transport test and one HTTP test cover immutability, selection, validation, cancellation, metadata, repeated Fill, family divergence, independent Clone, JSON and native roundtrips, and effective settings. Sixteen existing clipboard/project tests also pass: 27 focused unit/API checks total.
* Three Fill browser tests and six existing Clone browser tests pass. Mocks test client state, cancellation and error handling; they do not establish native packing fidelity.
* `tests/native-e2e/native-fill-bed.spec.js` passes against the real helper and OrcaSlicer 2.4.2. A 40×40×20 mm cube on a 100 mm plate gains three instances, automatically arranges, undoes/redoes both steps, exports one native object with four build items, and slices four object labels across 125 layers.
* `npm run build:native:arrange` completes from the pinned cache, records source/dependency hashes, and emits the matching binary plus `build-manifest.json`. The web production build passes. No tests are skipped.

Desktop GUI Fill capture, pixel comparison, other operating systems, every native bed configuration, and complete linked-instance editing remain unverified. This evidence does not support a total parity percentage.
