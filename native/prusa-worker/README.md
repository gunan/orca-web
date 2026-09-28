# Pinned native Prusa 3MF importer

This read-only worker calls OrcaSlicer 2.4.2's `PrusaFileParser` and `load_3mf` from revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`. It supplies the GUI-specific importer missing from the installed command-line dispatch. It never opens a printer connection, runs post-processing, enables GUI backup, or reads native user settings.

Build after the native emboss worker's verified dependency cache is available:

```sh
ORCA_NATIVE_CACHE_DIR=/path/to/cache node scripts/build-native-prusa.mjs
```

The cache contains `upstream/repository`, `prefix`, and `dependencies`. `CMAKE_BIN` and `CMAKE_GENERATOR` are optional. Default output is `native/build/prusa/orca-prusa-import`; `ORCA_PRUSA_IMPORTER_BIN` overrides the server executable path. The build writes a paired `build-manifest.json` beside the executable with its SHA-256, source/dependency manifests, platform, compiler and CMake identities. A missing or mismatched worker fails explicitly. The single process-wide importer queue admits one active and four pending requests, including direct project imports. Queue wait consumes the same request deadline; queued cancellation removes the entry before any temporary directory or process starts. The server does not fall back to the BBS-only importer for recognized Prusa projects.

The worker interface is `orca-prusa-import INPUT.3mf OUTPUT.json`, plus `--version`. INPUT and OUTPUT are supplied by the server's isolated temporary directory. Archive entry names and embedded source paths are never used as output filesystem paths. Bounds: 128 MiB input, 4096 ZIP entries, 256 MiB expanded archive, 2 million output triangles, 10,000 objects/instances, 64 materials, 150 MiB JSON. The JS boundary additionally checks actual decompression, XML structure/entities, triangle indexes, facet encodings, post-processing, typed settings, project geometry and retained source frames.

`Format/3mf.cpp`, mesh/facet algorithms and configuration parsing are compiled from unchanged source. `Model.cpp` excludes only the unused `read_from_step` definition to avoid linking OCCT. The generated Model file and exact thumbnail configuration helper extraction have pinned SHA-256 checks. STEP is not an accepted worker format. GUI backup entry points preserve their disabled-backup behavior and throw if a future path tries to enable side effects. `source-manifest.json` pins the checkout and relevant source hashes; configuration fails on tracked source modifications. The native local/instance matrices remain active to preserve orientation-dependent native infill behavior.

OrcaSlicer source and derived worker components are AGPL-3.0; see `LICENSE.txt` and the pinned source URL in `docs/prusa-project-import.md`. Source, build definitions and extraction scripts are retained with this integration. Dependency licensing remains with the shared verified cache and its upstream distributions.
