# Milestone43 — Home and startup preferences

Native Home is now the default workspace, with persistent next-launch Home/Prepare selection and functional New/Open actions. Home navigation retains the editor, Undo and native Preview. [Implementation, source provenance and limitations](NATIVE_HOME.md).

| Command | Result |
|---|---|
| `npm test` |1,098 passed; no failures, cancellations or skips|
| `npm run build` |Passed|
| `npm run test:e2e -- --workers=2` |361 passed; no failures or skips|
| `npm run test:e2e:native` |82 passed; no failures or skips|
| Focused startup units |3 passed|
| Focused Home browser tests |7 passed; all7 failed against the preceding build|
| `npm run parity:export` / `npm run parity:check` |Passed|

[Unit/API log](UNIT_VALIDATION_M43.log), [browser log](BROWSER_VALIDATION_M43.log), [native-browser log](BROWSER_NATIVE_VALIDATION_M43.log). Installed baseline2.4.2; pinned source8500fcdccaa10b5099ac20d252af3a7c560046f1. Native worker/slicing code is unchanged; standalone native slicing was not rerun. No printer was contacted.

The working major-feature inventory has135 entries:2 missing,123 partial,8 implemented and2 verified. The71 candidate preference controls now contain9 partial and62 missing. These are not exhaustive counts or parity percentages. Home is partial; recent history and AMS remain missing. Paired desktop acceptance is pending while the Mac is locked. Earlier native repeatability failures and download diagnostics remain recorded.
