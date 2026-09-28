# Milestone 34 — prime-tower X/Y Move handles

The prime tower now supports native-style X/Y Move handles and the M shortcut, with source-derived pointer-ray projection, Shift snapping, existing native translation limits and one Undo transaction. Native-disabled tower tools stay disabled. [Implementation, native reference and open visual limits](NATIVE_TOWER_GIZMO.md).

Baseline: OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Production native workers are unchanged from M32/M33.

| Command | Result |
|---|---|
| `npm test` | 1,056 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 313 passed; zero failures or skips |
| `npm run test:e2e:native` | 76 passed, 1 failed; zero skips |
| Focused projection unit checks | 28 passed |
| Combined projection/interruption unit checks | 37 passed |
| Focused body/gizmo browser checks | 14 passed |
| Focused actual browser/native body/X/Y checks | 3 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M34.log), [browser](BROWSER_VALIDATION_M34.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M34.log) logs are retained. The full native-browser suite passes both new axis workflows, the native Fill camera-frustum tests and the large Preview idle test. The full body-drag case reaches completed slicing, then its separate Playwright API download fails with `read ECONNRESET`. Its earlier move/Undo/Redo and 3MF export assertions passed, but its final G-code assertions did not run. The focused body workflow passed separately; it does not replace this full-run failure.

The retained trace shows the actual browser's automatic download of the same completed job returning HTTP 200 with 1,047,484 bytes at 21:02:03.896 UTC. The separate API request fails at 21:02:04.283, 5.894 seconds after its prior health request, consistent with M33's idle-socket failure. This is evidence of an API transport boundary, not proof of its TCP cause. No native job was retried, no comparison was relaxed and no output was selected to erase the failure. [Exact trace](M34_NATIVE_DOWNLOAD_RESET.zip).

Standalone native checks were not repeated for frontend-only changes. M32's 331 native passes and two strict same-input slicing-repeatability failures remain recorded and unresolved. Native desktop appearance remains unverified while the Mac is locked. Camera-view buttons can cover a tower handle at some zoom levels; tested native axis workflows explicitly zoom out to expose it. Post-slice Prepare geometry, broader UI/features and hardware acceptance remain incomplete. No printer was contacted.

The feature inventory remains 130 units: 1 missing, 119 partial, 8 implemented, 2 verified. These counts are not a parity percentage.
