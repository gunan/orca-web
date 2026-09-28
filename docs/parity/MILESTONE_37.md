# Milestone 37 — cancellable project loading

Project/model loading now protects the current workspace and commits replacement state only after successful preset restoration. Cancel, Escape, superseding imports and late local read failures cannot overwrite later work. Failed or cancelled loads retain the existing project, catalog, Undo history and completed Preview result. Autosave recovery follows the same transaction. [Behavior and regression evidence](IMPORT_TRANSACTIONS.md).

This milestone includes M36's demand-rendering changes; M36 was not promoted alone after its full browser run exposed the loading race. Baseline: installed OrcaSlicer2.4.2 and source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native workers are unchanged.

| Command | Result |
|---|---|
| `npm test` | 1,064 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| Initial `npm run test:e2e -- --workers=2` | 328 passed,1 failed: older New-project test attempted to click through the loading modal |
| Revised `npm run test:e2e -- --workers=2` | 329 passed; no failures or skips |
| `npm run test:e2e:native` | 77 passed; no failures or skips |
| Seven focused delayed-import checks | Passed |
| Focused import plus original multi-selection checks | 11 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M37.log), [browser](BROWSER_VALIDATION_M37.log) and [browser/native](BROWSER_NATIVE_VALIDATION_M37.log) logs are retained. The revised browser test explicitly cancels before selecting New project and still checks that releasing the earlier read leaves an empty, unsliceable new project. The original failed run and every regression-harness failure remain in the [implementation record](IMPORT_TRANSACTIONS.md).

The combined implementation passes the original same-project Drop/Undo workflow and actual native project, Prusa import, model manipulation, export and slicing scenarios. A successful run does not erase M32's two strict same-input slicing-repeatability failures or M33/M34's API download connection resets. Standalone native slicing was not rerun for these frontend lifecycle/rendering changes.

Progress-dialog appearance, interrupting synchronous tessellation, complete native project portability, graphics preferences, all remaining feature units and hardware acceptance remain open. The expanded inventory contains131 units:1 missing,120 partial,8 implemented,2 verified. This is not a parity percentage. No printer was contacted.
