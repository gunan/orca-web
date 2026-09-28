# Native preset JSON dependencies

This adds native dependency metadata import/export and the pinned OrcaSlicer 2.4.2 Filament Dependencies controls. It builds on the original compatibility predicate helper. It does not claim complete preset inheritance/editor parity.

## Preserved behavior

Native JSON import preserves `compatible_printers`, `compatible_printers_condition`, `compatible_prints`, and `compatible_prints_condition`. Omitted fields inherit from the named preset. Explicit empty lists/strings replace inherited values. Literal unknown names and duplicate list entries remain intact; they are not converted to every local printer ID. A nonempty list takes precedence over its retained condition, as the original native predicate specifies. Malformed native expression syntax retains native diagnostic/compatibility behavior rather than being interpreted with a JavaScript expression evaluator.

The filament editor provides All, Set, and Condition for both printer and process dependencies. All clears the list without clearing the condition. Set includes all eligible native preset names, not only the current compatible subset. Applying all or zero selections stores an empty list. Opening/Cancel never alters unavailable names. Applying a list explicitly replaces them. The condition is disabled while a list is nonempty. Process dependency JSON is preserved and shown read-only: its analogous editor code is commented out in the pinned native GUI.

A preset made incompatible by its dependencies remains editable. Editor source resolution invokes the original compatibility checks in inspection mode and displays the result; normal configuration and slicing always enforce compatibility. A public request cannot select inspection mode. An old helper lacking the explicit inspection response fails with status 503 and a rebuild instruction.

On the first save of a system-derived filament with an empty printer list, the selected base printer is inserted, exactly as native Tab.cpp does. A later custom save can retain All. Process saves do not receive that rewrite. A system printer is itself the base, regardless of its JSON template inheritance. Copying an already-derived custom preset retains its existing native compatibility parent; copying a system or root custom preset uses that source name as parent.

Original `full_config` emits native expression groups when conditions are nonempty. `compatible_machine_expression_group` (process then material conditions) and `compatible_process_expression_group` (material conditions) survive configuration normalization and 3MF roundtrip. These bounded metadata vectors are not discarded merely to make slicing admission succeed.

## Bounds and preservation

Each condition is at most 16 KiB UTF-8 without NUL. Lists have at most 10,000 native names, each at most 1,000 UTF-8 bytes without NUL. Expression groups contain at most 66 strings, each with the same condition bound. Unknown metadata fields, cross-scope dependency keys, multiple inheritance names, and ambiguous combinations of JSON dependencies with legacy printer IDs are rejected. Existing credential, external asset, and host post-process restrictions remain in place.

Legacy custom records without native dependency metadata retain their existing printer-ID behavior. Their first native-mode edit stores explicit native fields. JSON imports with one native parent resolve trusted catalog names; no imported name is used as a filesystem path.

## Source references

Pinned revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- `src/slic3r/GUI/Tab.cpp:4216–4232`: live filament dependencies; process counterpart at 2791 is commented out.
- `Tab.cpp:6990–7112, 7502–7514`: All/Set, same-technology printer list, and condition enablement.
- `Tab.cpp:6706–6714, 6742`: first system filament save restriction and `update_compatible(Never)`.
- `src/libslic3r/Preset.cpp:2925–2932, 3132–3140`: new preset ancestry and selected base printer.
- `src/libslic3r/PresetBundle.cpp:3918–4157, 4304–4318`: expression groups and native load resizing.

## Validation and remaining gaps

The acceptance cases cover persistence, inherited versus explicit-empty values, dormant conditions, list precedence, unknown names, first-save behavior, derived compatibility ancestry, incompatible-editor access, enforced ordinary admission, stale-helper refusal, bounded malformed values, and expression-group 3MF roundtrip. Browser cases use the real web API and pinned config helper with a fake slicer. Original native predicates are independently compared by the earlier compatibility reference suite.

No installed Orca CLI, export, or native GUI acceptance was run for this tranche. The desktop is blocked by its crash-restoration modal. This evidence verifies configuration/native predicate behavior, not newly sliced toolpaths.

Custom preset setting storage still uses full snapshots plus web overrides. Native `Preset::save` diff/nullable inheritance serialization, root-parent edit propagation, detach, native user-preset reload semantics, and parent-relative reset beyond existing snapshot behavior remain pending. JSON exports remain flattened native settings, with preserved dependency fields; they are not claimed to be native parent diffs. Account/cloud preset management and native automatic incompatible-selection replacement remain separate gaps.
