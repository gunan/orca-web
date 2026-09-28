# Shrinkage workflow acceptance

Pinned native engine: OrcaSlicer 2.4.2 (`8500fcdccaa10b5099ac20d252af3a7c560046f1`). No printer was contacted.

The native browser regression creates a saved custom filament with 98% XY and Z shrinkage, selects it in the actual UI, imports an ordinary STL, and restores its captured GUI placement. A custom process supplies the captured GUI's 0.2 mm layers, 70 mm/s outer wall and disabled prime tower. The normal `/api/jobs` path returns 102 layers ending at Z 20.4 mm. All 9,217 G0/G1/G2/G3 motion commands exactly match `native-gui-shrink98-2.4.2.gcode`; preset names and nonmotion headers are excluded from comparison. The reference came from the actual native GUI, as documented in that fixture's provenance.

Three real API/native calibration regressions exercise the saved 98% material:

- Temperature uses the actual compensated 102 layers, with all 102 commands checked against the pinned interpolation schedule. The endpoint publishes one target output and removes private work.
- Pressure advance uses 56 compensated layers, with every command checked against the native `start + floor(Z) * step` schedule.
- Flow ratio uses the native project endpoint; all nine labelled specimen wall E/mm ratios match their planned independent multiplier within 0.3% after initialization.

A positive server capability suppresses only the historical fresh-load CLI diagnostic in the layer editor. Without that explicit capability, the diagnostic remains. Unrelated warnings are always retained. The raw installed single-apply CLI discrepancy remains a documented and tested diagnostic; it is not a limitation of the initialized web workflow.

Evidence before capability UI integration: native browser 1 passed (8.1 seconds), native calibration 3 passed (13.36 seconds), warning-filter unit 1 passed. The browser test now additionally checks advertised capability and 102-layer editor texture without the obsolete warning; this final assertion needs the capability patch and a rebuilt frontend before its confirmation run.
