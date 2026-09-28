# Milestone 38 — Prepare display and editing units

The Preferences Units selection now applies to Prepare position offsets, measured dimensions and the status bar. Inch edits commit millimeters using the original native constants; angle and scale fields retain their meanings. Switching units preserves saved geometry, settings and Undo history. [Source reference, exact conversions, browser evidence and limits](NATIVE_MANIPULATION_UNITS.md).

Baseline: installed OrcaSlicer2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native worker binaries and slicing settings are unchanged.

| Command | Result |
|---|---|
| `npm test` | 1,074 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 332 passed; no failures or skips |
| `npm run test:e2e:native` | 78 passed; no failures or skips |
| Independent native conversion checks | 10 passed |
| Focused units/preferences browser checks | 6 passed |
| Focused installed-native export/slicing check | 1 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Full [unit/API](UNIT_VALIDATION_M38.log), [browser](BROWSER_VALIDATION_M38.log), and [browser/native](BROWSER_NATIVE_VALIDATION_M38.log) logs are retained. The new native workflow enters1in X and2in Y, exports millimeter geometry at25.4/50.8mm, validates actual wall-path placement and compares every layer height with the independently retained GUI G-code. The complete suites also retain all M36/M37 rendering/import regressions.

The initial test assumptions and failures remain documented rather than overwritten: the baseline had no Prepare inch support; STL import auto-centers its mesh; scaled geometry needs a nonzero offset to sit on the bed; world vertices use Float32; joint transforms bake individual object offsets; and the source GUI cube's actual final layer is20.04mm. Native conversion comparisons remain exact; geometry assertions use the corresponding real representation. [Diagnostic evidence](NATIVE_MANIPULATION_UNITS.md).

Native selection-relative coordinate semantics, percentage scale and editable-size fields, buffered two-decimal input, import unit conversion, other Preferences pages and fresh desktop visual acceptance remain open. The existing web inspector keeps its explicit offset/scale-factor presentation and three-decimal formatting. The131-unit inventory remains1 missing,120 partial,8 implemented,2 verified. Full parity is not established.

Standalone native slicing was not repeated for this presentation/conversion change. The new actual browser-to-native export/slice and all78 native browser workflows pass, while earlier M32 strict repeatability failures and M33/M34 API resets remain unresolved historical records. No printer was contacted.
