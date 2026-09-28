# Variable layer heights

Status: partial parity. Native profile metadata, source-backed adaptive generation, smoothing and brush actions, browser curve/point editing and 3D layer preview, validation, native export and installed-engine slicing are implemented. Native GUI gestures/appearance and physical print results are not certified. No printer was contacted.

## Data and native behavior

`object.native.layerHeightProfile` is a flat numeric `[z, height, z, height, …]` array shared by every part in one native object. Empty means ordinary global/range layer heights. Negative volumes and modifiers do not affect the object's height or adaptive face analysis. Regrouping adopts the destination profile; detaching an object clones it.

`Metadata/layer_heights_profile.txt` stores `object_id=N|z;height;…`. IDs use the same one-based native model-object order as height-range XML, independent of 3MF component IDs. Export reindexes selected plates and writes six decimal places, matching native `%f` serialization. The reader rejects malformed/duplicate IDs, missing/nonfinite/negative coordinates, descending Z, incomplete pairs and missing target objects. Native's importer requires more than four scalar values although its exporter permits four; the web boundary deliberately rejects such two-point records instead of claiming they survive native import. Generated profiles contain enough points.

Preparation validates the profile against the current normal-part group height, the effective first object layer, and native nozzle/layer limits. Orca's `PrintObject::update_layer_height_profile` otherwise silently drops a stale profile. The browser/server instead explain that it needs resetting or regenerating. Profile height endpoints tolerate the native 0.001 mm endpoint check. Z starts at zero, before raft lift; raft cases use the configured normal layer height as the initial object height and do not fix the first profile segment.

Adaptive generation ports `SlicingAdaptive::prepare/next_layer_height` and `layer_height_profile_adaptive` from the pinned release. It uses actual transformed normal-part triangles, float32 normals/intermediates, sorted face spans, native surface-deviation calculation, nozzle limits, 0.04 mm height-change steps, range-specific heights and native endpoint handling. Lower quality-factor values yield finer layers; larger values prioritize speed. It rejects an object shorter than its first layer, where a meaningful native adaptive profile cannot be generated.

Smoothing ports native `smooth_height_profile`: six Gaussian passes with the native height bias, first-layer preservation and optional keep-minimum behavior. Nozzle bounds follow `SlicingParameters::create_from_config`, including its published extruder-index conventions, support limits, zero-minimum 0.07 mm fallback and zero-maximum 75%-of-nozzle fallback. Application limits additionally cap profiles at 100,000 pairs, metadata at 16 MiB, and smoothing radius at 100.

The browser offers a native-icon toolbar entry, adaptive quality slider, uniform profile creation, adaptive generation, curve/point editing, add/remove points, smoothing, reset and cancellation. It commits through ordinary project history, so undo/redo and previous-result invalidation apply. An active variable profile supplies layer heights; height-range region overrides such as walls/material still apply. Adaptive regeneration incorporates range layer heights. The 3D brush adds the native increase/decrease/reduce/smooth actions and layer color texture described below. Native desktop appearance is not yet pixel-certified.

## Source and independent references

Pinned OrcaSlicer 2.4.2 commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- [bbs_3mf.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp#L2824): profile parser, with writer at 7482.
- [SlicingAdaptive.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/SlicingAdaptive.cpp): transformed facets, float32 deviation/quality algorithm and forward face-span checks.
- [Slicing.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Slicing.cpp#L315): adaptive profile construction; smoothing at 405; nozzle bounds and raft state above; actual interpolated layer scheduling at 807.
- [PrintObject.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintObject.cpp#L3743): material participation in nozzle limits and profile invalidation at 3806.
- [PrintRegion.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintRegion.cpp#L71): participating feature extruders.
- [Model.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Model.cpp#L1518): normal-part mesh and raw slicing bounds at 1586.

`tests/fixtures/variable-layers-native-reference.cpp` contains the unmodified pinned adaptive/smoothing functions with minimal model/type shims and analytic cube/pyramid face normals. It independently generates the checked-in JSON oracle, avoiding tests that merely reproduce the JavaScript algorithm. The derived source is AGPL-3.0; the repository retains the native license in `docs/native-schema/ORCASLICER-LICENSE.txt`.

To regenerate references with a C++17 compiler:

```sh
c++ -std=c++17 -DNDEBUG tests/fixtures/variable-layers-native-reference.cpp -o /tmp/orca-variable-layer-reference
/tmp/orca-variable-layer-reference > tests/fixtures/variable-layers-native-reference.json
```

The ordinary test suite reads the fixture; it does not require a compiler.

## Verification

Focused staged results: 43 unit/service/HTTP regression tests, 3 browser scenarios and 4 actual OrcaSlicer tests passed, zero skips; build passed. These counts are focused checks, not a full integrated repository run.

- 14 new unit tests: eight analytic shape/quality cases compare every adaptive and smoothed point against independent C++ references within 0.0000001 mm, including keep-minimum mode. Remaining tests cover invalid profiles, native limits, range incorporation, first-layer preservation, XML-independent text codec, grouped/multi-plate roundtrip, regrouping, server preparation, and stale geometry/process rejection.
- 3 browser tests: real curve generation/smoothing/editing and native export; invalid point bounds/order plus cancellation; removal, undo and redo.
- 4 native-engine comparisons: cube quality 0.5 produces 67 layers / 6,115 motions; pyramid quality 0 produces 121 / 7,396; pyramid quality 0.25 produces 70 / 4,898; smoothed pyramid quality 0 produces 121 / 7,396. Every native G-code motion matches an independently compiled-source profile, and nonuniform layer steps prove the engine did not silently fall back to the global process.

Negative evidence: the initial JavaScript pyramid comparison differed by accumulated float32 rounding. Native's unqualified `sqrt(float)` returns a float; rounding only at the outer expression was insufficient. Explicit float32 sqrt rounding fixed the mismatch before installed-engine and browser acceptance. The tests retain strict point-by-point comparisons.

Remaining parity work includes a native desktop-reference run for profile texture/selection appearance, large-mesh worker/performance acceptance, and broad raft/support/multiple-nozzle physical acceptance. Source behavior for these settings is preserved, but those broader workflows have not been certified.


## Native brush and 3D layer preview

The variable-layer dialog now renders the real normal-part meshes with the native layer-height palette and a 70-pixel vertical editing bar. Left drag decreases height, right drag increases it, Shift-left moves it toward the default, and Shift-right smooths. A held button repeats every 100 ms. Scrolling the bar changes its width between 1.5 and 10 mm. Each completed stroke can be undone locally; Apply commits the resulting profile to ordinary project undo/redo, while Cancel leaves the project unchanged. Numeric/graph edits clear the local brush history so a later stroke undo cannot discard intervening edits.

`adjustLayerHeightProfile` ports native `adjust_layer_height_profile`, including the cosine brush weighting, 0.1 mm samples, float32 UI strength, six smoothing passes, range locks and layer bounds. Reduce and Smooth intentionally do nothing when the current height already equals the default, as the pinned source does. A raft can leave the first layer unfixed; the native algorithm underflows an unsigned index when its band reaches Z=0. The web helper rejects that boundary with a specific explanation rather than reproducing the unsafe access.

`layerHeightProfileFromRanges` ports the native range initializer: fixed first layer, lexicographic range ordering and overlap trimming, gap filling, range discontinuities, and equal-height point reduction. Empty brush/preview profiles use this result. The explicit **Create uniform profile** command remains a uniform reset. Native can reduce a uniform curve to two pairs, which its 3MF reader does not retain; editable web initialization inserts one collinear pair so export/import remains valid. `{editable:false}` exposes the exact native result for source-reference tests. At most 1,024 ranges are accepted; an object shorter than its fixed first layer has no editable band and is rejected. Shrinkage compensation is a supported explicit helper context value and has an oracle case; the present browser context defaults it to one and does not claim full native material-derived shrinkage context.

`generateObjectLayers` ports the display layer schedule with precise-Z alignment disabled, matching the native GUI caller. `generateLayerHeightTexture` generates the 1,024×1,024 RGBA texture and 512×512 secondary level, using native colors, layer stripes, interpolation and row-edge duplication. The material uses the pinned vertex/fragment lighting, screen-derivative detail selection and yellow cosine cursor band. The native bar curve uses the same maximum-height scaling. This is a visual preview; slicing still runs the installed engine. A valid native schedule can leave a small unfilled region above its last layer, and its fresh texture then has zero pixels there; the web helper preserves that source result rather than inventing a layer.

Application bounds cap display schedules at 200,000 layers and texture dimensions at 2,048 per side. Native's secondary texture allocation can be exceeded by extremely tall/thin-layer inputs; the web code detects this and presents a preview-unavailable message. It does not reproduce a buffer overrun. Fresh texture buffers are deterministic; retained stale GPU texels between native edits are not treated as a parity requirement.

Pinned additional source references:

- [Slicing.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Slicing.cpp#L233): range initialization at 233, brush action at 518, display layer scheduling at 807 and texture generation at 903.
- [GLCanvas3D.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GLCanvas3D.cpp): bar width, cursor mapping, wheel adjustment, action mapping, rendering and texture creation.
- [GLCanvas3D.hpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/GLCanvas3D.hpp#L1303): 100 ms held-button timer.
- [Native vertex shader](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/resources/shaders/140/variable_layer_height.vs) and [fragment shader](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/resources/shaders/140/variable_layer_height.fs): illumination, texture coordinates/detail level and cursor blend.

### Focused verification for this extension

- 13 additional unit tests pass. Eight fixtures compare raw native range profiles, every display-layer Z, and SHA-256 of every RGBA byte in both texture levels against independently compiled original C++ functions. Cases include uniform and different first layers, nonuniform curves, overlapping ranges, an unfixed raft first layer, Z shrinkage, equal min/max limits and a first layer above the regular maximum. Remaining checks cover editable profile semantics, range initialization, cursor fading, malformed/resource-limited input and floating-point provenance.
- JavaScript matches every byte from the original C++ oracle with floating-point contraction disabled. This machine's default C++ compilation fuses some arithmetic and changes certain color channels by one 8-bit unit. The fixture retains the exact default-compiler hash and sparse differing bytes; tests reconstruct that hash and require each difference to be at most one non-alpha channel unit. This is an explicit visual rounding limitation, not pixel-perfect native certification.
- The parent's focused brush suite reports 20 unit checks and four installed-OrcaSlicer action comparisons passing; every motion matches its independent original-C++ profile. Those checks are separate from the 13 texture checks and are not represented as a full integrated suite here.
- All nine browser checks pass: six new checks for the four gestures plus saved-project export and global undo, held repeat/local undo/Cancel, wheel bounds and height-range preservation; three pre-existing variable-layer regressions remain passing. No WebGL console errors occur in the held-stroke check. The rendered screenshot was inspected for the real mesh, native palette, curve and cursor band.
- Production build passes. No desktop screenshot certification or physical printer run is claimed.

The first browser run exposed duplicate error announcements during invalid point editing. The preview now presents a status message while the edit validation keeps its specific alert. No assertion was weakened.

To regenerate the independent profile/schedule/texture references:

```sh
c++ -std=c++17 -O0 tests/fixtures/layer-height-texture-reference.cpp -o /tmp/orca-layer-texture-contracted
/tmp/orca-layer-texture-contracted > /tmp/orca-layer-texture-contracted.json
c++ -std=c++17 -O0 -ffp-contract=off tests/fixtures/layer-height-texture-reference.cpp -o /tmp/orca-layer-texture-reference
/tmp/orca-layer-texture-reference | python3 tests/fixtures/make-layer-height-texture-reference.py /tmp/orca-layer-texture-contracted.json > tests/fixtures/layer-height-texture-reference.json
```

The fixture contains the original three native functions with small type/configuration shims; ordinary tests only read the committed result. Different compiler architectures may contract differently; the documented default-compiler comparison records this development machine rather than assuming cross-platform pixel identity.
