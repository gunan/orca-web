# Milestone 08 — painting, adaptive layers and measured results

Baseline: installed OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Full parity remains incomplete.

[Facet painting](../facet-painting.md) now changes actual support, seam, color and fuzzy-skin paths. Native tree annotations survive archive roundtrip, mirrors and supported split/assembly/repair operations. Cut and text regeneration require explicit consent where facet correspondence would be lost. Three native comparisons and six browser workflows verify these paths. Advanced painting gestures and full native visual equivalence remain open.

[Variable layers](VARIABLE_LAYERS.md) include native profile metadata, adaptive generation, smoothing, curve editing and undo. Independently compiled native C++ fixtures verify every generated point; four installed-engine cases match every motion against those references. The browser/native cube generates 67 layers. Native 3D brush gestures remain open.

[Filament order](FILAMENT_ORDER.md) preserves the cached per-plate sequence and edits native first-layer/interval controls. Ten native layers prove requested order and later-row precedence. Invalid complete orders and stale caches are handled explicitly. Trusted preset canonicalization also fixes installed default scalar nozzle types when creating native projects.

[Measured calibration results](CALIBRATION.md) accept explicit temperature, pressure advance, retraction and maximum-flow values and save session-bound custom filament presets. Four native tests persist, reload and slice those presets. A browser/native result workflow produces `M109 S225` during an ordinary later slice. These are synthetic test entries; no physical measurement is inferred and no printer was contacted.

## Integrated checks

| Command | Result |
|---|---|
| `npm test` | 353 unit/API pass, zero skips |
| `npm run build` | Pass |
| `npm run test:e2e` | 122 browser pass, zero skips |
| `npm run test:native` | 60 installed-native pass, zero skips |
| `npm run test:e2e:native` | 11 browser/native pass, zero skips |

Initial failures remain part of the evidence. One integrated error-message assertion was fixed without weakening validation. The first new browser/native adaptive-layer check incorrectly expected maximum height immediately after the first layer: native uses a 0.04 mm ramp. The corrected test compares the submitted curve point by point against the independent C++ fixture, retains the exact 67-layer assertion, and checks maximum-height spacing throughout the stable interior. The first run's 10/11 result is not counted as a pass.

The initial native order fixture floated above the plate after centered scaling and crashed the native custom-order path. Dropping the fixture onto the bed fixed it; server preflight now guards the demonstrated empty-first-layer configuration. Details and the conservative support limitation are recorded in the filament-order report.

The Mac remained locked for native GUI comparison. No feature was newly marked verified. Advanced painting, cut connectors and revised camera fitting started afterward are excluded from these counts.
