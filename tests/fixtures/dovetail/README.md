# Native dovetail plane reference

Pinned baseline: OrcaSlicer **2.4.2**, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

`generate-source.cpp` independently evaluates the ordered cutting planes and groove width in [CutUtils.cpp:557–783](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/CutUtils.cpp#L557), with `Rz × Ry × Rx` rotation from [Geometry.cpp:348](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Geometry.cpp#L348). It copies the groove-width body (qualified `std::max`, explicit nonzero-angle approximation check) and transcribes the native ordered upper/lower half-space decisions. It does **not** use the web plan generator, native GUI or native mesh cutter. The source-derived excerpt/algorithm is AGPL-3.0; see the repository's retained OrcaSlicer license.

The fixture has six parameter sets: single, repeated, tapered, obtuse flap, zero clearance and negative clearance. All use a 40×20×20 mm source bounding-box radius, centered at local origin, with a Z-normal cutting plane. The emitted JSON includes all float-rounded input values and plane coefficients, side assignments and branch order. Native geometry uses float parameters/trigonometric overloads followed by double transforms. JavaScript reproduces those float intermediates; a **1e−6 tolerance** on source-plane coefficients covers platform `tanf` versus rounded double `tan` differences. An observed 110° fixture differs by one `tanf` ULP, resulting in about 2.3e−7 mm of plane-offset difference. This is documented rather than claiming bit-identical math libraries.

Regenerate:

```sh
c++ -std=c++17 tests/fixtures/dovetail/generate-source.cpp -o /tmp/orca-dovetail-source
/tmp/orca-dovetail-source > tests/fixtures/dovetail/source-planes.json
```

Native differential tests apply these independent coefficients to the separately tested shared planar clipper, transform them to the actual object's center, serialize complete native projects and slice them using installed 2.4.2. This is an independent parameter/plane oracle and engine acceptance test; it does not independently reimplement native triangulation or certify GUI byte identity.

Source SHA-256:

- `CutUtils.cpp`: `ec488174a01a53bf1fba7fedefdf19611194450eb9eab5bef20370ffc9241dfa`
- `GLGizmoCut.cpp`: `0795192f30faef0485996ed23c42533e443852c08a5246df516820e34c3ee3f4`
- `Geometry.cpp`: `a78642c0220b69176d2511a12fd112011a9f62d47d946cbb8f92a1a0e9f77f19`
