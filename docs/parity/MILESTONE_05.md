# Milestone 05 — geometry, calibration and trusted native settings

Baseline: installed OrcaSlicer **2.4.2**, source commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`, working tree following `5050dab`. This milestone records scoped behavior and remaining gaps. It does not establish full native UI or feature parity.

## Integrated behavior

- **Planar cuts and mirror.** Axis/custom world planes produce actual closed upper/lower meshes with caps that retain cavities, nested islands and disconnected shells. The dialog previews generated surfaces, supports retaining either/both sides, original or side-by-side placement, and a single undo step. Group cuts preserve negative/modifier/support roles, overrides and filament slots. Mirror reflects asymmetric geometry around the group center and fixes winding. Two installed-native tests preserve cavity openings, mirrored output and cut-group modifier effects; removing the tested modifiers changes filament use from 1,973.62 to 1,924.77 mm. Connectors, dowels/dovetails, interactive plane gizmos, curved cuts and native cut metadata remain incomplete.
- **Whole native objects and individual parts.** Object transforms share a pivot/frame so helper volumes stay aligned during movement, rotation, nonuniform scale, arrangement, duplication and bed/face placement. Part edits preserve other parts' world geometry and invalidate obsolete shared frames. Deleting the last normal part while helper volumes remain fails recoverably. Native 3MF output bakes actual geometry; `groupTransform` is validated web editing metadata. Seven unit/service and three browser cases cover these paths. Installed native slicing retains both transformed negative holes across **39,724** deposited segments. General collision solving and complete native instance semantics remain unfinished.
- **Role materials.** Actual Three.js materials give normal parts filament colors and negative/modifier/support volumes distinct translucent colors without depth writes. Browser checks inspect instantiated material/gizmo state, and [the captured viewport](milestone-05-volume-materials.png) was visually inspected. This verifies useful volume visibility, not native pixel parity.
- **Prime tower placement.** Per-plate `wipe_tower_x/y` values preserve other plate entries and native indexed fallback behavior. Enable/width/rotation remain process settings; cancel discards drafts and Apply is one undo action. A native test moves **45,198** deposited tower segments exactly **30 mm in X** while model-wall endpoints stay fixed. Prepare currently shows editable origin/settings; native slicing supplies the real tower depth, ribs, brim and deposited footprint. Native-style tower dragging and complete footprint/collision checks remain absent.
- **Flow ratio.** All four bundled sets retain **9/10/11/16** labelled native objects with independent per-object extrusion ratios. Four installed-native tests compare relative wall extrusion to planned multipliers within **0.3%**, then explicitly choose a specimen, save a new compatible custom filament, reopen storage and verify the derived ratio. Coarse/fine use percentage multiplication; YOLO methods use additive ratios. No printed measurement is inferred. Native automatic nesting and wider printer/nozzle/firmware acceptance remain incomplete.
- **VFA and maximum flow.** Source-derived native towers and settings use a maximum-speed native baseline plus validated outer-wall feed scheduling because the installed CLI exposes no calibration-state flag. VFA's three cases each compare **7,832** wall moves with four independent native speed slices. Maximum-flow cases compare **3,440 / 2,859 / 2,504 / 2,493** moves against **9 / 9 / 6 / 8** independent native speed slices, covering source X-only bed compression, a 0.6 mm nozzle/0.92 filament ratio, slowdown ramp and the 200 mm³/s cap. XYZ/E and effective F match within **0.002 mm/min** emitted-feed precision. Native first-layer/ramp/cap behavior and travel/retraction remain intact. Timing estimates and M73 time progress are removed after changing speeds. Physical result measurement/persistence, native GUI-generated references, rafts, adaptive PA and nonzero small-perimeter thresholds remain unsupported.
- **Trusted native corrections.** Custom-preset preparation derives native choices and warnings from server-resolved presets, then revalidates exact decisions before saving. Ordinary edits remain separate from derived hidden changes such as vase-mode `enforce_support_layers`. Sequential batches preserve explicit native alternatives and reject stale/injected choices. Multipart and embedded/catalog-native project jobs replay remaining decisions before structural preflight and archive/profile creation. Native scalar/array legacy forms compare by declared type. The editor preserves unsaved values on failures; 21 focused browser cases cover correction acknowledgment, alternatives, hidden values, stale requests and immediate geometry warnings. Complete native event behavior and geometry validation remain unfinished.

## Verification and failures retained

The final recorded integrated checks pass. Focused batches overlap the full suites and must not be added together as a unique total. Text and brim-ear work that began afterward belongs to the next milestone, not these verification counts.

| Check | Recorded result |
|---|---|
| `npm test` | **281 unit/API tests passed**, 0 failed, 0 skipped |
| `npm run build` | Passed |
| `npm run test:native` | **37 installed-native tests passed**, 0 failed, 0 skipped |
| `npm run test:e2e:native` | **7 browser/native tests passed**, including real VFA and maximum-flow UI-to-engine paths; 0 skipped |
| `npm run test:e2e` | **95 browser tests passed**, 0 failed, 0 skipped; fake engine/printer fixtures |
| Focused ProfileEditor browser suite | **21 passed** against actual correction/event/validation helpers with fixture catalog lookup |
| Focused process correction/helper/API regression batch | **44 passed**; fake slicing for HTTP paths |
| Focused calibration batch | **62 passed**: 32 unit, 13 HTTP and 17 native; separate **15 browser** checks passed |
| Fresh native GUI export/re-export | **Not validated**; the last attempt was blocked at a macOS recovery dialog while the Mac was locked |
| Physical printer or firmware acceptance | **Not performed**; no printer was contacted |

The recorded 92-case browser run failed two assertions: one assumed the printer's process list could not gain a custom preset saved concurrently by another test; the other still expected the now-implemented Objects button to be disabled when the engine was unavailable. These are retained as failed test evidence. After correcting those expectations, the final expanded **95-case** integrated browser run passed.

The first two-filament prime-tower probe caused native **SIGSEGV** in filament ordering because generated settings omitted `filament_colour`. The source uses the color vector's length as filament count. Preparation now fills missing colors from the native schema for every slot, retains explicit colors, and rejects invalid filament-to-nozzle maps. The subsequent native displacement test passes. The failed probe remains recorded in the inventory and [prime-tower notes](../prime-tower.md).

A VFA experiment using height-range 3MF speed settings was rejected by native spiral-vase validation (**exit 205**) because it introduced multiple print regions. The implemented schedule retains the single-region native geometry and is compared with independent constant-speed slices. This does not claim byte-identical native GUI calibration output.

## Inventory and remaining acceptance

The inventory now has **110** feature units: **14 missing, 86 partial, 8 implemented and 2 verified**. Five existing missing units move to partial: cut, prime tower, flow ratio, VFA and maximum flow. Mirror gets a stable feature ID. New explicit gaps cover fuzzy-skin painting, painted-facet metadata, native cut/connector metadata and filament-sequence metadata. Previous evidence and status history are preserved; no new broad feature is promoted to verified.

Counts cover the tracked inventory, not a defensible percentage of all native functionality. Native layout/menus/visuals, painting, variable layers, height-range settings, brim ears, cut connectors, text tools, lossless rich project assets/metadata, remaining calibration modes, firmware/vendor capabilities and hardware behavior remain tracked work. Headless native acceptance does not replace fresh native GUI comparisons.

Implementation and evidence details:

- [Planar cut and mirror](../planar-cut.md), [native group editing/materials](../native-object-groups.md), [prime tower](../prime-tower.md).
- [Calibration sources, command semantics and limits](CALIBRATION.md).
- [Trusted correction APIs and structural validation](../native-schema/NATIVE_CORRECTIONS.md), [dependency coverage](../native-schema/SETTINGS_DEPENDENCIES.md).
- [Feature inventory](features.json), [CSV export](features.csv), [generated progress matrix](PROGRESS.md).

Historical milestones retain their original counts and limitations. This report supersedes their listed missing paths only where the scoped behavior and evidence above apply.
