# Bahl CAD — Structural Drafting Core (MVP)

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


## Structural analysis API (first live integration)

The first solver connection uses **PyNiteFEA 3.2.0** behind Vercel's Python runtime. Its MIT license and capabilities are documented in the upstream [PyNite repository](https://github.com/SoundsSerious/PyNite). The frontend calls:

- `GET /api/structural/health` — reports whether PyNiteFEA is available.
- `POST /api/structural/analyze` — validates a submitted structural model, runs a linear-elastic finite-element analysis, and returns nodal reactions/displacements plus member force/deflection summaries.

The API currently accepts nodes, six-DOF supports, elastic materials, section properties, beam/frame members, nodal loads, member point loads, distributed loads, and explicitly named load combinations. It uses one consistent unit system supplied in the request and **does not convert units automatically**. Requests are limited to 100 nodes, 160 members, 500 loads and 20 combinations in this prototype.

### Run locally

Use Python 3.12, then:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
# macOS/Linux:
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m http.server 5173
```

The static HTML frontend can run with the simple HTTP server, but the `/api` endpoints are Vercel serverless functions and are **not** provided by `python -m http.server`. For a local end-to-end test, run a compatible Vercel development environment or create a small local API adapter.

The Structural Workspace now creates an editable idealised two-bay, two-storey frame model from the same member data used by the diagram and member inspector. Section widths/depths and explicit gravity line loads can be edited before analysis. After solving, the API returns 17 sampled result points per member for moment/shear/deflection diagram overlays. These results are for the submitted linear-elastic frame only: there is no automatic slab-load distribution, self-weight take-off, diaphragm action, reinforced-concrete code design, reinforcement selection or code-compliance certification. A regression test checks a known simply supported beam and verifies that the editable portal frame reactions balance the specified applied line loads.
