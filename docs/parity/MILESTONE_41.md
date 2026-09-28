# Milestone 41 — native FPS controls and detailed preference tracking

FPS cap and Show FPS overlay now apply to Prepare, Preview and painting, persist across reloads and leave model history unchanged. Demand rendering follows the original native frame-start pacing calculation and stops completely when idle. Compiled original-source references cover cap parsing and frame statistics. [Scope, provenance, failures and remaining gaps](NATIVE_GRAPHICS_PREFERENCES.md).

Baseline: installed OrcaSlicer 2.4.2 and source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. No native worker or slicing settings changed. No printer was contacted.

| Command | Result |
|---|---|
| `npm test` | 1,092 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 349 passed; no failures or skips |
| `npm run test:e2e:native` | 81 passed; no failures or skips |
| Focused graphics/scheduler/inventory units | 12 passed |
| Focused graphics/camera/display browser checks | 15 passed |
| Final graphics/calibration/camera harness checks | 9 passed |
| Focused installed-native graphics workflow | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

[Unit/API log](UNIT_VALIDATION_M41.log), [browser log](BROWSER_VALIDATION_M41.log), [installed-native browser log](BROWSER_NATIVE_VALIDATION_M41.log). New tests observe actual WebGL submissions and native processed geometry, not placeholder controls.

A new [CSV](native-preferences.csv) and [JSON](native-preferences.json) inventory records71 candidate preference declarations:8 partial and63 missing, with source guards and individual acceptance plans. One #if0 declaration is retained separately. Candidate controls include platform/build-specific code and do not represent71 verified visible macOS controls. Metadata validation is not functional test coverage.

Four new regressions failed against the previous build. An initial broad run exposed a missing React import in the classic-JSX calibration harness; it was fixed. A following run could not start because that interrupted server retained its test port. The next full run had347 passes and found a shared CSS import incompatible with the standalone camera harness; moving that import to the app entry point fixes its two cases. The initial native graphics test exhausted its deadline during overlapping browser work; the same test passes in isolation. Evidence is retained in the linked focused report.

The major-feature inventory now contains133 entries:1 missing,122 partial,8 implemented and2 verified. Counts are not a parity percentage. Graphics widget details, physical presentation rate, native camera math, unimplemented preferences and paired GUI acceptance remain open. Earlier strict native slicing-repeatability failures and download diagnostics remain unresolved/in history; standalone native slicing was not repeated for graphics-only changes.
