# Milestone 40 — Fit preserves the viewing direction

Manual Prepare Fit, Zoom to bed and Preview Fit toolpaths now keep the settled camera axes while fitting the relevant geometry. Delayed tower replacement completes a pending Fit in the chosen custom orientation. Explicit named views and the existing automatic plate policy retain their prior behavior. Preview now fits all eight corners through the actual frustum instead of estimating from the largest dimension. [Source inspection, regression evidence and limitations](NATIVE_FIT_ORIENTATION.md).

Baseline: installed OrcaSlicer2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. No native worker or slicing configuration changed.

| Command | Result |
|---|---|
| `npm test` | 1,083 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 345 passed; no failures or skips |
| `npm run test:e2e:native` | 80 passed; no failures or skips |
| Focused camera-fit units | 4 passed |
| Focused Fit and delayed-tower browser checks | 18 passed |
| Focused installed-native Fit workflow | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

[Unit/API log](UNIT_VALIDATION_M40.log), [browser log](BROWSER_VALIDATION_M40.log), [installed-native browser log](BROWSER_NATIVE_VALIDATION_M40.log). The real-engine workflow verifies unchanged viewing axes and projects every selected native path endpoint through the rendered matrices, both for the full range and a restricted layer interval. It submits only one slice. No printer was contacted.

The three new orientation regressions fail against the preceding build. The first fix additionally changed automatic plate framing; that unrelated behavior was restored with explicit initial-view requests. The initial15-pass/1-failure run and the original failures are retained. Final focused18 and full345 browser checks pass.

Native camera projection and zoom mathematics, margin, native selection/volume framing, named-view semantics, automatic plate behavior, navigation cube and paired desktop appearance remain incomplete. These camera features remain partial. The132-feature inventory remains1 missing,121 partial,8 implemented and2 verified; these counts are not a parity percentage.

Standalone native slicing was not repeated for camera-only behavior. All80 actual browser-to-native workflows pass. Earlier strict native slicing-repeatability failures remain unresolved; the M39 tower browser-download correction and its original idle API reset evidence remain in the history.
