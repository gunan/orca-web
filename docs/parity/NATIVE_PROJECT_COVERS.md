# Native project cover generation

Baseline: OrcaSlicer 2.4.2, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`; its wxWidgets dependency is SoftFever/Orca-deps-wxWidgets 3.3.2, revision `88f3483ca546fbf4ad732e1acd94cc930935077a`.

Project → Model Pictures → Set as cover now generates the native 240×240, 252×188 and 680×680 PNGs with the unchanged `generate_image` function from `src/slic3r/GUI/GUI_Utils.cpp`. The source image remains an attachment; `DesignerCover` names it and the root package relationships identify the three derived images. Generation is one undoable edit. Cancel, document replacement/edits during generation, invalid output and missing helper cannot publish a partial set.

The helper uses native wx image decoding and interpolation, including its Float32 intermediate sizing. Browser canvas does not reproduce this exactly. For a 3×1 RGB test image, native arithmetic produces a 719×239 intermediate for the 240×240 cover, a red/green averaged first column and an opaque black last row. This native behavior is retained and covered explicitly.

## Build and operation

Run `npm run build:native:images` with CMake 3.20+, Ninja and a C++ compiler available. Set `CMAKE_BIN` and `CMAKE_GENERATOR` when needed. macOS uses its SDK; Linux additionally needs wxWidgets' GTK development prerequisites. The script downloads the pinned wx repository/submodules, verifies the pinned Orca source SHA256 and exact copied function, builds static dependencies and writes `native/build/image/orca-image-worker`. This checkout has a locally built helper; the binary/build cache are ignored. `ORCA_NATIVE_CACHE_DIR` relocates the shared cache root; `ORCA_IMAGE_CACHE_DIR` overrides this helper's cache specifically. Reproduction here used the verified cache at `/private/tmp/orca-implementation/m32-cover-images` and CMake in the isolated emboss build tooling. No system package or app preference was changed.

`ORCA_IMAGE_WORKER_BIN` selects an explicit helper. Its full pinned identity must match. The server exposes `/api/project-images/capabilities` and `/api/project-images/cover` before the normal small JSON parser. One active process, four waiting requests, a 15-second deadline including queue time, bounded input/output/logs and private temporary files constrain requests. Cancellation and shutdown kill active work and remove private files. PNG, JPEG and BMP are supported; animated PNG and invalid/oversized source headers are rejected. Source dimensions are limited to 4096×4096; exceptionally wide/tall images are also rejected before native resampling would allocate an oversized intermediate. No image URL or client filesystem path is accepted.

## Focused evidence

- Nine unit/API tests cover atomic state, invalid/foreign output, version identity, malformed input, relative helper paths, deadlines, output limits, queue capacity, aborts, shutdown and private-file cleanup.
- Four real-helper/native tests cover exact RGB crop pixels, BMP, PNG alpha/downsampling, installed-app JPEG, and an installed Orca 2.4.2 re-export retaining all original/generated image bytes and cover relationships.
- Three browser tests use explicit mocked image responses to check save/export/undo, unavailable/invalid outputs and stale/cancelled requests. One separate real-helper browser test checks generated pixels/dimensions and saved relationships.
- The explicit pinned rebuild and production Vite build pass. Focused logs: `/private/tmp/orca-m32-image-final.log`, `/private/tmp/orca-m32-browser3.log`, `/private/tmp/orca-m32-reproduce.log`.

The initial headless probe omitted standard BMP-handler initialization; this is now explicit. A relative configured helper worked for version probing but failed after the worker entered its private directory; resolving that path at service creation fixes it and has a regression test. Early pixel expectations assumed nearest-neighbor scaling and were corrected against the pinned Float32 sizing and wx box-filter equations. An undo test now compares original metadata exactly, including the native empty DesignerCover value. Stage-only build attempts initially hit the sandbox/symlinked HTML path and were rerun with the correct permissions and copied entry file.

Fresh GUI set-cover screenshot/pixel comparison remains pending while the host is locked. Complete native Project layout, online model/design workflows, plate-thumbnail regeneration and non-macOS acceptance remain separate gaps. This implementation does not mark broad project or UI parity verified. Source and licensing details are in `native/image-worker/NOTICE.md`.
