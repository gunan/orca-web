# Milestone48 — native import volume inspection

Structured3MF geometry imports now remove native zero-volume models before placement, display the original information notice, and preserve the current document on cancellation or all-empty results. Original native volume and unit-classification methods run in the bounded geometry worker. [Evidence and remaining gaps](NATIVE_IMPORT_INSPECTION.md).

| Validation | Result |
|---|---|
| Full unit/API |1,140 passed|
| Build |Passed|
| Full browser |401 passed|
| Full browser/native |90 passed|
| Full standalone-native |First339 passed/one cancelled; rerun330 passed,7 failed,3 cancelled. Native acceptance incomplete|
| Focused checks |13 unit/API,7 native,4 browser,2 browser/native and32 broader browser passed|
| Previous build |4 new regressions failed as expected|
| Parity export/check |Passed|

The final unit and browser runs have no failures or skips. Standalone-native acceptance remains incomplete: known cut repeatability, an isolated SIGBUS and eight export timeouts remain recorded. A sampled timeout waits at a macOS window-restoration alert while the Mac is locked. The generic3MF and XL mask isolated retries pass; neither establishes that the broader native issue is resolved. No physical printer was contacted. Installed baseline2.4.2/source8500fcdccaa10b5099ac20d252af3a7c560046f1.

Inventory:139 major units,2 missing,127 partial,8 implemented,2 verified. Preferences:71 candidates,12 partial and59 missing. Zero-volume filtering and backend-only unit inference are partial; broader formats, unit conversion/prompt, oversize and paired desktop acceptance remain open. Counts are not parity percentages.
