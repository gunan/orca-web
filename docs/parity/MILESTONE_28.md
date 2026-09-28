# Milestone 28 — asynchronous tower camera fitting

Fit and named camera views now include the completed native tower after asynchronous refresh. Later orbit/pan/zoom, bed-only view, disabling, failure or a plate change supersede the pending request. Stale responses cannot move the camera. [Implementation and reproduction](NATIVE_CAMERA_FIT.md).

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

| Command | Result |
|---|---|
| `npm test` | 978 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 287 passed; zero failures or skips |
| `npm run test:e2e:native` | 70 passed, 2 failed; zero skips |
| Focused camera/tower browser checks | 13 passed |
| Focused browser/native tower checks | 3 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M28.log), [browser](BROWSER_VALIDATION_M28.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M28.log) logs are retained. The final full suites include the common actual-frustum assertion helper. The full native-browser run failed a flow-calibration download with ECONNRESET and the 20-second post-orbit idle assertion in Preview. A focused unchanged diagnostic (no other native browser suite) passed the complete flow workflow but failed the same Preview idle assertion. [Diagnostic log](BROWSER_NATIVE_DIAGNOSTIC_M28.log) and [full-run failure traces](M28_NATIVE_BROWSER_FAILURES.zip) are retained. The download reset's cause remains undetermined, and the repeated Preview performance failure is unresolved; the tests were not relaxed. These failures occur outside the changed Prepare camera path. The standalone native suite was not repeated for this frontend-only change; its M27 result remains 297 passed and one unresolved strict linked-instance repeatability failure. No new native determinism claim is made.

The original M27 build fails both new delayed-fit projection tests. The initial fix exposed sub-threshold camera damping in one pan assertion; the source-based tolerance, failure log and passing follow-up are documented without changing native geometry or frustum comparisons. The [native-backed web screenshot](images/M28_NATIVE_FILL_TOWER.png) shows the full tower; it is not a native desktop pixel comparison.

The inventory remains 130 major units: 1 missing, 119 partial, 8 implemented and 2 verified. The three reviewed features remain partial. Native desktop visual checks remain unavailable while the Mac is locked. Post-slice Prepare towers, tower dragging/rotation gizmos, custom fractional plate sizing and device/hardware acceptance remain open. The screenshot's incorrect embedded-preset loading labels are tracked for the next change. No printer was contacted.

The 23-file promotion verified source baselines and unchanged native helper provenance. The checkout then passed all 978 unit/API tests, its production build and parity validation. The two full native-browser failures remain recorded.
