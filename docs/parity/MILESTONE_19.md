# Milestone19: native configuration, Cut and scalar Preview

Baseline: installed OrcaSlicer2.4.2, source8500fcdccaa10b5099ac20d252af3a7c560046f1. Full UI and feature parity remains incomplete.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 737 passed,0 skipped | `/private/tmp/orca-m19-final-unit.log` |
| `npm run test:e2e` | 242 passed,0 skipped | `/private/tmp/orca-m19-final-browser.log` |
| `npm run test:native` | 198 passed,0 skipped | `/private/tmp/orca-m19-final-native.log` |
| `npm run test:e2e:native` | 37 passed,0 skipped | `/private/tmp/orca-m19-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m19-final-build.log` |

## Implemented and compared

- [Native preset configuration](../native-extruder-variants.md): original native JSON parsing, inherited system-preset normalization and separate archival/selected physical-nozzle values. Inactive variants survive export and material-slot expansion. The native configuration helper is now an explicit startup/test prerequisite documented in the root README.
- [Configuration lifetime](../native-config-lifecycle.md): owned shutdown/cancellation, bounded request/cache limits, binary-content identity before cache reuse and after execution, preserved HTTP operational status, and effective Arrange settings.
- [Model Cut](NATIVE_CUT_CLIPBOARD.md): independent model clipboard, deletion Undo, processed-cut family decisions, native connector deletion and final-volume settings promotion. Ctrl/Command X is exported in the native shortcut table.
- [Seven scalar Preview views](NATIVE_SCALAR_PREVIEW.md): Speed, Actual speed, Fan speed, Temperature, Pressure advance, Acceleration and Jerk. Source-defined whole-file ranges are independent of the current layer; older helpers disable unavailable modes. Native vertex color bytes reach the original shader without an intervening lossy color conversion.
- [Native calibration configuration](../native-calibration-config.md): archive/effective token binding and original Bambu/compatible layer, role and wipe tags. Real X1C temperature, pressure-advance and flow jobs pass; no global gcode_comments override is used.

Native configuration acceptance compares582H2D Standard/Standard motions,582H2D Standard/High Flow motions and615J1 motions exactly between archive and selected configurations. The unchanged XL printable mask correctly rejects nozzle3 with native exit188. The separately staged negative XL run earlier encountered SIGBUS; that diagnostic is retained in the configuration report. The actual repository focused run and complete198-test run both pass the explicit exit188 assertion. These are synthetic native-project fixtures derived from a genuine GUI cube, not newly captured H2D GUI sessions.

Scalar evidence includes812,588 original vertex colors,448 synthetic colors and5,376 GPU comparisons at the unchanged1e-6 tolerance. The original processor has undefined pressure advance before a recognized setter; the helper exports null/gray and excludes it from ranges. This deliberate defined behavior is not claimed as byte equivalence to uninitialized native memory.

## Regression diagnostics and remaining scope

The first M19 unit run passed712/713. The old Prusa admission/queue fixture used an empty catalog and could no longer reach its intended queue assertion after native configuration became required. It now supplies a real archived native settings fixture and retains the queue assertion. The focused check and complete737-check run pass. Diagnostics remain in `/private/tmp/orca-m19-initial-unit.log` and `/private/tmp/orca-m19-prusa-queue-rerun.log`.

The first complete browser/native run passed36/37. The nine-specimen flow calibration had already sliced and saved its explicit result when browser interaction exceeded the120second overall deadline while the full4worker browser suite and native suite also ran. The trace is retained at `/private/tmp/orca-implementation/m19-flow-timeout-trace.zip`, with the initial log at `/private/tmp/orca-m19-initial-native-browser.log`. The complete browser/native suite was rerun separately and passed37/37 without changing assertions or timeouts; the same flow case completed in33.1seconds. Preview performance remains under investigation and is not certified by this rerun.

Native configuration does not yet implement every user-preset inheritance/compatibility expression or dedicated physical-nozzle mapping control. The next audit demonstrated that saving a custom active H2D filament value can replace an inactive alternative; its fix remains staged separately. Cut still combines some multi-object confirmations and needs linked-instance edit propagation. Settings/layer clipboards, Fill and native tool-marker work are staged but are not part of this milestone. Exact UI/layout acceptance and fresh native GUI captures remain outstanding while the desktop is locked. The saved surface-text exact-motion mismatch remains open. No physical printer was contacted.
