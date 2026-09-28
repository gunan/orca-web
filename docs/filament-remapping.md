# Native painted-filament remapping

OrcaSlicer 2.4.2 exposes a manual source-slot to destination-slot mapping in the color painting editor. Its source functions are [`render_filament_remap_ui`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoMmuSegmentation.cpp#L991) and [`remap_filament_assignments`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoMmuSegmentation.cpp#L1082).

The web color-paint dialog now exposes the used slots of the selected native object, up to the native facet limit of 16. Applying the mapping changes normal-part leaf states and base filament slots simultaneously. Explicit part extruder text and the shared object fallback remain consistent. The unpainted state zero continues to use the part's base filament. Support, seam and fuzzy channels retain their data; geometry is unchanged. Other object groups are untouched. Mapping Reset discards pending choices; Undo paint restores the applied mapping and other painting edits from metadata snapshots without copying mesh vertex arrays. Cancel discards the entire dialog draft.

The browser's explicit `filamentSlot` is authoritative on export, so it is remapped along with applicable native XML config text. Helper volume base slots are not directly remapped, matching the native loop over normal model parts; the shared object fallback metadata remains consistent across their group.

Evidence: two unit tests pass, including cyclic swaps, identity mapping, malformed IDs, mixed groups, exact geometry and other-channel preservation. One real native test through sanitized project preparation compares two remapped normal parts with independently assigned base and painted slots: all 1,305 outer-wall segments and both filament consumptions match exactly. The browser regression passes for used slots, Reset, actual preview material colors, Undo, production native export and metadata retention.

This control is manual mapping; no generic automatic color-paint command is claimed. Native popup pixel layout, shortcut equivalence and native GUI re-export acceptance remain unverified.
