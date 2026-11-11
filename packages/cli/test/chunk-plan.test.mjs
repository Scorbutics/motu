// How a chunked lagoon is cut. Each graph is a shape a real project produced:
//
//   - the demo: one directory holds both the UI its islands import and the screens that import its
//     regions — whole-directory chunks imported each other and the page died on
//     `Cannot access 'n' before initialization`;
//   - Peps: its lagoon aliases `next/navigation` to a stub in the lagoon's own source, so a dependency
//     imports app code — merging cycles made one 2.1 MB chunk of vendor, motu and every island;
//   - Peps again: its pages import its regions and its regions import the pages' components, so
//     merging directories on a cycle made one 600 kB chunk that every edit changed.
//
// The properties checked are the ones that decide whether the page runs and whether an edit stays
// small: the chunk graph is acyclic, a module cycle is never split, and a region keeps its own chunk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkOf } from '../src/lib/lagoon-vite.mjs';

const PATHS = { motuRoot: '/m', archipelagosDir: '/p/src/archipelagos', islandsDir: '/p/src/islands', hostRoot: '/p' };
const BIG = 'x'.repeat(5000);

/** Run the cut over a graph `{ id: [imports] }`; the first id is the entry. */
function cut(graph, { small = [] } = {}) {
  const ids = Object.keys(graph);
  const meta = {
    getModuleIds: () => ids[Symbol.iterator](),
    getModuleInfo: (id) => ({ importedIds: graph[id] ?? [], isEntry: id === ids[0], code: small.includes(id) ? 'x' : BIG }),
  };
  const fn = chunkOf(PATHS);
  const plan = new Map(ids.map((id) => [id, fn(id, meta) ?? '(entry)']));
  return plan;
}

/** The chunk-level import graph has no cycle. */
function assertAcyclic(graph, plan) {
  const edges = new Map();
  for (const [id, deps] of Object.entries(graph)) {
    for (const d of deps) {
      const a = plan.get(id);
      const b = plan.get(d);
      if (a === b) continue;
      if (!edges.has(a)) edges.set(a, new Set());
      edges.get(a).add(b);
    }
  }
  const state = new Map();
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    assert.notEqual(state.get(n), 'open', `chunk cycle: ${[...path, n].join(' -> ')}`);
    state.set(n, 'open');
    for (const m of edges.get(n) ?? []) visit(m, [...path, n]);
    state.set(n, 'done');
  };
  for (const n of edges.keys()) visit(n, []);
}

test('the demo: a directory both below the islands and above the regions does not make a cycle', () => {
  const graph = {
    '/p/.motu/cache/lagoon/main.tsx': ['/p/src/screens/screens.ts', '/p/src/archipelagos/members/members.archipelago.ts'],
    '/p/src/screens/screens.ts': ['/p/src/archipelagos/members/members.archipelago.ts', '/p/src/ui/frame.tsx'],
    '/p/src/archipelagos/members/members.archipelago.ts': ['/p/src/islands/member-card/element.ts', '/m/packages/react/index.js'],
    '/p/src/islands/member-card/element.ts': ['/p/src/ui/card.tsx', '/m/packages/react/index.js'],
    '/p/src/ui/card.tsx': ['/p/node_modules/react/index.js'],
    '/p/src/ui/frame.tsx': ['/p/node_modules/react/index.js'],
    '/m/packages/react/index.js': ['/p/node_modules/react/index.js'],
    '/p/node_modules/react/index.js': [],
  };
  const plan = cut(graph);
  assertAcyclic(graph, plan);
  assert.equal(plan.get('/p/src/archipelagos/members/members.archipelago.ts'), 'region-members');
  assert.equal(plan.get('/p/src/islands/member-card/element.ts'), 'island-member-card');
  assert.equal(plan.get('/p/node_modules/react/index.js'), 'vendor');
  assert.equal(plan.get('/m/packages/react/index.js'), 'motu');
  assert.equal(plan.get('/p/.motu/cache/lagoon/main.tsx'), '(entry)');
});

test('Peps: a stub a dependency imports is pulled into vendor, and nothing else is', () => {
  const graph = {
    '/p/motu/roots/lagoon/main.tsx': ['/p/src/archipelagos/team/team.archipelago.ts', '/p/node_modules/next-thing/index.js'],
    '/p/node_modules/next-thing/index.js': ['/p/motu/roots/lagoon/src/host-stubs/navigation.ts'],
    '/p/motu/roots/lagoon/src/host-stubs/navigation.ts': ['/m/packages/react/index.js'],
    '/m/packages/react/index.js': [],
    '/p/src/archipelagos/team/team.archipelago.ts': ['/p/src/islands/team-card.island.ts', '/m/packages/react/index.js'],
    '/p/src/islands/team-card.island.ts': ['/p/components/Card.tsx'],
    '/p/components/Card.tsx': ['/p/node_modules/next-thing/index.js'],
  };
  const plan = cut(graph);
  assertAcyclic(graph, plan);
  assert.equal(plan.get('/p/motu/roots/lagoon/src/host-stubs/navigation.ts'), 'vendor', 'the stub joins the dependency that imports it');
  assert.equal(plan.get('/m/packages/react/index.js'), 'vendor', 'and so does what the stub imports — vendor may not import motu back');
  assert.equal(plan.get('/p/src/islands/team-card.island.ts'), 'island-team-card', 'islands stay out of vendor');
  assert.equal(plan.get('/p/src/archipelagos/team/team.archipelago.ts'), 'region-team');
});

test('Peps: pages and regions importing each other through different files keep separate chunks', () => {
  const graph = {
    '/p/motu/roots/lagoon/main.tsx': ['/p/app/actions/page.tsx', '/p/src/archipelagos/actions/actions.archipelago.ts'],
    // The page integrates the region…
    '/p/app/actions/page.tsx': ['/p/src/archipelagos/actions/actions.archipelago.ts', '/p/app/actions/_components/Week.tsx'],
    // …and the region renders the page's own components.
    '/p/src/archipelagos/actions/actions.archipelago.ts': ['/p/app/actions/_components/Grid.tsx', '/p/src/islands/actions-header.island.ts'],
    '/p/src/islands/actions-header.island.ts': ['/p/app/actions/_components/Header.tsx'],
    '/p/app/actions/_components/Grid.tsx': [],
    '/p/app/actions/_components/Header.tsx': [],
    '/p/app/actions/_components/Week.tsx': [],
  };
  const plan = cut(graph);
  assertAcyclic(graph, plan);
  const region = plan.get('/p/src/archipelagos/actions/actions.archipelago.ts');
  assert.match(region, /^region-actions/);
  assert.notEqual(region, plan.get('/p/app/actions/page.tsx'), 'the region is not swallowed by the page');
  assert.notEqual(region, plan.get('/p/app/actions/_components/Grid.tsx'));
  assert.match(plan.get('/p/src/islands/actions-header.island.ts'), /^island-actions-header/);
});

test('a real module cycle is never split across chunks', () => {
  const graph = {
    '/p/main.tsx': ['/p/components/A.tsx'],
    '/p/components/A.tsx': ['/p/lib/B.ts'],
    '/p/lib/B.ts': ['/p/components/A.tsx', '/p/lib/C.ts'],
    '/p/lib/C.ts': [],
  };
  const plan = cut(graph);
  assertAcyclic(graph, plan);
  assert.equal(plan.get('/p/components/A.tsx'), plan.get('/p/lib/B.ts'));
});

test('a run under 4 kB folds into its neighbour rather than becoming a chunk of its own', () => {
  const graph = {
    '/p/main.tsx': ['/p/components/A.tsx'],
    '/p/components/A.tsx': ['/p/lib/tiny.ts', '/p/lib2/big.ts'],
    '/p/lib/tiny.ts': [],
    '/p/lib2/big.ts': [],
  };
  const plan = cut(graph, { small: ['/p/lib/tiny.ts'] });
  assertAcyclic(graph, plan);
  assert.equal(new Set(plan.values()).has('host-lib'), false, 'no chunk for the tiny run');
});
