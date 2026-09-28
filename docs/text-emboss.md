# Text, planar emboss and engraving

The text tool generates actual extruded glyph outlines from the installed OrcaSlicer's bundled TTF/OTF fonts. It supports multiline text, font selection, em size in millimetres, depth, overlap, character spacing, line spacing, horizontal alignment, in-plane angle and an editable anchor. Counters such as O and B remain holes in closed geometry. Missing glyphs and invalid or non-manifold outlines block application.

Standalone text creates a normal object. Emboss adds a normal part to the selected native group; engraving adds a negative volume. Existing roles, filament assignment and object settings are retained. Six initial planar placements use the cardinal faces of the selected normal group's world bounds; users can adjust the anchor. This is not curved-surface projection. Overlap helps the text intersect the body; the preview shows the resulting parts.

Text remains editable in Orca Web JSON. Its source placement and any baked affine transform are recorded alongside text/font parameters. Regeneration preserves subsequent object/part transforms, including group rebasing and face placement. Cut, mirror, split and repair produce independent geometry and discard stale text parameters. Native 3MF exports contain real normal/negative text geometry, but native text regeneration, native text metadata roundtrip and curved-surface wrapping are not implemented.

Only the installed or explicitly configured Orca `Resources/fonts` directory is exposed. Requests use opaque allowlisted IDs. Font bytes are bounded to 32 MB, external symlinks and path requests are rejected, and font attribution plus the bundled license remain accessible. Fonts are loaded locally, without a CDN. Outlines are limited to 256 characters, 16 lines, 200,000 path commands and 200,000 triangles.

## Evidence

- Unit tests verify exact area/volume of a synthetic counter glyph, size and line/character spacing, closed surfaces, orientation, parameter limits, group roles, JSON persistence, and regeneration after repeated object/part transforms.
- Font API tests verify allowlisting, exact bytes, attribution/license access, path rejection and symlink replacement rejection.
- Installed OrcaSlicer 2.4.2 generates 1,882 raised text deposition segments while preserving O's counter. In an engraving comparison, 202 baseline samples fall inside the letter stroke that becomes an extrusion-free cavity. Filament changes from 1377.13 mm (base) to 1422.08 mm (emboss) and 1437.53 mm (engrave); cavity walls can increase material in a sparse-infill object.
- Browser tests cover creation, preview, persistence, undo, transformed editing, negative-volume roles, missing glyphs and invalid parameters.

Native reference: [OrcaSlicer 2.4.2 3MF text serialization](https://github.com/OrcaSlicer/OrcaSlicer/blob/8500fcdccaa10b5099ac20d252af3a7c560046f1/src/libslic3r/Format/bbs_3mf.cpp#L9149). Font outline APIs: [OpenType.js documentation](https://github.com/opentypejs/opentype.js#the-font-object). The browser uses its own bounded outline generator; native regeneration parity is not claimed.
