// WHO REACHED FOR IT — the half `data-reach` needed before it could be a check rather than a readout.
//
// A reach is attributed at REQUEST time, like `traced` reads its island: a fetch starts inside an
// owner's window and resolves long after it has closed, so asking afterwards charges everything to
// nobody. These tests drive the fake through each window and read `readDataReach().by`.
//
// The attribution matters because the two owners declare in different places — an island's reach is
// its own `contract.ambient`, a source's is `reaches` on the source — so charging one to the other
// reports a correct declaration as a violation.
import { createPostgrestFetch, readUnscopedRequests, readDataReach } from '../dist/postgrest-fetch.js';
import { runWithIsland, runWithSource } from '@motu/core';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

const BASE = 'https://lagoon.invalid';
const fetchFn = createPostgrestFetch({
  baseUrl: BASE,
  tables: { shots: { rows: [{ id: 's-1', repo: 'acme/web' }] } },
  fixtures: [{ service: 'accept_shots', method: 'rpc', response: { ok: true } }],
});
const read = (path) => fetchFn(`${BASE}${path}`, { method: 'GET', headers: {} });
const rpc = (name) =>
  fetchFn(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

readUnscopedRequests();
readDataReach();

// --- no window open ------------------------------------------------------------------------------
{
  await read('/rest/v1/shots?select=*');
  const { by } = readDataReach();
  t('a reach with no window open is unattributed, not silently charged to someone',
    by.unattributed?.includes('table:shots(select)') === true, JSON.stringify(by));
}

// --- an island's own reach ----------------------------------------------------------------------
{
  await runWithIsland('x-shot-list', () => read('/rest/v1/shots?select=*'));
  const { by } = readDataReach();
  t('a reach inside an island window is charged to that island',
    by['island:x-shot-list']?.includes('table:shots(select)') === true, JSON.stringify(by));
  t('and nothing lands under unattributed', by.unattributed === undefined, JSON.stringify(by));
}

// --- a declared source's reach ------------------------------------------------------------------
{
  await runWithSource('shots', () => rpc('accept_shots'));
  const { by } = readDataReach();
  t('a reach inside a source window is charged to that source',
    by['source:shots']?.includes('rpc:accept_shots') === true, JSON.stringify(by));
}

// --- a source running while an island renders ---------------------------------------------------
// THE CASE THAT DECIDES THE DESIGN. A channel's work can run while an island's window is open — a
// source reacting to a store change the island's own render caused. The source declared the reach, so
// the source owns it; charging it to the island would fail a correct `contract.ambient`.
{
  await runWithIsland('x-shot-list', () => runWithSource('shots', () => read('/rest/v1/shots?select=*')));
  const { by } = readDataReach();
  t('a source nested inside an island window wins — the source declared it',
    by['source:shots']?.includes('table:shots(select)') === true && by['island:x-shot-list'] === undefined,
    JSON.stringify(by));
}

// --- the window closes ---------------------------------------------------------------------------
{
  runWithIsland('x-shot-list', () => {});
  await read('/rest/v1/shots?select=*');
  const { by } = readDataReach();
  t('the window does not leak past its own call',
    by.unattributed?.includes('table:shots(select)') === true && by['island:x-shot-list'] === undefined,
    JSON.stringify(by));
}

// --- the aggregate still works -------------------------------------------------------------------
{
  await runWithIsland('x-shot-list', () => read('/rest/v1/shots?select=*'));
  const reach = readDataReach();
  t('the aggregate view is unchanged by the split', reach.tables.shots?.includes('select') === true,
    JSON.stringify(reach.tables));
  t('an entry is deduped per owner', reach.by['island:x-shot-list'].length === 1,
    JSON.stringify(reach.by));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
