# Milestone 33 — reliable tower drag cancellation and current-preview Fit

Interrupted tower gestures restore their starting position and release temporary layout state. Camera Fit reads the current committed tower geometry, fixing the native Fill/Undo/Redo clipping defect. [Implementation and before/after regression evidence](NATIVE_TOWER_LIFECYCLE.md).

Baseline: installed OrcaSlicer2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native workers and comparison assertions remain unchanged from M32.

| Command | Result |
|---|---|
| `npm test` | 1,028 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 310 passed; zero failures or skips |
| `npm run test:e2e:native` | 74 passed,1 failed; zero skips |
| Focused tower unit checks | 11 passed |
| Focused tower/camera browser checks | 24 passed |
| Before-fix interruption checks | 8 unit failures,1 control pass;3 browser failures |
| Before-fix commit-timing Fit checks | 2 browser failures |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M33.log), [browser](BROWSER_VALIDATION_M33.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M33.log) logs are retained. The full native-browser run passes the unchanged camera-frustum assertions after actual native Fill, native drag/export/slicing and the large Preview idle test. No assertions, deadlines or equality checks were relaxed.

The one native-browser failure is flow calibration's API download of a completed job: `read ECONNRESET`. The trace records the preceding API health response at47966.8ms with `Keep-Alive: timeout=5`, then the download starting at53950.4ms and failing at54111.5ms. That timing is consistent with reuse at Node's idle socket boundary; it is an inference, not a captured TCP diagnosis. [Exact trace](M33_NATIVE_DOWNLOAD_RESET.zip). Node documents this reset risk for reused sockets and the one-second server timeout buffer ([HTTP documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#requestreusedsocket)). No native job was retried or passing output selected. The run remains74 passed,1 failed.

The standalone native suite was not repeated for frontend-only changes; [M32](MILESTONE_32.md) retains331 passes and2 strict same-input slicing-repeatability failures with all outputs. These remain unresolved and are not converted to passing evidence by UI checks.

The feature inventory remains130 units:1 missing,119 partial,8 implemented,2 verified. Exact native desktop appearance, X/Y tower move gizmos, post-slice tower geometry, broader feature behavior and hardware acceptance remain incomplete. No printer was contacted.
