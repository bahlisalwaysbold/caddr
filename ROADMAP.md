# BAHL CAD Roadmap

This roadmap is intentionally incremental. Each slice must preserve legacy `.bahl` readability and make meaningful changes undoable and serializable.

## Current slice

- Establish a versioned document boundary with legacy migration and stable entity/layer identity.
- Centralize command aliases, transaction history, coordinate parsing, and geometric snap candidates.
- Wire existing drawing/edit workflows through undo/redo; add practical selection and grip improvements.
- Keep the SVG renderer and current MVP workflows intact.

## Next slices

1. Precision and selection: window/crossing/fence selection, spatial index, snap overrides/tracking, and numeric command state machine.
2. Editing kernel: tested trim/extend, mirror/scale/stretch, fillet/chamfer, join/explode, and rectangular/polar/path arrays.
3. Annotation and styles: associative dimensions, text styles, center marks/centerlines, and real hatch boundaries.
4. Document systems: layer manager, blocks/attributes, layouts/viewports, tables, schedules, and migration tests.
5. Output and coordination: PDF/PNG/CSV, references, compare, markup, cleanup/audit, and standards checking.
6. Structural model: typed grids, columns, beams, slabs, foundations, reinforcement, relationships, and generated schedules/details.
7. 3D foundation, automation/plugin API, and deterministic assistant tools after the 2D/structural kernel is dependable.

## Quality gates

- Preserve the current line, circle, rectangle, polyline, text, dimension, move, copy, rotate, offset, delete, pan, zoom, snap, grid, layers, properties, save/open, SVG, and DXF workflows.
- Every geometry mutation uses a command transaction and round-trips through the versioned project format.
- Add focused mathematical and workflow tests with each behavior slice; do not represent unimplemented features as functional controls.