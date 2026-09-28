# Milestone 36 — Prepare renders on demand

Prepare and its painting, brim and variable-layer workspaces now stop GPU submissions when idle. Camera damping, scene edits, tower tools, clipping and shader changes request fresh frames. Original native `GLCanvas3D::on_idle` dirty-state behavior is the source baseline. [Implementation, source hash and focused evidence](NATIVE_PREPARE_RENDERING.md).

Baseline: OrcaSlicer 2.4.2, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Slicing workers and geometry are unchanged.

| Command | Result |
|---|---|
| `npm test` | 1,064 passed; no failures, cancellations or skips |
| `npm run build` | Passed |
| `npm run test:e2e -- --workers=2` | 321 passed, 1 failed |
| `npm run test:e2e:native` | 77 passed; no failures or skips |
| Focused scheduler/damping/tower unit checks | 43 passed |
| Focused real GPU submission browser checks | 5 passed |
| `npm run parity:export` / `npm run parity:check` | Passed |

Complete [unit/API](UNIT_VALIDATION_M36.log), [browser](BROWSER_VALIDATION_M36.log), [browser/native](BROWSER_NATIVE_VALIDATION_M36.log) logs and [failed reload trace](M36_PROJECT_RELOAD_FAILURE.zip) are retained.

The full browser suite exposed a project-loading race: after selecting a saved project with the same visible values, the workflow changed Z while preset restoration was pending. The subsequent project replacement cleared those edits and Undo history. The trace has input selection at85972.495 ms and the new Z edit at85996.055 ms. This run remains a failure. The loading transaction fix and its deterministic regression tests are tracked separately in Milestone37; M36 was not promoted to the running server by itself.

The five new GPU tests count actual WebGL draw calls, require exact idle equality and verify new frames after changes. They cover ordinary Prepare, paint cursors/clipping, variable-layer uniforms, brim ghosts and tower body/gizmo changes. This is scoped browser evidence. Native frame-rate preferences, full camera/gizmo appearance, large-project/device measurements and fresh paired desktop acceptance remain open. A separate partial inventory item makes these responsibilities explicit.

Standalone native slicing tests were not repeated for this rendering-only change. M32's two strict same-input native repeatability failures and M33/M34 API download resets remain historical unresolved evidence. No physical printer was contacted.
