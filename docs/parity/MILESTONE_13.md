# Milestone13: native preview data, text precision and shrinkage

Baseline: installed OrcaSlicer2.4.2, pinned source8500fcdccaa10b5099ac20d252af3a7c560046f1; repository5050dab plus this working tree. No printer contacted. No broad feature is newly marked verified.

## Validation

| Command | Result | Log |
|---|---:|---|
| `npm test` | 552 passed,0 skipped | `/private/tmp/orca-m13-final-unit.log` |
| `npm run test:e2e` | 191 passed,0 skipped | `/private/tmp/orca-m13-final-browser.log` |
| `npm run test:native` | 118 passed,0 skipped | `/private/tmp/orca-m13-final-native.log` |
| `npm run test:e2e:native` | 16 passed,0 skipped | `/private/tmp/orca-m13-final-native-browser.log` |
| `npm run build` | passed | `/private/tmp/orca-m13-final-build.log` |

Fixture-backed browser and installed-native suites are separate. Temporary AC system-sleep prevention kept long tests from being interrupted by the Mac's maintenance sleep; no display/security or persistent power settings changed.

## Changes and evidence

- [Preview inspector](PREVIEW_INSPECTOR.md) adds bounded raw-source context, native role palette and visibility toggles without moving the command cursor. [Scalar modes](PREVIEW_SCALARS.md) add exact tagged Height/Width and commanded Flow, with native color ranges and independent C++ references. Actual Flow, layer/per-role planner times and volume rendering remain open.
- [Native emboss metadata](NATIVE_EMBOSS_METADATA.md) retains font/shape/frame data, embedded SVG and local mesh precision. Preserving separate build/component matrices matches13,743 planar and12,030 surface reference motions; multiplying matrices or flattening vertices was observably different. Rewritten topology requires explicit loss consent with cancel/undo/stale-state checks. Regeneration is not implemented in this milestone.
- [Shrinkage initialization](../native-shrinkage-initialization.md) works around the pinned CLI's fresh Print::apply path using a private second native plate, leaving original mesh vertices unchanged and publishing only plate1. Project and STL paths reproduce all9,217 motions in the genuineGUI98% reference. [Workflow acceptance](../shrinkage-workflow-acceptance.md) includes real browser custom-preset selection and independent temperature/PA/flow checks. Raw3MF imports and additional GUI variants remain open.
- [Native image assets](../native-thumbnail-assets.md) retain exact bounded PNG bytes and native cover metadata when appearance is unchanged; geometry/material edits omit stale images and Undo restores them. Picking images are retained in web JSON only because exported IDs change. General auxiliary files, regenerated images and GUI reopening remain future work.

## Failed probes retained

The first assets browser test matched two Save project controls; the test was scoped to the actionbar and then passed. An early malformed-image unit case accidentally mutated a shared Buffer view; it now copies bytes before corruption and the original-image cases pass. The preview source audit found native --export-slicedata must precede --slice; putting it afterward silently produced no cache. Two scalar browser expectations had an incorrect final float digit and an unsuitable disabled-option matcher. Those assertion/probe corrections did not replace native runtime behavior. All final full suites above pass.

The two actual GUI text fixtures were generated earlier on this Mac. The original planar fixture extends off-bed; its native comparison independently translates the original XML into the bed and removes obsolete preset-compatibility plumbing. Desktop font/surface regeneration and broader screenshots remain unverified while the Mac is locked.
