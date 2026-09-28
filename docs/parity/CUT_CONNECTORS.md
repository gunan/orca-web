# Cut identities and planar connectors

Reference: OrcaSlicer 2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Authoritative source: `src/libslic3r/Format/bbs_3mf.cpp` lines 2559–2618 / 7419–7478; `src/libslic3r/ObjectID.hpp` lines 133–190; `src/libslic3r/Model.hpp` connector enum and CutInfo definitions. Source license is retained in `docs/native-schema/ORCASLICER-LICENSE.txt`.

## Native metadata preservation

`Metadata/cut_information.xml` now imports and exports exact native cut-family identities, checksums, connector counters and per-volume processed connector flags. Identity, checksum and counter use unsigned 64-bit decimal strings; a numeric JS value beyond its safe integer range is rejected. Native one-based model-object indexes and zero-based volume indexes are rebuilt from actual exported groups. Repeated build instances get independent groups with the same family identity. Exporting only one plate retains its cut-family fields while reindexing native objects.

`object.native.cutId = {id, checkSum, connectorsCount}` belongs to every part in one native object. `object.native.cutConnector = {type, radiusTolerance, heightTolerance}` belongs only to the corresponding normal or negative volume. Types are `plug`, `dowel`, `snap`. Tolerances are non-negative distances, bounded by this application's 10-million-mm geometry resource limit. The counter is a family-wide naming counter, not the number of currently exported local volumes; the checksum is a related-object count, not a geometry hash. Neither is reconstructed from an incomplete family or selected plate.

All three native connector types are preserved. This file describes already processed connector meshes. Native files do **not** encode their former editable insertion position, radius, depth, shape or style in cut_information.xml; these values are not invented on import.

Malformed XML, document types/entities, invalid/duplicate references, missing identities, invalid types/distances, conflicting within-group cut identity and missing referenced volumes reject before native slicing. Server sanitization and client normalization retain only validated cut fields. Moving parts between groups or changing their role explicitly invalidates related cut-family fields while retaining the actual meshes, following the state cleared by native `ModelObject::invalidate_cut()`. Renames preserve metadata. Splitting, assembling, disassembling, or repairing with changed topology invalidates family metadata while preserving the surfaces; exact one-volume correspondence preserves it. Related peers are updated atomically through undoable main state edits. Repeated native cuts increment and synchronize the native family checksum and connector counter. Variable layer profiles are explicitly cleared on cut outputs because their object height changes.

## Evidence

- `tests/unit/cut-metadata.test.js`: 10 passing checks, including IDs above 2^53, UINT64_MAX boundaries, repeated XML connector containers, duplicate/missing references, repeated build instances, selected-plate indexing, role/group invalidation and real server preparation.
- Existing object/native-project tests: 11 passing regression checks.
- `tests/native/cut-metadata.test.js`: installed OrcaSlicer 2.4.2 preserves exact family ID `9007199254740997`, plug/dowel/snap flags, tolerances, roles and bounds on six volumes. All **66,576** native motion commands match an independent slice of the same geometry without cut metadata. Both runs use actual native CLI, no fixture slicer and no skipped checks.

This is command-line and data-format evidence. Full native GUI connector workflow, interactive manipulator equivalence, dovetail cuts and physical assembly fit have not been certified. Broad `geometry.cut` remains partial.

## Connector generation and editing

The cut dialog supports Plug / Dowel with Prism / Frustum styles and Circle / Hexagon / Square / Triangle shapes, plus Snap connectors with space/bulge ratios. Controls edit plane-relative U/V coordinates, diameter, depth, radial/height clearance and axial rotation. Both cut sides are retained with connectors. The native stored radial tolerance is a **radius** distance; the web control names it radial clearance explicitly (the native GUI's size-tolerance field uses a diameter and divides by two). Each new connector retains its normalized generation plan in web project state; native exported files keep the actual processed geometry and cut flags. Imported connector plans are not reverse-engineered.

New connector parts follow native `GLGizmoCut.cpp:3420,4007` and `CutUtils.cpp:16,87`: positive plugs/snap arms attach to the lower half, clearance-expanded negative volumes belong to the upper half, and dowels create two split negative volumes plus a separate upright printable object. Native radius/height tolerances and ±0.05 mm preview offsets are preserved. Side-by-side placement moves every normal/negative part in its group and each standalone dowel onto the bed together. No approximate Boolean is substituted for native positive/negative-volume slicing. Existing paint-loss consent remains mandatory for painted source cuts; newly generated faces have no inherited facet indices.

Placement validates plane membership, cut-contour inclusion using native 3/4/6/60 sample counts, negative-volume exclusion, object bounds, overlap and finite inputs. Generating up to 128 connectors is an application resource bound, not a claim about the native maximum. Drag placement/gizmos and native pixel/gesture equivalence remain open. Automatic connector placement is marked WIP and its control is commented out in pinned GLGizmoCut.cpp:2377, so it is not a required 2.4.2 parity gap. Post-cut parameter regeneration is not claimed as an active native capability: the archive intentionally stores processed geometry rather than the original connector plan.

### Independent geometry and native output evidence

`tests/fixtures/cut-connectors-native-reference.cpp` contains the four pinned TriangleMesh.cpp primitive functions unchanged, with minimal vector/math stand-ins. Compile with `c++ -std=c++17 -O0 tests/fixtures/cut-connectors-native-reference.cpp -o /tmp/orca-connector-reference`, then redirect its output to the adjacent JSON fixture. Native cylinder/frustum/frustum-dowel/snap vertices and all triangles are checked independently. All triangle indexes match exactly; maximum observed vertex difference is 1.1924e-7 in a unit snap primitive, one float32 ULP across JavaScript/C++ math implementations. The unit tolerance is 2e-7. All shape/type/style variants are closed and outward wound.

Five installed-native acceptance tests compare generated cuts with independent C++ primitive fixtures transformed using the pinned CutUtils formulas. All native motion commands match exactly:

| Cut | Exact native motion commands | Upper-half extrusion moves avoiding the connector void |
| --- | ---: | ---: |
| Circle prism plug | 12,849 | 1,910 |
| Triangle frustum plug | 11,076 | 1,366 |
| Square prism dowel | 13,414 | 1,341 |
| Hexagon frustum dowel, auto supports | 13,368 | 1,487 |
| Snap | 13,174 | 1,910 |

Plug/snap toolpaths continue above the connected lower body. Native re-export retains two connector volumes for plugs/snap and three for dowels, along with each exact cut family ID. The separate native metadata test compares a further 66,576 motion commands against the same geometry without flags.

Negative evidence: the upright tapered dowel ends in a point. Native 2.4.2 rejected the initial no-support slice with exit 156 and `floating regions` in its debug log. The identical geometry slices successfully with native automatic supports. The editor explains that the separate dowel needs suitable orientation or supports; it never silently changes the process preset. This limitation is not counted as certified physical printability.

Final focused stage checks: **37 unit/service tests**, **6 installed-native tests**, **7 browser tests**, production build passed; no skipped checks. The browser tests cover connector edits, native solid/hole roles, durable save/reload, undo, independent dowel placement, invalid/outside placement, atomic peer counters, paint consent, and existing cut/mirror regressions. These are stage-specific counts, not a new claim about the full integrated suite.
