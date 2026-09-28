# Native project render assets

Baseline: OrcaSlicer 2.4.2, pinned revision8500fcdccaa10b5099ac20d252af3a7c560046f1. The native archive paths and plate metadata follow bbs_3mf.cpp352–355,6129–6221,6550–6595. This is a bounded image-retention implementation, not full auxiliary-asset or texture parity.

Imported native plate images are retained as PNG bytes inside web project JSON. Unchanged plates export byte-identical normal/small/no-light/top images, the corresponding plate metadata, PNG content type, and package cover relationships. Selected-plate and reordered exports renumber image paths consistently. No external file or network resource is loaded.

A plate-appearance signature covers ordered geometry, transforms, visibility, printable state, part role, filament assignment/painting, material colors and bed shape. Selection, project name and process-only edits do not invalidate render images. Geometry/appearance edits omit stale images from native output; the original bytes remain in the web scene so Undo restores their availability. This signature detects accidental stale render data, not a malicious client's forged image. Imported images are not automatically regenerated after edits.

Native picking images encode original object/instance identifiers. Web export renumbers those identifiers, so original picking bytes survive web JSON but are not emitted or referenced as a valid native pick buffer. Slice caches, G-code, pattern bounding boxes, arbitrary attachments, textures and external image resources are not claimed preserved.

Each PNG is bounded to8MiB and4096×4096pixels; all retained images total at most24MiB across36plates. Validation checks signature, bounded chunk lengths, header dimensions, CRCs and complete IDAT/IEND structure. It does not decode pixels. Base64 must be canonical. Missing referenced thumbnails produce explicit import warnings; unsafe references and malformed asset payloads fail before export. Exported paths are generated internally.

Six unit/service tests cover original GUI bytes, JSON/native roundtrips, strict service validation, per-plate invalidation, selection/reordering, independent missing-resource diagnostics, unsafe paths, malformed CRC/chunks/base64 and resource limits. The browser workflow passes unchanged export, web save, edit invalidation and Undo restoration. A combined 19-test installed-native run passes the captured GUI cube (10,989 exact motion commands), planar/surface text precision and shrinkage initialization checks. Native GUI reopening and image regeneration after edits remain pending.
