# Fresh native GUI cube reference

Generated on 2026-09-27 by opening the repository's CLI-exported `orca-2.4.2-cube.3mf` in installed OrcaSlicer 2.4.2 through the native Open dialog, then Save As to a fresh temporary filename. No geometry/settings edits preceded this GUI export. The GUI rendered the 20 mm cube and retained layer height 0.16 mm. No hardware was contacted.

Retained artifact: `native-gui-cube-2.4.2.3mf`. Original temporary output `/private/tmp/orca-native-gui-cube-20260927.3mf`.

SHA256 `6e0a3018b7d021917d16572171210d630d2ba166b8ee4a6855160adc9a987c9a`; 24158 bytes. The native project contains GUI-generated thumbnails and plate/model settings. The web exporter does not yet claim lossless retention of all auxiliary assets.

A second actual GUI session reopened this saved project, clicked Slice plate, and exported `native-gui-cube-2.4.2.gcode` without edits. The native preview showed 125 layers through Z20.04, 1.38 m / 4.11 g filament and 45m38s total estimate. Original output `/private/tmp/orca-native-gui-cube-20260927.gcode`; 371060 bytes; SHA256 `807589cc0cb94d56e69ebe0ff7fff3a132a071cd1370cda39d29755be160062b`.

`tests/native/gui-export.test.js` imports the actual GUI project through the production strict project service, exports validated bytes, and slices those with the installed CLI. It compares all **10,989** G0/G1/G2/G3 motion commands and every layer Z against the independently captured GUI G-code. The positive result is scoped to this project; thumbnails, native regeneration, all auxiliary metadata and pixel equality are separate acceptance.

An earlier direct-CLI reference attempt failed with error239 because the GUI appends the archive name to customized preset IDs while retaining base-name compatibility metadata. The production service already strips preset compatibility plumbing from standalone embedded projects; no geometry or process setting was removed to obtain a pass. Fresh GUI metadata additionally exposed `filament_colour_type` and `filament_multi_colour`, whose typed coStrings definitions and defaults are now generated from pinned PrintConfig.cpp2473–2479. Unit/API/browser checks preserve these fields and reject malformed vectors. Root used CUA to create and visually inspect both native artifacts; automated tests consume retained files rather than claiming to automate desktop interaction.
