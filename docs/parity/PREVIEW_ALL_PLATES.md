# Native Preview statistics for all plates

This package adds the active OrcaSlicer 2.4.2 “Statistics of all plates” behavior: native assigned-filament collection, material columns, total estimated time and cost. The calculations follow pinned source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It does not infer timing from browser geometry or add the native source's commented-out partial-event-time panel.

## Original source behavior

- `src/slic3r/GUI/PartPlate.cpp:1510`, `PartPlate::get_extruders(true)`, collects printable model/modifier assignments, painted MMU states, layer-range extruders, support/interface settings, wall/infill/surface overrides and ToolChange events. It deduplicates and sorts one-based IDs. `Model.cpp:2513–2555` supplies volume inheritance and role rules; `Model.cpp:3494` and the original TriangleSelector supply painted-facet states.
- This GUI function checks the first instance of a native ModelObject. The CLI overload checks instances differently. A later shared instance on another plate therefore does not independently contribute volume assignment IDs in this GUI path. The port preserves that behavior; a CLI export is not used as an equivalent oracle for it. The web descriptor uses plate association for containment only after slice preparation has validated the selected plate geometry. Reusing this helper before slicing requires a caller-supplied native containment predicate for out-of-bed/workspace objects; it is not itself a build-volume validator.
- An explicit object `raft_layers=0` can suppress inherited support collection even without an explicit object `enable_support`. Object/global fallback order is retained. Negative volumes and support enforcer/blocker parts do not contribute their own filament assignment.
- `GCodeViewer.cpp:2502–2850`, `render_all_plates_stats`, aggregates native per-role volume maps using those assignment IDs. Volumes use double accumulation; time, cost and per-row converted totals use float accumulation. Conversion uses the first plate's float filament diameter/density. Material columns appear only for nonzero volume. The source has per-filament rows, total time and cost; it does not add a separate all-filament material footer.
- `GLCanvas3D.cpp:6895` only offers the statistics action when more than one nonempty plate exists. `GLCanvas3D.cpp:8665–8705` requires completed plate move data and exposes readiness; `PartPlate.cpp:4726` includes unsliced/failed plates in the nonempty inventory. `Utils.hpp` time formatting uses float arithmetic, native minute rounding and a subsecond formatting roundtrip.

The native standalone-G-code plate path can use stored `slice_filaments_info`. These web project jobs contain model geometry and use the editor model path. Old jobs without a complete project association remain unavailable rather than being combined by filenames or preset names.

## Immutable job association and API

Project slicing now snapshots the complete visible project, resolved settings, selection and nonempty plate inventory. Only transient selection and active-plate state are excluded from the project hash. Separate resolved-settings hashes detect edited native presets and changed defaults. Embedded projects bind full original tower vectors in the project hash while excluding the per-slice reduced vectors from the settings hash; catalog projects retain their complete resolved default vectors.

`GET /api/jobs/:id/native-preview/all-plates?mode=normal|stealth&units=metric|imperial`:

- Accepts only an owned ready job. No supplied cohort IDs, costs, material counters or project hashes are accepted.
- Uses the latest ready job for each plate with the same complete-project/config/engine identity. The viewed job anchors its own plate even if a later job exists.
- Missing or incompatible results return `available:false` with actual missing plate names and ready/total counts. No partial cost/time totals are invented.
- Uses each matching job's native GCodeProcessor result. A changed helper, deleted job, changed native context or modified association invalidates the operation. A single operation is allowed at a time; busy requests return 429. The whole operation has a 120-second deadline, including queue wait, and aborts on disconnect or shutdown.
- Compacts each result to material/timing metadata immediately. It does not retain a collection of vertex buffers or a whole-project result cache.
- A successful response includes source G-code hashes, associated job IDs and helper/project/config identities.

Ordinary projects with multiple plates now use the native project request path so slicing preserves the other plates needed for association. Calibration jobs retain their existing isolated behavior.

## Verification

Two independent reference generators are retained with their C++ source and JSON captures:

1. `scripts/generate-native-plate-extruders-reference.py` extracts the original `PartPlate::get_extruders(true)` body. A narrow GUI configuration/containment adapter supplies inputs while the compiled original Model, ModelVolume and TriangleSelector process actual meshes and encoded painting. Twelve cases cover role exclusions, nested painted states through filament 16, support/raft precedence, object/global assignments, height ranges, ToolChange, first-instance containment and empty models. The capture records original source hashes and the integrated native Prusa build manifest hash.
2. `scripts/generate-native-all-plate-reference.py` compiles the original accumulation/conversion loops and time functions with narrow data adapters. It covers two synthetic edge cases plus two real native processed datasets, normal/stealth and metric/imperial modes. The input and capture retain G-code/context hashes and source-file hashes.

Focused results:

- 45 unit/service checks, including both source references, immutable association, mutation/deletion races, cancellation/shutdown, readiness, queue/deadline and multi-plate client routing.
- 2 HTTP checks using a fake slicer and an explicitly injected Preview API-contract worker. These verify real project submission/cohort capture and API behavior; they are not native calculation evidence.
- 3 native-helper checks: two-filament command fixture (84 vertices over two processed results) and the retained genuine native-GUI G-code fixture (58,042 vertices over two processed results), plus provenance. All source-derived material/time/cost values match in normal/stealth and metric/imperial combinations.
- Web production build passes. Four browser checks pass for native-data rendering, missing-plate polling, explicit failure/retry and the single-plate action guard. Strict console/page-error assertions remain; the captured modal screenshot was inspected.

Logs are listed in the handoff. No installed Orca CLI or physical printer was launched for this package. The same frozen M48 native helper is used; M49 does not change or replace its binary or manifest.

## Scope and remaining differences

The UI displays the native data in an accessible modal table. Native desktop replaces its Preview renderer area with this statistics view; exact desktop layout and fresh paired desktop screenshots are still pending. Source-derived values and native helper results are verified separately from pixel parity.

The current web project bound remains 100 plates; native GUI's supported plate-count behavior is a separate parity target. The service rejects missing first-plate filament properties explicitly instead of reproducing an undefined native vector access. Old jobs, changed projects/configurations and unsupported helpers have explicit unavailable states and require a new slice. The UI now follows the shared native Units preference for metric and imperial values. The integrated Units browser checks verify the requested API mode and exact table cells.

All-plate estimated timings come from reprocessed native GCodeProcessor results, not the original desktop's in-memory slicing result. Existing documentation records that pipeline distinction. No physical print measurements or hardware certification are claimed.

A separate M51 Units oracle exposed a rare decimal-rounding defect in the inherited generic `nativeFixed` helper (binary 0.005 at two decimals). The integrated Units change corrects that helper using exact binary64 rounding with independent native printf reference cases. Numeric all-plate accumulation and the retained native fixture labels remain unchanged and pass.
