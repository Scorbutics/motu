// THE CALLS THEMSELVES, not the set of names.
//
// `readDataReach()` answers "did this screen touch `team_schedules`" — the question a DECLARATION
// asks. It cannot answer "did my save actually send the new hour", which is the question a person
// asks when a screen appears to do nothing, and which no other tool can answer here: the fake fetch
// replies without touching the network, so the browser's own Network panel is empty by construction.
//
// The bug this closes, three times over on one project: a write RPC answering `{ success: true }`
// and recording nothing looks EXACTLY like a page that is not wired. One row — the call fired, with
// the right payload, and the read came back unchanged — separates the two in a second.
import { createPostgrestFetch, readWireCalls, clearWireCalls, readDataReach } from '../dist/postgrest-fetch.js';
import { runWithIsland } from '@motu/core';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

const BASE = 'https://lagoon.invalid';
const fetchFn = createPostgrestFetch({
  baseUrl: BASE,
  tables: { teams: { rows: [{ id: 't-1', name: 'Conseil' }, { id: 't-2', name: 'Mission' }] } },
  fixtures: [
    { service: 'set_session_agenda', method: 'rpc', response: { success: true } },
    { service: 'refused_write', method: 'rpc', response: { success: false, error: 'not_allowed' } },
  ],
});

const rpc = (name, body) =>
  fetchFn(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

clearWireCalls();
readDataReach();

// ── what was sent ────────────────────────────────────────────────────────────────────────────
await rpc('set_session_agenda', { p_session_id: 'session-next', p_agenda: 'Mes tarifs 2027' });
{
  const [call] = readWireCalls();
  t('records the target in the declaration\'s own spelling', call?.target === 'rpc:set_session_agenda', String(call?.target));
  // THE PAYLOAD IS THE POINT. Without it the row says a call happened, which the reach set already
  // said; with it you can see the new value leaving, which is what "did my save work" means.
  t('keeps the payload that was sent', JSON.stringify(call?.request) === JSON.stringify({ p_session_id: 'session-next', p_agenda: 'Mes tarifs 2027' }), JSON.stringify(call?.request));
  t('records the status', call?.status === 200, String(call?.status));
  t('summarises the response rather than keeping it', call?.response === 'success', String(call?.response));
}

// ── a read, and what came back ───────────────────────────────────────────────────────────────
clearWireCalls();
await fetchFn(`${BASE}/rest/v1/teams?select=*`);
{
  const [call] = readWireCalls();
  t('a table read records its verb and query', call?.target === 'table:teams' && call?.method === 'GET', `${call?.target} ${call?.method}`);
  // A ROW COUNT, never the rows: a read can answer with a whole table, and a log holding every row it
  // ever saw is a memory leak wearing a diagnostic's clothes.
  t('a read summarises as a row count', call?.response === '2 row(s)', String(call?.response));
}

// ── the rows worth seeing ────────────────────────────────────────────────────────────────────
clearWireCalls();
await rpc('no_such_rpc', { p: 1 });
{
  const [call] = readWireCalls();
  t('an unanswered call is recorded, not dropped', call?.target === 'rpc:no_such_rpc', String(call?.target));
  // It 404s and the app's own error handling swallows it — one of the ways a screen goes quiet with
  // nothing on it to see. The log is where it becomes visible.
  t('...and carries its failing status', call?.status === 404, String(call?.status));
}

clearWireCalls();
await rpc('refused_write', { p: 1 });
t('a refusal is summarised as one', readWireCalls()[0]?.response === 'refused: not_allowed', String(readWireCalls()[0]?.response));

// ── who asked ────────────────────────────────────────────────────────────────────────────────
clearWireCalls();
await runWithIsland('x-session-tab', () => rpc('set_session_agenda', { p_session_id: 's' }));
{
  // The same attribution `data-reach` uses. It is what makes this better than a network panel: not
  // "a POST happened" but "the session tab asked for it".
  const [call] = readWireCalls();
  t('attributes the call to the island that made it', call?.by === 'island:x-session-tab', String(call?.by));
}

// ── ordering and bounds ──────────────────────────────────────────────────────────────────────
clearWireCalls();
for (let i = 0; i < 5; i++) await rpc('set_session_agenda', { n: i });
{
  const calls = readWireCalls();
  t('keeps them in order, oldest first', calls.map((c) => c.request.n).join(',') === '0,1,2,3,4', calls.map((c) => c.request?.n).join(','));
  t('numbers them monotonically', calls.every((c, i) => i === 0 || c.seq > calls[i - 1].seq));
}

clearWireCalls();
// A lagoon left open re-fetches forever, so the log is a RING. 250 calls against a cap of 200.
for (let i = 0; i < 250; i++) await rpc('set_session_agenda', { n: i });
{
  const calls = readWireCalls();
  t('is bounded — an open lagoon cannot grow it without limit', calls.length === 200, String(calls.length));
  t('...and drops the OLDEST, keeping what just happened', calls[calls.length - 1].request.n === 249 && calls[0].request.n === 50,
    `${calls[0].request?.n}..${calls[calls.length - 1].request?.n}`);
}

// ── a payload too large to hold ──────────────────────────────────────────────────────────────
clearWireCalls();
await rpc('set_session_agenda', { p_sessions: Array.from({ length: 400 }, (_, i) => ({ i, note: 'a regenerated series is kilobytes' })) });
{
  const call = readWireCalls()[0];
  // Truncated and SAID to be, rather than silently cut: a payload that looks complete but is not is
  // worse than one that admits it.
  t('truncates a large payload and says so', typeof call?.request === 'string' && /chars\)$/.test(call.request), String(call?.request).slice(-40));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
