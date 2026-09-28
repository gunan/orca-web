# Milestone42 — native preference spin behavior

The FPS control now uses native left-hand arrows and repeat timing; orbit speed uses the native text-field behavior. Pointer and keyboard drafts, boundaries, capture, focus loss and disposal have regression tests. [Source provenance, failures and limits](NATIVE_PREFERENCE_SPIN.md).

Baseline: installed OrcaSlicer2.4.2 and source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. No native worker/slicing configuration changed and no printer was contacted.

| Command | Result |
|---|---|
| `npm test` | 1,095 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 354 passed; no failures or skips |
| `npm run test:e2e:native` | 81 passed; no failures or skips |
| Focused spin units | 3 passed;64 original C++ samples |
| Focused browser checks | 22 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

[Unit/API log](UNIT_VALIDATION_M42.log), [browser log](BROWSER_VALIDATION_M42.log), [installed-native browser log](BROWSER_NATIVE_VALIDATION_M42.log). Four new widget regressions failed against the preceding implementation. Two initial fixes still lost increments when callbacks were batched; final tests pass. One initial unit test exhausted a200ms child-process deadline; a1500ms test-only deadline retains every cancellation/timeout/recovery assertion. Earlier failure evidence is preserved.

The major-feature inventory now contains135 entries:3 missing,122 partial,8 implemented and2 verified. Newly discovered [Home/startup and recent-file groups](NATIVE_HOME_INVENTORY.md) are explicitly missing with acceptance plans; no passing coverage is claimed. The71-candidate preference inventory remains8 partial and63 missing, with one disabled declaration separately recorded. These are working inventories, not exhaustive native feature counts or parity percentages. wx validation/event details, paired desktop appearance and broad feature gaps remain. Earlier strict native slicing-repeatability failures and download diagnostics remain in the history; standalone native slicing was not repeated for widget-only changes.
