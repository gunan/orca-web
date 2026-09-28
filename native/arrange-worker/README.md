# Pinned native geometry worker

This worker compiles OrcaSlicer2.4.2 revision8500fcdccaa10b5099ac20d252af3a7c560046f1 model footprints, polygon nesting and native clipboard placement. Source and extraction hashes are verified before compilation. The core arrangement uses the original libnest2d/NLopt implementation. Native Print/PartPlate skirt and tower calculation bodies are extracted with only their host class qualifiers adapted. Clipboard reproduces original GLCanvas/Selection arithmetic and downstream grounding.

Build after the native emboss dependency cache is available:

```sh
ORCA_NATIVE_CACHE_DIR=/path/to/cache npm run build:native:arrange
```

The build adds Orca's SHA256-pinned NLopt2.5.0, then writes `native/build/arrange/orca-arrange-worker` and its paired source/dependency/compiler/binary manifest. `CMAKE_BIN` and `CMAKE_GENERATOR` are optional. Override the server path with `ORCA_ARRANGE_WORKER_BIN`. The helper accepts `INPUT.json OUTPUT.json` or `--version`. It reads no native user preferences and does not contact printers or invoke post-processing.

The shared service runs one active request plus four queued requests. Queue wait counts toward the60-second deadline; cancellation/shutdown kills the child and removes temporary geometry. Input64MiB/output2MiB and capped diagnostics apply. Arrangement input allows256 objects,4096 parts,500000 vertices/triangles. Clipboard permits4096 resulting objects,1000 copies,500000 input vertices/triangles,2000000 grid entries and50000000 hull containment visits. Browser project geometry bounds apply separately.

Current arrangement scope covers active-plate objects or a selection with fixed obstacles. Non-printable/overheight objects and unplaceable footprints remain explicit errors while the native outside-plate workspace is implemented. The actual native GUI uses separate global/current-plate preparation and can reuse existing rendered wipe-tower bounds; this adapter currently estimates its tower from native configuration. Full feature/UI parity is not claimed. Native source and CLI differentials distinguish option defaults, rather than treating different settings as equivalent.

Source-derived components are AGPL-3.0; see `LICENSE.txt`. NLopt's combined library is LGPL2.1-or-later, with MIT and other component notices in its pinned upstream source. Build scripts, source hashes, extracted body hashes and all adapter sources are retained. Other dependencies and licenses remain in the shared verified cache.
