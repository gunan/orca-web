# Native keyboard command parity

Baseline: OrcaSlicer 2.4.2, revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

`native-shortcuts.json` exports all 95 entries in the pinned `KBShortcutsDialog::fill_shortcuts` help table, including platform variants, repeated commands in distinct contexts and configurable mouse gestures. It records source line numbers, the complete file SHA256 and implemented binding versus pending/tool-specific interaction. These are command entries, not 95 distinct features or a completion percentage. Additional key predicates live in the actual GUI handlers; the help table alone is not a sufficient implementation specification.

Run `node scripts/export-native-shortcuts.mjs /path/to/pinned/OrcaSlicer` to reproduce it. The script rejects source hash drift. The web editor's corresponding command registry is `shared/native-shortcuts.js`.

## Implemented increment

- Ctrl/Command O opens a project; Ctrl/Command I imports models. The previous O binding incorrectly imported geometry.
- Ctrl/Command N uses the existing unsaved-document flow. S/Shift-S download a saved project; browsers do not expose native mutable local save-file ownership. R slices only when the current scene is ready; G downloads only a ready job.
- Ctrl/Command D now deletes all model objects across all plates, as native does. The previous web binding duplicated one object. Plate definitions, presets and project attachments survive; per-plate custom G-code, generated calibration state and stale plate images clear. One Undo restores the entire state. Duplicate remains a separate one-copy clipboard command. Ctrl/Command K opens the native-style Clone dialog with a bounded copy count and optional separate Auto arrange.
- Ctrl/Command C and V copy/paste selected model objects or parts in Prepare. The internal model clipboard preserves native geometry and metadata independently of later edits; focused text fields retain their own clipboard behavior. Settings/layer-row clipboards and operating-system model exchange remain open.
- Ctrl/Command X cuts selected Prepare model objects or parts to the independent model clipboard, with native cut-family confirmation behavior and one deletion Undo step. See [Cut clipboard behavior and limits](NATIVE_CUT_CLIPBOARD.md). This command is distinct from the geometry Cut tool.
- Prepare tool keys M/R/S/F/C/T/E/P/H select or open the corresponding implemented tool with the same enablement checks as its toolbar control. Arrows move selected objects/parts by 10 mm in world XY; Shift uses 1 mm. Ctrl/Command 0–6 selects the matching existing camera view; 0 fits the bed.
- '?' opens shortcut discovery. Focused fields retain local typing/selection/undo. Modal dialogs retain their own keys and Escape; global Delete/Undo/tool keys cannot edit the background project. Prepare commands do not mutate a hidden scene while the user is in Preview, Project or Device.

The browser may reserve OS/window shortcuts before delivering an event. Native camera fitting itself remains covered by the existing camera feature limitations. Preview navigation and additional Prepare keys are documented in [Preview shortcuts](PREVIEW_SHORTCUTS.md) and [Prepare keyboard behavior](NATIVE_PREPARE_KEYS.md). Native view toggles, settings/layer clipboards, Fill, preferences, 3Dconnexion and remaining native menus still need implementation/acceptance; the catalog exposes them explicitly.

Focused tests exercise actual file choosers, saved downloads, two-plate Delete All/Undo, modal/input guards, world-space nudge, camera and tools, plus actual fixture-backed slicing/export. The initial nudge test assumed an origin placement; corrected assertions compare displacement from the actual imported position. No native GUI keypress acceptance was claimed while the desktop is locked.
