# Painting cursors

The pinned native painter renders a dashed circle at the brush radius, a world-space sphere, and two real mesh-section contours for a height range. Source: [`render_cursor_circle`, `render_cursor_sphere`, `render_cursor_height_range`](https://github.com/SoftFever/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/slic3r/GUI/Gizmos/GLGizmoPainterBase.cpp#L134).

The browser renders the circle perpendicular to the actual brush ray, with its radius in millimetres; the sphere remains isotropic regardless of model scale. Height contours come from the transformed source mesh at the actual hit Z and hit Z plus range height, clamped to model height. As in the native tool, height paint starts at the pointer by default. The explicitly labelled fixed-start option retains the earlier numeric-range workflow. Hovering changes only display geometry. Missed surfaces, generated clipping caps and leaving the canvas hide the cursor.

Two unit tests pass for world radius, projection plane, nonuniform model scaling, actual height contours, range clamping and source immutability. The browser test passes for actual ray-hit cursor state, screenshots of all three modes, no hover mutation, and saved height paint matching the displayed range. The complete thirteen-case painting browser set passes; all three cursor screenshots were visually inspected. Native slice evidence for the height painting algorithm is already recorded in advanced-painting.md; cursor display alone does not require a new slice claim.

Native-specific OpenGL tessellation, line width and pixel styling are not certified identical. Right-button painting and modifier-key shortcuts remain separate incomplete interactions. Native GUI visual comparison is still required.

Multipart cursor/painting integration and remaining interaction gaps are recorded in [OBJECT_GROUP_PAINTING.md](parity/OBJECT_GROUP_PAINTING.md). The user-facing native height brush now uses the 0.1–8 mm range across visible normal parts of the selected object.
