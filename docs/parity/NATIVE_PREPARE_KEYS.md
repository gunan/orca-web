# Native Prepare keyboard behavior

Pinned OrcaSlicer2.4.2 source8500fcdccaa10b5099ac20d252af3a7c560046f1.

- `GLCanvas3D.cpp:3651–3688`: Command/Ctrl arrows multiply world camera axes by10mm (Shift1mm), then set Z to zero. The projected vector is not normalized; Up in a horizontal Front/Right camera does not move the object. The browser receives the actual camera transform after orbit/view changes. Repeated arrow-down events share one undo snapshot until key-up or window blur.
- `GLCanvas3D.cpp:3461–3482,4021–4027`:1 starts a500ms timer. A subsequent0–6 selects10–16;7–9 remain7–9. A lone1 selects1 when the timer fires. A lone0 is default/inherit. Unavailable slots leave the project unchanged. Modal editors and focused inputs keep their own typing; deferred material input cannot mutate a newly opened modal or hidden Prepare scene.
- `GUI_ObjectList.cpp:6575–6674`: material commands apply to selected whole objects or selected normal/modifier parts. Object changes update their parent setting, remove normal-part material overrides, and retain modifier overrides.0 resets whole objects to1, normal parts to their parent, and modifiers to inherited0. Source meshes, settings unrelated to material, painting and transforms remain intact.
- `GUI_ObjectList.cpp:6787–6843`:V sets all selected object groups to the inverse of the first selected object's printable state. It does not independently invert a mixed selection. Part selections remain unchanged.
- The earlier legacy Command/Ctrl Shift A deselect alias is removed. Native uses it for selection across all plates; that viewport/selection expansion remains pending. Escape and the Deselect all command remain available.

Seven unit tests and three isolated browser tests passed; the first browser assertion initially treated an omitted default material as an explicit1. The corrected assertion checks its effective slot. Browser checks cover actual camera movement, held-key undo, delayed two-digit material input, focus/modal guards, multiple-object updates, saved project state and printable undo. `tests/native-e2e/prepare-keyboard.spec.js` adds browser-keyboard→export→real-slice acceptance; its recorded result belongs to the next complete milestone.

The general Prepare selection/camera/transform features remain partial. Native Shift-key transitions while an arrow is held, PageUp/PageDown rotation, native Clone/clipboard, all-plate selection and remaining GUI camera/control layout are separate work. No fresh native GUI keypress observation was possible while the Mac was locked.
