# Milestone 09 — cut connectors, painting and usable window layout

Baseline: installed OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. The server remains available at http://127.0.0.1:3001 using the real installed engine.

[Cut connectors](CUT_CONNECTORS.md) now include plug/dowel prism/frustum variants and snap geometry. The editor validates placement and clearances, creates actual normal/negative native volumes, preserves uint64 cut identities, and synchronizes related family counters through undo. Six native tests retain metadata through CLI re-export and compare every motion against independent C++ primitive geometry. Upright tapered dowels need suitable orientation or supports; the UI explains the native failure without changing settings silently.

[Advanced painting](../advanced-painting.md) adds native connected fill/bucket/current-leaf behavior, height bands, overhang constraints/selection and gap fill. [Continuous strokes](../continuous-painting.md) use circle/sphere capsules between bounded screen-ray samples, breaking at misses and different parts. Native evidence covers 400 material wall paths, a removed 7.99 mm material island, 1,207 support paths and a continuous 66-layer painted strip. Native support colors and readable legend contrast are also restored.

[PA line calibration](CALIBRATION.md) uses source-generated labelled/unlabelled paths with a trusted real-native asset/session and native-expanded start/end macros. Direct and browser/native tests compare every ordered motion/feed/extrusion/PA call against independently compiled native-source fixtures. This does not claim an unlocked native GUI export or physical result.

The viewport now fits actual frustum bounds instead of applying excessive per-axis camera distance. Bottom views retain visible model undersides. The settings panel supports pointer and keyboard resizing, clamping, reset and a persisted width. Tests cover 720–1759 pixel windows while preserving viewport and slicing access. Native fuzzy-skin and color toolbar icons now use the correct installed assets, with every image checked for successful loading. [Current browser capture](web-prepare-milestone-09.png) records progress, not certified native pixel equivalence.

## Integrated checks

| Command | Result |
|---|---|
| `npm test` | 393 unit/API pass, zero skips |
| `npm run build` | Pass |
| `npm run test:e2e` | 135 browser pass, zero skips |
| `npm run test:native` | 72 installed-native pass, zero skips |
| `npm run test:e2e:native` | 12 browser/native pass, zero skips |

Initial negative evidence is retained. The first panel regression found a legacy mobile margin reduced the viewport to zero width at 720 pixels; explicit workspace CSS fixed it. The first isolated stroke-browser test queried an explicit `role` attribute on a native dialog with an implicit role; its selector was corrected before the passing integrated run. The native tapered-dowel no-support rejection and earlier PA fixture precision/boundary corrections are documented in their feature reports.

## More precise remaining work

Eleven native subfeatures are now tracked independently: planar connectors, dovetails, painting fill tools, clipping/caps, brush cursors, filament remapping, support preview, manual layer-height brush, PA lines, PA patterns and multiple selection. Every new item has acceptance criteria and unit/browser/native test plans; plans are not passing tests. No broad feature is newly marked verified.

The scope audit uses pinned [GLGizmoCut.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoCut.cpp), [GLCanvas3D.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GLCanvas3D.cpp), [GLGizmoMmuSegmentation.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoMmuSegmentation.cpp), [GLGizmoFdmSupports.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoFdmSupports.cpp), and the sources linked in the painting reports. Native automatic connector placement is commented out as WIP, so it is not a required 2.4.2 parity feature. Native has an active manual filament remap dialog; no generic automatic-color feature is inferred. Processed cut metadata does not preserve original connector plans, so imported plans are not invented.

Manual variable-layer brush, PA patterns, camera-aligned painting caps and multiple-selection work staged after this batch are excluded from these results. Full native GUI interaction, device and physical acceptance remain open; the desktop was locked and no printer was contacted.
