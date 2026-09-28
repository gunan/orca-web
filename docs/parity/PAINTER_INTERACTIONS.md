# Native painter interactions

Pinned OrcaSlicer 2.4.2 source `8500fcdccaa10b5099ac20d252af3a7c560046f1`, `GLGizmoPainterBase.cpp:657–718,724–748,816–825`, `GLGizmoFuzzySkin.hpp:29`, and painter header defaults define these controls:

- Left drag paints the chosen action; Shift drag erases. Right drag paints support blockers or avoided seams, erases fuzzy skin, and remains navigation in filament color painting. Pointer capture starts only on a normal-part hit and retains the pressed button during a stroke. Clipping caps do not accept paint.
- Ctrl/Command + wheel changes circle/sphere radius by 0.2 mm (0.4–8), height by 0.2 mm (0.1–8), fill angle by one degree (0–90), or gap area by 0.2 (0–5). Internal changes use native float rounding. Alt + wheel changes view clipping by 0.01 (0–1), starting from zero when clipping was off. Ctrl/Command takes precedence over Alt. Ordinary scrolling keeps camera zoom.
- Color brush direction can remain free or constrain the screen X/Y coordinate to vertical/horizontal strokes. A new stroke starts at the actual pointer. Misses break brush interpolation.
- Initial brush radius is 1 mm and height 0.2 mm, matching the source defaults. The browser cursor test was updated for this intentional correction.

Three unit tests and three browser interaction scenarios cover button/channel states, Shift erase and local undo, modifier wheel values and zoom exclusion, and constrained stroke coordinates. Existing group painting, clipping, cursor and channel-preservation tests remain applicable. These interaction checks do not certify desktop pixel equality or every native shortcut. Fill hover feedback is tracked separately.
