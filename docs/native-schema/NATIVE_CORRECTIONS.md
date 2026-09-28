# Validated native corrections and structural checks

These helpers use the OrcaSlicer 2.4.2 source pinned at `8500fcdccaa10b5099ac20d252af3a7c560046f1`. They do not change the general editor whitelist or execute native hardware actions.

## Correction decisions

`getNativeCorrectionPlan(selection, {scope})` returns native proposal groups for `machine`, `process`, or `filament`. Each group has `id`, `mode`, `reason`, `changes`, optional `alternative`, and a deterministic `signature`. The signature is an exact canonical snapshot of current affected values and native choices. It is neither authentication nor a lossy hash.

`applyNativeCorrectionDecisions(selection, {scope, decisions, applyAutomatic:false})` recomputes that plan before changing anything. A decision accepts exactly `{id, choice:'apply'|'alternative', signature}`. Unknown or no-longer-applicable groups, stale snapshots, duplicate decisions, unsupported choices, injected value fields, and cross-scope requests fail. All decisions are checked before any result is produced. Inputs remain unchanged.

```js
// The server constructs this from its trusted preset catalog and validated UI edits.
const current = { printer, process, filament, context: nativeContext };
const plan = getNativeCorrectionPlan(current, {scope: 'process'});
// Return plan for review. The client returns only the selected decision below.
const decision = {id: plan.groups[0].id, signature: plan.groups[0].signature, choice: 'apply'};
const result = applyNativeCorrectionDecisions(current, {
  scope: 'process', decisions: [decision],
});
// result.selection is a defensive updated selection.
// result.nativeChanges contains only source-derived normalized changes.
// result.remaining is the reevaluated plan, for any newly applicable rules.
```

`applyAutomatic:true` additionally accepts native automatic proposals. It does not accept warning/confirmation groups. Reevaluate after each batch because a native correction may make another rule applicable. A caller must explicitly preserve user acknowledgment and choices; a silent save must not imply acceptance.

The helper normalizes **derived** changes against known native profile membership. For example, enabling vase mode may legitimately derive `enforce_support_layers: "0"`, although that hidden key is rejected by the ordinary UI override normalizer. The caller cannot supply `enforce_support_layers: 999` or arbitrary host/script values through this API.

Server integration order:

1. Resolve the preset or frozen custom source on the server, including trusted native context.
2. Validate ordinary user edits with `normalizeProfileOverrides`. Do not accept a caller-provided complete native configuration as the authority.
3. Derive a correction plan and return it for review when needed.
4. On submission, reconstruct the same current selection, recompute and validate decisions with this helper.
5. Store returned `nativeChanges` as trusted corrections to the frozen base snapshot or a dedicated validated correction map. Do not add them to a UI override map that will later be rejected by its strict normalizer.
6. Validate the resulting configuration and persist atomically. Native slicing validation remains authoritative for geometry, scheduling and G-code.

Plans can be recomputed by browser code for presentation, but server verification is required before persistence. Changing a preset between review and save will reject a decision when its affected native values or proposal changed.

## Custom preset HTTP flow

`POST /api/presets/custom/prepare` prepares a new preset; `POST /api/presets/custom/:id/prepare` prepares an existing custom preset. Both accept the ordinary save fields (`name`, `type`, `baseId`, `settings`, `compatiblePrinterIds`) plus:

```json
{
  "selection": {"printerId":"…", "processId":"…", "filamentId":"…", "filamentIds":["…"]},
  "changedSetting": {"key":"nozzle_diameter", "index":0},
  "mode":"Expert",
  "projectSettings": {},
  "correctionBatches": [[{"id":"…", "choice":"apply", "signature":"…"}]],
  "acknowledgedWarnings": ["…"]
}
```

`changedSetting` is optional and must refer to an ordinary edited key. Its optional `previousValue` is validated against that key's schema. The server resolves other selected presets and derives native vendor/capability context itself. Clients cannot submit capabilities or arbitrary base snapshots. Project settings use the separate 22-key native schema.

The response includes `plan`, corrected editable `settings` for preview, `validation`, own-scope `blockingErrors`, `unacknowledgedWarnings` and `ready`. Automatic rules are applied to convergence, then decision batches are verified in sequence, with another automatic pass between batches. The client **keeps the original ordinary settings unchanged** while appending decisions and warning signatures. Replacing them with the corrected preview would change the proposals that the server must replay.

The existing POST/PUT save routes repeat the same preparation. Incomplete review produces HTTP 409 with `preparation`; changed/no-longer-applicable signatures produce HTTP 409. Other invalid inputs fail with HTTP 400. Known hidden corrections are stored in the frozen source snapshot; editable corrections are stored in its override map. Both survive reopening and export. Import validates native types and own-scope structural errors, but does not silently accept correction dialogs.

`ProfileEditor` uses this flow for every save. It retains native visibility, per-index inheritance and menus, shows native choices before any remaining structural blockers, and preserves unsaved edits after errors. Geometry-change and precise-Z checkbox warnings appear immediately; numeric edits are reviewed on Save. It retains accepted event choices until saving. No browser-supplied corrected values are trusted.

## Native change events

`native-setting-events.js` ports the relevant branches of `Tab.cpp:1573–1858`: prime-tower/smooth-timelapse and wrapping warnings in native nested order, prime-tower/precise-Z conflicts, clumping without a tower, enabling smooth timelapse, i3 printing by object, Simple-mode support-style reset, geometry-changing overhangs, first unsafe nonempty infill rotation, printer layer limits and long-cut-retraction risk acknowledgments. The separate SEMM nozzle synchronization follows `Tab.cpp:5095–5119`.

Pass `context.changedSetting` with `{scope,key,index?,previousValue?}`. Event choices precede passive dependency corrections. Returned `context.acknowledgedSettingEvents` suppresses the same event during that review flow; clear it on a new user edit. Native decline/no-op alternatives remain explicit. Material-sensitive support dialogs, virtual extruder-count resizing, GUI group reconstruction and other native event side effects remain unimplemented.

## Process correction submission for slicing

The selection endpoint exposes `nativeProcessSettings` in addition to editable display settings. `embeddedProjectSelection` exposes the corresponding defensive snapshot from native project settings. `processSettingsSelection` combines this raw source with visible edits and verifies `context.processCorrectionDecisions`; `processSettingsState` supplies `correctionPlan` alongside dependency fields.

`acceptProcessCorrectionChoices(resolved, overrides, decisions, context)` accepts exact reviewed `{id,signature,choice}` objects. It returns `{overrides, processCorrectionDecisions, selection, remaining}`. Accepted editable changes become ordinary overrides. The helper then recomputes only the remaining source-derived hidden changes against those updated visible values. Their new exact decisions are retained as `project.processCorrectionDecisions`, so strict editor normalization never accepts a hidden key. A stale source or injected decision is rejected. Clear decisions whenever ordinary settings or selected presets change.

Multipart `POST /api/jobs` accepts the additional JSON field `processCorrectionDecisions` (at most 128 decisions; request field size remains 1 MB). The server resolves presets, validates ordinary overrides, recomputes native proposals and applies accepted changes before structural preflight and CLI profile creation. The job records the decisions. Calibration uploads reject nonempty decisions and use their generated native settings instead.

Native project requests carry the same array at the top level. The service validates it against the complete normalized effective settings and trusted catalog context before generating the archive. This covers both installed-catalog and embedded-native workflows; `/api/projects/export` also includes accepted native changes in its actual bytes. Original snapshots and ordinary overrides remain unchanged. Native preset legacy scalar arrays and canonical project scalars compare according to their declared native type, preventing repeated corrections or false signature mismatches.

Four API tests exercise successful multipart output, cleanup after missing/stale/forged decisions, catalog-native slicing, and embedded-native export/slicing. Nine client-state tests cover raw snapshot preservation, editable/hidden partitioning, decline behavior, serialization and equivalent native shapes. These use local HTTP fixtures and fake slicing; they establish request semantics, not native engine or hardware parity.

## Structural validation

`validateNativeConfiguration(selection, {underCli:true, scalingFactor:0.000001})` returns `{valid, errors, provenance, coverage}`. It ports the structural branches in [PrintConfig.cpp:10337](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintConfig.cpp#L10337): layer heights, minimum filament/nozzle diameters, shell counts, firmware retraction and wipe, valid closed enums, positive flow/clearance values, CLI vase restrictions, and nozzle-dependent line widths. It also checks numeric bounds for known profile members. Native normal and large-printer coordinate scales are supported.

Percentage line widths use the largest nozzle as the base. Ordinary widths are limited to five times the largest nozzle; bridge width is limited to the smallest nozzle. The multiplier comes from `libslic3r.h:68`. Native UI firmware/wipe prompts and structural validation differ: firmware retraction plus any wipe is rejected by `FullPrintConfig::validate`, even when retract-before-wipe is 100%. Keep the error visible rather than inventing another correction.

Unknown/project-only settings, config migration, geometry, layer scheduling and G-code expansion remain native-engine work. Profile schema normalization continues to validate API input types, closed enums, supported keys, and prohibited host scripts. This helper does not replace those checks.

## Evidence

The native helper tests cover hidden vase correction, decline behavior, injected values, stale proposals, duplicate/cross-scope decisions, immutable data, native shapes, ordered event branches, exact structural boundaries, CLI versus GUI vase behavior, multi-nozzle percent widths and firmware/wipe conflicts. Custom-preset catalog and HTTP tests prove durable hidden corrections, API rejection, changing proposals, automatic rules and warning acknowledgment. All 31 backend/helper tests pass, including eight existing CRUD regression tests. The 21 ProfileEditor browser tests include safe signed submission, hidden vase values, structural minimum nozzle rejection, stale decisions, and an immediate geometry warning that remains accepted until Save. Installed Prusa MK4, Bambu X1 Carbon and Bambu H2D defaults pass a read-only structural smoke check. No physical printer was connected.
