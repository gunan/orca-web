# Milestone 04 — native projects, presets and calibration

Baseline: installed OrcaSlicer **2.4.2**, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Working tree follows `5050dab`. This records completed scoped work; full parity remains incomplete.

## Implemented behavior

- Native 3MF projects import/export effective settings, multiple plate locations, part groups and normal/negative/modifier/support-enforcer/blocker roles. Object and part overrides have typed editors and native scope validation. Users explicitly choose embedded project settings or installed presets; imports do not silently replace unknown presets. Selected-plate slicing excludes other plates before bounds validation.
- Native projects retain multiple filament settings, assignments and colors. Slot add/remove operations preserve vector/matrix indices and reject deleting a used filament. Purge volumes are editable per source/destination pair. Real native fixtures produce negative-volume holes, density modifiers and use both filaments.
- Layer-event editing supports native pause/custom/template/tool-change/color-change metadata. Browser-to-native tests verify effective pause and custom commands. Native 2.4.2 disables its ColorChange command-emission branch; retaining that metadata does not claim an emitted change.
- Machine, process and filament editors create, update, rename, delete, import and export durable custom presets. Frozen source snapshots and atomic writes protect inheritance and storage. The schema exposes 342 process, 115 machine and 112 filament controls. Source-pinned conditional rules cover visibility, enabled options, nullable vectors, material warnings and correction review. Some event dialogs and hidden-setting corrections remain incomplete.
- Native input-shaping frequency/damping and cornering classic-jerk/junction-deviation models use exact native resources and bound preparation sessions. Tests verify effective commands with installed 2.4.2. Cornering removes stale native time estimates after changing motion limits. No physical calibration was performed.
- ZIP64 native resource archives use bounded directory/locator/extra-field parsing and actual expansion limits. Oversized counts, integer overflow, forged sizes and unsupported multi-disk archives fail; five native flow archives pass.
- Native-part, filament, layer-event and preset dialogs have cancel/focus behavior. A printer change and its dependent filament reset are one undo step. Sidebar content no longer overlaps the footer.

## Executed verification

| Command | Result |
|---|---|
| `npm test` | 213 unit/API tests passed; 0 skipped |
| `npm run build` | Passed |
| `npm run test:e2e` | 75 browser tests passed; 0 skipped; fake engine/printer fixtures |
| `npm run test:native` | 22 installed OrcaSlicer 2.4.2 tests passed; 0 skipped |
| `npm run test:e2e:native` | 4 browser-to-native tests passed; 0 skipped |
| `node --test tests/unit/native-settings-inventory.test.js` | 3 scope-aware inventory regressions passed after exporter update |
| `npm run parity:settings -- --profiles-dir /Applications/OrcaSlicer.app/Contents/Resources/profiles --native-version 2.4.2 --write` | 881 observed category/key pairs; 569 controls; 537 observed editable keys (107 machine,322 process,108 filament); no scanner warnings |

The current fresh native GUI export attempt timed out after 60 seconds at the macOS recovery dialog while the Mac was locked. `npm run test:native:gui` is a separate interactive suite; it is **not claimed passed** in this batch. Headless/native-browser evidence does not substitute for that UI comparison. No physical printer was contacted.

## Evidence and remaining scope

- [Two-filament preparation](milestone-04-multimaterial-prepare.png) and [actual preview](milestone-04-multimaterial-preview.png).
- [Native project semantics and limitations](../native-projects.md).
- [Machine/filament schema and custom presets](../native-schema/PROFILE_SETTINGS.md).
- [Conditional settings provenance](../native-schema/SETTINGS_DEPENDENCIES.md).

Painted facets, variable layer profiles, height-range overrides, brim ears, cut connectors and auxiliary assets are not yet preserved/edited. Variable layers, height-range settings and brim ears now have separate feature IDs and acceptance plans. Exact native layout, complete calibration/device breadth and hardware acceptance remain unfinished. No additional broad feature is marked verified.
