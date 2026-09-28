# OrcaSlicer GUI shrinkage reference

Captured through the installed OrcaSlicer **2.4.2 native GUI** on 2026-09-27. The root agent opened the attached 3MF, sliced it in the GUI, and exported G-code. No printer connection or print was started. The input was generated from a fresh native GUI cube export: 20 mm cube, one filament, XY shrinkage 98%, Z shrinkage 98%, first/other layers 0.2 mm; translated to [60,70,0].

The captured G-code contains 102 layers, ending at Z20.4. The fixture unit test checks every layer against the source-derived preview. Fresh CLI loading of equivalent inputs separately yields 100 layers through Z20; it remains a known pipeline discrepancy, not resolved by this GUI reference.

SHA-256:

- `native-gui-shrink98-2.4.2.3mf`: `bb07d7b8d85d59a94f440f721092342ee584bb6bb8aac5a75658010d3a4e2bd9`
- `native-gui-shrink98-2.4.2.gcode`: `79399a156dc3cc43279242e832db5a74dd5426228303ed3a6eeef8bcc220337e`
