# Milestone47 — native multipart choices

Native structured3MF geometry import now asks whether elevated objects should become one multipart object. Source-derived detection and conversion retain relative heights, frames, painting and material priority; the dialog uses the installed warning asset and native choice styling. [Evidence and limitations](NATIVE_MULTIPART_IMPORT.md).

| Command | Result |
|---|---|
| Full unit/API with `node --test --test-concurrency=2` |1,127 passed; no failures, cancellations or skips|
| `npm run build` |Passed|
| `npm run test:e2e -- --workers=2` |397 passed; no failures or skips|
| `npm run test:e2e:native` |88 passed; no failures or skips|
| Focused geometry/multipart units |21 passed;49 original C++ decisions and3 conversions|
| New workflows |7 browser and2 native passed|
| Broader browser checks |28 passed|
| Prior build |4 new regressions failed as expected|
| `npm run parity:export` / `npm run parity:check` |Passed|

[Unit/API](UNIT_VALIDATION_M47.log), [browser](BROWSER_VALIDATION_M47.log), [native browser](BROWSER_NATIVE_VALIDATION_M47.log). Installed2.4.2/source8500fcdccaa10b5099ac20d252af3a7c560046f1. Prior unit deadline, initial dialog assertion and native overlap results are preserved in the detailed report. No production timeouts changed; standalone native slicing was not rerun and no physical printer was contacted.

Four newly separated import features bring the inventory to139 major units:4 missing,125 partial,8 implemented and2 verified. The71 candidate preferences remain12 partial and59 missing. Counts do not establish parity percentages or exhaustiveness. Small-unit, oversize and zero-volume workflows are tracked as missing; multipart remains partial for broader formats/native GUI acceptance. Historical native repeatability failures remain recorded.
