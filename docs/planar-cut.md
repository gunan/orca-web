# Planar cut and mirror

`cutMesh` works on the scene’s transformed triangle surfaces. The plane uses `dot(normalized normal, world point) = offset` in millimetres. It clips triangles into both half-spaces, extracts closed boundary loops, classifies nested contours and holes, and triangulates caps with Three.js ShapeUtils/Earcut. Original collinear boundary vertices are retained so the caps do not introduce open T-junctions. Both returned meshes must pass the existing closed/manifold/winding checks before any edit is applied.

`cutNativeGroup` cuts every part in one native group with the same world plane, preserves roles, filament slots and overrides, and assigns distinct group IDs to the two sides. Parts wholly on one side retain their original surfaces. A side without a normal visible part is discarded rather than leaving orphan modifiers. `arrangeCutResult` places normal-part footprints side by side on the bed and translates all associated negative, modifier and support parts together.

`mirrorNativeGroup` reflects a whole native group about its common bounds center. Reflection is baked into vertices, triangle winding is corrected, and saved scale remains positive.

The browser dialog previews the actual generated surfaces, allows axis/custom normals, plane offset, upper/lower/both retention, and side-by-side or original placement. Apply creates a single project history edit.

Validation covers transformed oblique cuts, planes through existing edges, nested cavities and islands, disconnected shells, exact volume preservation, manifold caps, mirror reversal, grouped role/setting preservation and real OrcaSlicer 2.4.2 output. Native tests verify no deposited extrusion in retained cavity openings and a material-use difference when cut density modifiers are removed.

Very near an existing edge, clipping can produce distinct double-precision points that collapse in the Float32 representation used by the renderer and STL. Finalization welds coincident output vertices, removes collapsed faces, and subdivides matching collinear boundary edges. It never moves the cut plane or fills an unrelated open hole. Work is bounded to three subdivision passes and at most 2,048 boundary edges per pass; an unresolved result still fails closed/manifold validation.

A synthetic near-edge tetrahedron regression and an installed-native retraction-tower regression cover this case. The native tower cuts at the exact source heights 3.3999 and 21.3999 mm, with both halves closed and volume drift below 0.000013 mm³. Native slicing succeeds with final layers at 3.4 and 21.32 mm respectively (layer quantization).

Current limits: inputs must have closed consistently wound surfaces at the cut; self-touching or ambiguous cut boundaries are rejected. This is a planar mesh operation. Connectors, dowels, dovetails, interactive plane gizmos and curved cut surfaces are not implemented. Vertex-only nonmanifold connections and arbitrary self-intersections are not exhaustively detected by the mesh analyser.
