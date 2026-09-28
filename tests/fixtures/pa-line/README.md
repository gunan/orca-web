# PA line source fixtures

These ordered numeric event fixtures are produced by compiling the unmodified
`CalibPressureAdvance` helper methods and `CalibPressureAdvanceLine::print_pa_lines`
from OrcaSlicer **2.4.2**, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`.
[Original calib.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/calib.cpp)
SHA-256: `e559d7772892f8ca4becc16bf5104e17ee671777229a681349bc9a12e0725163`.

`generate-source.cpp` embeds those method bodies, plus a minimal configuration,
vector, Flow and writer event recorder. The recorder models explicit retraction,
relative/absolute E and modal feedrate. `Flow::mm3_per_mm` stores its area in float32
but **returns double**, then multiplies a float32 flow ratio in double precision,
as in the pinned [Flow.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Flow.cpp#L219).
The excerpted implementation is covered by upstream AGPL-3.0 licensing.

These are independent C++ **source-algorithm fixtures**, not native GUI export
or physical printer evidence. No compiler or native application is needed for
the JavaScript unit tests. The separate native tests invoke installed OrcaSlicer
for trusted asset conversion and start/end macro expansion before comparing
all generated commands to these fixtures.

Regenerate from the repository root with a C++17 compiler:

```sh
c++ -std=c++17 tests/fixtures/pa-line/generate-source.cpp -o /tmp/orca-pa-source-fixture
/tmp/orca-pa-source-fixture 3 1 1 > tests/fixtures/pa-line/source-three-labelled.json
/tmp/orca-pa-source-fixture 51 1 1 > tests/fixtures/pa-line/source-full-labelled.json
/tmp/orca-pa-source-fixture 8 0 0 > tests/fixtures/pa-line/source-eight-absolute.json
```

Arguments are line count, print numbers, and relative E. Fixed source inputs
are a 250×210 mm bed, 0.4 mm nozzle, 0.2 mm initial height, 0.98 filament flow,
1.0 object flow, 0.8 mm retraction at 30 mm/s, 300 mm/s travel, 107/10 mm/s
fast/slow lines, and PA 0 with a 0.002 increment. The fixtures contain 324,
2,660 and 90 ordered writer calls respectively. JSON tuples preserve full
double precision; serialized native-style XYZ/feed use three decimals and E
five decimals. No browser mock responses are counted as native evidence.
