(function (root) {
  "use strict";

  const COLUMN_LAYER = /(?:^|[^a-z])(?:col(?:umn)?s?|pillars?)(?:$|[^a-z])/i;
  const GRID_LAYER = /(?:^|[^a-z])(?:grid|axis|axes|centreline|centerline)(?:$|[^a-z])/i;
  const COLUMN_TEXT = /\b(?:col(?:umn)?\s*[-_:]?\s*[a-z]?\d+[a-z]?|c\s*[-_:]?\s*\d{1,3}[a-z]?)\b/i;
  const MM_PER_UNIT = Object.freeze({
    mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, yd: 914.4,
    "us-ft": 1200 / 3937 * 1000, "us-in": 1200 / 3937 * 1000 / 12,
    "us-yd": 1200 / 3937 * 1000 / 3, "us-mi": 5280 * 1200 / 3937 * 1000,
    dm: 100, dam: 10000, hm: 100000, km: 1000000, micron: 0.001,
    nm: 0.000001, microin: 0.0000254, mil: 0.0254
  });

  const finite = value => Number.isFinite(Number(value));
  const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const layerFor = (entity, layerById) =>
    String(entity.layer || layerById.get(entity.layerId)?.name || "0");
  const round = value => Math.round(value * 1e6) / 1e6;

  function boundsOfPoints(points) {
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return {
      minX: Math.min(...xs), minY: Math.min(...ys),
      maxX: Math.max(...xs), maxY: Math.max(...ys)
    };
  }

  function dimensionsFromCorners(points, tolerance) {
    if (!Array.isArray(points)) return null;
    let corners = points.filter(point => point && finite(point.x) && finite(point.y))
      .map(point => ({ x: Number(point.x), y: Number(point.y) }));
    if (corners.length > 4 && pointDistance(corners[0], corners[corners.length - 1]) <= tolerance) {
      corners.pop();
    }
    if (corners.length !== 4) return null;

    const edges = corners.map((point, index) => {
      const next = corners[(index + 1) % corners.length];
      return { x: next.x - point.x, y: next.y - point.y, length: pointDistance(point, next) };
    });
    if (edges.some(edge => edge.length <= tolerance)) return null;

    for (let index = 0; index < 4; index += 1) {
      const a = edges[index], b = edges[(index + 1) % 4];
      if (Math.abs((a.x * b.x + a.y * b.y) / (a.length * b.length)) > 0.015) return null;
    }
    const width = (edges[0].length + edges[2].length) / 2;
    const depth = (edges[1].length + edges[3].length) / 2;
    const longSide = Math.max(width, depth);
    if (Math.abs(edges[0].length - edges[2].length) > Math.max(tolerance * 4, longSide * 0.02) ||
        Math.abs(edges[1].length - edges[3].length) > Math.max(tolerance * 4, longSide * 0.02)) return null;
    const centre = corners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
    return {
      shape: "rectangle", width, depth, centerX: centre.x, centerY: centre.y,
      bounds: boundsOfPoints(corners), points: corners
    };
  }

  function simpleBoundsForEntity(entity) {
    if (entity.type === "line" && entity.a && entity.b) {
      return { minX: Math.min(entity.a.x, entity.b.x), minY: Math.min(entity.a.y, entity.b.y),
        maxX: Math.max(entity.a.x, entity.b.x), maxY: Math.max(entity.a.y, entity.b.y) };
    }
    if (entity.type === "circle" && finite(entity.cx) && finite(entity.cy) && finite(entity.r)) {
      return { minX: Number(entity.cx) - Math.abs(Number(entity.r)), minY: Number(entity.cy) - Math.abs(Number(entity.r)),
        maxX: Number(entity.cx) + Math.abs(Number(entity.r)), maxY: Number(entity.cy) + Math.abs(Number(entity.r)) };
    }
    if ((entity.type === "polyline" || entity.type === "polygon") && Array.isArray(entity.points)) {
      return boundsOfPoints(entity.points);
    }
    if (entity.type === "rect" && [entity.x, entity.y, entity.w, entity.h].every(finite)) {
      return { minX: Math.min(entity.x, entity.x + entity.w), minY: Math.min(entity.y, entity.y + entity.h),
        maxX: Math.max(entity.x, entity.x + entity.w), maxY: Math.max(entity.y, entity.y + entity.h) };
    }
    if (entity.type === "text" && finite(entity.x) && finite(entity.y)) {
      return { minX: Number(entity.x), minY: Number(entity.y), maxX: Number(entity.x), maxY: Number(entity.y) };
    }
    return null;
  }

  function drawingTolerance(entities) {
    const bounds = entities.map(simpleBoundsForEntity).filter(Boolean);
    if (!bounds.length) return 1e-6;
    const width = Math.max(...bounds.map(box => box.maxX)) - Math.min(...bounds.map(box => box.minX));
    const height = Math.max(...bounds.map(box => box.maxY)) - Math.min(...bounds.map(box => box.minY));
    return Math.max(1e-6, Math.hypot(width, height) * 1e-9);
  }

  function directShapes(entities, layerById, tolerance) {
    const shapes = [];
    entities.forEach((entity, index) => {
      const id = String(entity.id || ("entity-" + (index + 1)));
      const layer = layerFor(entity, layerById);
      if (entity.type === "circle" && finite(entity.cx) && finite(entity.cy) && finite(entity.r) && Math.abs(Number(entity.r)) > tolerance) {
        const diameter = Math.abs(Number(entity.r)) * 2;
        shapes.push({
          shape: "circle", width: diameter, depth: diameter,
          centerX: Number(entity.cx), centerY: Number(entity.cy),
          bounds: { minX: Number(entity.cx) - diameter / 2, minY: Number(entity.cy) - diameter / 2,
            maxX: Number(entity.cx) + diameter / 2, maxY: Number(entity.cy) + diameter / 2 },
          points: null, sourceEntityIds: [id], layers: [layer], sourceGroupCount: 1
        });
      } else if ((entity.type === "polyline" || entity.type === "polygon") && entity.closed === true && Array.isArray(entity.points)) {
        const geometry = dimensionsFromCorners(entity.points, tolerance);
        if (geometry) shapes.push({ ...geometry, sourceEntityIds: [id], layers: [layer], sourceGroupCount: 1 });
      } else if (entity.type === "rect" && [entity.x, entity.y, entity.w, entity.h].every(finite) &&
          Math.abs(Number(entity.w)) > tolerance && Math.abs(Number(entity.h)) > tolerance) {
        const centre = { x: Number(entity.x) + Number(entity.w) / 2, y: Number(entity.y) + Number(entity.h) / 2 };
        const angle = Number(entity.rotation || 0) * Math.PI / 180;
        const points = [
          { x: Number(entity.x), y: Number(entity.y) },
          { x: Number(entity.x) + Number(entity.w), y: Number(entity.y) },
          { x: Number(entity.x) + Number(entity.w), y: Number(entity.y) + Number(entity.h) },
          { x: Number(entity.x), y: Number(entity.y) + Number(entity.h) }
        ].map(point => {
          const dx = point.x - centre.x, dy = point.y - centre.y;
          return { x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
        });
        const geometry = dimensionsFromCorners(points, tolerance);
        if (geometry) shapes.push({ ...geometry, sourceEntityIds: [id], layers: [layer], sourceGroupCount: 1 });
      }
    });
    return shapes;
  }

  function lineLoopShapes(entities, layerById, tolerance) {
    const lineRecords = entities.filter(entity => entity.type === "line" && entity.a && entity.b &&
      [entity.a.x, entity.a.y, entity.b.x, entity.b.y].every(finite) &&
      pointDistance(entity.a, entity.b) > tolerance).map((entity, index) => ({
        id: String(entity.id || ("line-" + (index + 1))), layer: layerFor(entity, layerById),
        a: { x: Number(entity.a.x), y: Number(entity.a.y) },
        b: { x: Number(entity.b.x), y: Number(entity.b.y) }
      }));
    const nodes = new Map(), adjacency = new Map();

    function nodeFor(point) {
      const key = Math.round(point.x / tolerance) + "," + Math.round(point.y / tolerance);
      if (!nodes.has(key)) nodes.set(key, { key, point: { ...point } });
      return nodes.get(key);
    }
    for (const line of lineRecords) {
      const a = nodeFor(line.a), b = nodeFor(line.b);
      if (a.key === b.key) continue;
      const edge = { id: line.id, layer: line.layer, a: a.key, b: b.key };
      if (!adjacency.has(a.key)) adjacency.set(a.key, []);
      if (!adjacency.has(b.key)) adjacency.set(b.key, []);
      adjacency.get(a.key).push(edge);
      adjacency.get(b.key).push(edge);
    }

    const visitedNodes = new Set(), shapes = [];
    for (const start of nodes.keys()) {
      if (visitedNodes.has(start) || !(adjacency.get(start)?.length)) continue;
      const componentNodes = new Set(), componentEdges = new Set(), stack = [start];
      while (stack.length) {
        const current = stack.pop();
        if (componentNodes.has(current)) continue;
        componentNodes.add(current); visitedNodes.add(current);
        for (const edge of adjacency.get(current) || []) {
          componentEdges.add(edge);
          const next = edge.a === current ? edge.b : edge.a;
          if (!componentNodes.has(next)) stack.push(next);
        }
      }
      if (componentNodes.size !== 4 || componentEdges.size !== 4) continue;
      if ([...componentNodes].some(key => (adjacency.get(key) || []).filter(edge => componentEdges.has(edge)).length !== 2)) continue;

      const ordered = [];
      let current = start, previous = null;
      for (let step = 0; step < 4; step += 1) {
        ordered.push(nodes.get(current).point);
        const edge = (adjacency.get(current) || []).find(item => componentEdges.has(item) && item !== previous);
        if (!edge) break;
        current = edge.a === current ? edge.b : edge.a;
        previous = edge;
      }
      if (ordered.length !== 4 || current !== start) continue;
      const geometry = dimensionsFromCorners(ordered, tolerance);
      if (!geometry) continue;
      const sources = [...new Set([...componentEdges].map(edge => edge.id))].sort();
      const sourceLayers = [...new Set([...componentEdges].map(edge => edge.layer))].sort();
      shapes.push({ ...geometry, sourceEntityIds: sources, layers: sourceLayers, sourceGroupCount: 1 });
    }
    return shapes;
  }

  function distanceToBounds(point, bounds) {
    const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
    const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY);
    return Math.hypot(dx, dy);
  }

  function gridIntersectionEntityIds(shape, lines, tolerance) {
    const maxDimension = Math.max(shape.width, shape.depth);
    const horizontal = [], vertical = [];
    for (const line of lines) {
      if (!GRID_LAYER.test(line.layer)) continue;
      const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y;
      if (Math.abs(dy) <= tolerance * 4 && Math.min(line.a.x, line.b.x) <= shape.centerX - maxDimension * 0.25 &&
          Math.max(line.a.x, line.b.x) >= shape.centerX + maxDimension * 0.25 &&
          Math.abs((line.a.y + line.b.y) / 2 - shape.centerY) <= maxDimension * 0.12) horizontal.push(line);
      if (Math.abs(dx) <= tolerance * 4 && Math.min(line.a.y, line.b.y) <= shape.centerY - maxDimension * 0.25 &&
          Math.max(line.a.y, line.b.y) >= shape.centerY + maxDimension * 0.25 &&
          Math.abs((line.a.x + line.b.x) / 2 - shape.centerX) <= maxDimension * 0.12) vertical.push(line);
    }
    if (!horizontal.length || !vertical.length) return [];
    return [...new Set([...horizontal, ...vertical].map(line => line.id))].sort();
  }

  function inTypicalColumnRange(shape, units) {
    const factor = MM_PER_UNIT[String(units || "").toLowerCase()];
    if (!factor) return { known: false, plausible: false, widthMm: null, depthMm: null };
    const widthMm = shape.width * factor, depthMm = shape.depth * factor;
    const shortSide = Math.min(widthMm, depthMm), longSide = Math.max(widthMm, depthMm);
    return { known: true, widthMm, depthMm,
      plausible: shortSide >= 75 && longSide <= 2500 && longSide / Math.max(shortSide, 1e-9) <= 3.5 };
  }

  function hash(value) {
    let h = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      h ^= value.charCodeAt(index);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function geometryKey(shape, tolerance) {
    const quantum = Math.max(tolerance * 10, 1e-5);
    return [
      shape.shape, Math.round(shape.centerX / quantum), Math.round(shape.centerY / quantum),
      Math.round(shape.width / quantum), Math.round(shape.depth / quantum)
    ].join(":");
  }

  function detectColumns(entities, layers, units, options = {}) {
    const sourceEntities = Array.isArray(entities) ? entities : [];
    const layerById = new Map((Array.isArray(layers) ? layers : []).map(layer => [layer.id, layer]));
    const tolerance = drawingTolerance(sourceEntities);
    const baseShapes = [
      ...directShapes(sourceEntities, layerById, tolerance),
      ...lineLoopShapes(sourceEntities, layerById, tolerance)
    ];

    const lineRecords = sourceEntities.filter(entity => entity.type === "line" && entity.a && entity.b &&
      [entity.a.x, entity.a.y, entity.b.x, entity.b.y].every(finite)).map((entity, index) => ({
        id: String(entity.id || ("line-" + (index + 1))), layer: layerFor(entity, layerById),
        a: { x: Number(entity.a.x), y: Number(entity.a.y) },
        b: { x: Number(entity.b.x), y: Number(entity.b.y) }
      }));
    const columnAnnotations = sourceEntities.filter(entity => entity.type === "text" && COLUMN_TEXT.test(String(entity.text || "")) &&
      finite(entity.x) && finite(entity.y)).map(entity => ({ id: String(entity.id || ""), text: String(entity.text), x: Number(entity.x), y: Number(entity.y) }));

    let unclassifiedPlausibleShapes = 0, duplicatesMerged = 0, ambiguousCandidates = 0;
    const merged = new Map();
    for (const shape of baseShapes) {
      const unitScreen = inTypicalColumnRange(shape, units);
      const layerEvidence = shape.layers.some(layer => COLUMN_LAYER.test(layer));
      const annotation = columnAnnotations.find(text => distanceToBounds(text, shape.bounds) <= Math.max(
        Math.max(shape.width, shape.depth) * 1.5,
        Math.hypot(shape.width, shape.depth) * 0.75
      ));
      const gridSourceIds = gridIntersectionEntityIds(shape, lineRecords, tolerance);
      const gridEvidence = gridSourceIds.length > 0;
      const evidenceEntityIds = [...new Set([...(annotation ? [annotation.id] : []), ...gridSourceIds])].filter(Boolean).sort();
      const hasContext = layerEvidence || Boolean(annotation) || gridEvidence;

      if (!hasContext) {
        if (unitScreen.plausible) unclassifiedPlausibleShapes += 1;
        continue;
      }

      const key = geometryKey(shape, tolerance);
      if (merged.has(key)) {
        const existing = merged.get(key);
        existing.sourceEntityIds = [...new Set([...existing.sourceEntityIds, ...shape.sourceEntityIds])].sort();
        existing.evidenceEntityIds = [...new Set([...existing.evidenceEntityIds, ...evidenceEntityIds])].sort();
        existing.sourceLayers = [...new Set([...existing.sourceLayers, ...shape.layers])].sort();
        existing.associatedLayer = existing.sourceLayers.length === 1 ? existing.sourceLayers[0] : null;
        existing.sourceGroupCount += 1;
        existing.evidence.push("overlaid_geometry_merged");
        duplicatesMerged += 1;
        continue;
      }

      const evidence = [];
      if (shape.shape === "circle") evidence.push("circular_outline");
      else evidence.push("closed_rectangular_boundary");
      if (shape.sourceEntityIds.length > 1) evidence.push("connected_line_boundary");
      if (layerEvidence) evidence.push("structural_layer_match");
      if (annotation) evidence.push("column_annotation");
      if (gridEvidence) evidence.push("structural_grid_intersection");
      if (unitScreen.plausible) evidence.push("typical_column_proportions");

      const warnings = [];
      if (unitScreen.known && !unitScreen.plausible) warnings.push("dimensions_outside_initial_column_screen");
      if (!unitScreen.known) warnings.push("typical_dimension_screen_unavailable_for_units");
      if (shape.layers.length > 1) warnings.push("source_geometry_spans_multiple_layers");
      const confidence = Math.min(0.97, Math.round((
        0.35 + (layerEvidence ? 0.3 : 0) + (annotation ? 0.2 : 0) +
        (gridEvidence ? 0.15 : 0) + (unitScreen.plausible ? 0.1 : 0)
      ) * 100) / 100);
      const candidate = {
        id: "",
        type: "column",
        classification: "column",
        sourceEntityIds: [...new Set(shape.sourceEntityIds)].sort(),
        evidenceEntityIds,
        geometry: {
          shape: shape.shape,
          centerX: round(shape.centerX),
          centerY: round(shape.centerY),
          width: round(shape.width),
          depth: round(shape.depth),
          unit: units || null,
          bounds: Object.fromEntries(Object.entries(shape.bounds).map(([name, value]) => [name, round(value)])),
          points: shape.points ? shape.points.map(point => ({ x: round(point.x), y: round(point.y) })) : null
        },
        associatedLayer: shape.layers.length === 1 ? shape.layers[0] : null,
        sourceLayers: [...shape.layers].sort(),
        sourceGroupCount: shape.sourceGroupCount,
        evidence: [...new Set(evidence)],
        confidence,
        reviewStatus: "needs_review",
        warnings,
        dimensionSource: "drawing_geometry"
      };
      const identity = candidate.sourceEntityIds.join("|") + "|" + key;
      candidate.id = "candidate-column-" + hash(identity);
      merged.set(key, candidate);
    }

    const candidates = [...merged.values()].map(candidate => {
      if (candidate.warnings.length || candidate.evidence.includes("overlaid_geometry_merged")) ambiguousCandidates += 1;
      candidate.evidence = [...new Set(candidate.evidence)];
      return candidate;
    });

    return {
      schemaVersion: 1,
      units: units || null,
      candidates,
      stats: {
        entitiesAnalysed: sourceEntities.length,
        candidateShapesConsidered: baseShapes.length,
        columnsDetected: candidates.length,
        unclassifiedPlausibleShapes,
        duplicatesMerged,
        ambiguousCandidates,
        tolerance
      },
      notes: [
        "Recognition is deterministic geometry interpretation, not a structural safety assessment.",
        "Shapes without column-layer, column-annotation or structural-grid evidence are not classified as columns.",
        "BLOCK/INSERT symbols are not recognised by the current DXF importer."
      ],
      source: options.source || "current-drawing"
    };
  }

  const api = { detectColumns, inTypicalColumnRange };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BahlColumnDetection = api;
})(globalThis);
