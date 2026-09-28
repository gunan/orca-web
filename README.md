# Orca Web

A work-in-progress browser interface backed by the real OrcaSlicer command-line engine. The parity baseline is **OrcaSlicer 2.4.2**. This is not a complete replacement for the native application.

The browser has a real mesh editor, group/part transforms, planar cuts and mirror, assembly/splitting/repair, multiple plates, native slicing and actual G-code preview. Imports support STL, OBJ, native 3MF projects, AMF, extruded SVG and STEP. Native project workflows preserve supported settings, parts/roles, filament assignments and layer events. Custom machine/process/filament presets persist with import/export and compatibility checks. Editors expose 342 process, 115 machine and 112 filament controls with source-backed conditional behavior and server-validated native correction choices. Per-plate prime-tower placement reaches real sliced output; remaining native event and validation rules are tracked.

Moonraker and OctoPrint connectors support status, G-code transfer and confirmed printer commands. Temperature, pressure advance, input shaping, cornering, flow ratio, VFA and maximum-flow calibrations use native resources and validated effective commands. Explicit flow-ratio, temperature, pressure-advance, retraction and maximum-flow results can be saved as new custom filament presets. Device tests use fake servers; no hardware has been contacted. Facet painting, text, brim ears, height ranges, adaptive layers and filament ordering have tested implementations. Their remaining native interactions, cut connectors, broader calibration, hardware validation and exact native UI layout remain active work. Unsupported controls are explicitly unavailable.

## Current focus

The current goal is the basic workflow: add/create a printer, choose filaments and print settings, load models, and use clear top-toolbar transforms. Rotation shows live angles and provides 90° snapping and quarter-turn presets. The broader native parity backlog is retained separately.

- [Core workflow goal and progress](docs/CORE_WORKFLOWS.md)
- [Frontend architecture](docs/ARCHITECTURE.md)

## Feature inventory and progress

- [Progress and implementation/test matrix](docs/parity/PROGRESS.md)
- [Feature list CSV](docs/parity/features.csv)
- [Source inventory, criteria, evidence, and history](docs/parity/features.json)
- [Observed native preset setting keys CSV](docs/parity/native-settings.csv)
- [Milestone48 native import inspection](docs/parity/MILESTONE_48.md)
- [Milestone47 native multipart choices](docs/parity/MILESTONE_47.md)
- [Milestone46 retained native geometry imports](docs/parity/MILESTONE_46.md)
- [Milestone45 native 3MF load choices](docs/parity/MILESTONE_45.md)
- [Milestone44 recent-file history](docs/parity/MILESTONE_44.md)
- [Milestone43 Home and startup preferences](docs/parity/MILESTONE_43.md)
- [Milestone42 native preference spin behavior](docs/parity/MILESTONE_42.md)
- [Milestone41 FPS preferences and preference inventory](docs/parity/MILESTONE_41.md)
- [Detailed native preference controls and progress](docs/parity/native-preferences.csv)
- [Milestone40 orientation-preserving Fit](docs/parity/MILESTONE_40.md)
- [Milestone39 camera preferences and mouse actions](docs/parity/MILESTONE_39.md)
- [Milestone38 Prepare display and editing units](docs/parity/MILESTONE_38.md)
- [Milestone37 cancellable loading and Prepare demand rendering](docs/parity/MILESTONE_37.md)
- [Milestone36 rendering evidence and original reload race](docs/parity/MILESTONE_36.md)
- [Milestone35 native toolbar icon states](docs/parity/MILESTONE_35.md)
- [Milestone34 prime-tower X/Y Move handles](docs/parity/MILESTONE_34.md)
- [Milestone33 tower drag and camera lifecycle reliability](docs/parity/MILESTONE_33.md)
- [Milestone32 native prime tower dragging](docs/parity/MILESTONE_32.md)
- [Milestone31 Preview camera and job lifecycle reliability](docs/parity/MILESTONE_31.md)
- [Milestone30 collision-safe native tower identities](docs/parity/MILESTONE_30.md)
- [Milestone29 active embedded preset names](docs/parity/MILESTONE_29.md)
- [Milestone28 asynchronous camera fitting](docs/parity/MILESTONE_28.md)
- [Milestone27 native tower obstacles](docs/parity/MILESTONE_27.md)
- [Milestone26 native prime-tower preview](docs/parity/MILESTONE_26.md)
- [Milestone25 native Cut to parts](docs/parity/MILESTONE_25.md)
- [Milestone24 native user preset inheritance](docs/parity/MILESTONE_24.md)
- [Milestone23 all-plate Preview and units](docs/parity/MILESTONE_23.md)
- [Milestone22 native hierarchy, dependencies and editor Preview](docs/parity/MILESTONE_22.md)
- [Milestone21 linked Cut, compatibility and native Preview](docs/parity/MILESTONE_21.md)
- [Milestone20 linked editing, clipboard, variants and Preview](docs/parity/MILESTONE_20.md)
- [Milestone19 native configuration, Cut and scalar Preview](docs/parity/MILESTONE_19.md)
- [Milestone18 native arrangement, clipboard and motion solids](docs/parity/MILESTONE_18.md)
- [Milestone17 native SVG, nozzle purge tables and Preview](docs/parity/MILESTONE_17.md)
- [Milestone16 native preview, keyboard, text and import](docs/parity/MILESTONE_16.md)
- [Milestone15 native text and project covers](docs/parity/MILESTONE_15.md)
- [Milestone14 project files, material correctness and preview solids](docs/parity/MILESTONE_14.md)
- [Milestone13 native preview, text precision, shrinkage and thumbnails](docs/parity/MILESTONE_13.md)
- [Milestone 12 brim tools, painting feedback, material context and GUI references](docs/parity/MILESTONE_12.md)
- [Milestone 11 dovetails, multiple selection, object painting and support preview](docs/parity/MILESTONE_11.md)
- [Milestone 10 layer brush, painting view/remapping and complete PA patterns](docs/parity/MILESTONE_10.md)
- [Milestone 09 cut connectors, advanced painting, PA lines and window layout](docs/parity/MILESTONE_09.md)
- [Milestone 08 painting, adaptive layers, filament order and measured results](docs/parity/MILESTONE_08.md)
- [Milestone 07 height ranges, retraction and native layout](docs/parity/MILESTONE_07.md)
- [Milestone 06 text, brim ears and exact cut planes](docs/parity/MILESTONE_06.md)
- [Milestone 05 cuts, groups, calibration and native corrections](docs/parity/MILESTONE_05.md)
- [Milestone 04 native projects, presets and calibration](docs/parity/MILESTONE_04.md)
- [Milestone 03 implementation and verification](docs/parity/MILESTONE_03.md)
- [Milestone 02 geometry, preview and projects](docs/parity/MILESTONE_02.md)
- [Milestone 01 implementation and verification](docs/parity/MILESTONE_01.md)
- [Tracker workflow](docs/parity/README.md)
- [Original comparison audit](docs/parity/PARITY_AUDIT.md)

Counts describe the tracked inventory; they are not a percentage of all native functionality. Each missing feature includes planned acceptance tests. Tests that do not yet exist are not reported as passing coverage.

## Run locally

Requirements: Node.js 20+, OrcaSlicer 2.4.2, the matching bundled `resources/profiles` directory, and the pinned native configuration helper. The tested helper build requires macOS Command Line Tools, Python 3.12+, Ninja and OpenSSL headers. Its first build downloads verified source/dependencies and needs several gigabytes of cache space. The macOS installation at `/Applications/OrcaSlicer.app` is discovered automatically. On Linux, set the executable and resource paths explicitly if discovery cannot find them.

```sh
npm ci
npm run build:native:config
npm run build
HOST=127.0.0.1 PORT=3001 npm start
```

Open <http://127.0.0.1:3001>. The default port is 3000 and default host is loopback. For another installation:

```sh
ORCA_SLICER_BIN=/path/to/OrcaSlicer \
ORCA_RESOURCES_DIR=/path/to/resources \
HOST=127.0.0.1 PORT=3001 npm start
```

`ORCA_PROFILES_DIR` may point directly to the bundled `profiles` folder. No native user/account configuration is loaded. CLI runs use a temporary `--datadir`. Presets with unsupported compatibility expressions or invalid inheritance are excluded, with warnings shown in the UI. The default preset selection is a working reference, not a claim to match your physical printer.

Preset selection, active nozzle/material variants and native exports use the original native configuration code. The helper is required for these workflows; missing or mismatched helpers produce an explicit unavailable response. Its binary and paired build manifest normally live under `native/build/config`; `ORCA_CONFIG_WORKER_BIN` selects a separately built pair. The current build recipe is validated on macOS. Other operating systems require independently validated helper builds; installing the slicer alone is insufficient.

Build the other helpers to enable all currently implemented native workflows:

```sh
npm run build:native:emboss    # text/SVG geometry and surface embossing
npm run build:native:images    # native project cover/image decoding
npm run build:native:gcode     # original native Preview data, colors and timing
npm run build:native:prusa     # Prusa project conversion
npm run build:native:arrange   # native arrangement and model clipboard
```

The helpers share a pinned source/dependency cache through `ORCA_NATIVE_CACHE_DIR`; their READMEs under `native/` document build and runtime overrides. The configuration build bootstraps shared dependencies and also builds emboss on a fresh cache. Builds are explicit: the server does not download or compile helpers during startup or requests. Capability responses identify unavailable optional helpers.

For UI development, `npm run dev` starts the API and Vite; Vite proxies `/api` to port 3000. Set the engine/resources environment on that command as necessary.

## Tests and exports

```sh
npm test                     # unit + HTTP tests; fake slicer, real config helper
npm run build
npx playwright install chromium
npm run test:e2e              # browser interactions; fake slicer, real config helper
npm run test:native           # real engine: formats, overrides, errors, API/CLI equivalence
npm run test:native:gui       # requires unlocked Mac and interactive native GUI
npm run test:e2e:native       # real browser upload -> real native engine -> G-code download
npm run parity:export        # rebuild CSV and Markdown from tracked feature evidence
npm run parity:check         # validate IDs, status, criteria, plans, and references
npm run check                # test + tracker + build + browser; prerequisites above
```

Build the configuration helper before the ordinary API/browser suites. These suites isolate slicing with a fake CLI but use the real configuration resolver; they are not dependency-free portable tests. The native suites require the installed slicer/resources and all helpers exercised by their cases.

Native acceptance is pinned to OrcaSlicer 2.4.2. Native suites fail rather than silently skipping when the actual engine or resources are unavailable. Set `ORCA_SLICER_BIN` and resource paths for the tested installation; fixture profiles must not be used in native suites.

Refresh the setting-key inventory after changing the native baseline or supported browser settings:

```sh
npm run parity:settings -- \
  --profiles-dir /Applications/OrcaSlicer.app/Contents/Resources/profiles \
  --native-version 2.4.2 --write
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Engine version, preset discovery and native configuration availability; 503 if required components are unavailable |
| GET | `/api/presets?printerId=...` | Bundled printer and compatible process/filament choices with defaults |
| GET | `/api/presets/selection?printerId=...&processId=...&filamentId=...` | Effective supported display settings and printer dimensions |
| POST | `/api/presets/configuration` | Resolve selected presets/overrides or embedded native settings into archival and active nozzle/material configurations |
| GET | `/api/geometry/capabilities` | Native arrangement and clipboard helper identity, readiness and limits |
| POST | `/api/geometry/arrange` | Arrange validated project geometry with native placement rules |
| POST | `/api/geometry/clipboard` | Native model/part clipboard placement and Clone |
| GET | `/api/profiles?printerId=...` | Compatible native process presets |
| GET | `/api/jobs` | Persistent job history |
| POST | `/api/jobs` | Multipart `model`, `printerId`, `processId`, `filamentId`, optional `settings` JSON overrides, `preservePosition`, and prepared `calibration` session |
| GET | `/api/jobs/:id` | Actual queued/slicing/ready/failed/cancelled state |
| POST | `/api/jobs/:id/cancel` | Cancel queued or running native work |
| GET | `/api/jobs/:id/download` | Completed single-plate G-code |
| DELETE | `/api/jobs/:id` | Remove inactive job/output |
| POST | `/api/calibrations/prepare` | Generate supported native calibration geometry and a bound session |
| POST | `/api/projects/import` | Import supported native 3MF project metadata and geometry |
| POST | `/api/projects/export` | Export validated native project settings, parts and plates |
| POST | `/api/jobs/project` | Slice a validated native project with supported part/multifilament/layer semantics |
| GET/POST | `/api/presets/custom` | List or create durable custom presets |
| GET/PUT/DELETE | `/api/presets/custom/:id` | Inspect, update or remove a custom preset |
| POST | `/api/presets/custom/import` | Import validated native preset JSON |
| GET | `/api/presets/custom/:id/export` | Export native preset JSON |
| GET/POST | `/api/devices` | List or create saved Moonraker/OctoPrint connections |
| PUT/DELETE | `/api/devices/:id` | Edit or remove a connection |
| GET | `/api/devices/:id/status` | Read current protocol status and capabilities |
| POST | `/api/devices/:id/upload` | Transfer a ready job; printing requires explicit confirmation |
| POST | `/api/devices/:id/command` | Send a validated, confirmed printer action |

The old `balanced`/`detail`/`draft` API strings have been replaced by native preset IDs from `/api/presets`. The old two-field JSON files under `server/profiles` are no longer used. The service validates supported process overrides and preserves the rest of the selected preset's effective values.

## Deployment and limits

[Docker and TrueNAS SCALE deployment status and requirements](docs/DEPLOYMENT.md). The web image can be built separately, but a complete Linux native runtime is still required for a functional slicer deployment.

The Docker image does not redistribute OrcaSlicer. Supply a compatible Linux installation including libraries and resources; mounting only an executable is not sufficient for every distribution. Configure `ORCA_SLICER_BIN` and `ORCA_RESOURCES_DIR` inside the container. Native configuration and optional feature helpers also need compatible Linux builds with their manifests; the currently tested macOS binaries cannot run in this image. `HOST=0.0.0.0` is set inside the image for container networking.

Authentication and multi-user isolation are not implemented. Keep the local listener private; a network deployment needs an authenticated reverse proxy and appropriate model/printer isolation. Run only one server per `DATA_DIR`. Queued/running jobs can be cancelled. Restart marks interrupted work failed and cleans owned temporary artifacts while retaining ready output. Calibration sessions expire after 24 hours or a server restart and must be regenerated. Multiple output plates currently fail clearly instead of returning an arbitrary plate.
