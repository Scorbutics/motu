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
import { createPostgrestFetch, readWireCalls, clearWireCalls, readDataReach, subscribeWireCalls, noteGesture } from '../dist/postgrest-fetch.js';
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

// ── told when one lands ──────────────────────────────────────────────────────────────────────
{
  // WITHOUT THIS THE PANEL IS A MOMENT BEHIND. The lens repaints on store writes, and a call whose
  // response changes no region key writes nothing — so the save you just made was not in the list,
  // and "I pressed Enregistrer and nothing appeared" is the report that follows.
  let fired = 0;
  const off = subscribeWireCalls(() => { fired++; });
  clearWireCalls();
  await rpc('set_session_agenda', { p: 1 });
  t('notifies a subscriber when a call lands', fired === 1, String(fired));
  off();
  await rpc('set_session_agenda', { p: 2 });
  t('...and stops after unsubscribing', fired === 1, String(fired));

  // A subscriber that throws must not stop the fake answering the request the app is awaiting.
  const offBad = subscribeWireCalls(() => { throw new Error('panel bug'); });
  const res = await rpc('set_session_agenda', { p: 3 });
  t('a throwing subscriber does not break the response', res.status === 200, String(res.status));
  offBad();
}

// ── what the person did ──────────────────────────────────────────────────────────────────────
{
  // `by` is what a CHECK needs and it is `unattributed` for most real calls — a source fetches
  // outside any island's window. So the log said the same nothing on every row of the save you just
  // made. This is the other axis: the button, and the run of calls it caused.
  clearWireCalls();
  noteGesture('Enregistrer');
  await rpc('set_session_agenda', { p: 1 });
  await rpc('get_team_sessions', { p: 2 });
  const calls = readWireCalls();
  t('tags the calls a gesture caused', calls.every((c) => c.gesture === 'Enregistrer'), String(calls[0]?.gesture));

  // AND STOPS. A gesture owns what follows it, not the page's whole life — a poll arriving a minute
  // later under the last button pressed is a lie that reads exactly like the truth.
  const g = globalThis.__motuGesture;
  globalThis.__motuGesture = { label: g.label, at: g.at - 10_000 };
  clearWireCalls();
  await rpc('set_session_agenda', { p: 3 });
  t('...and stops owning them once the window passes', readWireCalls()[0]?.gesture === undefined, String(readWireCalls()[0]?.gesture));
  globalThis.__motuGesture = undefined;
}

// ── two presses of the same button ───────────────────────────────────────────────────────────
{
  // THE BUG THIS CLOSES. Every save on a real screen is called "Enregistrer" — the agenda, the
  // commitment banner, the settings dialog — so grouping by the LABEL merged two separate actions
  // into one run and reported the second one's calls as part of the first.
  clearWireCalls();
  noteGesture('session-tab · Enregistrer');
  await rpc('set_session_agenda', { p: 1 });
  noteGesture('session-tab · Enregistrer');
  await rpc('set_session_agenda', { p: 2 });
  const [first, second] = readWireCalls();
  t('same label, two presses, two ids', first.gestureId !== second.gestureId, `${first.gestureId} vs ${second.gestureId}`);
  t('...and the label is still carried', second.gesture === 'session-tab · Enregistrer', String(second.gesture));
  globalThis.__motuGesture = undefined;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
