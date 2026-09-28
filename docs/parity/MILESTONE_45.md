# Milestone45 — native project-load choices

3MF loading now uses persistent native preferences and separate Open/Add decisions. The source-backed dialog, geometry-only choices, current presets, discard/cancel, Undo and delayed-read guards have browser coverage. [Provenance and remaining gaps](NATIVE_PROJECT_LOAD.md).

| Command | Result |
|---|---|
| `npm test` |1,106 passed; no failures, cancellations or skips|
| `npm run build` |Passed|
| `npm run test:e2e -- --workers=2` |386 passed; no failures or skips|
| `npm run test:e2e:native` |84 passed; no failures or skips|
| Focused units |4 passed;16 original native C++ decision cases|
| Load workflows |10 browser and1 native passed|
| Broader focused browser tests |40 passed|
| Initial6 regressions against previous build |6 failed as expected|
| Initial full native browser |83 passed; one outdated Prusa discard-order test timed out; corrected with2 focused passes and the full84-pass rerun|
| `npm run parity:export` / `npm run parity:check` |Passed|

[Unit/API](UNIT_VALIDATION_M45.log), [browser](BROWSER_VALIDATION_M45.log), [native-browser](BROWSER_NATIVE_VALIDATION_M45.log). Baseline installed2.4.2 and source8500fcdccaa10b5099ac20d252af3a7c560046f1. No native worker/slicing code changed, standalone native slicing was not rerun and no physical printer was contacted.

The135 major-feature entries remain1 missing,124 partial,8 implemented and2 verified. The71 candidate preference controls now include12 partial and59 missing. Counts do not establish parity percentages or exhaustiveness. Geometry-only structure and mixed-file behavior remain incomplete; paired desktop acceptance is pending. Historical native repeatability failures and transport diagnostics remain preserved.
