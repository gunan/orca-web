# Native machine, filament, and project settings

`shared/native-profile-schema.json` comes from OrcaSlicer 2.4.2, commit
`8500fcdccaa10b5099ac20d252af3a7c560046f1`. Every input is SHA-256 pinned in
`scripts/native-profile-schema-sources.json`; the upstream license is AGPL-3.0
(see `ORCASLICER-LICENSE.txt`). Source-derived labels/tooltips/defaults retain
that provenance. The generator executes no upstream code.

Regenerate or check:

```sh
node scripts/generate-native-profile-schema.js --download
node scripts/generate-native-profile-schema.js --check
```

An existing verified source checkout/cache can be passed with `--source-dir`.

There are 160 native machine memberships and 126 filament memberships, all with
fully parsed metadata. Native UI declarations expose 116 controls in each scope.
The web editor permits 115 machine and 112 filament controls: printer connection
plumbing and compatibility expressions are handled separately. Source-derived conditional visibility, enablement, material warnings and
correction review are implemented in [SETTINGS_DEPENDENCIES.md](SETTINGS_DEPENDENCIES.md).
Some native edit-event dialogs, hidden-setting corrections and dynamic page behavior
remain incomplete; schema completeness does not establish complete UI parity.

`scripts/lib/native-profile-schema.js` handles literal C++ metadata, native enum
symbols, loop-generated motion-axis defaults, nullable filament overrides derived
from their native extruder options, material-type suggestions from
`MaterialType.cpp`, and native UI range loops. `scripts/lib/native-schema.js` adds
only named helper exports; the existing process-schema output is unchanged.

`shared/native-project-schema.json` contains 22 additional native project
parameters observed in a real 2.4.2 export. Its scope is explicitly partial. Each
parameter's actual definition and provenance are retained rather than guessing
from serialized values.

## Runtime API

`shared/profile-settings.js` exports:

- `definitionsByScope`, `editableDefinitionsByScope`, `groupsByScope` for process,
  machine, and filament; groups preserve native page/section names.
- `normalizeProfileOverrides(scope, values)` for editable fields only.
- `normalizeNativeProfileValues(scope, values)` for known native preset members,
  with inheritance/compatibility and connection metadata handled by the caller.
- `displayedProfileSettings(scope, preset, {includeDefaults:true})` for editor
  presentation; do not use this to reconstruct an imported native project.
- `applyProfileOverrides(scope, preset, values)` for immutable native config edits.
- `projectSettingDefinitions`, `normalizeNativeProjectValues(values)` for the
  separately declared 22 project parameters.

Values serialize to native strings. True native vectors remain arrays; they are
never broadcast into nested arrays. Booleans become `0`/`1`, percentages retain
`%`, integers are bounded to native signed 32-bit storage, and a nullable entry
accepts `null` or `nil` and serializes as `nil`. Non-nullable entries reject nil.
A point serializes as `x,y`; polygon points as an array of `x`-separated coordinate
strings; point groups as an array of comma-separated polygon strings. Closed enums
use native serialized keys; open numeric/string enum suggestions do not restrict
ordinary values. Text is limited to 64 KiB per field, without null characters.

Ordinary machine and filament G-code strings are preserved. Nonempty host
post-processing scripts, connection credentials, and imported external asset
paths are rejected. Native dependency expressions are not silently dropped or
represented as evaluated.

## Durable custom preset catalog

`createCustomPresetCatalog({baseCatalog,dataDir})` wraps the native catalog and
preserves `list`, `resolveSelection`, and `getPreset`. The base catalog must expose
`getPreset(id,type)` and should expose `findPresets(name,type)` over resolvable
records, including inheritance templates.

Stored presets have stable IDs and frozen native source snapshots. Editing a base
later does not silently change derived custom presets. Writes serialize through
an atomic temporary-file/rename transaction; failed writes leave memory and the
previous snapshot unchanged. Corrupt stores fail startup instead of being reset.
Bundled files are never written.

`resolveSelection` accepts `overrides` (process), `printerOverrides`, and
`filamentOverrides`. A derived printer retains its known native ancestor names
for compatibility. Custom process/filament compatibility uses explicit printer
IDs. The chosen native configs are flattened for CLI use, including the
corresponding selected-printer compatibility name.

Mount `createCustomPresetRouter({catalog})` at `/api/presets/custom`:

| Method/path | Contract |
| --- | --- |
| `GET /?type=filament` | List custom records (optional scope). |
| `GET /source/:type/:id` | Editor source for bundled or custom ID. |
| `GET /source/:type/:id/export` | Flat native JSON export. |
| `POST /` | `{type,name,baseId,settings,compatiblePrinterIds}`; returns 201. |
| `GET /:id` | Read one custom record. |
| `PUT /:id` | Rename/edit; supplied `settings` replaces the stored override map. |
| `DELETE /:id` | Delete custom record, returning 204; referenced printer IDs return 409. |
| `POST /import` | `{preset,baseId?,compatiblePrinterIds?}` native JSON import. |
| `GET /:id/export` | Native flat JSON with `from:user` and no `inherits`. |

Editor records return effective `settings`, stored `overrides`, the resolved
`preset`, source metadata, explicit `compatiblePrinterIds`, and `nativeVersion`.
Machine creation omits compatibility IDs; process/filament creation requires at
least one. Mutating browser requests must have the same origin when Origin is
present. There is no separate server authentication scheme in this module.

Imports resolve inheritance only by indexed native/custom names, never paths;
unknown/ambiguous parents and unknown option keys fail explicitly. Complete
standalone JSON may be imported without a base. Compatibility expressions and
filament-to-process compatibility are rejected until their language/selection
semantics are supported. Imported custom printers without known ancestry need
explicit compatible custom process/filament presets (globally compatible bundled
choices remain eligible). This limitation is not full native user-preset parity.

## Verification

Unit and local HTTP tests cover every scalar/vector family, enum and numeric
validation, all editor default round-trips, geometry serialization, native G-code
preservation, persisted selection effects, CRUD/import/export, compatibility,
concurrent rename/delete/edit races, failed-write cleanup, corrupt stores, and
origin validation. `tests/native/custom-presets.test.js` requires the real
installed OrcaSlicer 2.4.2 and verifies generated toolpaths and saved custom machine,
process, and filament values; it never connects to a printer.
