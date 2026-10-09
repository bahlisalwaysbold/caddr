# Bahl CAD — Structural Drafting Core (MVP)

A dependency-free browser prototype for the first layer of the Bahl engineering product: precise CAD-like drafting for structural workflows.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Implemented

- SVG-based vector geometry with millimetre working units
- Line, polyline, rectangle, circle, arc, ellipse, polygon, spline, hatch, gradient, point, revision cloud, text and linear dimension tools
- Endpoint, midpoint, center, quadrant, intersection, grid and object-snap tracking
- Ortho, 15-degree polar tracking, grid, snap and dynamic absolute/relative/polar coordinate input
- Ortho, polar, object-snap tracking and coordinate readout toggles
- Arc, ellipse, polygon, spline, hatch, gradient, point and revision-cloud drawing tools
- Rotate, scale, mirror, trim/extend, fillet/chamfer, stretch, arrays, break, join and explode commands
- Basic dimensional/geometric line constraints and named parameters
- Layers with visibility and active-layer switching
- Selection + properties editor
- Move, copy, rotate, scale, mirror, line offset, trim/extend, fillet, chamfer, stretch, rectangular/polar/path arrays, break, join, explode and delete
- Horizontal, vertical and line-length constraints, with named dimensional parameters in the Parameters Manager
- Zoom, pan, fit-to-extents
- Keyboard shortcuts for common commands
- `.bahl` JSON save/open
- SVG export
- Basic DXF export for line/circle/polyline/text entities
- Starter structural-plan example

Hatch and gradient apply to selected closed boundaries. The lightweight editing kernel supports line-based trim/extend, fillets and chamfers; it is not a full AutoCAD-compatible solver or editing kernel.

## Product direction

The next layers should add structural semantics rather than only more drawing commands:

1. Columns, beams, slabs, walls and foundations as parametric objects.
2. Rebar objects, bar marks, schedules and reinforcement annotations.
3. DWG/DXF import/export hardening and compatibility testing against AutoCAD workflows.
4. Snapping upgrades, grips, window selection, trim/extend and block support.
5. Structural model graph shared between analysis, detailing and AI assistants.
