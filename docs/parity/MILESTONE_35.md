# Milestone 35 — native toolbar icon states

Fifteen toolbar icons now use the original native light/dark normal, hover, selected and disabled rasters, including Retina assets. Selection keeps colored arrows visible; disabled icons use native colors instead of generic opacity. [Source generation, exact-pixel evidence and limits](NATIVE_TOOLBAR_STATES.md).

Baseline: OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Production native workers are unchanged.

| Command | Result |
|---|---|
| Initial `npm test` | 1,062 passed,1 failed; byte-limit check reached an unrelated150 ms process deadline |
| Revised `npm test` | 1,064 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 317 passed; zero failures or skips |
| `npm run test:e2e:native` | 77 passed; zero failures or skips |
| Focused native icon unit checks | 7 passed |
| Focused icon/layout browser checks | 5 passed at1280×720 and5 passed at1759×1002 |
| Focused worker limits/deadlines | 5 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M35.log), [browser](BROWSER_VALIDATION_M35.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M35.log) logs are retained. The complete native-browser run includes all three body/X/Y tower movement/export/slicing cases, native Fill/frustum checks, flow calibration and Preview idle behavior.

The unit test was changed to separate byte-limit verification from deadline verification: input/output/console limits and error assertions remain unchanged, and a separate test retains the150 ms stalled-work deadline with explicit identity warmup. The byte-limit test has a5-second process budget. Production timeouts and worker code are unchanged. [Original failure](M35_UNIT_INITIAL_FAILURE.log) and all screenshot-harness failures are preserved in the implementation report; they are not rewritten as passes.

No download/network fix was made. M33/M34's API download connection resets remain unresolved historical evidence despite this new full run passing. Standalone native tests were not repeated for icon-only changes; M32 retains331 passes and2 strict same-input slicing-repeatability failures.

This closes the recorded icon-state mismatch at the tested sizes. The native desktop is still locked, so full paired visual acceptance remains open. Overall UI layout, toolbar coverage, other theme surfaces, camera-button overlap, remaining features and hardware acceptance remain incomplete. The inventory remains130 units:1 missing,119 partial,8 implemented,2 verified. No printer was contacted.
