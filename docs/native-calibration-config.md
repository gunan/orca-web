# Calibration configuration and native G-code tags

Calibration sessions now resolve their selected machine, process and material through the pinned native configuration service at preparation and validation. The token binds both complete archive and effective native snapshots: changing an inactive material alternative also requires regenerating the calibration. Generated settings use the selected active values. The app shares its native configuration lifetime with calibration sessions, so shutdown cancels pending native resolution as well as model preparation.

The installed X1C `0.12mm High Quality @BBL X1C` profile contains `bridge_speed: ["50","50"]`; native parsing resolves this scalar to50. Sparse values also use actual native defaults. For example, an omitted Marlin2 maximum junction-deviation value is positive in the native default, so a synthetic jerk-mode test must explicitly set zero rather than depend on a JavaScript fallback.

Real X1C acceptance exposed a second issue: Bambu G-code uses a different reserved-tag set, independent of the ordinary `gcode_comments` option. Readers now accept both sets while preserving original text and command order:

| Slice event | Compatible tag | Bambu tag |
| --- | --- | --- |
| Layer boundary | `;LAYER_CHANGE` | `; CHANGE_LAYER` |
| Layer Z | `;Z:` | `; Z_HEIGHT: ` |
| Feature | `;TYPE:` | `; FEATURE: ` |
| Wipe | `;WIPE_START` / `;WIPE_END` | `; WIPE_START` / `; WIPE_END` |

Source: OrcaSlicer2.4.2 commit8500fcdccaa10b5099ac20d252af3a7c560046f1, `GCodeProcessor.cpp:58–101`, `GCodeProcessor.hpp:375` and `GCode.cpp:4619–4627`. The latter emits the matching layer height and Z tags. The reader is shared by temperature/PA schedules, speed scheduling, retraction wipe boundaries, flow verification and PA pattern verification. Generated PA line bodies use the carrier's native tag style. Both native styles are rejected in user-supplied PA boundary comments.

No blanket comments override is added. The real X1C source keeps `gcode_comments=0`; reserved layer/role comments still exist. Existing retraction/PA-line modes retain their prior explicit command-comment requirements.

Acceptance covers native-normalized X1C temperature, pressure-advance and flow jobs through the real HTTP preparation, token validation, slicing and download paths. Unit tests compare compatible and Bambu tag forms for identical effective command sequences and summaries, preserving the original comments. Existing native flow ratios, fixed-speed differential slices, wipe/deposition paths, spiral schedules and PA patterns remain regression-tested. No physical printer was contacted or measurement inferred. Existing one-extruder calibration limits are unchanged; these tests do not establish full multi-nozzle calibration or fresh native GUI calibration equivalence.
