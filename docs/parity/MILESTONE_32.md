# Milestone 32 — native prime tower body dragging

Prepare supports selecting and dragging the native tower shell, native bed/brim constraints, one Undo transaction, per-plate persistence and native export/slicing. [Implementation and focused evidence](NATIVE_TOWER_DRAG.md).

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. A rebuilt arrangement helper returns the original plate bounds and drag margin. Its source/binary manifest is checked alongside the adapter. Existing tower golden requests remain unchanged.

| Command | Result |
|---|---|
| `npm test` | 1,017 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 305 passed; zero failures or skips |
| `npm run test:native` | 331 passed, 2 failed; zero cancellations or skips |
| `npm run test:e2e:native` | 73 passed, 2 failed; zero skips |
| Focused drag unit/native checks | 55 passed; 186 translations across 26 original-source cases match exactly |
| Focused drag browser checks | 8 passed |
| Focused installed-native drag/export/slice workflow | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M32.log), [browser](BROWSER_VALIDATION_M32.log), [native](NATIVE_VALIDATION_M32.log), and [browser/native](BROWSER_NATIVE_VALIDATION_M32.log) logs are retained.

## Unresolved full-suite failures

The two strict native failures are fixed reference/reference/web/web slicing experiments. Linked edits: both reference runs and the first web run produce 11,057 motions; the second byte-identical web input produces 11,299 motions with 10,652 differing lines. Cut to parts: reference runs produce 4,409 motions; byte-identical web inputs produce 4,483 and 4,587 motions, with 1,080 differences between those two web outputs. These demonstrate within-input nondeterminism; they do not establish complete reference/web equivalence for the failing cut fixture. [All hashes, counts and pairwise differences](M32_NATIVE_REPEATABILITY.json), [all eight exact archives and G-code outputs](M32_NATIVE_REPEATABILITY.zip). No retries, comparison tolerance changes or selected matching output were used.

The native browser Fill workflow fails its camera-frustum assertion: Fit clips the tower after Undo/Redo. This is an application defect; the later M33 commit/effect timing regression reproduces it. The hidden-retraction test fails before reaching Preview because the initial preset request reports Chromium `net::ERR_NETWORK_IO_SUSPENDED`. Its timeout remains a failure, not native Preview acceptance. [Both exact traces](M32_NATIVE_BROWSER_FAILURES.zip).

Additional isolated interruption checks found lost capture, window blur and preview-replacement defects after this full run. M33 addresses them before updating the live runtime. M32 itself does not claim these paths are fixed.

## Scope and remaining work

The native source explicitly disables the tower rotation gizmo (`GLGizmoRotate3D::on_is_activable`); native tower movement enables X/Y and disables Z (`GLGizmoMove3D::data_changed`). The tracker now distinguishes the missing X/Y move gizmo from a rotation gizmo that is unavailable in the pinned native version. Exact desktop visuals, post-slice tower/brim/rib geometry, purge-dependent collisions, broader configuration coverage and physical acceptance remain incomplete. Desktop comparison was unavailable because the Mac was locked; no printer was contacted.

The inventory remains130 major feature units:1 missing,119 partial,8 implemented and2 verified. Counts are not a parity percentage.
