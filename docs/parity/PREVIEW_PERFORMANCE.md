# Preview idle-render performance

This is an implementation optimization with unchanged native color/geometry semantics, following the737/242/198/37 M19 acceptance batch. It is not a revised claim about that already-recorded batch.

The exact nine-specimen flow job from the timeout trace contained684,745 G-code bytes,71,637 native vertices,50,089 spatial segments and46,634 visible native solids. On this machine, a warmed Node probe measured these median CPU costs:23.9ms for all13 native scalar availability/domain lookups;17.9ms for scalar colors at every endpoint;3.1ms for the visibility selection scan;1.3ms for the native range;0.24ms for command lookup. Scalar domains were already memoized across ordinary React events. These costs do not substantiate10–25-second idle UI stalls. Parent's identical flow test passed33.1seconds in the standalone native-browser rerun; the failed run had competing four-worker mock browsers and two native workers.

The concrete avoidable GPU work was an unconditional animation loop: a static Preview repeatedly rendered all visible instanced solids. The scheduler now coalesces requested frames and leaves the GPU idle once OrbitControls damping settles. Native geometry/color, layer/command/option changes, marker asset/position changes, resize and Fit explicitly invalidate. OrbitControls' original update result/change events preserve all damping frames. Disposal cancels pending work and rejects late invalidations. This does not throttle active playback, alter native shader branches or replace actual solids with lines.

Two bounded CPU changes accompany it. The visible count uses a memoized selection, avoiding the50k-segment scan for unrelated React state. Scalar endpoint colors read one native scalar directly instead of allocating a complete inspector dictionary. The13 domain lookups remain cached by their existing dependencies. The exact flow job's scalar-color median in a later local probe was15.6ms; run-to-run load and JIT variation mean this is not a controlled percentage-speedup claim.

Evidence:

- Three deterministic scheduler tests prove invalidation coalescing, idle termination, continued damping (including reentrant control-change events) and disposal.
- Existing native scalar tests compare812,588 genuine GUI-file vertex RGB values to independent original C++ for seven modes and all four Travel/Wipe combinations; undefined PA remains unavailable. Both tests pass.
-21 existing browser regressions pass: geometry/shader comparisons, scalar colors, source fallback, role visibility, layer/move controls, shortcuts, command inspector and error handling.
- Four focused native-helper browser tests pass: three original marker/property/profile tests plus an actual native-solids idle test. The new case verifies zero additional frames over250ms after settling, then redraws on layer/color/options/resize/orbit/Fit/scrub/playback and disposes when returning to Prepare. Orbit damping on a large software-rendered viewport can take more than5seconds; this new test allows20seconds to settle and still requires an entirely idle frame counter afterward. No existing test's timeout/assertions were weakened.
- The M42 rebase exposed a root integration import typo (`nativeFixed` omitted) and a missing staged reference file. Both were corrected before final focused acceptance; this was not a performance workaround. The parent fixed its source independently.

Reproduce the CPU measurements with `node scripts/benchmark-preview.mjs input.gcode output.json [native-cache.json]` and the configured real native helper. The script is diagnostic and does not change the runtime. Browser frame counters are diagnostic attributes only; they do not substitute for native vertex/shader reference comparisons.

No new paired desktop GUI comparison or physical printer action was performed. Remaining Preview parity gaps continue to be tracked by the native feature documents.
