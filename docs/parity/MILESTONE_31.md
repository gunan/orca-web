# Milestone 31 — Preview camera and job lifecycle reliability

Preview camera damping now settles according to elapsed time even when native toolpath frames are expensive. Preview data is bound to the current ready job, preventing the calibration-save null-job crash and premature hotend loading during job changes. [Implementation, regression proofs and limitations](NATIVE_PREVIEW_RELIABILITY.md).

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native kernels, generated geometry and exact comparison assertions are unchanged.

| Command | Result |
|---|---|
| `npm test` | 989 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 297 passed; zero failures or skips |
| `npm run test:e2e:native` | 74 passed; zero failures or skips |
| Focused camera/scheduler unit checks | 6 passed |
| Unchanged native large-toolpath performance check | 1 passed |
| Focused job-lifecycle browser checks | 7 passed |
| Same lifecycle checks against preceding component | 3 failed, 4 passed; expected regression proof |
| Native flow with delayed actual hotend response | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M31.log), [browser](BROWSER_VALIDATION_M31.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M31.log) logs are retained. The final full native-browser run includes both the deliberately delayed hotend calibration workflow and unchanged Preview performance checks. Existing assertions and deadlines were not relaxed. Focused failures and before/after traces remain in the linked implementation report.

The standalone native suite was not repeated for these frontend-only changes. M30 still records305 native passes and one strict failure between byte-identical reference inputs; full slicing repeatability remains unverified. A passing Preview suite does not resolve that separate failure.

The inventory remains130 major units:1 missing,119 partial,8 implemented and2 verified. Native desktop appearance, broader feature behavior and hardware acceptance remain incomplete. No printer was contacted.
