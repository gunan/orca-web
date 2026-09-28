# Native filament ordering

Reference: OrcaSlicer 2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

The per-plate editor sets first-layer order and inclusive layer ranges. Later overlapping rows have native precedence. Each custom row contains every configured material exactly once; native slicing ignores unused slots. All native rows have equal width. Automatic reset, cancellation and a single undo transaction are supported. Slot changes invalidate an incomplete order before export/slicing.

`Metadata/filament_sequence.json` is a cached native slicing result, distinct from ordering controls. The importer preserves `sequence`/`filament_sequence`, zero-based `nozzle_sequence` and `optimal_assignment` by native plate ID. Export reindexes the selected/reordered plates. Editing ordering clears the old cache. Arrays, plate references and indices are bounded/validated. The file's cache is retained without claiming it controls fresh native tool ordering.

The ordering controls live in plate metadata: `first_layer_print_sequence`, `other_layers_print_sequence`, and `other_layers_print_sequence_nums`. Native ranges flatten to equal-width rows `[firstLayer,lastLayer,...slots]`. Layer numbers can exceed sixteen in plate metadata. Global configuration retains native CLI bounds: a range ending at 100 in the global vector is rejected by the installed engine's generic 0–16 validator. The editor therefore uses the native plate representation.

Sources: [archive format](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp), [interval encoding](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/ParameterUtils.cpp), and [tool ordering](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCode/ToolOrdering.cpp).

The initial native test scaled around the source mesh center without dropping the model, leaving both parts nine millimetres above the plate. Automatic slicing rejected that fixture; custom ordering crashed in `reorder_filaments_for_minimum_flush_volume` at an empty first-layer sequence. After correctly placing geometry on the bed, all ten layers match requested ordering, including overlap priority; reversing the first-layer order reverses its first deposited tool. Server preflight now rejects custom ordering when every normal part starts above the first layer. This conservative guard also covers floating configurations whose support generation has not yet been proven with custom ordering.

A separate installed-default regression found that bundled Prusa MK4 `nozzle_type` is scalar while native project JSON requires a vector. Trusted preset flattening now shares the server's existing legacy canonicalizer. The strict embedded validation path is unchanged. The real installed default printer/process/filament now flattens, validates and slices through embedded mode.

Tests: `tests/unit/filament-sequence.test.js`, `tests/e2e/filament-sequence.spec.js`, `tests/native/filament-sequence.test.js`. Native GUI re-export of cached sequences, device material mapping, very large multi-nozzle configurations and full visual parity remain unverified.
