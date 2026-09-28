# Native project attachments and attribution

Baseline: installed OrcaSlicer2.4.2 and source8500fcdccaa10b5099ac20d252af3a7c560046f1. Source contracts: Auxiliary.hpp66–75; Auxiliary.cpp921–930; bbs_3mf.cpp2754–2798,5945–5950,6810–6840,8519–8582.

Native `Auxiliaries/` file bytes survive web JSON and native3MF export, including unknown imported categories, nested paths, Unicode names and root-level files. Root cover/small/middle relationships retain their referenced auxiliary files. Missing cover references and DesignerCover files are reported. Files remain opaque in the server; no external resources are fetched or general files extracted by the web implementation. Native slicing extracts them only in each isolated native job.

The Project page exposes native categories Model Pictures, Bill of Materials, Assembly Guide and Others. Their add-file extensions match the pinned native dialog. Download retains bytes; rename preserves file type and cover references; deleting the named designer cover also removes its derived cover images, as native does. These edits participate in project Undo/Redo. Reads that complete after another document edit are rejected instead of attaching to changed state. Static raster pictures have bounded header validation before preview; other imported content remains download-only.

Native model metadata retains Origin, DesignerCover, Copyright, License, model/region and profile attribution fields. The UI edits copyright, origin, profile title/description and the native license choices; unknown imported license strings remain available. Names, author and project description use existing controls. It does not synthesize creation/modification timestamps or designer user IDs, matching native privacy behavior. Newer/unknown arbitrary metadata is not claimed preserved.

Limits:256files,32MiB perfile,64MiB total. Paths cannot traverse, escape the Auxiliaries root or collide under Unicode normalization/case-insensitive matching. Canonical base64, native metadata bounds and existing whole-project/ZIP limits apply. Unsupported upload types do not overwrite existing files. Empty imported files can be retained; native may discard them on re-export.

Seven unit cases cover byte retention, JSON/native relationships, supported uploads, rename/delete/history, missing resources, malformed paths/payloads, Unicode collisions and metadata bounds. An installed-native slice/re-export retains two text attachments with Unicode names and attribution while matching all10,989 independently captured GUI motions. All three integrated browser workflows pass, including stale asynchronous reads. Native GUI attachment editing, creating/resizing a new cover image, texture resources outside Auxiliaries, and arbitrary new metadata remain incomplete.


Set-as-cover generation is now integrated and tested; see [Native project covers](parity/NATIVE_PROJECT_COVERS.md). Earlier notes describe the initial attachment increment; current remaining gaps are recorded in the feature tracker.
