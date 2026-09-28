# Pressure advance pattern batches across plates

Baseline: installed OrcaSlicer 2.4.2; pinned source revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`. This closes the automatic extra-plate workflow within the supported rectangular-bed pattern generator. It does not certify full calibration or native arranger parity.

## Source behavior and scope

- [Plater::_calib_pa_pattern, lines 12755–12846](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Plater.cpp#L12755) arranges enlarged complete pattern footprints, retains Cartesian ordering with speeds varying fastest and accelerations in the outer loop, adds missing `bed_idx` plates and places 5 mm handle cubes relative to each native plate origin.
- [Plater::_calib_pa_pattern_gen_gcode, lines 12849–12888](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Plater.cpp#L12849) generates and merges four custom layers for objects on the current plate only.
- The existing [independent C++ fixtures](../../tests/fixtures/pa-pattern/README.md) cover source chevrons, labels, frames, extrusion and modal commands. Their geometry algorithm is unchanged.
- Source inspection of [calib_dlg.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/calib_dlg.cpp) found VFA `on_start` at 722, frequency at 1010, damping at 1209 and cornering at 1405; these handlers validate parameters and start tests, without a measured-result save/apply action. No inferred result control was added. This is a scoped code inspection, not exhaustive GUI behavior testing.

## Implemented behavior

The bounded grid now opens more plates when the batch cannot fit one. Each individual full pattern must still fit its bed. Up to four speeds × four accelerations remain supported, so at most sixteen combinations/plates are created. Last plates are centered independently. Actual extrusions, labels and handle footprints must stay within the bed margin and cannot overlap on the same plate.

The server caches both the complete native project and normalized selected-plate archives. Each archive includes its complete native settings, original handle geometry, per-object settings and all four custom command layers. Native per-plate origins are normalized when generating selected archives; selecting a second plate must not shift its print coordinates.

`POST /api/jobs/calibration` sends `{calibration, ids, objects, plateId}` with **all** original objects. The validator compares token, parameters, selected preset IDs and content, exact baked geometry, object/native settings and plate assignments before returning the selected cached bytes and its source plan. A missing selection for a multi-plate slice, unknown plate, inactive-plate edits or stale session fails clearly.

`POST /api/calibrations/project` additionally accepts boolean `allPlates`. Omission retains the previous complete-project default. `true` preserves every plate; `false` returns the selected complete plate. No handle-only fallback exists. Tokens remain ephemeral (24 hours or until server restart); downloaded native archives preserve scripts, while ordinary JSON scenes retain only the token/request and displayed geometry.

Imported complete archives use binding version 2, excluding the active selection from the fingerprint while retaining all geometry/settings/plate-script content. Switching an existing plate is benign. Editing inactive geometry, plate assignments/order/scripts, native settings or catalog selection fails with restore-or-regenerate guidance. Legacy binding version 1 remains readable using its original fingerprint. This is accidental-edit detection, not authentication of arbitrary client metadata; ordinary Custom G-code remains user data.

## Evidence

- `tests/unit/pa-pattern-multiplate.test.js`: three checks of cross-product placement, independent complete/selected archive geometry bounds, and imported selection versus stale edits.
- `tests/unit/generated-pattern-binding.test.js` also loads `tests/fixtures/pa-pattern/legacy-binding-v1.json`, recorded by the pre-M21 version-1 binder over the existing complete archive fixture after replacing random import IDs with deterministic IDs. It proves old scene snapshots remain readable without inventing a new expected fingerprint.
- `tests/integration/pa-pattern-multiplate-sessions.test.js`: three loopback API checks of complete-scene binding, full versus selected exports, strict unknown/expired token handling and preset/parameter changes.
- `tests/native/pa-pattern-multiplate.test.js`: installed **2.4.2**, eight patterns on **two plates (6 + 2)**. Full download/re-import followed by selected native slicing yields **four layers on each plate and 18,200 verified generated moves**. All generated XY/Z/E/feed/PA/acceleration/reset commands match the source plan; the 80 mm/s and 1,000 mm/s² pattern also matches every independent compiled C++ fixture command after translation. Selected archive downloads equal the trusted cached bytes.
- `tests/e2e/pa-pattern-multiplate.spec.js`: browser checks use real generated archive fixtures with mocked calibration transport. They verify all-object submission with selected ID, complete selected/all exports, imported selection and edit protection. This is browser evidence, not native-engine evidence.

Existing single-plate source fixtures, complete export/expiry handling, flow calibration sessions and dialog regressions remain part of the verification set. No test is skipped or replaced by a placeholder pass.

## Limits

Grid placement is not native polygon nesting. Rectangular single-extruder non-Bambu scope, explicit extrusion retraction, zero extra restart length, supported templates and bounded labels remain unchanged. Exact native GUI project/export equality, nonrectangular beds, more hardware/firmware profiles, physical measurements and automatic hardware calibration remain unverified. No printer was contacted.
