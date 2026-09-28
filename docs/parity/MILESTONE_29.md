# Milestone 29 — active embedded preset names

Printer, Process and Print profile now display the embedded native profile actually in use, even when an imported project lacks catalog IDs or retains IDs for other installed presets. Disabled controls no longer imply loading. [Implementation and regression evidence](NATIVE_PRESET_LABELS.md).

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

| Command | Result |
|---|---|
| `npm test` | 978 passed; zero failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 290 passed; zero failures or skips |
| `npm run test:e2e:native` | 71 passed, 1 failed; zero skips |
| Focused preset browser checks | 10 passed |
| Focused native-project browser checks | 2 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M29.log), [browser](BROWSER_VALIDATION_M29.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M29.log) logs are retained. Both native project workflows verify the embedded names and still generate actual G-code. Export, installed-preset switching, Undo and custom preset editing pass.

The native browser failure repeats M28's unchanged 20-second Preview idle assertion after an orbit gesture. Its [exact trace](M29_PREVIEW_IDLE_FAILURE.zip) is retained. This was not hidden or relaxed. The M28 flow-calibration workflow passes in this full run; its previous ECONNRESET remains historical evidence with an undetermined cause. The standalone native suite was not repeated for this frontend-only change; M27's strict linked-instance repeatability failure remains open.

The [native-backed web screenshot](images/M29_EMBEDDED_PRESET_NAMES.png) shows the corrected names. Native aliases, modified suffixes, dropdown grouping, broader embedded-preset editing and desktop visual acceptance remain partial. The inventory remains 130 major units: 1 missing,119 partial,8 implemented and2 verified. The Mac remains locked; no physical printer was contacted.

The 21-file promotion verified source baselines and unchanged native helper provenance. The checkout then passed all 978 unit/API tests, its production build and parity validation. The native Preview idle failure remains recorded.
