const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

test('legacy document migrates with stable entity and layer identity', () => {
  const migrated = Core.normalizeDocument({ units: 'mm', layers: [{ name: 'Structural', color: '#123456' }], entities: [{ id: 'e7', type: 'line', layer: 'Structural', a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }], nextId: 8 });
  assert.equal(migrated.format, 'BAHL-CAD');
  assert.equal(migrated.version, 1);
  assert.equal(migrated.document.entities[0].id, 'e7');
  assert.equal(migrated.document.entities[0].layerId, migrated.document.layers[0].id);
  assert.equal(migrated.document.entities[0].layer, 'Structural');
  assert.equal(migrated.document.entities[0].locked, false);
});

test('serialized schema reopens without legacy layer-name storage', () => {
  const serialized = Core.serializeDocument({ units: 'mm', layers: [{ id: 'layer-1', name: 'Structural' }], activeLayer: 'Structural', entities: [{ id: 'e1', type: 'line', layer: 'Structural', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }], nextId: 2, grid: true, snap: true, gridSize: 50, majorGrid: 250, viewport: { x: 0, y: 0, scale: 1 } });
  assert.equal(serialized.document.entities[0].layer, undefined);
  assert.equal(Core.normalizeDocument(serialized).document.entities[0].layer, 'Structural');
});

test('document round-trips precision modes, constraints, and parameters', () => {
  const saved = Core.serializeDocument({
    units: 'mm', layers: [{ id: 'layer-1', name: 'Structural' }], activeLayer: 'Structural',
    entities: [], nextId: 1, constraints: [{ id: 'c1', type: 'Length', entityId: 'e1', value: 120, parameter: 'BeamLength' }],
    parameters: [{ id: 'p1', name: 'BeamLength', value: 120 }], grid: true, snap: true,
    ortho: true, polar: false, tracking: true, dynamicInput: false, gridSize: 25, majorGrid: 125,
    viewport: { x: 4, y: 8, scale: 2 }
  });
  const reopened = Core.normalizeDocument(saved);
  assert.deepEqual(reopened.document.constraints, saved.document.constraints);
  assert.deepEqual(reopened.document.parameters, saved.document.parameters);
  assert.deepEqual(reopened.view, saved.view);
});

test('history groups mutations and supports redo', () => {
  let value = 0;
  const history = new Core.HistoryManager({ capture: () => ({ value }), restore: snapshot => { value = snapshot.value; } });
  history.transact('increment', () => { value += 1; });
  assert.equal(history.undo(), 'increment');
  assert.equal(value, 0);
  assert.equal(history.redo(), 'increment');
  assert.equal(value, 1);
});

test('command registry resolves aliases without hardcoded call-site maps', () => {
  const registry = new Core.CommandRegistry();
  let called = false;
  registry.register('LINE', ['L'], () => { called = true; });
  assert.equal(registry.execute('l'), true);
  assert.equal(called, true);
  assert.deepEqual(registry.suggestions('LI'), ['LINE']);
});

test('coordinate parser supports absolute, relative, and polar input', () => {
  assert.deepEqual(Core.parseCoordinate('125.5,-20'), { x: 125.5, y: -20 });
  assert.deepEqual(Core.parseCoordinate('@10,-5', { x: 2, y: 3 }), { x: 12, y: -2 });
  const polar = Core.parseCoordinate('@100<90', { x: 10, y: 20 });
  assert.ok(Math.abs(polar.x - 10) < 1e-8);
  assert.ok(Math.abs(polar.y - 120) < 1e-8);
});

test('ASCII DXF import reads layers and common drafting entities', () => {
  const dxf = [
    '0','SECTION','2','TABLES','0','TABLE','2','LAYER',
    '0','LAYER','2','S-CONC','62','3','6','CONTINUOUS',
    '0','LAYER','2','S-TEXT','62','7','6','CONTINUOUS','0','ENDTAB','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','LINE','8','S-CONC','10','0','20','0','11','100','21','0',
    '0','CIRCLE','8','S-CONC','10','50','20','50','40','10',
    '0','ARC','8','S-CONC','10','50','20','50','40','20','50','0','51','90',
    '0','LWPOLYLINE','8','S-CONC','90','3','70','1','10','0','20','0','10','20','20','0','10','20','20','20',
    '0','TEXT','8','S-TEXT','10','5','20','10','40','2.5','1','TEST',
    '0','ENDSEC','0','EOF'
  ].join('\n');
  const parsed = Core.parseDxf(dxf);
  assert.equal(parsed.entities.length, 5);
  assert.deepEqual(parsed.entities.map(e => e.type), ['line','circle','arc','polyline','text']);
  assert.equal(parsed.entities[0].b.x, 100);
  assert.equal(parsed.entities[1].r, 10);
  assert.equal(parsed.entities[3].closed, true);
  assert.equal(parsed.entities[4].text, 'TEST');
  assert.ok(parsed.layers.some(layer => layer.name === 'S-CONC'));
  assert.ok(parsed.layers.some(layer => layer.name === 'S-TEXT'));
});

test('ASCII DXF import rejects files with no supported entities', () => {
  assert.throws(() => Core.parseDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF'), /No supported DXF entities/);
});

test('viewport zoom keeps the world point under the cursor fixed', () => {
  const viewport = { x: 40, y: -20, scale: 2 };
  const cursor = { x: 420, y: 200 };
  const beforeWorld = {
    x: (cursor.x - viewport.x) / viewport.scale,
    y: (cursor.y - viewport.y) / viewport.scale
  };
  const zoomed = Core.zoomViewportAt(viewport, cursor, 4);
  assert.equal(zoomed.scale, 8);
  assert.ok(Math.abs((cursor.x - zoomed.x) / zoomed.scale - beforeWorld.x) < 1e-9);
  assert.ok(Math.abs((cursor.y - zoomed.y) / zoomed.scale - beforeWorld.y) < 1e-9);
});

test('viewport zoom supports a very broad bounded scale range', () => {
  const cursor = { x: 100, y: 80 };
  const zoomedIn = Core.zoomViewportAt({ x: 0, y: 0, scale: 1 }, cursor, 1e20);
  const zoomedOut = Core.zoomViewportAt({ x: 0, y: 0, scale: 1 }, cursor, 1e-20);
  assert.equal(zoomedIn.scale, Core.MAX_VIEW_SCALE);
  assert.equal(zoomedOut.scale, Core.MIN_VIEW_SCALE);
});

test('snapping resolves geometric points before grid points', () => {
  const line = { type: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  assert.equal(Core.snapPoint({ x: 50, y: 1 }, [line], { threshold: 5 }).kind, 'MIDPOINT');
  const crossing = { type: 'line', a: { x: 37, y: -50 }, b: { x: 37, y: 80 } };
  assert.equal(Core.snapPoint({ x: 37, y: 1 }, [line, crossing], { threshold: 5 }).kind, 'INTERSECTION');
});

test('object snap tracking aligns to nearby snap-point axes', () => {
  const line = { type: 'line', a: { x: 37, y: -50 }, b: { x: 37, y: 80 } };
  assert.deepEqual(
    Core.snapPoint({ x: 39, y: 1 }, [line], { threshold: 5, gridSnap: false, tracking: true }),
    { p: { x: 37, y: 1 }, kind: 'TRACK_Y' }
  );
});

test('object snaps include ellipse quadrants and closed polygon edges', () => {
  const ellipse = { type: 'ellipse', cx: 20, cy: 30, rx: 10, ry: 5 };
  assert.deepEqual(Core.snapPoint({ x: 30, y: 31 }, [ellipse], { threshold: 5 }).p, { x: 30, y: 30 });
  const polygon = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }] };
  assert.equal(Core.snapPoint({ x: 5, y: 10 }, [polygon], { threshold: 2 }).kind, 'MIDPOINT');
});