# Native Cut to parts

Baseline: OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

The Cut dialog now exposes native **Cut to parts**. Enabling it retains both sides in one native object family, clears place-on-cut/flip options, and disables incompatible connector and dovetail controls. Ordinary and linked objects use the original `cut_mesh`, GLU tessellation, CutUtils solid/modifier processing, instance reset and bed grounding. The result applies as one Undo transaction.

Normal volumes retain native `_A`/`_B` order and cap triangulation. Negative, modifier and support helper volumes remain once in each instance. Independent native build and component transforms carry the original used Float32 vertices and faces without a second geometry bake. Existing settings, material membership and layer profiles survive; topology-dependent painting, brim ears and solid text/emboss metadata are explicitly invalidated under the existing dialog consent. The native family survives saved-project and 3MF roundtrip.

## Validation boundaries

Seven independently compiled original-function reference cases cover ordinary meshes, two solids, linked translations, crossed/outside helper volumes, oblique cuts, tilted/mirrored instances and native auto-drop. Instance matrices, volume matrices, grounding, roles, names and oriented cap triangles match exactly. Six retained-frame cases additionally compare raw indexed vertices and faces; an ordinary mesh reconstructed from its triangle stream has different index numbering, so its exact oriented triangles are compared instead. The earlier mirrored grounding discrepancy is corrected by the native kernel, without adding a numerical tolerance.

The oracle generator was rebuilt against the paired production helper. All seven regenerated inputs and results were unchanged. `scripts/reference/build-cut-parts-reference.py` compiles original source functions independently and does not call the production cut adapter. Captured source, generator and binary hashes are tested. This proves the stated original-function comparisons; it is not a complete native GUI interaction capture.

The HTTP endpoint uses the shared worker queue, whole-operation deadline and disconnect cancellation. Native input and output independently validate identities, transforms, roles, vertex/face bounds and part order. The cut-specific geometry output allowance is capped at 64 MiB. Input is bounded to 500,000 triangles; results to 1,000,000 and expanded instance geometry to 2,000,000. Missing helpers and native write failures reject explicitly. No alternate cutting algorithm is substituted.

## Reproduction

Build the production helper with `npm run build:native:arrange`, using the documented pinned native cache. Build the independent reference with:

```sh
python3 scripts/reference/build-cut-parts-reference.py --source /path/to/pinned/OrcaSlicer --build native/build/arrange --output .reference-parts
node scripts/generate-cut-parts-reference.mjs
```

The build validates source hashes and the production binary/manifest pair. The reference executable and all generated object files remain separate from production.

Meaningful checks are in `tests/unit/cut-to-parts.test.js`, `tests/unit/cut-to-parts-transport.test.js`, `tests/integration/cut-to-parts.test.js`, `tests/e2e/cut-to-parts.spec.js`, `tests/native/cut-to-parts.test.js` and `tests/native-e2e/cut-to-parts.spec.js`. Each mocked transport/browser check is distinct from actual native-helper and installed-slicer evidence. See the milestone report for completed runs.

## Motion repeatability and remaining parity

The first strict four-run installed slicing comparison failed: two slices of the identical original-reference 3MF differ at **1,080 motion commands**. All four original/web results retain 50 layers and two linked footprints. The comparison remains strict; it is neither skipped nor weakened. The [comparison and hashes](cut-to-parts-repeatability.json) and [original inputs and G-code](cut-to-parts-repeatability.zip) retain this failure. Exact cut geometry does not establish identical arbitrary slicer motion output.

The subsequent complete M25 native run passed the unchanged strict Cut-to-parts check: all four original/web runs matched4,409 motion commands. It also reproduced a different, pre-existing linked-edit same-input failure. Both results remain recorded; the earlier1,080-command cut discrepancy is not erased or treated as resolved.

Full native interactive gizmo appearance/placement, topology-aware paint transfer, large-model native prompts, broader multi-plate interaction and fresh paired native desktop acceptance remain incomplete. Ordinary separate-object cuts and dovetails retain their existing implementations; their prior limitations remain recorded. Native desktop inspection was unavailable while macOS was locked.
