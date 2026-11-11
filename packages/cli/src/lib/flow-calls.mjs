// `flow-calls`: a flow step (or a screen) that made a backend call NOTHING declared fails.
//
// WHY. On 2026-11-11 Peps' screens made four calls nothing answered — `member_feature_grants`,
// `notifications`, `ticket_replies`, `business_services`. The app swallowed each error and rendered a
// plausible page, every check passed, and only the dock's call signals showed them: a signal is
// something an agent never reads. So a call that no fixture, table or route answered is now a
// finding, attributed to the step that caused it.
//
// A DECLARED failure is not one: a fixture's `status: 500` is the state "a failing search" working,
// and the live feed marks it `declared` (core's `LiveCall`).

/** What to declare so this call is answered — in the declaration's own spelling. */
export function callFix(call) {
  const label = String(call.label ?? '');
  if (!call.status) return `the call never got an answer${call.error ? ` (${String(call.error).slice(0, 120)})` : ''}`;
  let m;
  if ((m = /^table:([^(]+)/.exec(label))) return `declare the table \`${m[1]}\` in the wire's tables, or a fixture for it`;
  if ((m = /^rpc:(.+)$/.exec(label))) return `declare a fixture for the rpc \`${m[1]}\``;
  if ((m = /^fn:(.+)$/.exec(label))) return `declare a fixture for the edge function \`${m[1]}\``;
  if ((m = /^route:(\S+) (.+)$/.exec(label))) return `declare a fixture for ${m[1]} ${m[2]} (an appRoutes route)`;
  if ((m = /^([\w$]+)\.([\w$]+)$/.exec(label))) return `declare a fixture for ${m[1]}/${m[2]}`;
  return `declare an answer for ${label || call.url}`;
}

/** One line per undeclared call: what was asked, what came back, and what to declare. */
export function describeCall(call) {
  const answer = call.status ? `${call.status}${call.error ? ` ${String(call.error).replace(/\s+/g, ' ').slice(0, 90)}` : ''}` : 'no answer';
  return `${call.method} ${call.label || call.url} → ${answer} (by ${call.owner}) — ${callFix(call)}`;
}

/**
 * Report the calls a run's steps made that nothing declared.
 *
 * `steps` carry `{ where, undeclared, calls }`. Same call made twice in one step is said once with a
 * count: a refetch loop is one finding, not a wall.
 */
export function reportFlowCalls(report, steps, what = 'flow step(s)') {
  let total = 0;
  let bad = 0;
  for (const s of steps) {
    total += s.calls ?? 0;
    const seen = new Map();
    for (const c of s.undeclared ?? []) {
      const k = `${c.method} ${c.label || c.url} ${c.status}`;
      seen.set(k, { call: c, n: (seen.get(k)?.n ?? 0) + 1 });
    }
    for (const { call, n } of seen.values()) {
      bad++;
      report.error('flow-calls', `${s.where}: ${describeCall(call)}${n > 1 ? ` (×${n})` : ''}`);
    }
  }
  if (!bad) report.ok('flow-calls', `every call the ${what} made was answered by a declaration`, { n: total, of: 'call(s)' });
}
