# Milestone 25 — native Cut to parts

Baseline: installed OrcaSlicer **2.4.2**, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`, repository `5050dab` plus the working tree. Full parity remains incomplete.

[Cut to parts](CUT_TO_PARTS.md) now retains upper/lower pieces as one native family using original native cutting and tessellation. It preserves linked instances, helper volume roles, part order, native frames and settings. The dialog enforces original mutually exclusive options and applies one Undo transaction. Native geometry output uses bounded processing, validation, cancellation and explicit failure handling.

Seven original-function references agree exactly on cap geometry and instance reset, including tilted/mirrored and modifier cases. Rebuilding the independent oracle reproduced every captured result unchanged. The actual browser exports one linked native family with four retained parts, then installed OrcaSlicer slices both full-height10mm instances into50 layers.

## Validation

| Command | Result | Evidence |
|---|---|---|
| `npm test` | 962 passed, zero skipped | `/private/tmp/orca-m25-final-unit.log` |
| `npm run build` | Passed | `/private/tmp/orca-m25-first-build.log` |
| `npm run test:e2e` | 274 passed, zero skipped | `/private/tmp/orca-m25-all-browser.log` |
| `npm run test:native` | 240 passed, one failed, zero cancelled/skipped | [Full native log](NATIVE_VALIDATION_M25.log) |
| Focused original kernel and malformed input checks | Two passed, zero skipped | `/private/tmp/orca-m25-cut-native-geometry.log` |
| Isolated actual-browser cut workflow | One passed, zero skipped | `/private/tmp/orca-m25-cut-native-browser.log` |

The complete `npm run test:e2e:native` run finished **67 passed, two failed, zero skipped** ([full log](BROWSER_NATIVE_VALIDATION_M25.log)). The sleep-interrupted machine-variant case passed unchanged in focused validation (`/private/tmp/orca-m25-sleep-followup.log`). The second-material-slot save also crossed its10-second UI assertion deadline: native preparation took6.72seconds and the save request was still pending. As in M24, the test now waits for and asserts the actual save response before checking dialog closure; all three native variant workflows pass (`/private/tmp/orca-m25-variant-save-response.log`), retaining every stored/exported value assertion. Both original failures remain recorded; this is not a clean full-suite result. Its machine-variant case was interrupted by documented623-second clamshell sleep at09:58:53–10:09:16 local time, exceeding the existing120-second test deadline. The [power log](M25_SLEEP_INTERRUPTION.log) and trace in `/private/tmp/orca-implementation/m25-sleep-browser-evidence` are retained. A temporary process wake assertion reduces ordinary idle sleep; it does not claim to override closing the lid. The machine-variant assertion was not weakened.

## Strict motion evidence

The new four-run Cut-to-parts test passes in the complete native run: all original/web slices match4,409 motion commands,50 layers and two footprints. Its earlier focused attempt differed at1,080 commands even between identical original-reference input; those inputs, outputs and hashes remain in the [durable failure record](cut-to-parts-repeatability.json) and archive. This single passing run does not establish general motion repeatability.

The full native suite failed its existing translation-only linked-edit comparison with10,556 differing commands. That failure remains strict and is recorded alongside the successful new geometry checks. No comparison tolerance was broadened and no test was skipped. Prior export and XL SIGBUS failures also remain historical unresolved issues.

## Remaining parity

The new `geometry.cut-to-parts` inventory unit remains partial. Native interactive gizmo appearance, broader cut/paint behavior, large-model prompts, native desktop acceptance and arbitrary slicing determinism remain open. macOS was locked when direct native UI inspection was attempted. No printer was contacted and no physical print began.

## Build isolation correction

Promotion preflight stopped before copying app files because the repository arrangement binary already matched M25 instead of the expected M24 helper. Inspection found that the older cut development stage inherited a `native/build` symlink to the repository. Its native build had therefore written the exact tested M25 binary and paired manifest early; M24's live snapshot also contained this newer, compatible helper. The application source and APIs were still M24. The link was moved aside and replaced by an independent build directory. The M24, M25 and M26 integration stages have independent helper output directories. Promotion accepts only the original pair or this exact validated M25 pair, and verifies every declared adapter source hash.

## Repository promotion

All39 promoted source, test, documentation and helper files matched the accepted stage hashes. The repository subsequently passed962 unit/API checks without skips and built successfully (`/private/tmp/orca-m25-promoted-unit.log`, `/private/tmp/orca-m25-promoted-build.log`). Parity consistency and whitespace checks passed. The old stage-specific CMake cache was preserved at `/private/tmp/orca-implementation/m25-native-build-cache`; the repository helper directory now contains only its verified binary/manifest pair so a future native build can configure against the repository source.
