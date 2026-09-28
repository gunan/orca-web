# Milestone 06 — text, brim ears and exact cut planes

Native reference: installed OrcaSlicer **2.4.2**, source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`, following repository revision `5050dab`. These are scoped implementations; full parity is not established.

Planar text uses actual installed font outlines with counters, kerning, spacing and alignment. Standalone, raised and engraved text creates actual normal/negative geometry. Web projects preserve editable parameters through grouped transformations and face placement. Font access uses a bounded installed-directory allowlist, includes attribution/license access, and makes no external font request. Native tests prove raised deposition and a cutout with the letter's counter retained. Native text editing metadata and curved wrapping remain incomplete. See [text implementation and evidence](../text-emboss.md).

The brim-ear editor changes native manual adhesion points, shows their actual positions and diameters in Prepare, and supports cancellation, undo/redo, native export and removal. Whole-object transforms preserve point placement; part edits retain object-level positions. The native exporter now uses centered instance coordinates for models with ears, fixing an initial probe that produced no adhesion despite preserved metadata. Native fixtures produce 110/109 corner-specific segments and none without ears or above the plate. Brush placement, drag handles and automatic detection remain incomplete. See [brim implementation, failures and evidence](../brim-ears.md).

The planar cutter now resolves bounded Float32 collapse at near-edge planes by welding coincident output vertices and subdividing matching boundary edges. The native retraction structure cuts at exactly 3.3999/21.3999 mm, without a height inset, producing two manifold halves and less than 0.000013 cubic mm volume drift. Unresolved topology still fails. See [planar cut behavior and evidence](../planar-cut.md).

## Integrated checks

| Command | Result |
|---|---|
| `npm test` | 292 unit/API tests pass, no skips |
| `npm run build` | Pass |
| `npm run test:e2e` | 99 fixture-backed browser tests pass, no skips |
| `npm run test:native` | 40 installed-native tests pass, no skips |
| `npm run test:e2e:native` | 8 browser/native workflows pass, no skips |

The browser/native suite includes a brim-ear workflow that imports an ordinary model, edits adhesion in the browser, submits installed presets and inspects native deposited segments. Ordinary browser tests remain distinct from real-engine evidence. Earlier failures are retained in feature history and linked implementation reports. Full native GUI comparison remains unavailable while the Mac is locked. No printer was contacted. No feature was promoted to verified in this milestone.

Height ranges, retraction calibration, painted facets and further native UI layout work underway afterward are excluded from these test counts.
