# Native object hierarchy — OrcaSlicer 2.4.2

The web Prepare sidebar now builds a hierarchy from native ModelObject families instead of displaying one flat row per physical mesh. A shared object owns its part rows, height ranges and instance rows. Parts select a part of the currently selected instance; an instance selects all of its parts. Selecting an object selects its instances on the active plate. Selecting an instance on another saved plate activates that plate.

## Source contract

Baseline: OrcaSlicer **2.4.2**, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

- `GUI_ObjectSettings.hpp` enables `NEW_OBJECT_SETTING=1`. The current native tree uses settings action icons, not legacy settings child rows.
- `GUI_ObjectList.cpp:4078–4202` builds object/volume/instance rows. Cut connector volumes are hidden from ordinary parts. A cut object displays parts only with multiple nonconnector model parts or any non-model volume. A dedicated **Cut connectors** row selects the processed connector parts.
- `ObjectDataViewModel.cpp:644–869` orders shared volume rows before Layers and Instances. Object printability is true if any instance is printable. Toggling an object applies to every instance; toggling an instance applies only to that instance.
- `GUI_ObjectList.cpp:3820–3889` and `GUI_Factories.cpp:43,261` determine nonempty settings categories. Negative/support helper parts have no settings action. An equal-to-parent layer height does not mark a layer as overridden. `GUI_ObjectList.cpp:4653` omits a range row without an explicit native extruder key.
- The lock action **resets overrides**, as implemented by `GUI_ObjectList.cpp:1587` and `Tab.cpp:3119`. Reset erases the intersection of native print-preset keys and scope keys. Filament assignment and object-only compensation keys stored on parts survive. A layer reset restores its parent's layer height (`Tab.cpp:3519`). The web adds an explicit settings menu action to open the existing object/part or range editor at the clicked scope.
- `GUI_Factories.cpp:515` defines Hide/Show from current visibility. The tree context action changes viewport visibility independently of printability, with one reversible edit.
- Native instance constructors label rows `Instance N`. Only `SetIdx` renumbering produces `[P%d]Instance N`, and it uses the raw zero-based plate index. The pure label helper preserves that distinction; this web tree currently rebuilds constructor labels rather than emulating incremental wx node lifetimes.

Native part/text/SVG, paint, range, printability and reset SVG icons are copied from the installed 2.4.2 resources; hashes are recorded in `public/native-icons/manifest.json`. Existing native asset licensing applies.

## Verification

- `tests/unit/native-object-tree.test.js`: 12 passing tests for ordering, visibility, settings categories, role icons, selection scopes, cross-plate activation, printability, immutable edits, reset behavior, stale-node rejection and native 3MF roundtrip.
- The independent C++ reference compiles unchanged native `can_add_volumes_to_object`, `is_improper_category` and `ObjectDataViewModelNode::SetIdx` bodies with small data adapters. It produces **726 reference cases**, including every connector/model-part combination for zero through four volumes. The JS tests compare all cases. This checks these source methods, not a complete wx object-list implementation.
- `npm test`: **843/843** unit/integration tests passed, zero skips, after rebasing the isolated M47 stage onto the latest integrated M21 code.
- The final rebased focused browser run passed **12/12**: five new hierarchy/Hide–Show checks, four linked Cut checks, and three preset-workflow checks. Selection, clicked-scope editors, reset, printability, visibility, Undo/Redo and native archive export are exercised. The earlier custom-printer failure passes in this run; its historical failure remains recorded below.
- The first broad mocked-engine run passed **229/258**; 29 old flat-list/layout assertions failed. Semantic hierarchy assertions fixed those failures while retaining mesh, selection, Undo and archive assertions. The second broad run passed **257/258**: a custom-printer selection test timed out before any tree interaction, showing the unresolved preset caption. Its original failure is retained in `browser-tree-full-final.log`; it has not been reclassified as a pass. The isolated stage was then rebased onto M21, which contains a newer preset import lifecycle guard.
- `tests/native/native-object-tree.test.js` passed **1/1 on the first attempt** with installed OrcaSlicer 2.4.2, isolated data directory and plain slicing. Exported native-read archive entries were byte-identical to an independent build-item printability edit. All **1,146 deposition segments** stayed inside the printable instance footprint; only one printed object appeared. No native GUI or CLI archive export was invoked.
- `tests/native-e2e/native-object-tree.spec.js` passed **1/1 on the first attempt** through the production browser/API and installed OrcaSlicer 2.4.2. It exports and reimports one linked family with independent printability, submits native project slicing, and confirms deposition only in the printable footprint. No fixture engine fallback is allowed.
- The inspected screenshots `native-object-tree.png` and `native-object-tree-printability.png` show the actual browser fixture and installed-engine workflow. They are not native GUI pixel comparisons.
- The final isolated build passed. Full combined-suite execution after integration belongs to the parent milestone; the earlier 257/258 result is not presented as a clean broad pass. `NATIVE_OBJECT_TREE_EVIDENCE.json` retains commands, results and the earlier failure.

Reproduce the source reference without starting OrcaSlicer:

```sh
python3 scripts/reference/build-object-tree-reference.py --source /path/to/pinned/OrcaSlicer --output /tmp/orca-object-tree-reference
```

The script validates source hashes before compiling and exports both the reference JSON and the exact native print-option reset key list. Build outputs stay outside the repository's shared native cache.

## Remaining gaps

- Plate placement follows **saved assignments**. Native `PartPlate` membership/outside sets and full geometric exclusion classification have not been ported; the UI states this. The hierarchy contains Outside for unknown assignments but does not relabel arbitrary moved meshes as native Outside.
- Cross-plate instance selection switches the active plate. Simultaneous selection/transform of instances on multiple plates remains unsupported by the viewport and persisted selection model.
- Full native object-list context menus, drag/reorder/reparent interactions, editable filament-column behavior, incremental wx renumbering, sinking/warning/repair columns, assembly view hierarchy and SLA-specific rules are not complete. Existing editors expose supported settings and filament edits; the tree's filament badges display their assignments.
- Native Global/Objects settings-panel presentation and exact empty-list/pixel layout are not certified. The existing empty Prepare settings layout is retained until an object is present.
- No physical printer, hardware workflow, or new native GUI interaction was exercised.

`objects.tree`, `objects.instances`, `objects.multi-selection`, `plates.manage` and the relevant settings features remain **partial**. There is no full parity certification or defensible parity percentage.
