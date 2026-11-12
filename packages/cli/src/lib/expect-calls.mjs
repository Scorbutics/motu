// `expectCalls` on a flow step: the backend calls that step is allowed to make — and only those.
//
// WHY: the call ledger already recorded every ask (`flow-calls` fails one nothing ANSWERED), but no
// flow could say what a state should ask for. So a change that made a state ask for MORE went unseen
// as long as the extra call was answered: bench/evidence's blind mistake B9 dropped "only fetch the
// remote servers when the store starts empty", every harness default-answered `/servers.json`, and the
// only trace was "1 answered" in the lagoon's calls strip where there had been nothing.
//
//   { expectRender: { list: 'Main shlink' }, expectCalls: [] }                 // asks for nothing
//   { emit: …, expectCalls: ['GET /servers.json'] }                              // exactly this
//
// An entry names a call as `METHOD /path` (query ignored), as `/path` (any method), or by its
// declaration's label (`shots.list`, `table:shots(select)`). Compared as SETS of distinct calls: how
// many times a call repeated is a render detail (StrictMode doubles effects) and not the claim. Every
// call the step made must be named, and every name must have been called.

/** A recorded call, as the lagoon's ledger hands it over. */
const pathOf = (url) => String(url ?? '').split('?')[0];

/** Does this declared entry name this call? */
export function namesCall(entry, call) {
  const e = String(entry).trim();
  const m = e.match(/^([A-Z]+)\s+(\/\S*)$/);
  if (m) return call.method?.toUpperCase() === m[1] && pathOf(call.url) === m[2];
  if (e.startsWith('/')) return pathOf(call.url) === e;
  return call.label === e;
}

/** A call as a person reads it, for messages. */
export const describeCall = (c) => `${c.method} ${pathOf(c.url)}${c.label && c.label !== pathOf(c.url) ? ` (${c.label})` : ''}`;

/**
 * The mismatches between what a step declared and what it called, in the shape flow mismatches take
 * (`{ key, expected, actual }`), or `[]` when it holds. `undefined` declares nothing — no check.
 */
export function expectCallsMismatches(expected, calls) {
  if (expected === undefined) return [];
  const list = Array.isArray(expected) ? expected : [expected];
  const unnamed = [...new Map(calls.filter((c) => !list.some((e) => namesCall(e, c))).map((c) => [describeCall(c), c])).keys()];
  const missing = list.filter((e) => !calls.some((c) => namesCall(e, c)));
  const out = [];
  if (unnamed.length) {
    out.push({
      key: 'calls',
      expected: list.length ? `only ${list.map((e) => JSON.stringify(e)).join(', ')}` : 'no backend call',
      actual: `also called ${unnamed.join(', ')}`,
    });
  }
  if (missing.length) {
    out.push({ key: 'calls', expected: `a call to ${missing.map((e) => JSON.stringify(e)).join(', ')}`, actual: 'never called' });
  }
  return out;
}
