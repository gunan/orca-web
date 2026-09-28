# Native text and embossed-shape metadata

Baseline: OrcaSlicer **2.4.2**, source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. The active native tool is `GLGizmoEmboss`; the older `GLGizmoText` is not the implementation being matched.

The web project now retains native `slic3rpe:text` and `slic3rpe:shape` data when importing, saving JSON, and exporting native 3MF. This includes the text, native font descriptor and platform, font face/style/weight, line height, character/line gaps, alignment, boldness, skew, font collection, per-glyph flag, depth, surface flag, healed flag, and the regeneration coordinate frame. Self-contained SVG sources embedded in a native archive can also be retained. External file paths are descriptive data; the importer does not read them from the server filesystem.

Native text appears as a printable mesh with a metadata notice in the inspector. It remains editable in the native tool after roundtrip only to the extent supported by that tool and the receiving system's fonts; GUI regeneration acceptance is pending. The browser does **not** claim native text regeneration, native surface wrapping, or font substitution equivalence. Existing browser-created planar text is a separate implementation.

## Coordinate contract

Native 3MF loading centers each raw volume. Native text regeneration then removes `fix_3mf_tr` from its volume transform. The importer stores the equivalent glyph frame in the browser mesh's source coordinates:

`frame = T(-plateOrigin) × buildAndComponentMatrix × T(rawMeshBoundsCenter) × inverse(fix)`

Exported native mesh vertices are already transformed, including native plate/brim offsets and optional reflection used to preserve painting winding. The corresponding native metadata transform is:

`fix = inverse(exportVertexMatrix × frame) × T(exportedRawMeshBoundsCenter)`

Ordinary transforms, mirrored groups, duplicate, face placement, group rebasing and multiple-selection baking preserve the frame. Groups imported with native emboss metadata also retain bounded indexed local meshes and separate build/component matrices. Baking all rotated vertices to Float32 changed native slicing in the first probe; preserving these factors restores exact motions for both fixtures. Every retained triangle is checked against the browser source geometry, vertices must all be referenced, and dimensions/indices/matrices are validated before project serialization and server preparation. This is a precision carrier, not a second editable model.

Native export uses the retained factorization when all group members retain a common build transform and no brim-center rewrite is required. Mixed groups, independently transformed parts, or groups with brim ears use the existing transformed-mesh export; their editing frames remain covered by unit tests, but exact native motion equality for those combinations is not asserted. Split, repair, assembly, planar/connector cut and dovetail cut replace topology and clear stale editing metadata. Their UI requires explicit consent when native text or embossed-shape metadata would be lost. Split/repair/assembly prepare results before consent, cancellation leaves the project unchanged, stale consent rejects changes made while the dialog is open, and undo restores the original metadata.

Frames must be finite, affine and invertible. Text and source sizes are bounded. Embedded SVG rejects active content and protocol references. Native text metadata attached to non-millimeter 3MF geometry is explicitly rejected instead of applying an unverified unit conversion.

## Independent native fixtures

`tests/fixtures/native-text-planar-2.4.2.3mf` and `native-text-surface-2.4.2.3mf` were saved from the installed native GUI. Both contain `A & B`, Helvetica, native line height 13 mm, depth 1 mm, and approximately 1.43° rotation. Their glyph plane origin is `[11.55856357, 1.09159894, 20]` before repositioning. The planar mesh has 1,176 triangles and Z bounds 19.985–20.985 mm. The surface mesh has 572 triangles and Z bounds 19.985–21 mm. These independent expectations exercise native's 0.015 mm overlap and its different planar/surface depth conventions.

The original planar glyphs extend outside the bed; fixtures are retained unchanged to expose that fact. Native slicing tests translate the complete object +100,+100 mm in XY. The reference is modified independently in the native archive's build matrix. GUI-local preset IDs also have a filename suffix while compatibility names retain the base names, causing unmodified CLI exit 239. The reference removes only the six stale compatibility fields; production preparation already omits these non-slicing fields. Mesh vertices, text/shape metadata and effective print settings remain the fixture's native values.

## Verified results and diagnostic history

- 12 unit regressions passed with no skips.
- Two strict installed-native regressions passed: **13,743 exact normalized motion commands** for planar and **12,030** for surface. Both finish at Z21 mm. Native version is asserted as 2.4.2.
- Four browser checks passed after the precision fix. The six affected existing geometry/project/selection unit suites plus the new file passed 48 tests (12 new and 36 existing), with no skips.
- The production build passed; existing large-bundle and OCCT browser-externalization warnings remain.

The failed first precision probe is retained in the stage's `test-results/native-compare`: the flattened web mesh produced 13,883 planar and 12,100 surface commands. All effective slicing settings matched; omitted host fields were the only G-code configuration differences. Retaining only local vertices while multiplying build/component transforms together still differed (13,756 / 12,010 commands). Retaining both the raw vertices and separate native transform factors restored exact streams. These failures led to the precision fix; no acceptance threshold was weakened to material totals.

## Evidence and limits

- `tests/unit/native-emboss.test.js`: exact source attributes and independent coordinate/overlap expectations; JSON/native roundtrips; transform/duplicate/face/mirror/brim/paint/multiplate frames; neighboring-part deletion; topology invalidation; embedded SVG; malformed frames/source; legacy inline shape and alignment attributes; explicit non-mm rejection.
- `tests/e2e/native-emboss.spec.js`: real fixture import, browser transform/save/native export, split/repair/assembly/cut consent, cancellation, undo and stale-action rejection. The browser server uses the fake slicer fixture; these checks do not prove native G-code generation.
- `tests/native/native-emboss.test.js`: installed version must be exactly 2.4.2. Compare the independently positioned native reference with web JSON roundtrip → validated native project service → native slice. The fixture's existing glyph geometry is sliced, not regenerated.

Native generation remains a substantive missing feature. `EmbossJob` and `GLGizmoEmboss` drive regeneration in the GUI. The installed CLI exposes no emboss regeneration action and its 3MF path loads existing meshes before `Print::apply`. No standalone bundled libslic3r/emboss worker was found. Native surface text uses CGAL `cut_surface`, a ±1 mm projection extension, an 89.9° orientation filter, and the nearest candidate surface patch; per-glyph placement follows model-slice arc length and tangent samples ±5 mm. A generic ray projection or another font triangulator would not establish equivalence. Building a pinned native worker with its font/CGAL dependencies, then comparing regenerated geometry to native GUI fixtures, is the remaining implementation path. No physical printing, cross-platform font availability, or GUI pixel equality is certified here.

Source references: `src/libslic3r/Format/bbs_3mf.cpp` 9171–9455, `src/libslic3r/Model.cpp` centering near 2600, `src/slic3r/GUI/Jobs/EmbossJob.cpp` update near 1024, `src/slic3r/GUI/Gizmos/GLGizmoEmboss.cpp`, `src/libslic3r/Emboss.cpp`, and `src/libslic3r/CutSurface.cpp` at the pinned commit. The local audit source cache is `/private/tmp/orca-implementation/m23-text-audit/upstream`.
