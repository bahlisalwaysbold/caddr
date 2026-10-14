# Caddr column detection and desktop compatibility assessment

## Current integration point

The current CAD editor uses core.js for document normalization, serialization, history and DXF parsing, and app.js for SVG rendering and interaction. Column recognition is isolated in column-detection.js; it consumes the current document's entities, layers and confirmed drawing units and returns plain data. It does not own the canvas, mutate source geometry, invoke the structural solver or call a hosted AI service.

Reviewed entities in the first slice:
- Closed four-corner rectangular polylines and native editor rectangles.
- Rectangular outlines formed by four connected line entities.
- Circular outlines.
- Column-like layer names, nearby column marks/section annotations, explicitly named structural grid/axis lines, and line alignment through the candidate centre on recognisable structural-member layers.
- Source geometry references and dimensions in the current document's units.

A rectangle or circle alone is not sufficient evidence to classify it as a column. Compact shapes without column-layer, column-annotation, structural-grid, or recognisable structural-member-alignment evidence are excluded and counted for test feedback. Candidates with atypical dimensions or other ambiguity remain reviewable and carry warnings. Displayed confidence is a heuristic evidence score, not a calibrated probability or a safety rating.

## DXF limitations

The existing importer supports LINE, CIRCLE, ARC, LWPOLYLINE, POINT, TEXT and MTEXT. It records unsupported entity types and does not currently expand INSERT block references or resolve block transforms/attributes. This first detector therefore cannot recognise columns represented only inside blocks, legacy POLYLINE/VERTEX structures, hatches, or raster/scanned drawings. It uses importer-assigned entity IDs (e1, e2, ...) as source references; native DXF handles are not yet preserved. References are reliable for the current imported document and its saved review data, but are not a promise of cross-file identity if the source DXF is re-imported after entity order changes.

The $INSUNITS / unit-confirmation logic added previously remains the authority for the current drawing units. Detection reports dimensions in those same units and does not rescale geometry. The current mm, cm, m, in, ft, yd and other known-unit size screen is only a candidate-filtering heuristic, not an engineering design limit. It can be revised against labelled drawings.

## Review and structural-model boundary

The document stores recognition results separately from geometric entities. Candidate states are needs_review, confirmed and rejected; source entity geometry is not automatically edited. Dimension corrections are retained as review data. A confirmed candidate is only an engineer-reviewed recognition result: this slice does not derive storey elevation, material, loads, supports, member connectivity, code checks, reinforcement, analysis results or professional approval. No candidate is silently injected into the current idealised PyNite frame model.

The initial test fixtures are synthetic labelled DXFs created to exercise supported import cases and known expected locations. They are regression fixtures, not a representative survey of field drawings and not a basis for accuracy claims. Production evaluation still requires varied drawings and qualified labels, followed by precision/recall and dimension-error measurement.

## Desktop packaging assessment

The repository audit did not find a package.json, Electron entry point or builder configuration, tauri.conf.json, or a src-tauri packaging tree. The current editor is a static HTML/CSS/JavaScript application and its recognition engine is ordinary JavaScript; the engine can be reused in a browser or a desktop webview without a separate recognition service.

No downloadable desktop executable is currently configured or verified by this repository state. Local-first recognition is feasible, but local native file dialogs, durable project locations, automatic update/signing, installer generation and supported Windows/macOS/Linux builds need a packaging decision and independent build/launch tests. Do not claim desktop readiness based only on the hosted web application or these browser tests. This change intentionally does not introduce Electron or Tauri ahead of that packaging audit.
