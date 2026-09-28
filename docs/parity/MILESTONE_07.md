# Milestone 07 — height ranges, retraction and native layout

Baseline: installed OrcaSlicer **2.4.2**, pinned source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. Full parity remains incomplete.

The [height-range editor](HEIGHT_RANGES.md) preserves native metadata, exposes 148 region controls, retains grouped object settings, and implements native interval/part/modifier precedence. Four real-native cases prove wall speeds, layer increments, modifier priority and material selection; a browser/native test edits 4–8 mm to 0.1 mm and checks the resulting layers.

[Retraction calibration](CALIBRATION.md) uses the native source model and exact cut plane. It updates actual retraction/wipe and paired unretraction E commands. Three native scenarios compare all wipe cycles with independently sliced constant-length references while preserving native XYZ/feed/deposited E. Unsupported cooling slowdown, adaptive PA, pressure equalizer and zero-length active-hop combinations remain guarded. No physical best result is inferred.

The Prepare layout uses attributed native icons, a single primary filament selector and a settings list that uses available height. Secondary filament preset saves preserve the primary slot. The [browser capture](web-prepare-milestone-07.png) is a visual progress record, not a pixel-parity certificate. Native GUI comparison still needs an unlocked desktop.

G-code preview interprets T only as a leading tool command, allowing an optional line number. M104/M204/G10 T parameters no longer corrupt material assignment.

## Integrated checks

| Command | Result |
|---|---|
| `npm test` | 311 unit/API pass, no skips |
| `npm run build` | Pass |
| `npm run test:e2e` | 105 browser pass, no skips |
| `npm run test:native` | 47 installed-native pass, no skips |
| `npm run test:e2e:native` | 9 browser/native pass, no skips |

An initial device HTTP test used its intentional 100 ms slow-body timeout for unrelated malformed-response checks, causing an incorrect timeout under concurrent native work. Ordinary response validation now has 5 seconds while the stalled-body case retains 100 ms; the full suite passes. The first browser run found three actual pointer-interception failures because the tall embedded preset stack shrank the Process header over Objects. Fixed nonshrinking headers and a scrollable minimum-height settings panel pass all affected workflows. An old test expected retraction to be unavailable; it now checks availability and server-error recovery. The initial four failures and subsequent one stale assertion failure are not counted as successes.

Measured-result saving, facet painting, adaptive layers and filament ordering underway afterward are excluded from these counts. No printer was contacted and no broad feature was promoted to verified.
