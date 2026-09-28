# Active embedded preset labels

Baseline: installed OrcaSlicer 2.4.2, source `8500fcdccaa10b5099ac20d252af3a7c560046f1`.

Printer, Process and footer Print profile selectors now display the active embedded native profile name. Previously, an unmatched imported project displayed Loading presets indefinitely; when catalog IDs were retained it could display the installed profile name while slicing with different embedded settings. Disabled and loading states are now distinct. The tooltip explains that the displayed profile comes from the project. Switching explicitly to installed presets restores the catalog choices. The displayed labels do not modify IDs, settings or native exports.

Two regression cases fail on the unchanged preceding build: embedded projects with missing catalog IDs and with retained catalog IDs. Tests now verify all three selectors, native export after a layer-height edit, switching to installed presets and Undo. A third test distinguishes initial loading, a failed catalog request and successful reload. The focused suite also covers the existing native import/export and custom preset workflows: ten browser tests pass. Two existing browser/native project workflows now assert the embedded names and still generate actual native G-code.

[Before-fix failures](PRESET_LABELS_BEFORE_M29.log), [focused browser results](PRESET_LABELS_BROWSER_M29.log), [focused native-browser results](PRESET_LABELS_NATIVE_M29.log), and the [native-backed web screenshot](images/M29_EMBEDDED_PRESET_NAMES.png) are retained. The complete unit/API suite passes 978 tests and the production build passes. Full browser/native results are recorded by the milestone report once complete.

Pinned source `PresetComboBoxes.cpp` selects profile labels from the active preset (`PresetComboBox::get_preset_name`, `PlaterPresetComboBox::get_preset_name`, and `TabPresetComboBox::get_preset_name`). This change fixes the web's misleading active-profile state; it does not implement every native alias, modified suffix, dropdown grouping or embedded-preset editing workflow. Full native desktop visual comparison remains unavailable while the Mac is locked. These features remain partial.

The complete M29 suites passed 978 unit/API and290 browser checks. Native browser:71 passed,one repeated Preview idle failure; both preset-name native workflows passed. See [full results](MILESTONE_29.md).
