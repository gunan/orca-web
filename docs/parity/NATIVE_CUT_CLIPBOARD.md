# Native model Cut clipboard

Baseline: OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This extends the model clipboard; settings/layer-row Cut, operating-system model exchange, linked-instance edit propagation and exact GUI appearance remain separate work.

Ctrl/Command X and Edit → Cut capture the independent model clipboard, then remove the selected objects/parts in one project history step. Undo restores geometry without clearing that clipboard. Focused text controls, modal editors and other workspaces retain their own keyboard behavior. Copy, Paste and the Cut geometry tool keep their distinct commands.

Native processed-cut handling is preserved: cutting a related whole object asks before deleting and invalidates surviving matching cut correspondence. Cutting a solid or negative cut volume first offers **Invalidate cut info**, **Cancel**, and, for connector volumes, **Delete all connectors**. Invalidation keeps the geometry; the user repeats Cut to remove the volume. Deleting all connectors removes the matching family's connector volumes and any resulting object without a normal solid, while retaining native cut identities. Family equality checks identity, checksum and connector count. Cancel retains the copied clipboard and leaves geometry/history unchanged.

Deleting the last normal solid while retaining helper volumes rejects. When part deletion leaves one volume, its native overrides move into the object configuration. Requests are prepared immutably before committing, and a changed project invalidates a pending correspondence decision.

## Source evidence

- `Selection.cpp:2110`: Copy then erase.
- `Plater.cpp:17331`: enclosing Cut snapshot; ObjectList clipboard gets first opportunity.
- `Plater.cpp:7456`: processed whole-object deletion confirmation and family invalidation.
- `GUI_ObjectList.cpp:2770–2860`: processed part decisions return without deleting the requested part, last-solid guard, final-volume setting promotion.
- `GUI_ObjectList.cpp:3470–3545`: family invalidation and deletion of all connectors.
- `Model.cpp:1937`: connector deletion retains the cut identity.
- `ObjectID.hpp:175`: family equality includes all three identity values.

## Tests and limits

Seven focused Cut units and five shortcut units pass. Two browser checks cover Cut/Undo/Paste, field editing, processed-cut cancellation, invalidation, repeat Cut and independent Undo. One browser/native acceptance uses the actual placement helper after Cut/Undo/Redo/Paste, retains an editable native 20mm cube on export, and slices one object across125layers with installed2.4.2.

Logs: `/private/tmp/orca-m42-cut-unit.log`, `/private/tmp/orca-m42-cut-browser.log`, `/private/tmp/orca-m42-cut-native-browser.log`, `/private/tmp/orca-m42-cut-build.log`. The native placement algorithm is additionally covered by the separately compiled original-method clipboard captures recorded in M18. These checks do not constitute a native GUI Cut capture. Multiple protected objects currently share one confirmation, while the original GUI can prompt separately for each object; exact prompt sequencing, linked-instance part deletion and every native selection mode remain open.

No physical printer was contacted.
