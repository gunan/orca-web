# Preview keyboard and slider interactions

This increment implements the pinned native Preview bindings and slider-state rules. It remains part of a partial viewer: the existing spatial playback range is not yet identical to the entire native event/visibility range.

Sources are [OrcaSlicer 8500fcd](https://github.com/SoftFever/OrcaSlicer/tree/8500fcdccaa10b5099ac20d252af3a7c560046f1): `KBShortcutsDialog.cpp:300–312`, `GLCanvas3D.cpp:3848–3887`, `GUI_Preview.cpp:508–527`, `IMSlider.cpp:179–201,449–473,1607–1684`, `GCodeViewer.cpp:1766–1821`, and `AppConfig.cpp:202–203`. Source hashes are retained with the independent fixture.

Implemented interactions:

- Up/Down changes the last selected layer thumb. Shift or Cmd/Ctrl changes the step from one to five. Crossing the other thumb moves it too; values clamp to the valid layer range.
- Left/Right steps by G-code command, grouping consecutive arc/acceleration subdivisions with the same original source ID. At a horizontal endpoint, it enters the previous/next layer by one layer even with the five-step modifier. Home/End goes to the current spatial command-range endpoints.
- L toggles one-layer mode. Its initial saved value is the native midpoint, a manually chosen upper thumb is retained, switching off restores the full layer range, and switching back restores the saved layer. The lower thumb is disabled while one-layer mode is active.
- C toggles the raw G-code inspector. Tab from the canvas/body returns to Prepare, without applying Prepare geometry commands. Tab from normal form controls retains browser focus navigation.
- Wheel events over a slider move it; wheel elsewhere retains camera/browser behavior. The actual native macOS predicate uses Raw Control for five steps and reverses Shift scrolling. On other platforms Cmd/Ctrl or Shift multiplies the step by five. This is recorded because the native keyboard-help label does not explain the macOS distinction.
- Text/select editing, composition, open dialogs and already handled events keep their own keys. Alt combinations remain reserved for browser/window navigation. The keyboard-help dialog now includes Preview entries.

The independent C++ fixture embeds the original `IMSlider` setters, clamp methods and one-layer switch method, plus the actual native arrow/Home/End handler body. Only GUI accessors are stubbed. All 44 transition cases compare exactly to the JavaScript state helper. Regeneration verifies the pinned commit and source hashes. The source-derived snippets retain the upstream AGPL-3.0 licensing, as documented for the native workers.

Four unit tests cover those 44 cases, modifiers/guards, wheel platform behavior, clamp/remember semantics and source-command grouping. Three browser tests cover layer/range boundaries, single-layer restore, command inspection, modal/input guards and returning to explicitly positioned Prepare geometry without mutations. The existing 15 Preview browser checks still pass. A separate actual-native browser test generates the retained GUI fixture through the compiled native worker and verifies that a shortcut advances over a complete acceleration group, with the exact native vertex ID and source line.

One old regression test used the browser's default Home behavior to change a focused layer `<input type=range>`. Native Home targets the horizontal slider regardless of active layer thumb. That test now explicitly fills the layer value, preserving its original layer-filter assertion; new tests separately verify the native Home binding.

Remaining differences: the native viewer defaults to top-layer-only playback and its slider range includes hidden intermediate vertices/events. The current spatial preview still plays the selected range and omits non-spatial events; command grouping is exact within that existing spatial range. Fully porting `ViewerImpl::update_view_full_range` and event/marker range semantics remains required before claiming complete native slider parity. Native pixel layout and independent desktop key-by-key acceptance are also pending. No unperformed GUI comparison is claimed.
