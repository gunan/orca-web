# Project and model import transactions

The M36 full-browser trace exposed a race when reopening the same saved project: old inspector values already matched the test's expected values, so a Z edit arrived while catalog restoration was still pending. `loadCatalog` subsequently replaced the project and cleared history. This was a real application opportunity to lose edits, not only a timing assertion problem.

A native HTML modal now makes the existing workspace inert while reading a project or model. Transform input fields also explicitly disable during loading. Cancel and Escape invalidate the import generation; an AbortController cancels native upload/catalog requests. Uncancellable local file/WASM work may finish, but its late success or failure cannot change the current scene or status. New imports supersede old work. Startup cleanup and New project invalidate outstanding work. Autosave recovery uses the same restoration transaction.

Catalog restoration keeps the existing project, catalog and ready Preview job until a new catalog and project successfully commit. Aborted requests do not trigger fallback, replace state, clear history or mark an uncommitted project as saved. Failed restoration retains the old catalog and reports its error. Existing missing-preset fallback remains supported. A cancelled or failed model import also retains the current completed Preview job.

## Regression evidence

Seven deterministic browser cases cover a held same-project catalog load and subsequent Drop/Undo; cancellation followed by a late catalog response; failed installed-preset restoration; Escape during a native upload; a cancelled local read completing after a new model; cancellation from a completed Preview; and a late local read error. [Seven-case run](M37_IMPORT_BROWSER.log). The original multi-selection workflow also passes in an eleven-case focused run [log](M37_MULTI_SELECTION_BROWSER.log).

The unchanged implementation initially failed four of five new cases because there was no loading/cancellation dialog. Its failure test initially used embedded presets, which did not expose catalog erasure; strengthened to inspect an installed catalog, it failed because both valid printer options were replaced with an unavailable-preset entry. Both runs are retained: [initial](M37_IMPORT_BEFORE.log), [installed-catalog regression](M37_CATALOG_BEFORE.log).

The additional Preview preservation test initially used the wrong canvas name, then assumed renderable geometry in a source-only fake-helper fixture. The final check verifies the real fixture contract: retained ready job, unchanged download identity, Preview workspace and downloadable G-code. Both diagnostic runs are retained, and no fake path is represented as native GPU evidence: [first](M37_PREVIEW_FIRST.log), [second](M37_PREVIEW_SECOND.log).

The first full browser run passed328 cases and failed the older unfinished-model/New project test because the new modal correctly intercepted its File-menu click. That test now explicitly cancels the import before starting New project, then releases the old read and retains the existing empty-scene/slicing-disabled assertions. [Original full run](M37_BROWSER_FIRST.log). All diagnostic traces are preserved in [the archive](M37_IMPORT_DIAGNOSTICS.zip).

This implements safe web loading behavior. It does not establish identical native progress-dialog pixels, interrupt synchronous tessellation mid-call, make native server computation stop immediately upon browser cancellation, or complete all project-format roundtrips. Overall native parity remains partial; no slicing engine, printer command or physical print was changed.
