# Native parity tracker

`features.json` is the persistent source of truth for the version-pinned OrcaSlicer 2.4.2 comparison. Its initial 102 feature units cover major native workflows, not every setting key, printer capability, operating system behavior or upstream feature. Add missing units as the native inventory is inspected. A count of verified items is not a defensible percentage of all native functionality.

The original observations remain in [PARITY_AUDIT.md](PARITY_AUDIT.md) and the Prepare screenshots. The baseline repository revision is `5050dab`. Later implementation work must add its own evidence; regenerating reports cannot promote a status or erase the historical failures.

## Current milestone and exports

The latest focused delivery is [Core workflows 1](CORE_WORKFLOWS_1.md): printer setup, material/settings persistence, labeled tools, visible rotation angles and snapping, and frontend module organization. Its full validation passed 1,140 unit/API, 405 mock-browser and 91 installed-native browser tests. The broader native parity statuses remain unchanged.

[Milestone48](MILESTONE_48.md) adds original native volume inspection and zero-volume filtering. **1,140 unit/API,401 browser and90 browser/native checks pass**; build passes. Standalone native remains incomplete (330 passed,7 failed,3 cancelled on rerun). [Evidence, first-run timeout and remaining gaps](NATIVE_IMPORT_INSPECTION.md). Native parity remains incomplete; historical failures are retained.

The current **139-feature** inventory contains **2 missing,127 partial,8 implemented and2 verified** items. Counts are not a percentage of native parity. The two verified units remain installed-native invocation and supported-format G-code generation. Native GUI access allowed independent cube, text and shrinkage references; broader GUI acceptance remains incomplete. Device tests use fake servers and no physical printer has been contacted.

Subsequent work can exist in the working tree before its next full milestone run. Refer to individual feature documents and the latest recorded evidence instead of treating this page as certification of every uncommitted change.

- [Feature source/evidence](features.json), [CSV](features.csv), and [generated progress](PROGRESS.md).
- [Milestone48 results and limitations](MILESTONE_48.md).
- [Detailed Preferences inventory and regeneration](NATIVE_GRAPHICS_PREFERENCES.md#detailed-preferences-inventory).
- Earlier milestones: [47](MILESTONE_47.md), [46](MILESTONE_46.md), [45](MILESTONE_45.md), [44](MILESTONE_44.md), [43](MILESTONE_43.md), [42](MILESTONE_42.md), [41](MILESTONE_41.md), [40](MILESTONE_40.md), [39](MILESTONE_39.md), [38](MILESTONE_38.md), [37](MILESTONE_37.md), [36](MILESTONE_36.md), [35](MILESTONE_35.md), [34](MILESTONE_34.md), [33](MILESTONE_33.md), [32](MILESTONE_32.md), [31](MILESTONE_31.md), [30](MILESTONE_30.md), [29](MILESTONE_29.md), [28](MILESTONE_28.md), [27](MILESTONE_27.md), [26](MILESTONE_26.md), [25](MILESTONE_25.md), [24](MILESTONE_24.md), [23](MILESTONE_23.md), [22](MILESTONE_22.md), [21](MILESTONE_21.md), [20](MILESTONE_20.md), [19](MILESTONE_19.md), [18](MILESTONE_18.md), [17](MILESTONE_17.md), [16](MILESTONE_16.md), [15](MILESTONE_15.md), [14](MILESTONE_14.md), [13](MILESTONE_13.md), [12](MILESTONE_12.md), [11](MILESTONE_11.md), [10](MILESTONE_10.md), [9](MILESTONE_09.md), [8](MILESTONE_08.md), [7](MILESTONE_07.md), [6](MILESTONE_06.md), [5](MILESTONE_05.md), [4](MILESTONE_04.md), [3](MILESTONE_03.md), [2](MILESTONE_02.md), [1](MILESTONE_01.md). Their historical scope, counts, failures and access limitations remain unchanged.
- [Observed native preset keys](native-settings.json) and [setting-key CSV](native-settings.csv): 881 observed category/key pairs, 569 scoped controls (342 process, 115 machine, 112 filament), 537 observed editable keys. Declared preset keys are not the entire native UI schema.
- [Pinned native schema provenance and reproduction](../native-schema/README.md).

## Commands

Run these from the repository root:

```sh
node scripts/parity-report.js --check
node scripts/parity-report.js --write
node --test tests/unit/parity-tracker.test.js
```

`--check` validates the inventory and referenced files, prints counts, and writes nothing. `--write` performs the same validation and exports `docs/parity/features.csv` and `docs/parity/PROGRESS.md`. Exports are deterministic and should be committed with changes to the inventory. The script does not run feature tests and never infers success from a test file's existence.

The CLI also accepts `--root PATH` and `--inventory PATH` for validation of staged inventories. The module exports `readInventory`, `validateInventory`, `summarizeInventory`, `renderCsv`, `renderMarkdown`, and `writeReports`; `validateInventory` returns an array of error messages. `rootDir` determines the repository against which test references are checked and where reports are written.

## Status rules

| Status | Meaning |
|---|---|
| `missing` | The acceptance behavior is absent, even if a decorative control exists. |
| `partial` | Some behavior exists; full acceptance is unmet. Passing limited tests does not change this automatically. |
| `implemented` | Implementation is believed complete; recorded native acceptance is still outstanding. |
| `verified` | Every acceptance criterion has passed a documented comparison against the pinned native baseline. |
| `blocked` | A concrete unresolved dependency prevents further work; record the dependency in evidence and history. |

Priorities are `P0` for foundation or correctness blockers, `P1` for major workflows, and `P2` for secondary interactions. Priority is independent of implementation status.

No feature is verified merely because the test suite passes. At historical revision `5050dab`, integration tests used a fake executable and a zero-facet STL fixture; those baseline results validated only the limited process/API path. Milestone 01 replaced the STL with a real twelve-triangle watertight cube, strengthened mock tests, and added separate real-native and browser-to-native tests. The ordinary integration/browser suites use a fake slicing engine and, since Milestone19, the real native configuration helper. Their success alone does not establish native slicing/output equivalence. Earlier failed native probes remain in the evidence history and are superseded only by explicitly recorded later acceptance.

## Updating a feature

1. Keep the stable `id`; refine its acceptance criteria if comparison reveals additional behavior. When splitting a unit, retain a milestone explaining the relationship to the old ID.
2. Implement a real planned test or a reproducible manual protocol. `plannedTests` are work items, not executable placeholders. Do not add skipped, unconditional-pass, or mock-only tests and call the feature natively verified.
3. Add existing test or protocol paths to `testRefs`, with their actual type: `unit`, `integration`, `browser`, `mock`, `native`, or `manual`. Use repository-relative file paths. A fixture may be recorded but must be described as a fixture, not as an executed test.
4. Append evidence with `kind`, `result`, `source`, `summary`, `date`, and `revision`. Kinds distinguish code inspection, unit, integration, browser, mock, native and manual observations. Results are `observed`, `passed`, or `failed`; code inspection can only be `observed`. Identify exact command, fixture, engine version, outcomes and limitations in a durable referenced report. Keep previous records to preserve historical failures.
5. Set the current `status` and append a `history` event containing date, revision, status and reason. Add a top-level `milestones` entry for a completed tranche or a material verification result. If a later regression fails acceptance, return the status to `partial` or `blocked` and record the failure without deleting earlier passes. The optional repository `CHANGELOG.md` may describe the same milestone in prose.
6. Run relevant tests, `--check`, and `--write`; inspect the generated change before committing.

For `verified`, the latest appended native/manual acceptance attempt must pass: `native-test` evidence requires a native reference, while `manual-observation` evidence requires a manual reference. All references must exist. A later acceptance failure invalidates verification based on an older pass. This is a structural guard against accidental promotion, not proof that the recorded claim is true; reviewers must inspect whether every criterion is covered and whether evidence matches the current implementation. Unit, mock and browser checks remain useful but alone cannot establish native parity.

## Evidence and progress interpretation

`PROGRESS.md` separates current status counts, evidence record counts, passed evidence counts, distinct test-reference files and planned-only items. Counts can overlap: an integration test may use a mock executable, and one feature may have both historical failures and later passes. Historical evidence is not a fresh test run. Never add these columns together as a total of verified features.

Native visual/layout equivalence remains missing after Milestone 02, despite the real geometry and preview renderers. Native behavior must be tested with real fixtures, complete effective presets and recorded version information. Device workflows additionally require the same supported reference hardware and explicit authorization before sending physical printer actions. Full parity is only claimable after the agreed inventory is complete, every acceptance criterion passes, and platform/hardware scope is stated.

## Diagnostic artifacts

The recorded validation logs and screenshots are versioned. Large historical Playwright diagnostic ZIP archives referenced by earlier reports are retained only in the original development checkout and are excluded from Git. Their links are local evidence, not downloadable release artifacts. Native build caches, built worker binaries and application data are also excluded; reproduce workers with the documented recipes.
