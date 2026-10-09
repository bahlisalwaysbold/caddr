# Caddr Roadmap

This roadmap is intentionally incremental. Each slice must preserve legacy `.bahl` readability and make meaningful changes undoable and serializable.

## Current slice

- Establish a versioned document boundary with legacy migration and stable entity/layer identity.
- Centralize command aliases, transaction history, coordinate parsing, and geometric snap candidates.
- Wire existing drawing/edit workflows through undo/redo; add practical selection and grip improvements.
- Keep the SVG renderer and current MVP workflows intact.
- Add the basic 2D drawing/editing command set, precision toggles, starter line constraints/parameters, and common selection operations (select all/similar/previous/last).

## Next slices

1. Precision and selection: fence/lasso selection, polygon selection, selection cycling, snap overrides, polar-angle configuration, and richer dynamic command prompts.
2. Editing kernel: expand edge cases and geometric test coverage for trim/extend, mirror/scale/stretch, fillet/chamfer, join/explode, and arrays; support more than line-based boundaries and selected entity types.
3. Annotation and styles: associative dimensions, text styles, center marks/centerlines, and boundary-driven hatch regions.
4. Document systems: layer manager, blocks/attributes, layouts/viewports, tables, schedules, and migration tests.
5. Output and coordination: PDF/PNG/CSV, references, compare, markup, cleanup/audit, and standards checking.
6. Structural model: typed grids, columns, beams, slabs, foundations, reinforcement, relationships, and generated schedules/details.
7. 3D foundation, automation/plugin API, and deterministic assistant tools after the 2D/structural kernel is dependable.

## Quality gates

- Preserve the line, polyline, rectangle, circle, arc, ellipse, polygon, spline, hatch, gradient, point, revision-cloud, text and dimension workflows; move, copy, rotate, scale, mirror, offset, trim/extend, fillet/chamfer, stretch, arrays, break/join/explode; precision aids; constraints/parameters; and save/open/export.
- Every geometry mutation uses a command transaction and round-trips through the versioned project format.
- Add focused mathematical and workflow tests with each behavior slice; do not represent unimplemented features as functional controls.
- Editing commands are an intentionally small 2D kernel, not full DWG/AutoCAD-compatible implementations; unsupported geometry combinations must report their limits.

## Structural workflow UI prototype

- [x] Add a separate Caddr Structural Studio navigation entry without replacing the current CAD canvas.
- [x] Prototype model, load cases/combinations, analysis review, member-design categories, detailing preferences, quantity/cost schedule, and report summary.
- [ ] Connect the shared typed model to CAD entities and persist structural properties.
- [ ] Integrate a validated solver and code-based design engines; retain explicit review and approval gates.
- [ ] Test every calculation against independently verified engineering examples before exposing results as design outputs.
