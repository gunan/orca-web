# Native process and height-range clipboard

Baseline: OrcaSlicer 2.4.2, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This tranche implements settings payload and range-copy behavior; it does not complete the native object-tree UI or all selection modes.

The Edit menu exposes Copy/Paste Process Settings for one source object or part and up to 256 matching-scope destinations. Copy captures object overrides, plus part overrides for a part. Native typed ConfigOption equality, replacement and serialization run in the configuration helper. Paste retains each destination's extruder, replaces existing overrides, filters ordinary part copies to region settings, and applies native parent compensation. In the pinned source, compensation can insert object options into a part and its comparison set is computed only for the first selected destination; both behaviors are preserved and independently tested. Ordinary part controls still allow only region options.

The height-range editor can copy the selected range, copy all ranges, and paste the accumulated range cache. Copy Selected accumulates entries; Copy All replaces the cache. Paste preserves destination settings at identical bounds, while distinct overlapping ranges coexist, matching native `std::map::emplace`. The model and list clipboards retain separate payloads. Generic Paste follows the active list type, and model Copy/Cut clears list caches. Text inputs retain normal text editing. Successful project changes produce one Undo entry, and cancellation or failed native results leave the project intact.

`POST /api/presets/clipboard` uses the app-owned native configuration queue, cancellation and deadline. Native input is bounded to 256 targets, 512 keys per config and 65,536 characters per serialized value; API JSON is bounded to 2 MiB. Only known object/process settings pass the API boundary. No account, printer or arbitrary filesystem operations are accepted.

## Independent reference

`native/config-worker/scripts/build-settings-clipboard-reference.py` verifies the pinned `GUI_ObjectList.cpp` hash and extracts the unchanged `ObjectList::paste_settings_into_list` method. A minimal selection/configuration shim invokes that original method against original native Config classes. The fixture covers 12 cases: replacement, empty cache, absent/copied/preserved extruders, inherited equality, lexical numeric equality, object-to-region filtering, parent compensation, multiple differing parents, percentages, ranges and multiple object destinations.

After building the native configuration helper, reproduce with:

```sh
python3 native/config-worker/scripts/build-settings-clipboard-reference.py --source "$ORCA_NATIVE_CACHE_DIR/upstream/repository" --build native/build/config --output /tmp/orca-settings-reference
python3 scripts/generate-settings-clipboard-reference.py --reference-dir /tmp/orca-settings-reference
```

The source checkout must match the recorded manifest. The harness needs the same compiler/dependency environment as the helper build and `ninja` on PATH. The second command regenerates the checked-in JSON from the independent binary, not the web implementation.

## Validation and remaining work

- Six new unit tests plus two API tests pass. The API tests use the real configuration helper and a fake slicer; they are not slicing evidence.
- Three native tests pass: all 12 original-method cases, boundary/validation behavior, and installed slicing plus native re-export with copied process/range settings and actual 0.1 mm interior layers.
- Eight browser regressions pass, including three new clipboard scenarios and existing height-range/model-Cut cases. A separate real browser/native test exports and slices two objects after settings and height-range Paste.
- Build passes. Initial browser fixture failures were corrected by explicitly marking the fixture as an embedded native workflow; an initial CLI test skipped production compatibility preparation and was corrected to use the same native project preparation service as the app. Assertions were retained.

Open: native tree selection/action-icon behavior and exact menu placement; range-settings clipboard selection; global Paste's cross-scope selection variants; exact native GUI screenshots. The current context command deliberately exposes only matching object/part scopes. These gaps keep the broader clipboard/menu/settings inventory partial. Linked-instance edits use the central reconciliation layer after integration; dedicated combined acceptance belongs to the integration milestone.

Pinned `GUI_ObjectSettings.hpp` sets `NEW_OBJECT_SETTING` to 1: current native settings affordances are action icons on the selected node, not the older compiled-out settings child rows. The remaining tree work is scoped to that active interface.
