# Caddr — CAD & Structural Engineering Workspace (MVP)

A dependency-free browser prototype for the first layer of the Bahl engineering product: precise CAD-like drafting for structural workflows.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

**Viewport navigation:** use the mouse wheel to zoom around the pointer; use middle-mouse drag or hold **Space** and drag with the left mouse button to pan. Trackpad pinch gestures are handled through browser wheel events.

**Selection:** drag left-to-right for window selection (fully enclosed objects); drag right-to-left for crossing selection (objects touched by the box). Use `Ctrl+A` / `SELECTALL`, `SELECTSIMILAR`, `SELECTPREVIOUS`, `SELECTLAST`, and `DESELECTALL` in the command line.

## Implemented

- SVG-based vector geometry with millimetre working units
- Line, polyline, rectangle, circle, arc, ellipse, polygon, spline, hatch, gradient, point, revision cloud, text and linear dimension tools
- Endpoint, midpoint, center, quadrant, intersection, grid and object-snap tracking
- Ortho, 15-degree polar tracking, grid, snap and dynamic absolute/relative/polar coordinate input
- Layers with visibility and active-layer switching
- Selection + properties editor, including click/window/crossing selection, Ctrl+A Select All, and Select Similar/Previous/Last commands
- Move, copy, rotate, scale, mirror, line offset, trim/extend, fillet, chamfer, stretch, rectangular/polar/path arrays, break, join, explode and delete
- Horizontal, vertical and line-length constraints, with named dimensional parameters in the Parameters Manager
- Cursor-anchored zoom over a very broad range, smooth mouse-wheel/trackpad zoom, middle-mouse drag pan, and Space + left-drag pan
- Zoom, pan, fit-to-extents
- Keyboard shortcuts for common commands
- `.bahl` JSON save/open
- SVG export
- Basic DXF export for line/circle/polyline/text entities
- ASCII DXF import for LINE, CIRCLE, ARC, LWPOLYLINE, POINT, TEXT and MTEXT, including basic layer names/colors
- Starter structural-plan example

Hatch and gradient apply to selected closed boundaries. The lightweight editing kernel supports line-based trim/extend, fillets and chamfers; it is not a full AutoCAD-compatible solver or editing kernel.

## Product direction

The next layers should add structural semantics rather than only more drawing commands:

1. Columns, beams, slabs, walls and foundations as parametric objects.
2. Rebar objects, bar marks, schedules and reinforcement annotations.
3. Broader DXF import/export coverage, units/header interpretation, and compatibility testing against AutoCAD workflows.
4. Snapping upgrades, grips, window selection, trim/extend and block support.
5. Structural model graph shared between analysis, detailing and AI assistants.


## Structural Studio prototype

Open `structural.html` (or select **Structural Studio** from the CAD ribbon) to explore the combined structural workflow: shared model, load cases and combinations, analysis review, concrete/steel design workflow, reinforcement detailing preferences, quantities and costs, and report assembly. This is a UI prototype with sample data; no structural solver or code-based design engine is connected, and it must not be used for engineering decisions or construction.
