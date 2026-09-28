# Tower interaction and Fit lifecycle reliability

M33 extends the M32 native body drag implementation without changing native geometry, constraints or helper binaries. Baseline: OrcaSlicer2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

Losing pointer capture, window blur, a hidden page, released mouse buttons, tool changes and replacement preview geometry now cancel the temporary tower displacement, release the layout reservation and restore the original control availability. Foreign pointer events cannot take over or commit another pointer's active gesture. Normal release commits exactly once even when releasing capture synchronously dispatches another event. Disposal removes event handlers and does not select into an unmounted owner.

The regression tests reproduced eight unit failures and three browser failures against M32; the disposal control already passed. The fixed implementation passes all nine interruption unit checks and the full11-case body-drag browser suite, including a successful subsequent drag after interruption.

## Camera Fit

M32's actual native Fill workflow revealed clipped tower geometry after Undo/Redo. A deterministic React harness reproduces the timing gap: the parent calls Fit in a layout effect after new tower props commit but before the scene's passive effect replaces old geometry. Fit previously used imperative bounds from the old render while reading the new ready status. Both ready-to-ready and loading-to-ready cases fail before the fix, with independent world-corner frustum assertions.

Fit now derives bounds directly from the current committed preview. Bounds include the original native shell and every Float32 rendered band vertex; rotated towers and rounding at band edges remain covered. This avoids relying on the timing of scene replacement effects. Two unit checks compare the bounds to actual Three geometry and independently transformed shell corners across native fixtures and four rotations. The two browser timing regressions pass with the original frustum threshold unchanged.

Final focused validation:11 unit checks and24 browser checks pass. The browser run includes all existing camera gesture, delayed-response, plate switch, disabled-tower and projection tests, as well as interruption and commit-timing regressions. [Unit log](M33_TOWER_UNIT.log), [browser log](M33_TOWER_BROWSER.log).

Before-fix failures: [interruption unit](M33_INTERRUPTION_UNIT_BEFORE.log), [interruption browser](M33_INTERRUPTION_BROWSER_BEFORE.log), [camera browser](M33_FIT_BROWSER_BEFORE.log), [all retained traces](M33_TOWER_REGRESSION_TRACES.zip).

These checks establish browser reliability, not complete native appearance or physical printer acceptance. Native X/Y move gizmos, post-slice geometry and broader native interactions remain partial. M32's two strict slicing-repeatability failures are retained separately; these frontend fixes do not resolve them. M32's startup network failure was Chromium `net::ERR_NETWORK_IO_SUSPENDED`, before Preview could be exercised.

[Full M33 results and retained download failure](MILESTONE_33.md).
