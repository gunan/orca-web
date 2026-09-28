# Physical nozzle purge tables

The native project stores **N × F × F** raw volumes, ordered by physical nozzle, then source filament row, then destination filament column. It also stores one multiplier per nozzle and F load/unload pairs. This package preserves that structure through strict project preparation, native 3MF export/import, material insertion/removal, and the Prusa archive importer's current-material expansion.

The dialog selects a physical nozzle (Left/Right for two, numbered for larger configurations). Like the installed native dialog, it displays `round(raw × multiplier)`; a displayed edit writes `round(display / multiplier)`, or zero when the multiplier is zero. Multiplier edits retain raw table values. The editable range is 0–3 and displayed volumes are limited to 20,000 mm³. Reset explicitly sets the selected raw table to 280 mm³; it is not native color-based automatic calculation. A malformed matrix is reported instead of being replaced with a default. Known unused native four-material defaults are canonicalized to the active dimensions.

Material insertion keeps every existing cell in every nozzle table and initializes new transitions from the first load/unload pair, as native PresetBundle does. Removal retains the selected rows/columns in every table. The UI prevents fewer material slots than physical nozzles. Catalog callers pass the resolved physical nozzle count; embedded projects derive it from their complete settings. This change does not implement automatic slot creation when switching to a multi-nozzle catalog printer.

## Source

Pinned OrcaSlicer revision `8500fcdccaa10b5099ac20d252af3a7c560046f1`:

- [PrintConfig.hpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PrintConfig.hpp), `get_flush_volumes_matrix`, lines 2133–2160: contiguous physical-nozzle slices.
- [PresetBundle.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/PresetBundle.cpp), `update_multi_material_filament_presets`, lines 5183–5255: minimum material count, table preservation, new pair defaults, new-nozzle multiplier 1. The shared resize helper also explicitly handles a nozzle-count-only layout change instead of retaining an ambiguous old layout.
- [WipeTowerDialog.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/WipeTowerDialog.cpp), `BuildTableObjStr` and `GetFlattenMatrix`: separate tables/multipliers. Installed `Resources/web/flush/WipingDialog.html`, lines 469–488 and 570–616: displayed/raw conversion and multiplier editing. `FlushVolCalc.cpp` defines maximum 20,000 mm³.
- [GCode.cpp](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/GCode.cpp), lines 7810–7841: use the destination physical nozzle's prior material, table and multiplier; first use of a nozzle has zero purge; subtract grab-purge volume and clamp to zero.

## Evidence

32 focused and adjacent unit/service tests and 4 browser tests pass. Three native tests pass: two installed-OrcaSlicer 2.4.2 slice/re-export checks and one actual pinned Prusa importer check. The native fixture starts with the independently captured `native-gui-cube-2.4.2.3mf` complete configuration, explicitly creates a two-nozzle test printer, and places four small solids with material mapping `[1,1,2,2]`. This is a derived test configuration, not a GUI-saved J1 or XL project.

Twelve executed native tool-change macros show 100/500 mm³ tables produce 41.5752/207.876 mm of 1.75 mm filament. Halving nozzle 2's multiplier changes only its purge lengths; doubling nozzle 1's raw table changes only its purge lengths. Model wall motions remain identical. Installed native post-slice 3MF export retains both tables, multipliers and assignments. A second native check expands to five materials, retains all old table cells, and re-exports both 5×5 matrices. The importer check opens a synthetic three-material Prusa assembly against a two-material/two-nozzle current configuration, grows both tables, and preserves negative-volume and material assignments.

## Remaining native parity

Color-derived automatic purge calculation (`CalcFlushingVolumes`, `GenericFlushPredictor`, support-filament special rules) is separate and remains incomplete. A fresh GUI-saved multi-nozzle reference is also pending; the Mac was locked during this work.

Initial sparse bundled J1 and XL5T source-profile probes failed with installed CLI SIGSEGV. The initial J1 probe also exposed an empty post-process-list rejection before slicing. These failures were not counted as acceptance. A debugger launch was denied by macOS attach permissions. No printer was contacted. Bundled H2D additionally needs exact source extruder-variant resolution: its process `bridge_speed` is a multi-value scalar in the older web schema, and filament values have variant arrays. The current wrapper must retain those full values and report unsupported conversion; truncation is not acceptable.

Bounds remain explicit: at most 64 materials, 64 physical nozzles, 262,144 matrix entries and 4 MiB of serialized matrix values. Other native setting vectors retain their existing 1,024-entry/64 KiB limits. These are web resource limits, not claims of tested 64-nozzle hardware support.
