# Caddr CAD & Structural Workspace Architecture

## Current foundation

The MVP remains a dependency-free browser application. `core.js` contains framework-independent document normalization, versioned serialization, command registration, transaction history, coordinate parsing, and geometric snap candidates. `app.js` owns interaction state, SVG rendering, and the current UI. The SVG renderer consumes the in-memory compatibility view (`entity.layer` as a layer name); persisted entities use stable `layerId` values.

The canonical project envelope is `{ format: "BAHL-CAD", version: 1, document, view }`. `normalizeDocument` accepts both this envelope and legacy MVP state files, and `serializeDocument` writes the canonical envelope. Entity IDs and layer IDs are stable; engineering attributes and metadata have explicit homes on each entity.

## Ownership boundaries

- Core: document schema, geometry utilities, command registry, undo/redo transactions.
- Document: layers, entities, styles, blocks, layouts, references, and metadata.
- Rendering: SVG presentation only; it does not own engineering meaning.
- UI: command input, selection, properties, layer controls, and viewport interaction.
- Structural: future typed structural entities and relationships, independent of their SVG representation.

The current application is still one UI module. Extract additional modules only as behavior moves behind these boundaries; do not replace the working renderer or introduce a framework migration as a prerequisite.

## Structural Studio prototype

`structural.html`, `structural.css`, and `structural.js` are a self-contained, dependency-free UI prototype for the intended integrated structural workflow. It is deliberately separated from the working 2D drawing kernel. Its sample analysis, design states, reinforcement detail, and quantity schedule are illustrative only. Future integration should consume a shared, typed structural model and validated numerical solvers rather than interpreting the prototype outputs as engineering results.
