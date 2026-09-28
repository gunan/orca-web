# Pinned native text geometry worker

This executable compiles OrcaSlicer **2.4.2**, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`, without the desktop application. It uses the native stb font outlines, healing/Clipper operations, CGAL triangulation, and CGAL `CutSurface` engine. The surface orchestration in `worker/main.cpp` follows the pinned `EmbossJob.cpp` functions `create_projection_for_cut`, `cut_surface_to_its`, and `create_emboss_projection`. It is not a browser triangulator or generic vertex projection.

## Build

On the tested macOS host, install/develop with Apple Command Line Tools, Python 3.12+, Ninja, and available OpenSSL headers. Run:

```sh
npm run build:native:emboss
```

The explicit command downloads the pinned source and dependency archives, verifies archive SHA256 hashes, retains the source/licenses, builds static dependencies with at most two build jobs, and produces ignored `native/build/emboss/orca-emboss-worker` and `build-manifest.json`. Nothing downloads or compiles at server startup. The first build needs internet access and several gigabytes of cache space. The verified host uses Apple clang 21 / SDK 27 on arm64; other platforms and cross compilation are not certified by this recipe.

`ORCA_NATIVE_CACHE_DIR` selects the reusable source/dependency cache (default `.native-cache`). `CMAKE` can select an existing CMake 3.31+ executable; otherwise the recipe uses the pinned local CMake 3.31.6 wheel. `ORCA_NATIVE_BUILD_JOBS` is capped at two. `ORCA_EMBOSS_WORKER_BIN` selects an explicit runtime binary. The server defaults to `native/build/emboss/orca-emboss-worker` and verifies its version/commit before advertising readiness.

A prepopulated cache is reusable across workers/checkouts. Worker object directories are keyed by source directory; GMP/MPFR/TBB/Boost installation prefixes remain shared. `CMakeLists.txt` also accepts `ORCA_SOURCE_DIR`, `ORCA_NATIVE_PREFIX`, and `ORCA_NATIVE_DEPENDENCIES` for controlled builds.

## Sources and licensing

The source checkout remains at the pinned commit and configuration rejects modified `src`/`deps_src` files. `native-helper-manifest.json` additionally pins the exact `TriangleMesh.cpp` source and extracted `its_merge` function. Extracting this unchanged helper avoids the unrelated `Model.hpp` → STEP/OCCT desktop dependency graph; geometry code is not stubbed.

`dependency-manifest.json` pins CGAL 5.6.3, Eigen 5.0.1, Boost 1.84.0, TBB 2021.5.0, GMP 6.2.1, MPFR 4.2.2, cereal 1.3.0, and the CMake tool wheel with SHA256 hashes. Bundled stb, Clipper, admesh, and nlohmann headers come from the pinned Orca source. The GMP patch is the patch in Orca's pinned dependency recipe. OpenSSL is a host header/build dependency pulled by native `Utils.hpp`; no OpenSSL dynamic library remains in the tested executable after dead stripping.

The native source and derived worker glue are provided with the GNU Affero General Public License v3 in `LICENSE.txt`. Retain upstream copyright notices and dependency licenses; the downloaded source trees remain in the cache, and the build copies top-level dependency licenses to its `licenses/` directory. The executable is not redistributed here without its source/build recipe.

## Protocol and limits

The executable accepts a trusted font-file argument and one bounded JSON request on standard input, then exits. HTTP callers use opaque font IDs; a request cannot supply a font path or URL. Geometry responses identify the native version and source commit and contain local indexed vertices/triangles, shape scale, and healing state. `operation: "font-info"` is used internally for native TTC collection metrics/names.

The server wrapper bounds text to 4,096 UTF-8 bytes, input to 32 MiB, combined source geometry to 200,000 vertices/triangles, sources to 32, output to one million vertices/triangles and 96 MiB, diagnostics to 64 KiB, active jobs to one by default, and queued jobs to four. The 30-second default wall deadline includes queue time and font resolution. Abort/timeout kills the process group, escalating to SIGKILL after 250 ms. Shutdown waits for child cleanup.

The executable additionally bounds file/input/output geometry, limits CPU time to 60 seconds and TBB parallelism to two. On macOS a 10-ms resident-memory watchdog terminates over 2 GiB; this is a sampled guard, not an allocation-level hard cap. Non-Apple code uses an address-space limit, but the build recipe currently declines unvalidated platforms.

Native GUI numeric limits are retained for height, depth, boldness, skew and gaps. Boldness and gaps are **font units**, matching the native advanced controls. Per-glyph layout is explicitly rejected until its model-slice/arclength algorithm is implemented.

See [acceptance and remaining scope](../../docs/parity/NATIVE_EMBOSS_WORKER.md).

Per-glyph support now compiles pinned TriangleMeshSlicer.cpp and the source-adapted TextLines/EmbossJob orchestration in `worker/per-glyph.cpp`. See `per-glyph-source-manifest.json` and `docs/parity/NATIVE_TEXT_CREATION.md`. The helper advertises this extension through `--capabilities`; no new dependencies are required.

SVG mode accepts bounded embedded source bytes through `--svg`, without a font or request-supplied filesystem path. It compiles pinned `NSVGUtils.cpp` and NanoSVG, preserving native mm/96 dpi, fill/stroke healing, centering and 0.1 mm world-scale tessellation. `svg-source-manifest.json` records the exact source hashes, verified during CMake configuration. `--capabilities` reports `svg: true`. Existing generated meshes are retained on unchanged editor close. Geometry diagnostics report native zero-area faces instead of silently altering their triangulation; see `docs/parity/NATIVE_SVG.md`.
