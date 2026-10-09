((root) => {
  const FORMAT = 'BAHL-CAD';
  const VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));

  function normalizeDocument(input = {}) {
    const source = input.document && typeof input.document === 'object' ? input.document : input;
    const sourceLayers = Array.isArray(source.layers) ? source.layers : [];
    const layers = sourceLayers.map((layer, index) => ({
      id: layer.id || `layer-${index + 1}`,
      name: layer.name || `Layer ${index + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      color: layer.color || '#111827',
      linetype: layer.linetype || 'CONTINUOUS',
      lineweight: layer.lineweight ?? null,
      transparency: layer.transparency ?? 0,
      frozen: layer.frozen === true
    }));
    if (!layers.length) layers.push({ id: 'layer-1', name: 'Structural', visible: true, locked: false, color: '#111827', linetype: 'CONTINUOUS', lineweight: null, transparency: 0, frozen: false });
    const layersByName = new Map(layers.map(layer => [layer.name, layer]));
    const layersById = new Map(layers.map(layer => [layer.id, layer]));
    const usedIds = new Set();
    let nextId = Math.max(1, Number(source.nextId) || 1);
    const entities = (Array.isArray(source.entities) ? source.entities : []).map(entity => {
      const normalized = { ...entity };
      if (!normalized.id || usedIds.has(normalized.id)) normalized.id = `e${nextId++}`;
      usedIds.add(normalized.id);
      const layer = layersById.get(normalized.layerId) || layersByName.get(normalized.layer) || layers[0];
      normalized.layerId = layer.id;
      normalized.layer = layer.name;
      normalized.visible = normalized.visible !== false;
      normalized.locked = normalized.locked === true;
      normalized.color = normalized.color || 'BYLAYER';
      normalized.linetype = normalized.linetype || 'BYLAYER';
      normalized.lineweight = normalized.lineweight ?? null;
      normalized.transparency = normalized.transparency ?? 0;
      normalized.attributes = normalized.attributes || {};
      normalized.metadata = normalized.metadata || {};
      normalized.transform = normalized.transform || { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1 };
      normalized.createdAt = normalized.createdAt || new Date().toISOString();
      normalized.modifiedAt = normalized.modifiedAt || normalized.createdAt;
      return normalized;
    });
    for (const id of usedIds) {
      const numericId = Number(String(id).replace(/^e/, ''));
      if (Number.isFinite(numericId)) nextId = Math.max(nextId, numericId + 1);
    }
    return {
      format: FORMAT,
      version: VERSION,
      document: {
        units: source.units || 'mm',
        layers,
        activeLayer: layersByName.has(source.activeLayer) ? source.activeLayer : layers[0].name,
        entities,
        nextId,
        metadata: source.metadata || { name: 'Untitled', createdAt: new Date().toISOString() },
        styles: source.styles || {},
        blocks: source.blocks || [],
        layouts: source.layouts || [],
        references: source.references || [],
        constraints: Array.isArray(source.constraints) ? source.constraints : [],
        parameters: Array.isArray(source.parameters) ? source.parameters : []
      },
      view: {
        grid: input.view?.grid ?? input.grid !== false,
        snap: input.view?.snap ?? input.snap !== false,
        ortho: input.view?.ortho ?? input.ortho === true,
        polar: input.view?.polar ?? input.polar === true,
        tracking: input.view?.tracking ?? input.tracking === true,
        dynamicInput: input.view?.dynamicInput ?? input.dynamicInput !== false,
        gridSize: input.view?.gridSize || input.gridSize || 50,
        majorGrid: input.view?.majorGrid || input.majorGrid || 250,
        viewport: input.view?.viewport || input.viewport || { x: 0, y: 0, scale: 1 }
      }
    };
  }

  function serializeDocument(state) {
    const normalized = normalizeDocument(state);
    normalized.document.entities = normalized.document.entities.map(({ layer, ...entity }) => entity);
    normalized.view = { grid: state.grid, snap: state.snap, ortho: state.ortho, polar: state.polar, tracking: state.tracking, dynamicInput: state.dynamicInput, gridSize: state.gridSize, majorGrid: state.majorGrid, viewport: clone(state.viewport) };
    return normalized;
  }

  class CommandRegistry {
    constructor() { this.commands = new Map(); }
    register(name, aliases, handler) {
      const definition = { name: name.toUpperCase(), handler };
      for (const key of [name, ...aliases]) this.commands.set(key.toUpperCase(), definition);
    }
    resolve(input) { return this.commands.get(String(input).trim().toUpperCase()) || null; }
    execute(input, context) {
      const definition = this.resolve(input);
      if (!definition) return false;
      definition.handler(context);
      return true;
    }
    suggestions(prefix) {
      const query = String(prefix).trim().toUpperCase();
      return [...new Set([...this.commands.keys()].filter(key => key.startsWith(query)))].sort();
    }
  }

  class HistoryManager {
    constructor({ capture, restore, limit = 100 }) {
      this.capture = capture;
      this.restore = restore;
      this.limit = limit;
      this.undoStack = [];
      this.redoStack = [];
      this.applying = false;
    }
    transact(label, action) {
      if (this.applying) return action();
      const before = this.capture();
      const result = action();
      this.record(label, before);
      return result;
    }
    record(label, before) {
      if (this.applying) return;
      const after = this.capture();
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      this.undoStack.push({ label, before: clone(before), after: clone(after) });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    undo() {
      const entry = this.undoStack.pop();
      if (!entry) return false;
      this.applying = true;
      try { this.restore(clone(entry.before)); } finally { this.applying = false; }
      this.redoStack.push(entry);
      return entry.label;
    }
    redo() {
      const entry = this.redoStack.pop();
      if (!entry) return false;
      this.applying = true;
      try { this.restore(clone(entry.after)); } finally { this.applying = false; }
      this.undoStack.push(entry);
      return entry.label;
    }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
  }

  // A very broad practical zoom range avoids the tiny hard limits of the
  // first prototype while keeping transforms numerically stable.
  const MIN_VIEW_SCALE = 1e-6;
  const MAX_VIEW_SCALE = 1e6;

  function zoomViewportAt(viewport, screenPoint, factor) {
    const oldScale = Number.isFinite(viewport?.scale) && viewport.scale > 0 ? viewport.scale : 1;
    const oldX = Number.isFinite(viewport?.x) ? viewport.x : 0;
    const oldY = Number.isFinite(viewport?.y) ? viewport.y : 0;
    const screenX = Number.isFinite(screenPoint?.x) ? screenPoint.x : 0;
    const screenY = Number.isFinite(screenPoint?.y) ? screenPoint.y : 0;
    const multiplier = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const requestedScale = oldScale * multiplier;
    const scale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, requestedScale));

    // Keep the world coordinate underneath the cursor fixed on screen.
    const worldX = (screenX - oldX) / oldScale;
    const worldY = (screenY - oldY) / oldScale;
    return {
      ...viewport,
      x: screenX - worldX * scale,
      y: screenY - worldY * scale,
      scale
    };
  }

  function parseCoordinate(input, reference = { x: 0, y: 0 }) {
    const text = String(input).trim().replace(/\s+/g, '');
    if (!text) return null;
    const relative = text.startsWith('@');
    const value = relative ? text.slice(1) : text;
    const polar = value.match(/^(-?(?:\d+\.?\d*|\.\d+))<(-?(?:\d+\.?\d*|\.\d+))$/);
    if (polar) {
      const distance = Number(polar[1]);
      const angle = Number(polar[2]) * Math.PI / 180;
      const origin = relative ? reference : { x: 0, y: 0 };
      return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
    }
    const pair = value.match(/^(-?(?:\d+\.?\d*|\.\d+)),(-?(?:\d+\.?\d*|\.\d+))(?:,(-?(?:\d+\.?\d*|\.\d+)))?$/);
    if (!pair) return null;
    const x = Number(pair[1]), y = Number(pair[2]);
    return { x: relative ? reference.x + x : x, y: relative ? reference.y + y : y, ...(pair[3] === undefined ? {} : { z: Number(pair[3]) }) };
  }

  function segments(entity) {
    if (entity.type === 'line' || entity.type === 'dimension') return [[entity.a, entity.b]];
    if (entity.type === 'rect') {
      const a = { x: entity.x, y: entity.y }, b = { x: entity.x + entity.w, y: entity.y }, c = { x: entity.x + entity.w, y: entity.y + entity.h }, d = { x: entity.x, y: entity.y + entity.h };
      return [[a, b], [b, c], [c, d], [d, a]];
    }
    if (['polyline', 'polygon', 'revcloud'].includes(entity.type)) {
      const edges = entity.points.slice(1).map((point, index) => [entity.points[index], point]);
      if (entity.closed || entity.type === 'polygon' || entity.type === 'revcloud') edges.push([entity.points.at(-1), entity.points[0]]);
      return edges;
    }
    return [];
  }

  function intersection(a, b, c, d) {
    const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denominator) < 1e-10) return null;
    const determinantA = a.x * b.y - a.y * b.x, determinantB = c.x * d.y - c.y * d.x;
    const x = (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) / denominator;
    const y = (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) / denominator;
    const within = (p, q, value) => value >= Math.min(p, q) - 1e-8 && value <= Math.max(p, q) + 1e-8;
    return within(a.x, b.x, x) && within(a.y, b.y, y) && within(c.x, d.x, x) && within(c.y, d.y, y) ? { x, y } : null;
  }

  function snapPoint(point, entities, options = {}) {
    const { threshold = 10, gridSize = 50, gridSnap = true, objectSnap = true, tracking = false, isVisible = () => true } = options;
    const candidates = [];
    const add = (p, kind) => { if (p) candidates.push({ p, kind }); };
    const visibleEntities = entities.filter(entity => entity.visible !== false && isVisible(entity));
    const allSegments = [];
    for (const entity of objectSnap ? visibleEntities : []) {
      const edges = segments(entity);
      allSegments.push(...edges);
      if (entity.type === 'line' || entity.type === 'dimension') {
        add(entity.a, 'ENDPOINT'); add(entity.b, 'ENDPOINT');
        add({ x: (entity.a.x + entity.b.x) / 2, y: (entity.a.y + entity.b.y) / 2 }, 'MIDPOINT');
      } else if (entity.type === 'rect') {
        for (const [a, b] of edges) { add(a, 'ENDPOINT'); add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'MIDPOINT'); }
      } else if (entity.type === 'circle') {
        add({ x: entity.cx, y: entity.cy }, 'CENTER');
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) add({ x: entity.cx + Math.cos(angle) * entity.r, y: entity.cy + Math.sin(angle) * entity.r }, 'QUADRANT');
      } else if (entity.type === 'ellipse') {
        add({ x: entity.cx, y: entity.cy }, 'CENTER');
        add({ x: entity.cx + entity.rx, y: entity.cy }, 'QUADRANT');
        add({ x: entity.cx - entity.rx, y: entity.cy }, 'QUADRANT');
        add({ x: entity.cx, y: entity.cy + entity.ry }, 'QUADRANT');
        add({ x: entity.cx, y: entity.cy - entity.ry }, 'QUADRANT');
      } else if (['polyline', 'polygon', 'revcloud'].includes(entity.type)) {
        entity.points.forEach((p, index) => {
          add(p, 'ENDPOINT');
          if (index) add({ x: (p.x + entity.points[index - 1].x) / 2, y: (p.y + entity.points[index - 1].y) / 2 }, 'MIDPOINT');
        });
        if ((entity.closed || entity.type === 'polygon' || entity.type === 'revcloud') && entity.points.length > 1) add({ x: (entity.points[0].x + entity.points.at(-1).x) / 2, y: (entity.points[0].y + entity.points.at(-1).y) / 2 }, 'MIDPOINT');
      } else if (entity.type === 'arc') {
        add(entity.a, 'ENDPOINT');
        add(entity.c, 'ENDPOINT');
      }
    }
    for (let first = 0; first < allSegments.length; first++) for (let second = first + 1; second < allSegments.length; second++) {
      const p = intersection(...allSegments[first], ...allSegments[second]);
      if (p) add(p, 'INTERSECTION');
    }
    let best = null, bestDistance = threshold;
    for (const candidate of candidates) {
      const distance = Math.hypot(point.x - candidate.p.x, point.y - candidate.p.y);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
    if (best) return { p: { ...best.p }, kind: best.kind };
    if (tracking) {
      for (const candidate of candidates) {
        if (Math.abs(point.y - candidate.p.y) < threshold) return { p: { x: point.x, y: candidate.p.y }, kind: 'TRACK_X' };
        if (Math.abs(point.x - candidate.p.x) < threshold) return { p: { x: candidate.p.x, y: point.y }, kind: 'TRACK_Y' };
      }
    }
    if (!gridSnap || !(gridSize > 0)) return { p: { ...point }, kind: 'FREE' };
    return { p: { x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize }, kind: 'GRID' };
  }

  const api = { FORMAT, VERSION, normalizeDocument, serializeDocument, CommandRegistry, HistoryManager, parseCoordinate, snapPoint, zoomViewportAt, MIN_VIEW_SCALE, MAX_VIEW_SCALE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BahlCore = api;
})(globalThis);