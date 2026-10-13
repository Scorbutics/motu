// `data-flow`'s verdict. An empty render is an output, not a reason to refuse the comparison.
//
// Once islands that render nothing by default stopped being skipped silently, the old rule — any
// scenario rendering nothing is an ERROR — made twelve correct islands in one project red, each for a
// deliberate empty state ("no invitation", "not frozen — silent"). Those still have to be NAMED,
// because an empty scenario is also what a seed that never arrived looks like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataFlowFindings } from '../src/lib/data-flow-verdict.mjs';

const levels = (fs) => fs.map((f) => f.level);

test('all scenarios distinct and non-empty → ok only', () => {
  assert.deepEqual(levels(dataFlowFindings({ distinctOutputs: 3, scenarioCount: 3, empty: [] })), ['ok']);
});

test('a deliberate empty state among others → ok, with a warning naming it', () => {
  const fs = dataFlowFindings({ distinctOutputs: 2, scenarioCount: 2, empty: ['not frozen — silent'] });
  assert.deepEqual(levels(fs), ['warn', 'ok']);
  assert.match(fs[0].msg, /not frozen — silent/);
});

test('every scenario empty → error', () => {
  const fs = dataFlowFindings({ distinctOutputs: 1, scenarioCount: 3, empty: ['a', 'b', 'c'] });
  assert.deepEqual(levels(fs), ['error']);
  assert.match(fs[0].msg, /every scenario rendered NOTHING/);
});

test('identical non-empty renders → error', () => {
  const fs = dataFlowFindings({ distinctOutputs: 1, scenarioCount: 4, empty: [] });
  assert.deepEqual(levels(fs), ['error']);
  assert.match(fs[0].msg, /rendered identically/);
});

test('two empty scenarios collapse into one render → duplicate warning too', () => {
  const fs = dataFlowFindings({ distinctOutputs: 3, scenarioCount: 5, empty: ['x', 'y'] });
  assert.deepEqual(levels(fs), ['warn', 'warn', 'ok']);
});
