const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');
const ColumnDetection = require('../column-detection.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'column-detection', name), 'utf8');
}

function detectFixture(name) {
  const parsed = Core.parseDxf(fixture(name));
  const detection = ColumnDetection.detectColumns(parsed.entities, parsed.layers, parsed.units);
  return { parsed, detection };
}

test('recognises represented columns from a mixed DXF and retains source entity traceability', () => {
  const { parsed, detection } = detectFixture('recognition-mixed-mm.dxf');
  assert.equal(parsed.units, 'mm');
  assert.equal(detection.candidates.length, 5);
  assert.equal(detection.stats.duplicatesMerged, 1);
  assert.equal(detection.stats.unclassifiedPlausibleShapes, 2);

  const square = detection.candidates.find(candidate => candidate.geometry.centerX === 150 && candidate.geometry.centerY === 150);
  assert.ok(square);
  assert.equal(square.geometry.width, 300);
  assert.equal(square.geometry.depth, 300);
  assert.equal(square.geometry.unit, 'mm');
  assert.ok(square.sourceEntityIds.length >= 5, 'closed polyline and four overlaid line entities are referenced');
  assert.ok(square.evidence.includes('structural_layer_match'));
  assert.ok(square.evidence.includes('overlaid_geometry_merged'));
  assert.equal(square.reviewStatus, 'needs_review');

  const circular = detection.candidates.find(candidate => candidate.geometry.shape === 'circle');
  assert.ok(circular);
  assert.equal(circular.geometry.width, 300);
  assert.equal(circular.geometry.depth, 300);

  const labelled = detection.candidates.find(candidate => candidate.evidence.includes('column_annotation'));
  assert.ok(labelled);
  assert.equal(labelled.geometry.width, 400);

  const gridded = detection.candidates.find(candidate => candidate.evidence.includes('structural_grid_intersection'));
  assert.ok(gridded);
  assert.equal(gridded.sourceEntityIds.length, 1, 'outline source geometry stays distinct from grid references');
});

test('recognises a closed rectangle drawn as four connected lines', () => {
  const { detection } = detectFixture('recognition-mixed-mm.dxf');
  const result = detection.candidates.find(candidate => candidate.geometry.centerX === 1150);
  assert.ok(result);
  assert.equal(result.geometry.width, 300);
  assert.equal(result.geometry.depth, 300);
  assert.equal(result.sourceEntityIds.length, 4);
  assert.ok(result.evidence.includes('connected_line_boundary'));
});

test('retains the source drawing unit and interprets metre geometry without rescaling coordinates', () => {
  const { parsed, detection } = detectFixture('recognition-meters.dxf');
  assert.equal(parsed.units, 'm');
  assert.equal(detection.units, 'm');
  assert.equal(detection.candidates.length, 1);
  assert.equal(detection.candidates[0].geometry.width, 0.3);
  assert.equal(detection.candidates[0].geometry.depth, 0.25);
  assert.equal(detection.candidates[0].geometry.unit, 'm');
  assert.ok(detection.candidates[0].evidence.includes('typical_column_proportions'));
});

test('does not classify plausible-sized furniture circles or architectural rectangles without column context', () => {
  const { detection } = detectFixture('recognition-mixed-mm.dxf');
  assert.ok(detection.stats.unclassifiedPlausibleShapes >= 2);
  assert.ok(!detection.candidates.some(candidate => candidate.sourceLayers.includes('A-FURNITURE')));
  assert.ok(!detection.candidates.some(candidate => candidate.sourceLayers.includes('A-ARCH')));
});

test('candidate IDs and initial review state are deterministic for the same drawing', () => {
  const first = detectFixture('recognition-mixed-mm.dxf').detection.candidates;
  const second = detectFixture('recognition-mixed-mm.dxf').detection.candidates;
  assert.deepEqual(first.map(candidate => candidate.id), second.map(candidate => candidate.id));
  assert.ok(first.every(candidate => candidate.reviewStatus === 'needs_review'));
});

test('column layer evidence does not hide unusual dimensions; it adds a warning for engineer review', () => {
  const entities = [{
    id: 'e1', type: 'polyline', layer: 'S-COLUMNS', closed: true,
    points: [{x:0,y:0},{x:3000,y:0},{x:3000,y:3000},{x:0,y:3000}]
  }];
  const result = ColumnDetection.detectColumns(entities, [], 'mm');
  assert.equal(result.candidates.length, 1);
  assert.ok(result.candidates[0].warnings.includes('dimensions_outside_initial_column_screen'));
  assert.equal(result.candidates[0].reviewStatus, 'needs_review');
});

test('unsupported INSERT records remain reported while supported geometry can still be analysed', () => {
  const { parsed, detection } = detectFixture('unsupported-block-symbol.dxf');
  assert.equal(parsed.unsupportedEntityTypes.INSERT, 1);
  assert.equal(detection.candidates.length, 0);
  assert.ok(detection.notes.some(note => note.includes('BLOCK/INSERT')));
});

test('empty or unrelated drawings return an empty detection result instead of guessed columns', () => {
  const result = ColumnDetection.detectColumns([
    { id:'r1', type:'polyline', layer:'ROOMS', closed:true, points:[{x:0,y:0},{x:1000,y:0},{x:1000,y:900},{x:0,y:900}] }
  ], [], 'mm');
  assert.deepEqual(result.candidates, []);
  assert.equal(result.stats.columnsDetected, 0);
});
