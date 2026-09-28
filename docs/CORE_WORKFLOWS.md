# Current working goal

The user changed the goal on 2026-09-27. Prioritize a usable everyday slicing workflow over expanding the native parity edge-case inventory.

1. Add an installed printer or create and persist a named custom printer, then select it for the project.
2. Select filaments and update ordinary print settings, preserving those choices in the saved project.
3. Load models and make the primary top-toolbar actions understandable.
4. Show rotation angles beside the active tool. Provide 0°, 90°, 180° and 270° presets and snap viewport rotation to 90° by default, with an explicit free-rotation option.
5. Separate application setup, file import, presets, model actions, workspace panels and dialogs into readable modules. Do not hide a large component through compressed lines or a generic state bag.
6. Exercise these complete workflows with browser tests and a real installed-native smoke test; preserve the existing regression suite.

## Progress

| Work | Status | Acceptance |
|---|---|---|
| Add/create printer | Implemented and tested | Visible entry point; save, select and reload a custom printer |
| Filaments and print settings | Implemented and tested | Change material and settings; save/reopen retains them |
| Model loading and top toolbar | Implemented and tested | Load STL/3MF; visible tool labels and selected state |
| Rotation | Implemented and tested | Visible X/Y/Z angles; quarter turns, snapped drag, free rotation and Undo |
| Module organization | Refactored and regression tested | Focused components and workflow hooks; small application entry point |
| Core workflow tests | Passed: 1,140 unit/API; 405 browser; 91 installed-native browser | Full workflow through native export/slicing, plus regression results |

The broad 139-feature parity inventory remains in docs/parity. Unpromoted small-model conversion, oversized-import and camera-transition work is preserved in separate temporary stages and is outside this focused delivery. The earlier full-parity app goal remains paused; the available goal tool cannot edit its objective.

Implementation and acceptance details: [Core workflow delivery 1](parity/CORE_WORKFLOWS_1.md).
