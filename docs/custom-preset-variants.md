# Saving native preset variants

Custom preset edits now retain complete native variant vectors. Previously, saving H2D PLA’s Standard volumetric limit as `[27]` replaced its `[25,40]` vector, and native normalization subsequently expanded that saved value to `[27,27]`. The High Flow limit was lost.

The editor loads active values in an explicit physical nozzle, nozzle-volume and material-slot context. Variant vectors have fixed dimensions and labels; machine motion-limit pairs identify Normal and Silent modes. Switching context is disabled until edits are saved or reset. “Use source value” restores the selected active values from the preset’s immutable source snapshot. The saved JSON still contains every inactive alternative. Native JSON import/export continues to represent the complete preset.

Saving uses the native configuration worker to load full source scopes, apply native indexed overrides, and replay the existing signed correction choices against the same active context. A complete per-key difference is stored against the complete source. Editing Standard27, then High Flow43 produces `[27,43]`; resetting Standard restores `[25,43]`. Duplicating, reloading, renaming and selecting the same preset in two material slots preserve the independent alternatives. No printer, process or material credentials are added to this operation.

## Editor projection versus slicing projection

The worker’s `profile-editor-projection` operation calls the pinned native `DynamicPrintConfig::get_index_for_extruder` and `ConfigOptionVector::set_at` on an intact preset scope. This follows `Tab::switch_excluder` (`Tab.cpp:7433–7494`) rather than reconstructing editor values from an already flattened slicing configuration. It returns source indices as well as values. The native nullable material inheritance display uses the intact printer’s value at the material variant index (`Tab.cpp:3810–3848`), including cases where that index differs from the selected physical nozzle.

This distinction is observable in OrcaSlicer 2.4.2: `PresetBundle::full_fff_config(true)` first projects `printer_options_with_variant_1`, including the ID/variant metadata, then projects stride-two motion limits. The second pass sees the shortened metadata. A synthetic H2D Standard/High Flow preset with stored speed pairs at offsets 0/1 and 6/7 yields different second-nozzle motion limits from the editor projection. The test records both results, the editor reports this difference when present, and the ordinary native slicing algorithm remains unchanged. This package does not claim to correct an upstream slicing behavior.

## API

`POST /api/presets/custom/source/:type/:id/context` accepts `{selection, projectSettings, filamentIndex}`. It returns active `preset`, displayed `settings`, `baseSettings`, active `overrides`, fixed `variantFields`, `relatedSettings`, native dependency `context` and an `editorContext` with physical nozzle choices. `filamentIndex` is zero-based and must identify an existing slot. Only trusted catalog IDs supply source chains; request bodies cannot supply filesystem paths or preset chains.

Prepare/save requests can specify `nativeEditor: true`, the same selection/project context and material index. Existing multi-variant saves automatically use preserving normalization. A submitted variant vector must contain exactly its active dimensions; complete variant arrays belong in native JSON import. Raw GET/source/export access remains compatible. Reads are abortable, share the bounded native configuration queue and participate in application shutdown. Missing helper support produces an error instead of a lossy fallback.

The [configuration helper](../native/config-worker) requires rebuilding after this change. The new header and source manifest are included in the existing paired build manifest. Source revision: `8500fcdccaa10b5099ac20d252af3a7c560046f1`; Tab.cpp SHA-256: `2b7c129434f54a85ed657599aa2de3323cdf085b43bc97074d81aa84a92da577`.

## Evidence and limits

Focused checks pass: 43 unit/API cases, 6 native cases, 21 existing browser editor cases and 3 real-native browser cases. Native cases use installed OrcaSlicer 2.4.2 with isolated temporary storage/datadir. Actual slicing and post-slice 3MF re-export preserve complete material limits `[27,43,27,43]`, while G-code uses selected limits `[27,43]`. Correction replay, invalid edit dimensions, inactive reset/clone/reload, same-preset slot identity, default singleton nozzle context and material inheritance are checked. All three editor scopes open for the default printer, H2D and legacy J1. Process variant vectors are internal identity metadata, so process views retain the existing native normalization rather than demanding a missing legacy nozzle identity. Browser coverage verifies labels, fixed dimensions, saved-source reset, second-slot edits and precedence over stale embedded metadata. The tests’ explicit plate mapping matters: an old automatic mapping in a fixture can select another nozzle despite a global manual map.

The evidence is generated from bundled presets and an independently captured GUI cube geometry. It is not a fresh GUI save/reload of these custom H2D presets. Native account/user preset synchronization, physical extruder-count reconstruction, every variant-related native tab layout and fresh multi-nozzle GUI acceptance remain separate parity work.
