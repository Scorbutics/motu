// One ledger, three doors — the contract, a traced host module, and the wire.
//
// DEBUG must be on before the modules evaluate: every diagnostic in this framework is stripped in
// production by the same build-time constant, and this ledger is no exception.
globalThis.__MOTU_DEBUG__ = true;

const { traced, runWithIsland, runWithSource, recordOutbound, outboundCalls, outboundLabel, resetOutbound } = await import('../dist/index.js');
const { createPostgrestFetch } = await import('@motu/runtime/postgrest-fetch');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

// 1. THE CONTRACT DOOR — the one no check ever printed before this ledger existed.
{
  resetOutbound();
  runWithIsland('shot-list', () => recordOutbound('contract', 'shots.list()'));
  const [ask] = outboundCalls();
  t('a contract ask is recorded with its island', ask?.via === 'contract' && ask?.owner === 'island:shot-list', JSON.stringify(ask));
}

// 2. THE HOST-MODULE DOOR — `traced`, which already had its own ledger, feeding the shared one.
{
  resetOutbound();
  const fetchFeed = traced('@/lib/services/club-feed', 'fetchClubFeed', async (limit) => [limit]);
  await runWithIsland('club-feed', () => fetchFeed(11));
  const [ask] = outboundCalls();
  t('a traced host-module call joins the ledger', ask?.via === 'host-module' && ask?.name === 'fetchClubFeed' && ask?.args === '11', JSON.stringify(ask));
  // NAME AND ARGS SEPARATE, composed on the way out — the lens wants two columns and a check wants one
  // string, and a wire reach's declared form has no argument half to compose.
  t('the label composes them', outboundLabel(ask) === 'fetchClubFeed(11)', outboundLabel(ask));
  t('and carries the island whose window was open', ask?.owner === 'island:club-feed');
}

// 3. THE WIRE DOOR — recorded in the form `data-reach` compares against declarations, so one readout
//    can show it beside a contract call without translating between two vocabularies.
{
  resetOutbound();
  const fake = createPostgrestFetch({
    baseUrl: 'https://db.example',
    tables: { shots: { rows: () => [{ id: 1 }] } },
  });
  await runWithSource('shots', () => fake('https://db.example/rest/v1/shots?select=*'));
  const wire = outboundCalls().filter((o) => o.via === 'wire');
  t('a wire reach joins the ledger in its declared form', wire[0]?.name === 'table:shots(select)', JSON.stringify(wire));
  t('a reach has no argument half, so its label gains no ()', outboundLabel(wire[0] ?? {}) === 'table:shots(select)', outboundLabel(wire[0] ?? {}));
  t('and is attributed to the SOURCE, not an island', wire[0]?.owner === 'source:shots', JSON.stringify(wire[0]));
}

// 4. A source WINS over an island, as `reachOwner` documents — the two windows can be open at once.
{
  resetOutbound();
  runWithIsland('shot-list', () => runWithSource('shots', () => recordOutbound('contract', 'shots.list()')));
  t('a source open inside an island window owns the ask', outboundCalls()[0]?.owner === 'source:shots');
}

// 5. Nobody's window open is said, not silently charged to the last owner seen.
{
  resetOutbound();
  recordOutbound('wire', 'table:shots(select)');
  t('an ask outside every window is unattributed', outboundCalls()[0]?.owner === 'unattributed');
}

// 6. All three doors coexist in ONE ordered list — the property the merged readout groups on.
{
  resetOutbound();
  recordOutbound('contract', 'shots.list()');
  recordOutbound('wire', 'table:shots(select)');
  recordOutbound('host-module', 'fetchClubFeed(11)');
  t('the ledger holds every door, in order', outboundCalls().map((o) => o.via).join(',') === 'contract,wire,host-module');
  resetOutbound();
  t('reset empties it', outboundCalls().length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
