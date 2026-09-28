# Orca Web / OrcaSlicer parity audit

> Historical baseline at `5050dab`. Several slicing and persistence findings below have since been fixed. See [Milestone 01](MILESTONE_01.md) and the [current progress tracker](PROGRESS.md) for implementation status and executed tests. Original observations are preserved below.

Audit date: 2026-09-26 (America/Los_Angeles). Repository: `/Users/gunan/workspace/orca-web`, revision `5050dab`. Native reference: locally installed OrcaSlicer **2.4.2**. Web service: **http://127.0.0.1:3001**, configured to use the installed executable.

## Conclusion

The repository currently provides a React interface resembling a slicer and an upload/job/download API. It does **not** provide native UI or feature parity. Most visible controls are placeholders, no actual model or toolpath is rendered, and the real slicing path fails. A matching slicing engine alone cannot reproduce the desktop application's editing, configuration, preview, device, and project behavior.

There is no defensible parity percentage or full certification from this audit. Establishing either requires an agreed feature inventory and repeatable acceptance tests against this specific native version.

## Evidence and verification limits

- **Observed during this session:** the server started using the installed native executable; `npm run build` and all three Node tests passed. API job `019ef44a-a650-4284-9690-c3e4f3d3c027` failed with `unknownfileformat` because its uploaded model was passed under an extensionless temporary filename. A separate watertight cube with its extension preserved then exposed a native profile-format rejection. Two simultaneous adapter calls reproduced an output-file collision.
- **Inspected in source:** the UI, request pipeline, three local profiles, CLI adapter, persistent job store, and test fixtures. Findings below identify relevant files and lines at the audited revision.
- **Observed visually:** native Prepare/settings and the Calibration menu were inspected. Empty Prepare captures are saved as `native-prepare.png` and `web-prepare.png` alongside this report. Native uses a light theme, a printer/filament/process stack on the left, and slice/export at the upper right. Web uses a dark theme, printer/filament across the top, objects on the left, settings on the right, and actions in a footer. Icons and layout hierarchy differ visibly.
- **Not established:** a successful real-native slicing/download journey, toolpath equivalence, printer communication, calibration results, physical print correctness, comprehensive native feature coverage, or browser end-to-end success. Passing the Node tests does not establish any of these.
- Browser model upload was attempted but the file chooser timed out; no successful browser upload is claimed. Native inspection was selective, not an exhaustive behavior test.
- The tests invoke `tests/fixtures/fake-slicer.sh`, which writes a fixed `G28` output without parsing geometry or settings. `tests/fixtures/cube.stl:1` contains only `solid`/`endsolid`, with **zero facets**. These fixtures cannot validate native slicing.

## Feature matrix

| Native capability | Web implementation | Evidence |
|---|---|---|
| Import and inspect geometry | One file; fixed CSS cube for every model | `src/main.jsx:16–26`, `src/styles.css:2` |
| Orbit, zoom, view cube, camera modes | Decorative controls | `src/main.jsx:19–20` |
| Move, rotate, scale, place on face, cut, support painting | Toolbar selection highlight only | `src/main.jsx:60` |
| Multiple objects, instances, plates, object settings | One file/plate; add controls unwired | `src/main.jsx:45,59` |
| Printer and filament presets | Fixed names, retained as metadata | `src/main.jsx:57`, `server/app.js:56,69` |
| Process profiles and advanced settings | 19 fields; disconnected selectors and incomplete schema | `src/main.jsx:7–12,34–39,63` |
| Slice and export | API exists; real-native execution currently fails | `server/app.js:27–30,69` |
| Toolpath preview, layers, colors, estimates | No toolpath renderer or layer controls | `src/main.jsx:55–63` |
| Device monitoring and print submission | No Device workspace or network bridge | `src/main.jsx:55–62` |
| Project save/load and metadata | No Project workspace or serialization | `src/main.jsx:55–62` |
| Calibration workflows | Button without handler | `src/main.jsx:57` |
| Multimaterial and filament assignment | No Multimaterial category or working add-filament flow | `src/main.jsx:7–12,57` |

## Blocking findings

### P0: Real slicing and preset correctness

1. **Extensionless input breaks the installed slicer.** Multer's `dest` storage generates an extensionless path (`server/app.js:27–30`), subsequently supplied unchanged to the CLI (`:69`). Preserve a validated extension inside a unique job directory and test actual nonempty STL, OBJ, and 3MF inputs.
2. **Profiles fail native validation.** A direct CLI run with a real watertight cube, preserved `.stl` extension, current adapter flags, and `balanced.json` exited **251**, reporting `operator():file /Users/gunan/workspace/orca-web/server/profiles/balanced.json's from unsupported`. The three profiles contain only two layer-height fields; native format, inheritance, machine, and filament settings are unresolved. Printer/filament choices are stored but never passed to `sliceModel`. Correct file naming alone is insufficient; generate and validate complete native-compatible configurations.
3. **Displayed settings do not reliably describe the job.** The Process selector has no handler (`src/main.jsx:34`); the footer selects a separate profile (`:63`). Visible default fields are fallback text while submitted settings initially equal `{}` (`:38,47,52`). Fine/Draft can therefore show 0.20 mm while requesting another layer height. Any override also resets Draft's first layer from 0.28 to 0.20 (`server/app.js:66`, `server/profiles/draft.json:3`).

### P1: Missing application behavior

4. **Geometry and preview are substitutes for the real feature.** The CSS cube never uses model content. Triangle count is hardcoded to 12, and transforms never reach the submitted file. Prepare/Preview/Device/Project only change the active navigation styling; all render the same workspace.
5. **Settings and workflows are incomplete.** Global/Objects, Advanced, save/reset/compare presets, menus, plate creation, filament creation, and calibration are unwired. Enum fields are free text and use display labels as values. The UI's `ironing` boolean differs from native `ironing_type`; native preset examples serialize `aligned`, `tree(auto)`, and `classic`. Search only filters the current category. STEP/AMF/SVG are advertised but rejected.
6. **Native workflow coverage is absent.** Missing areas include multimaterial assignment, model repair and assembly operations, per-object overrides, project persistence, printer management, and calibration for temperature, maximum flowrate, pressure advance, flow ratio, retraction, cornering, input shaping, and VFA.

### P1: Concurrent jobs and restart reliability

7. **Concurrent output collision was reproduced.** All CLI executions share an output directory and select the first newly appearing `.gcode` (`server/slicer.js:13–27`). Two simultaneous calls with the fake fixture produced an `ENOENT` while renaming `result.gcode`; only `b.gcode` remained. Give each job an isolated directory and verify its expected output. This reproduces adapter failure, independently of native slicing.
8. **Persistence is not crash-safe.** `server/store.js:26` writes the shared JSON index without serialization or atomic replacement. Restart recovery marks `slicing` jobs failed but leaves `queued` jobs stranded (`:15`). Serialize writes, use atomic persistence, and recover every interrupted state. Persistence/restart risks were code-inspected, not experimentally reproduced here.

## Implementation sequence and acceptance criteria

1. **Establish a trustworthy native pipeline.** Preserve extensions, use valid native presets, wire machine/filament/process selection, isolate jobs, and repair persistence. Acceptance: real fixtures slice and download through the API; invalid configuration fails clearly; concurrent jobs retain correct outputs; restart never strands jobs.
2. **Define the parity architecture and inventory.** Decide whether exact native UI access or a separately implemented browser UI is required. Inventory every native screen, command, setting, format, and workflow against version 2.4.2. Acceptance: each item has an owner, implementation approach, and reproducible test; placeholders are clearly identified.
3. **Implement the editing and preview foundation.** Add real geometry, scene state, transforms, plates/objects, native-compatible project serialization, and G-code visualization. Acceptance: transformed objects produce corresponding toolpaths; projects round-trip; layers and displayed estimates match native results for reference cases.
4. **Complete settings and native workflows.** Derive validated settings/presets from native definitions, then implement multimaterial, calibration, device, and project features. Acceptance: every exposed control has an observable effect and supported combinations match native behavior.
5. **Run the full parity suite.** Compare screenshots, interaction sequences, effective settings, geometry, toolpaths, and relevant device behavior. Normalize nondeterministic metadata before output comparisons. Claim 100% parity only after every agreed inventory item passes with documented exceptions resolved.


## Architecture decision for full parity

The current README describes a separately implemented browser UI using the native CLI. Completing that design requires implementing the missing desktop workflows and maintaining them as OrcaSlicer evolves. Fixing the two immediate CLI failures is only the first step.

For preserving the actual native interface, browser streaming is a viable alternative to evaluate. [LinuxServer's OrcaSlicer image](https://docs.linuxserver.io/images/docker-orcaslicer/) runs OrcaSlicer with a Selkies browser client; the [Selkies documentation](https://docs.linuxserver.io/selkies/) describes streaming a full Linux application to the browser. This was researched, not installed or tested in this audit. A Linux container would still require version, preset, theme, file-transfer, shortcut, graphics, and printer-network validation, and would not establish pixel-identical parity with the installed macOS application. Exact macOS appearance would require preserving that platform's UI as well.

## Running server

The inspected checkout remains running on `127.0.0.1:3001` with the installed macOS executable. Port 3000 was already occupied by an SSH listener. The health endpoint reports liveness, not successful slicing; its `ok` response must not be interpreted as native readiness.

The server is a foreground development process for this session, not an installed background service. Reproduce the launch from the repository with:

```sh
npm ci --no-audit --no-fund
npm run build
ORCA_SLICER_BIN=/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer \
  node --input-type=module -e 'const {createApp} = await import("./server/app.js"); const app = await createApp(); app.listen(3001, "127.0.0.1", () => console.log("Orca Web listening on http://127.0.0.1:3001"));'
```

## Visual references

These are empty Prepare states with the existing application preferences; they are layout references, not a pixel-diff test. The browser was inspected at a 1759 × 1002 CSS viewport, and screenshot captures have different pixel scaling.

Native OrcaSlicer 2.4.2:

![Native Prepare workspace](/Users/gunan/workspace/orca-web/docs/parity/native-prepare.png)

Orca Web at revision 5050dab:

![Web Prepare workspace](/Users/gunan/workspace/orca-web/docs/parity/web-prepare.png)
