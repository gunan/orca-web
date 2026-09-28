# Milestone44 — persistent recent-file history

Recent browser copies can be reopened from Home and File, removed individually or cleared. Native limit and STL/STEP preferences control storage with atomic pruning. Copies, corruption, quota errors, cancel/discard and cross-tab updates have regression coverage. [Implementation and remaining native gaps](NATIVE_RECENT_FILES.md).

| Command | Result |
|---|---|
| `npm test` |1,102 passed; no failures, cancellations or skips|
| `npm run build` |Passed|
| `npm run test:e2e -- --workers=2` |376 passed; no failures or skips|
| `npm run test:e2e:native` |83 passed; no failures or skips|
| Focused units |4 passed|
| Expanded focused browser tests |33 passed|
| Initial8 regressions against previous build |8 failed as expected|
| `npm run parity:export` / `npm run parity:check` |Passed|

[Unit/API log](UNIT_VALIDATION_M44.log), [browser log](BROWSER_VALIDATION_M44.log), [native-browser log](BROWSER_NATIVE_VALIDATION_M44.log). Installed baseline2.4.2, pinned source8500fcdccaa10b5099ac20d252af3a7c560046f1. No native worker/slicing code changed; standalone native slicing was not rerun. No hardware was contacted.

The working inventory now contains135 major units:1 missing,124 partial,8 implemented and2 verified. The71 candidate preference controls have11 partial and60 missing. Counts are not parity percentages or an exhaustive native inventory. Recent history is partial because browser copies differ from OS path references and native context/launch/provider behavior. AMS and hardware acceptance remain outstanding. Historical native repeatability failures and transport diagnostics remain preserved.
