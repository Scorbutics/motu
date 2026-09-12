// THE LIVE FEED: a call that has LANDED, with the two facts that decide what to do about it.
//
// `outbound-ledger.test.mjs` covers the other half — an ask recorded when it LEAVES, which is the
// ledger a declaration is compared against. This is the half a person reads: the address it went to
// and the status that came back, pushed to whoever is watching the moment it arrives.
//
// DEBUG before the modules evaluate, like every diagnostic here: the feed is stripped in production
// by the same build-time constant, and a test that imported first would be asserting on the no-op.
globalThis.__MOTU_DEBUG__ = true;

const { liveCalls, resetLiveCalls, subscribeCalls, runWithSource, runWithIsland } = await import('../dist/index.js');
const { createPostgrestFetch } = await import('@motu/runtime/postgrest-fetch');
const { configure, call, MotuError } = await import('@motu/runtime');

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

const fake = createPostgrestFetch({
  baseUrl: 'https://db.example',
  tables: { shots: { rows: () => [{ id: 1 }] } },
});

// 1. THE WIRE DOOR — the one that has a real address, because the app's own client built it.
{
  resetLiveCalls();
  await runWithSource('shots', () => fake('https://db.example/rest/v1/shots?select=*&club_id=eq.11'));
  const [c] = liveCalls();
  // THE QUERY STRING IS THE POINT. `table:shots(select)` — the declaration's spelling, which is what
  // a check compares — cannot tell you it asked for the wrong club, and that is the bug a person is
  // usually looking at when they go looking at all.
  t('records the address as it was written', c?.url === '/rest/v1/shots?select=*&club_id=eq.11', String(c?.url));
  t('keeps the declared name beside it', c?.label === 'table:shots', String(c?.label));
  t('records the verb and the status', c?.method === 'GET' && c?.status === 200 && c?.ok === true, `${c?.method} ${c?.status} ${c?.ok}`);
  t('and the owner whose window was open', c?.owner === 'source:shots', String(c?.owner));
}

// 2. A FAILURE IS THE ROW WORTH SEEING. A path no fixture answers 404s here and the application's
//    own error handling swallows it, which is one of the ways a screen goes quiet.
{
  resetLiveCalls();
  await fake('https://db.example/rest/v1/rpc/nothing_answers_this', { method: 'POST', body: '{}' });
  const [c] = liveCalls();
  t('a refused call is recorded as not ok', c?.ok === false && c?.status >= 400, `${c?.status} ${c?.ok}`);
  t('and carries what the fake said, so the card can name it', typeof c?.error === 'string' && c.error.length > 0, String(c?.error));
}

// 3. PUSHED, NOT POLLED: the consumer is chrome in another document, and the whole value is being
//    told about something nobody went looking for.
{
  resetLiveCalls();
  const seen = [];
  const off = subscribeCalls((c) => seen.push(c.status));
  await fake('https://db.example/rest/v1/shots?select=*');
  off();
  await fake('https://db.example/rest/v1/shots?select=*');
  t('a subscriber hears the call that landed', seen.length === 1 && seen[0] === 200, JSON.stringify(seen));
  t('and stops hearing them once it unsubscribes', liveCalls().length === 2, String(liveCalls().length));
}

// 4. THE CONTRACT DOOR, whose address only the TRANSPORT knows — and one of the two that ship here
//    has none. An invented URL would be a lie in the surface built to end guessing about where data
//    came from, so the absence is reported as an absence.
{
  resetLiveCalls();
  configure({
    endpoint: (service, method) => `/rest/motu/${service}/${method}`,
    call: async (service) => (service === 'Broken' ? Promise.reject(new MotuError(403, 'nope')) : { ok: true }),
  });
  await runWithIsland('x-member-results', () => call('MemberService', 'search', [1]));
  const [c] = liveCalls();
  t('asks the transport where it went', c?.url === '/rest/motu/MemberService/search', String(c?.url));
  t('names the call the way the contract does', c?.label === 'MemberService.search' && c?.via === 'contract', `${c?.label} ${c?.via}`);
  t('attributes it to the island that asked', c?.owner === 'island:x-member-results', String(c?.owner));

  await call('Broken', 'save', []).catch(() => {});
  const bad = liveCalls()[1];
  t('a rejected call lands too, with its status', bad?.status === 403 && bad?.ok === false, `${bad?.status} ${bad?.ok}`);

  // A TRANSPORT WITH NO ADDRESS says so, rather than being given one that looks real.
  resetLiveCalls();
  configure({ call: async () => ({}) });
  await call('MemberService', 'search', []);
  t('a transport that cannot say leaves the address empty', liveCalls()[0]?.url === '', JSON.stringify(liveCalls()[0]?.url));
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
