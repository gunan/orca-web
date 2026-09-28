# Native tower footprints in Fill and Arrange

Baseline: OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This implements the **pre-slice** viewport obstacle for existing towers. Full Fill/Arrange and prime-tower parity remain partial.

The server prepares every project plate and its effective native settings. It builds the tower request from validated geometry, family order, painting, assignments, events and active/selected plate state. User-supplied tower bounds are ignored. The native worker computes visibility and size with the original PartPlate methods introduced in M26. Duplicate request geometry is omitted from the public Fill response; the original byte, queue and deadline limits remain active.

`GLCanvas3D::get_wipe_tower_info` uses the **untransformed shell bounding box**, expands it twice by the native brim width, clamps raw per-plate X/Y coordinates, and leaves rotation zero. Negative brim selects original `WipeTower::get_auto_brim_by_height`. `GUI::WipeTower::get_arrange_polygon` creates a fixed virtual obstacle with priority one and bed index zero. The web adapter preserves those source details, including the original second-plate bed-index quirk. An oversized tower is rejected before the original `std::clamp` would receive an invalid range.

Fill inserts the obstacle after exclusions, before candidate budgeting and packing. Its original grid branch uses the footprint in candidate budgeting but does not test every grid cell against it. Arrange now uses the same existing viewport obstacle on the current plate; future plates without a rendered tower retain the prior native estimate fallback. Fill and its automatic Arrange remain separate Undo actions.

## Independent reference

The reference generator compiles unchanged original `FillBedJob::prepare/process/finalize`, `Plater::get_empty_cells`, `GLCanvas3D::get_wipe_tower_info` and the original GUI tower polygon class. GUI ownership, callbacks and plate access are fixture shims. The rendering dimensions come from the separately compiled original PartPlate oracle, never the production tower worker. The bounded model/config loader and pinned geometric kernel remain shared. This is original-source evidence, not a desktop UI capture.

Thirteen reference cases cover two materials, larger prime volume, zero/automatic brim, edge clamping, ignored rotation, a second plate, sequential visibility, one used material, smooth timelapse, wrapping detection, custom tool changes and the float-grid path. Every Fill count, candidate placement, output instance matrix and footprint matches exactly. Arrange's existing footprint matches each corresponding original reference. The separate existing arrangement suite covers its packing kernel.

Reproduce with the documented M26 prime oracle, then:

```sh
python3 native/arrange-worker/scripts/build-fill-reference.py --source ORCA_SOURCE --build native/build/arrange --output FILL_REFERENCE
node scripts/reference/capture-fill-tower.mjs PRIME_REFERENCE FILL_REFERENCE
node --test tests/native/native-fill-tower.test.js tests/native/native-fill-bed.test.js
```

The frozen JSON and C++ references include original source hashes, generator/template/source/binary hashes and exact input cases. Tests also verify the production binary's paired adapter manifest, selected-plate preparation, API trust boundaries, immutable inputs, malformed geometry, absent context, oversized towers and error cleanup.

## Actual slicing and limits

A two-material 150 mm reference plate with a 60 mm wide tower and 200 mm³ prime volume completes browser Fill, automatic Arrange, both Undo/Redo steps, linked native project export and real native slicing. A 100 mm plate with a 20 mm wide tower and 20 mm³ prime volume instead produces the native path-conflict exit. The web app preserves that failure and explains how to resolve intersecting toolpaths; it does not offer a completed file.

The [retained native diagnostic](M27_NARROW_TOWER_COLLISION.json) and [exact project/log archive](M27_NARROW_TOWER_COLLISION.zip) show `WipeTower`/model toolpath conflicts in the narrow case. Its estimated footprint is smaller than the actual purge-dependent tower. This is a rejection regression, not a successful-print claim. No collision checking was disabled. Post-slice Prepare meshes and footprints, native desktop visual acceptance, per-extruder printable regions, arbitrary custom/fractional plate sizing and broader outside-plate behavior remain open. In particular, native `PartPlate::get_size` stores integer dimensions; fractional GUI plate sizing requires additional acceptance beyond these integer-bed cases. No printer was contacted.
