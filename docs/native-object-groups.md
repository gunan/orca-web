# Native object groups

Object scope applies movement, rotation, scale, centering, bed placement, duplication, removal, face placement and arrangement to a complete native object, including its negative, modifier and support volumes. Part scope changes the selected volume. Removing the last normal part while helper volumes remain is rejected.

A common world-space pivot and editing frame are stored in `native.groupTransform`. Geometry keeps each part's role, settings and filament slot. Native 3MF export bakes the geometry; the editing frame is Orca Web metadata, not a native engine setting. Editing one part retains that part's numeric transform and invalidates the common frame. A later object transform establishes a new frame from the current surfaces. Cut and mirror likewise invalidate an obsolete frame.

Negative, modifier and support volumes use translucent role colors drawn over the normal filament-colored body. The viewport's `data-part-materials` attribute records the actual instantiated material state, which the browser regression checks. A shared transform gizmo moves the complete object interactively.

## Verification

- Seven unit/service tests cover common-pivot transforms, independent numeric part edits, group/part duplication, protected deletion, arrangement, bed/face placement, frame validation and invalidation, and native-role materials.
- One installed OrcaSlicer 2.4.2 test rotates, nonuniformly scales, duplicates and arranges groups. The sanitized project retains both negative holes across 39,724 deposited segments.
- Three browser tests pass: group transform/arrange/duplicate and undo; independent numeric part transforms and recoverable protected deletion; actual translucent materials and the group transform gizmo.
- The rendered browser screenshot was visually inspected. These tests cover the explicit operations above; they do not establish complete native assembly or renderer parity.
