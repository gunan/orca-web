# Milestone 27 — native tower obstacles

Full automated regression results are recorded below. The native repeatability failure and the stated acceptance gaps remain open.

Fill now reserves the original pre-slice tower footprint, and its subsequent Arrange keeps that same existing-volume obstacle. Source-specific double brim, automatic brim, placement clamping, zero rotation and fixed-obstacle behavior are retained. Native path-conflict errors are actionable. See [implementation and limits](NATIVE_FILL_TOWER.md).

Baseline: installed OrcaSlicer 2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

| Command | Result |
|---|---|
| `npm test` | 978 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 276 passed; zero failures or skips |
| `npm run test:native` | 297 passed, 1 failed; zero cancellations or skips |
| `npm run test:e2e:native` | 72 passed; zero failures or skips |
| Focused native tower / existing Fill checks | 30 passed, including 13 original-source Fill and 13 Arrange footprint comparisons |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M27.log), [browser](BROWSER_VALIDATION_M27.log), [native](NATIVE_VALIDATION_M27.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M27.log) logs are retained. Both new browser/native workflows pass: the larger-volume configuration slices; the narrow-tower configuration rejects the actual native toolpath collision and displays the final actionable error.

The existing strict linked-instance repeatability test fails again. In fixed reference/reference/web/web order, command counts were 11,057 / 11,057 / 11,135 / 11,057. Native-readable archive entries match independent XML edits, but identical web archives produce different motions. The [four-run data](M27_INSTANCE_REPEATABILITY.json) and [exact input/output archive](M27_INSTANCE_REPEATABILITY.zip) retain the failure without retries or relaxed comparisons.

The [web screenshot](images/M27_NATIVE_FILL_TOWER.png) records a viewport issue: the tower is clipped after Fit while its asynchronous preview refreshes. It is evidence of an open camera-fitting gap, not visual acceptance. Native desktop visual comparison remains incomplete while the Mac is locked.

Initial test setup failures are retained in temporary logs: a missing stage web build; initial cube translations outside the reduced bed; an expected 0/-0 JSON serialization distinction in reference-input comparison; and a too-small positive-test plate that correctly added no instances. The narrow-tower slicing conflict exposed the missing Arrange viewport obstacle and remains a native post-slice conflict even with the source-correct pre-slice footprint. The final suite includes both rejection and successful slicing scenarios; no tolerance or collision check was relaxed.

The inventory remains 130 major feature units, with 1 missing, 119 partial, 8 implemented and 2 verified. Full native desktop/hardware acceptance, earlier exact-motion repeatability failures and the gaps listed in the implementation report remain open.

The 43-file promotion verified baseline and paired native helper hashes. The repository then passed all 978 unit/API tests, its production build and parity validation.
