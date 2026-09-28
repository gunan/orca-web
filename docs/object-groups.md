# Native object and part editing

The inspector's Transform scope selects a whole native object or its selected part. Whole-object moves, rotations, nonuniform scales, centering, bed placement and face placement preserve a common pivot and relative locations of negative/modifier/support volumes. The gizmo uses that same pivot and previews the whole group while dragging. Duplication creates a new independent native group; arrangement packs normal-part footprints and translates associated volumes together.

Part edits preserve other parts' world geometry. Editing a part clears obsolete shared-frame metadata, while its numeric transform values remain editable. Deleting the last normal part of a group containing helper volumes is rejected with a recoverable message. Native project export bakes real geometry; the optional validated `groupTransform` frame is retained only as Orca Web editing metadata.

Normal surfaces use filament colors. Negative volumes, modifiers, support enforcers and blockers have distinct translucent materials and do not write depth. Material-state assertions inspect actual Three.js material properties; the retained screenshot shows the rendered result. This is functional editing/visibility coverage, not exact native pixel parity.

Seven unit/service regressions cover shared pivot math, part isolation, duplicate IDs, protected deletion, arrangement and frame persistence. Three browser regressions cover complete group/part workflows and actual material/gizmo state. The installed OrcaSlicer 2.4.2 test rotates and scales a negative-volume object, duplicates and arranges it, then verifies both holes remain clear across **39,724** deposited motion segments. General collision solving, all native instance semantics and visual equivalence remain incomplete.
