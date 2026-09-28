# Preview camera and job lifecycle reliability

Baseline: installed OrcaSlicer 2.4.2 and pinned native processor source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Native geometry, shaders, job snapshots and helper binaries are unchanged.

## Camera damping

M28 and M29 full native-browser runs exceeded the existing 20-second idle-render assertion after an orbit gesture. OrbitControls decayed movement per rendered frame; with a heavy native toolpath it could take over 40 seconds at four frames per second. The new scheduler adapter preserves the default 60 Hz exponential decay using elapsed time for scheduled updates. Pointer events retain their configured factor. New gestures reset the clock, Fit drains old movement, and the final sub-threshold remainder is cleared so future data changes cannot nudge the camera.

Three new unit tests exercise the actual OrbitControls at 4,10,30,60 and144 FPS for both orbit and pan, require settling within4.5 seconds, and compare the final camera and target within1e-8 mm. An unchanged default controller demonstrates the >20-second regression at4 FPS. Three existing render-scheduler tests also pass. The initial attempt failed because the sub-threshold remainder could move the camera again; that failure is retained and corrected by draining it. Neither the native idle assertion nor its timeout was changed.

The existing large native-toolpath browser test passes without modification. The first damping-only full suite passed989 unit/API and290 browser tests; final combined results are recorded separately. [Final unit diagnostics](PREVIEW_DAMPING_UNIT_M31.log), [initial failed attempt](PREVIEW_DAMPING_INITIAL_M31.log), [native performance check](PREVIEW_DAMPING_NATIVE_M31.log), [initial full browser run](PREVIEW_DAMPING_BROWSER_INITIAL_M31.log).

## Job lifecycle

M30 saving a flow-calibration result cleared the active job while an effect still saw the preceding native parsed data. A pending or unavailable hotend led to a synchronous null.id crash. A direct ready-job switch also requested a new hotend before the new job's G-code loaded.

Parsed Preview state now records the job that produced it. Rendering and dependent effects only use data matching the current ready job; the hotend effect also requires a ready job. Existing abort cleanup discards old requests. Native timing-mode edits retain this binding. This keeps cleared, running, failed and cancelled states usable and prevents old data from starting a new job's asset request.

Seven focused browser regressions cover pending/unavailable/loaded hotends, ready-to-running/failed/cancelled, result clearing and delayed new-job download. They all pass. Against the unchanged preceding component, three fail (two null-job crashes and the premature new-hotend request), while four controls pass. [Corrected checks](PREVIEW_LIFECYCLE_BROWSER_M31.log), [previous-component failures](PREVIEW_LIFECYCLE_BEFORE_M31.log), [exact failure traces](M31_PREVIEW_LIFECYCLE_BEFORE.zip).

The real native flow-calibration workflow now deliberately holds the actual hotend metadata response across result saving, waits for genuine processed toolpaths, checks the empty result and application survival, and still verifies the saved preset ratio. The focused check passes. Only response timing is controlled; actual slicing, processing, result saving and metadata come from installed OrcaSlicer and the real server. The specimen choice remains an explicit synthetic test entry, not a physical measurement. [Native flow check](PREVIEW_LIFECYCLE_NATIVE_M31.log).

These fixes resolve demonstrated web defects. Complete native desktop appearance, interaction coverage, physical printing and earlier identical-input native slicing variability remain incomplete. Feature statuses stay partial.

Final combined validation passes989 unit/API,297 browser and74 browser/native checks, with build and parity checks passing. See [M31 full results](MILESTONE_31.md).
