# Milestone 26 — native prime-tower preview

Prepare now renders the original native estimated prime tower with filament bands, native sizing and plate containment. Geometry refreshes after edits; cancellation, error and disabling remove stale towers. Camera fitting includes the tower. See [implementation and original-source evidence](NATIVE_PRIME_TOWER.md).

The stable `multimaterial.prime-tower` feature remains **partial**. Inventory totals remain 130 major feature units: 1 missing, 119 partial, 8 implemented and 2 verified. Counts do not measure every native feature or certify parity.

## Validation

Baseline: installed OrcaSlicer 2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

| Command | Result |
|---|---|
| `npm test` (final unchanged retry) | 973 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e` | 276 passed; no failures or skips |
| `npm run test:native` | 269 passed, 1 failed; no cancellations or skips |
| `npm run test:e2e:native` | 70 passed; no failures or skips |
| Focused tower unit/API/native checks | 40 passed, including 27 exact original-source cases |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M26.log), [browser](BROWSER_VALIDATION_M26.log), [native](NATIVE_VALIDATION_M26.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M26.log) logs are retained.

The full native failure is the existing strict translation-only linked-instance repeatability test. It uses a fixed reference/reference/web/web order. The two reference runs and final web run had 11,057 commands; the first web run had 11,189. The two byte-identical web inputs differed by 2,204 motion lines. All native-readable archive entries match independently edited reference XML. [Four-run data](M26_INSTANCE_REPEATABILITY.json) and the [exact input/output archive](M26_INSTANCE_REPEATABILITY.zip) preserve this failure. No retry or tolerance selected a matching result; native repeatability remains unresolved.

The first complete unit run passed 973 tests. A later full run during simultaneous four-worker browser, native and browser/native workloads passed 971 and failed two 250 ms transport checks (output-limit and cancellation assertions instead received their operation deadline). Its [failure log](UNIT_LOAD_FAILURE_M26.log) is retained. After the four-worker suite ended, all 973 passed unchanged; no runtime deadline or assertion was weakened.

## Corrections and limits

The first real-browser probe rejected the native preset's single-point exclusion sentinel. The adapter was corrected to match the native completed-quad rule, protected by two original-source reference cases. A second probe had an incorrect hard-coded 25 mm assumption for the 20 mm reference cube. The corrected assertion uses the actual source bounds; runtime sizing was unchanged.

The native-backed web workflow covers rendering, numeric movement/rotation, disable, Undo and camera fitting. Tower selection/drag and rotation gizmos, actual post-slice tower meshes in Prepare, Fill's tower obstacle, broader collisions and desktop visual acceptance remain open. The Mac remained locked during the desktop check. No printer was contacted and no physical print began. Earlier native motion, export and crash failures remain historical evidence, even when later cases pass.

## Repository verification

49 source, helper and evidence files were promoted after checking their M25 baseline hashes and preserving backups. The native helper binary matches its paired manifest, and every adapter source matches its recorded hash. In the actual repository, `npm test` passed all 973 checks, `npm run build` passed and `npm run parity:check` passed.
