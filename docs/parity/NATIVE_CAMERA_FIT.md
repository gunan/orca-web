# Camera fitting with asynchronous native geometry

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This fixes a web timing defect exposed by native Fill/Arrange. It does not certify native camera or visual parity.

Prepare removes an obsolete tower during native recomputation. Previously, clicking Fit or a named camera view during that interval fitted only the models. The completed tower then appeared outside the viewport. Both perspective and orthographic tests [fail against the unchanged M27 build](CAMERA_BEFORE_M28.log): after completion the horizontal camera target remains 52.5 instead of including the tower.

Fit now remembers its requested view and active plate until valid geometry arrives. Orbit, pan, zoom, a later bed-only camera command, disabling, failure and plate changes supersede or cancel that request. Aborted responses cannot satisfy it. Automatic initial tower fitting also respects camera movement. A new fit drains residual OrbitControls damping before applying its position.

The tests project independent model bounds and transformed tower corners with the actual rendered view/projection matrices, checking horizontal, vertical and depth clipping. Eleven new browser scenarios cover both projections, three gestures, bed-only override, failure, disabling, stale responses, plate switches and initial automatic-fit cancellation. The existing two tower browser tests also pass. Browser/native Fill tests retain export, Undo/Redo and actual slicing checks and now verify the rendered frustum too. The [native-backed web screenshot](images/M28_NATIVE_FILL_TOWER.png) shows the formerly clipped tower fully inside the viewport.

The [first fix run](CAMERA_INITIAL_FIX_M28.log) passed ten of eleven checks; its pan assertion compared a damped camera below OrbitControls' event threshold too strictly (0.000795 mm drift). The library suppresses change events below a 1e-6 squared-distance threshold. The final gesture assertion uses a 0.005 mm tolerance; all frustum bounds and native geometry comparisons remain unchanged. The [expanded 13-test run](CAMERA_VALIDATION_M28.log) and [three browser/native checks](CAMERA_NATIVE_M28.log) pass. A first test setup attempt placed the tower origin beyond the bed and was correctly rejected; the actual regression uses an in-bounds origin.

The Mac remained locked at the latest desktop check. Native desktop pixel comparison, tower dragging/rotation gizmos, actual post-slice Prepare meshes and the other tracked parity gaps remain open. The screenshot also retains an embedded-preset label issue: disabled selectors say Loading presets even though embedded profiles are known. That remains a separate UI gap. No physical printer was contacted.

[M29 embedded preset labels](NATIVE_PRESET_LABELS.md) addresses the separate misleading loading-label issue observed in the M28 screenshot.
