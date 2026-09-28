# Core workflow delivery 1

Date: 2026-09-27 (validation continued on 2026-09-28 UTC). Native engine: installed OrcaSlicer 2.4.2. Revision: `5050dab + core-workflows-1 working tree`.

## Goal

The user narrowed the request to adding a printer, selecting filaments, editing ordinary settings, loading models, clearer top-toolbar controls, visible rotation angles with quarter-turn snapping, and meaningful frontend modules. The broad parity inventory is retained for reference. Unpromoted M49–M51 import/camera work is outside this delivery.

## Delivered behavior

- The printer panel has an **Add printer** entry point. An installed profile can be selected directly, or used as the base for a named custom printer with bed dimensions, build height and nozzle diameter. Custom printers are saved through the existing validated preset API and selected with compatible process and filament defaults.
- Printer, material, layer-height and model-transform choices survive project save/reopen. Loading and slicing use the existing project/native pipeline.
- Primary model tools show their names and selected state. The Rotate tool exposes live X/Y/Z angles, numeric entry, and 0°/90°/180°/270° buttons. Viewport rotation snaps by 90° by default. Snapping can be disabled for free rotation. Each completed drag remains a single Undo action.
- `src/main.jsx` only mounts the application. `src/App.jsx` composes the layout and named domain controllers. Preset requests, imports, transforms, slicing, clipboard actions, workspace panels and dialogs have separate modules. See [architecture](../ARCHITECTURE.md).

The new setup form is shown in the [Add printer screenshot](CORE1_ADD_PRINTER.png).

## Acceptance coverage

| Workflow | Evidence |
|---|---|
| Add an installed printer | Browser chooses another installed profile and checks compatible material/process selection and saved IDs |
| Create a custom printer | Browser creates a named 220 × 220 mm printer; real-native browser creates a machine derived from an installed profile |
| Change filament and settings | Browser selects PETG and 0.24 mm layers, saves/reopens the project; native output contains the chosen material, custom printer name and layer height |
| Load a model | STL loaded through the visible file input; existing STL/3MF browser/native regression workflows retained |
| Understand the top toolbar | Visible text and active state; label bounds do not overlap neighboring buttons; original 36-pixel icons checked in light/dark at 1×/2× |
| Rotate | Every axis has tested quarter-turn buttons; a real pointer drag displays 90° before release, commits it, and undoes once; free dragging and numeric angles also persist |
| Preserve the refactored application | Full unit/API, mock-engine browser and installed-native browser suites |

New tests: `tests/e2e/core-workflows.spec.js` (four workflows) and `tests/native-e2e/core-workflows.spec.js` (one installed-native workflow).

## Validation

| Command | Result | Log |
|---|---|---|
| `npm test` | 1,140 passed; no failures/cancellations/skips | [Unit/API](UNIT_VALIDATION_CORE1.log) |
| `npm run build` | Passed; existing bundle-size advisory remains | [Build](BUILD_VALIDATION_CORE1.log) |
| Focused Playwright regression run | 23 passed | [Focused browser](BROWSER_FOCUSED_CORE1.log) |
| `npx playwright test --workers=2` | 405 passed; no failures/skips | [Mock-engine browser](BROWSER_VALIDATION_CORE1.log) |
| `npm run test:e2e:native` | 91 passed; no failures/skips | [Installed-native browser](BROWSER_NATIVE_VALIDATION_CORE1.log) |
| `npm run parity:export` / `npm run parity:check` | Passed; inventory regenerated and checked | Generated feature inventory |

Screenshots: [rotation controls](CORE1_ROTATION.png), [installed-native workflow](CORE1_NATIVE_PREPARE.png). The [compressed native G-code](CORE1_NATIVE_OUTPUT.gcode.gz) preserves the final core-workflow output.

The [first complete mock-browser attempt](BROWSER_INITIAL_CORE1.log) had 394 passes and 10 failures. It found an incorrect named React import in the extracted transform panel and a move test using fixed coordinates from the old toolbar layout. The import was corrected, and the test now locates the handle relative to canvas height. All 23 focused regression checks pass after these fixes. No production/test timeout was increased.

## Scope

This delivers the requested everyday workflow; it does not certify all 139 native parity features. The clearer labels and rotation controls intentionally follow the user's usability request rather than claiming pixel-identical native controls. Physical printer communication/printing and a native desktop visual comparison were not performed. No native worker or slicing algorithm was changed; historical standalone-native limitations remain recorded under M48.
