# Milestone 03 — native controls, imports, devices and calibration

Baseline: installed OrcaSlicer **2.4.2**, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Working tree follows `5050dab`; this is scoped implementation evidence, not a claim of full parity.

## Implemented work

- A source-generated process editor exposes 342 native UI definitions across all six pages, including Multimaterial. Controls preserve native enums, booleans, integers, percentages, float-or-percent strings and real vectors. Native defaults fill absent preset values. Search, mode filtering, per-row reset and preset comparison work. Host post-processing scripts remain explicitly disabled. Dynamic dependency/enablement rules and context corrections are still incomplete.
- STEP imports use a local OpenCascade worker and WASM, with linear/angular deflection controls. Plain/compressed AMF honors physical units. SVG paths/holes extrude with physical size, depth and scale. File, triangle and actual ZIP expansion bounds are enforced; unsupported AMF constellations report an error.
- Assembly, disassembly and connected-shell splitting preserve baked world geometry; undo restores previous surfaces. Conservative repair removes duplicate/degenerate faces, snaps near-identical points and fixes winding while preserving nested cavity orientation. It does not fill holes or repair self-intersections.
- Moonraker and OctoPrint connections persist with atomic private credential storage. Status drives capability/state gating. G-code transfer-only, confirmed print starts, pause/resume/cancel, homing, bounded jog, heaters and supported fan commands have actual protocol implementations. Camera URLs support direct MJPEG/snapshot display. All executed device tests use fake local printer servers; no printer was contacted.
- Native browser dialogs contain focus, close with Escape and restore focus. Unsaved project replacement supports keeping changes, discarding, or saving before continuing; unload protection and existing autosave remain active.
- Temperature and pressure-advance towers use the actual native resources, source-backed clipping/settings and effective per-layer G-code commands. Ephemeral tokens bind exact generated STL bytes, parameters and resolved preset snapshots; changed/expired sessions require regeneration. Geometry/preset edits clear calibration. See [calibration provenance and constraints](CALIBRATION.md).
- Every API-uploaded 3MF is checked for embedded host post-processing commands in JSON, XML, object metadata and legacy configuration carriers before invoking native code. Native project parser/export foundations now have scoped unit fixtures; full project integration continues in the next tranche.

## Executed verification

| Command | Result |
|---|---|
| `npm test` | 147 unit/API tests passed; 0 skipped |
| `npm run build` | Passed; local STEP worker/WASM emitted |
| `npm run test:e2e` | 34 browser tests passed; 0 skipped; fake slicing engine and fake printer API fixtures |
| `npm run test:native` | 15 real OrcaSlicer 2.4.2 tests passed; 0 skipped |
| `npm run test:e2e:native` | 2 complete browser/native tests passed; 0 skipped |
| `npm run parity:settings -- --profiles-dir /Applications/OrcaSlicer.app/Contents/Resources/profiles --native-version 2.4.2 --write` | 881 observed category/key pairs; 342 process control definitions; 322 observed editable keys |

The second direct CLI/API differential fixture uses additional enums, 125% outer-wall width, acceleration and a vector flow-compensation model; **all 9,433 motion commands match**. The original 10,989-command fixture and transformed STL/3MF 6,100-command comparison still pass. AMF import matches **8,869 direct-native motion commands**. These are limited reference fixtures, not proof of general equivalence.

Native temperature preparation produces a closed 6,436-triangle clipped tower and **100 layers with M104 230→225 commands**. PA preparation produces a closed 52-triangle 3 mm tower and **15 layers with effective M900 changes**. Native resource conversion, exact-token upload validation and slicing are tested separately; the full browser temperature flow also verifies that editing geometry exits calibration. Physical calibration results are untested.

## Durable visual evidence

- [Prepare with expanded native controls](milestone-03-prepare.png)
- [Actual G-code preview](milestone-03-preview.png)
- [Native temperature model prepared](milestone-03-calibration-prepare.png)
- [Native temperature toolpaths](milestone-03-calibration-preview.png)

Native process schema provenance, source hashes, reproduction command and upstream license are in [docs/native-schema](../native-schema/README.md). The screenshots establish rendered behavior only; exact native layout remains unfinished.

## Remaining parity

Native project settings/parts/plates/multimaterial and layer events are being integrated. Machine/filament editing and durable custom preset workflows are also in progress. Cut/connectors, painting, modifiers/text, full calibration workflows, device vendor breadth, native conditional settings behavior and complete visual equivalence remain tracked. No additional broad feature is marked `verified` in this milestone.
