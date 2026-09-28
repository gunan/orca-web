# PA pattern source and project fixtures

OrcaSlicer **2.4.2**, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`, is the pinned baseline. `generate-source.cpp` embeds the unmodified `CalibPressureAdvance` drawing methods and `CalibPressureAdvancePattern` generation/dimension methods from [calib.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/calib.cpp), SHA-256 `e559d7772892f8ca4becc16bf5104e17ee671777229a681349bc9a12e0725163`. The original methods are AGPL-3.0. Configuration/vector/Flow stubs and an explicit extrusion writer recorder surround them; this fixture is independent source-algorithm evidence, **not an exported native GUI calibration or physical print**.

The recorder retains relative/absolute E, retraction, modal feeds, acceleration and reset behavior. Flow stores its area in float32 but returns double; native extrusion then multiplies the float32 filament-flow value in double precision. JavaScript events must match every source event within 1e-9 before serialization. The real-native tests separately prove that installed OrcaSlicer retains the generated four-layer commands while slicing the native handle geometry and processing macros.

Regenerate from the repository root:

```sh
c++ -std=c++17 tests/fixtures/pa-pattern/generate-source.cpp -o /tmp/orca-pa-pattern-source
/tmp/orca-pa-pattern-source 3 1 120 4000 > tests/fixtures/pa-pattern/source-three-relative.json
/tmp/orca-pa-pattern-source 17 0 80 1000 > tests/fixtures/pa-pattern/source-full-absolute.json
```

Arguments are PA value count, relative E flag, speed (mm/s) and acceleration (mm/s²). Common inputs: 0.4 mm nozzle, 0.2 mm initial/regular layers, 0.98 filament flow, 1.75 mm filament, 0.8 mm retraction at 30 mm/s, 300 mm/s travel, 0.4 mm Z hop, start XY 50/50, start PA 0 and increment 0.005. The files contain **824 / 2,932 ordered calls**, spanning all four layers, frame, native labels and chevrons. The JSON stores full double precision. Emitted native-style XY/Z/feed use three decimals and E five decimals.

`calibration-project.3mf` is a real generated complete web calibration project using the bundled Prusa MK4 selection, three PA values (0/.005/.01), speed 120 and acceleration 4000. It contains one 5 mm handle cube, complete native settings and four Custom layer-event scripts. The browser export test uses these valid bytes behind an intercepted endpoint to exercise download/re-import behavior; that transport mock is not counted as native engine evidence. `tests/native/pa-pattern-calibration.test.js` independently regenerates, exports, re-imports and slices its own projects using the real installed engine.
