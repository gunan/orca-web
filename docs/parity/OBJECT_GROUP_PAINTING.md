# Painting a native object with multiple parts

Baseline: OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

The native painter operates on normal volumes of the selected native object. `GLGizmoPainterBase.cpp:760–779` constructs per-volume transforms; ordinary stroke samples are grouped by the actual hit volume. Height painting at `592–655` and `780–813` visits every intersecting normal volume. `TriangleSelector.cpp:311–320` seeds every original facet intersecting the height cursor, including disconnected regions in one volume. `GLGizmoPainterBase.hpp:245–247` limits the native height brush to 0.1–8 mm, step 0.2.

The browser now accepts hits on either visible normal part of the selected object. Ordinary strokes do not form a capsule across a transition between two parts. Height strokes share the same world Z interval across the group, use native float32 pointer height, and render section contours on every affected part. Clear, gap fill and angle-based support selection apply to the object's normal parts; negative/modifier/helper volumes and unrelated objects/plates retain their annotations. Clipping uses the selected group bounds; unrelated objects do not intercept paint rays. Normal base filament colors and painted overlays render across the group. The native height range limit is exposed by the control and checked by the group operation.

Undo snapshots retain every affected part's paint/native/base-filament data, while applying a completed paint dialog is one project history operation. Saved group identity and topology are retained.

## Evidence

- `tests/unit/paint-object-group.test.js`: three cases verify all-part height coverage, helper/plate/group exclusion, immutability, actual hit routing, channel clear and shared cursor contours.
- `tests/native/paint-object-group.test.js`: installed 2.4.2 slicing of two painted normal parts matches **800 native outer-wall paths and their material assignments** from an independently configured native object height range. The comparison does not reuse the painter to build the reference.
- `tests/e2e/paint-object-group.spec.js`: opens a native two-part project, paints the second part while the first is selected, undoes locally, paints both by height, checks saved native facet regions and restores both with one project Undo.
- Integrated combined-renderer run `/private/tmp/orca-m18-renderer-browser.log`: all **17** focused browser cases pass, including multi-selection, clipping/caps, painting cursors, support preview and manual layer brush. This focused run is separate from later full-suite totals.

This does not certify native GUI pixels or every large/hidden-volume case. Right-button paint assignments, modifier-wheel controls and hover fill highlights remain separate native interaction gaps. The standalone low-level paint helper retains its custom broad range for programmatic callers; the native user-facing group brush enforces the pinned 0.1–8 mm range.
