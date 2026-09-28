# Continuous native facet painting

The browser circle and sphere tools join pointer samples with finite 2D and 3D capsules. The raycaster samples the intervening screen path at a maximum one-pixel step, retains source-facet transitions, and breaks continuity at a missed or different part. Runs on one planar source triangle reduce to their endpoints. This follows the pinned native `get_projected_mouse_positions` and `DoublePointCursor` workflow; it does not claim an identical native mesh simplification strategy.

Native reference: [GLGizmoPainterBase.cpp at 8500fcd](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoPainterBase.cpp#L470) and [TriangleSelector.cpp capsule implementation](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/TriangleSelector.cpp#L2072).

The support painting viewport uses the native default neutral base (0.8, 0.8, 0.8), green enforcer (0.5, 1, 0.5) and red blocker (1, 0.5, 0.5). User-specific native render-color preferences are not imported. The legend uses the application text theme instead of a pale fixed color.

Evidence on OrcaSlicer 2.4.2:

- `node --test tests/unit/brush-strokes.test.js`: three tests pass for finite geometry distances, continuous circle/sphere region coverage, bounded screen sampling, planar compression, and miss breaks.
- `node --test tests/native/brush-strokes.test.js`: one real native test passes through sanitized project generation. A two-endpoint painted strip produces 322 second-material wall segments on 66 consecutive layers and consumes 55.55 mm of that filament.
- `tests/e2e/brush-strokes.spec.js` covers a sparse actual mouse drag, checks the saved subfacet geometry has no mid-stroke gaps, and checks support-legend text contrast. The browser test passes after integration. The nine earlier painting cases also pass in the same built app. The screenshot confirms an unbroken green strip on the neutral base and a readable legend.

Each pointer event is bounded to 8192 ray samples, and refinement retains the existing node budgets. Native GUI comparison, clipping caps, view-aligned clipping, brush cursor graphics, and automatic color mapping remain separate incomplete work. These results do not certify full painting or UI parity.
