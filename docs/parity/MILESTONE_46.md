# Milestone46 — retained native geometry imports

Geometry-only3MF import now retains native parts, linked instances, paint and editing metadata instead of flattening them. Current presets/material/purge context survives, and placement follows original native methods. [Evidence and limitations](NATIVE_GEOMETRY_IMPORT.md).

| Command | Result |
|---|---|
| `npm test` |1,119 passed; no failures, cancellations or skips|
| `npm run build` |Passed|
| `npm run test:e2e -- --workers=2` |390 passed; no failures or skips|
| `npm run test:e2e:native` |86 passed; no failures or skips|
| Focused units |13 passed;10 original C++ placement cases|
| New workflows |4 browser and2 native passed|
| Prior build |3 new regressions failed as expected|
| `npm run parity:export` / `npm run parity:check` |Passed|

[Unit/API](UNIT_VALIDATION_M46.log), [browser](BROWSER_VALIDATION_M46.log), [native browser](BROWSER_NATIVE_VALIDATION_M46.log). Installed2.4.2/source8500fcdccaa10b5099ac20d252af3a7c560046f1. Early test-fixture/locator failures are retained in the detailed report. Native workers/slicing were unchanged; standalone native slicing was not rerun and no physical printer was contacted.

The135 major-feature entries remain1 missing,124 partial,8 implemented and2 verified. The71 candidate preferences remain12 partial and59 missing. Counts do not establish parity percentages or exhaustiveness. Multipart, mixed-file, palette and paired desktop gaps remain open; historical native repeatability failures remain recorded.
