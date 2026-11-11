// The chart's RULE — which what-ifs a flow reaches — tested on snapshots, without a page. The browser
// half (`chartRegion`) only replays and snapshots; everything it decides is decided here.
// Driven against the built output (`node scripts/build-packages.mjs`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeWhatIfs } from '../dist/lagoon-player.js';

/** JSON with object keys sorted — exactly how `chartRegion` records the store, so the two sides compare. */
const J = (v) => JSON.stringify(v === undefined ? null : v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
/** A snapshot: the region's keys as JSON, the way `chartRegion` records them. */
const snap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, J(v)]));

const CALENDAR = [{ id: 'a' }, { id: 'b' }];
const COUNTED = [{ id: 'a', going: 1 }, { id: 'b' }];
const DENNIS = { id: 'dennis' };
const RICH = { id: 'rich' };
const FULL = { pending: null, error: { eventId: 'b', reason: 'full' } };

// Two flows, as Dennis: one picks `a`; one picks `b` and is refused. The RSVP also moves the
// calendar (a count changes), which is exactly the list that must NOT become situation.
const RUNS = [
  {
    flow: 'picking an event',
    steps: [
      snap({ events: CALENDAR, me: DENNIS, selectedEventId: null, rsvp: null }),
      snap({ events: CALENDAR, me: DENNIS, selectedEventId: 'a', rsvp: null }),
    ],
  },
  {
    flow: 'a full event refuses',
    steps: [
      snap({ events: CALENDAR, me: DENNIS, selectedEventId: null, rsvp: null }),
      snap({ events: CALENDAR, me: DENNIS, selectedEventId: 'b', rsvp: null }),
      snap({ events: COUNTED, me: DENNIS, selectedEventId: 'b', rsvp: FULL }),
    ],
  },
];

const whatIf = (name, keys, extra = {}) => ({ island: 'x-detail', slot: 'detail', name, keys, unbound: [], interactions: false, ...extra });
const place = (...candidates) => placeWhatIfs('events', RUNS, candidates);

test('the situation is what flows move, and a list is never part of it', () => {
  const { situation, whatIfs } = place(whatIf('full', { events: [{ id: 'other' }], me: DENNIS, selectedEventId: 'b', rsvp: FULL }));
  // `events` moved (the count), so it is in the region's moved set — but not in this what-if's situation.
  assert.deepEqual(situation, ['events', 'rsvp', 'selectedEventId']);
  assert.deepEqual(whatIfs[0].situation, ['selectedEventId', 'rsvp']);
  // Its own copy of the calendar differs from the region's, and that does not stop the match.
  assert.equal(whatIfs[0].status, 'reached');
  assert.deepEqual(whatIfs[0].reachedBy, [{ flow: 'a full event refuses', step: 2, context: [], absent: [], emptyHere: [] }]);
});

test('the same situation as SOMEONE ELSE is still reached — who differs, the kind of situation does not', () => {
  const [w] = place(whatIf('full, as Rich', { me: RICH, selectedEventId: 'b', rsvp: FULL })).whatIfs;
  assert.equal(w.status, 'reached');
  assert.deepEqual(w.reachedBy, [{ flow: 'a full event refuses', step: 2, context: ['me'], absent: [], emptyHere: [] }]);
});

test('the same situation with NOBODY where the flows have someone is reached only in another context', () => {
  // "a guest": me is null. Every flow runs as a member, so the situation is reached — never as a guest.
  const [w] = place(whatIf('full, as a guest', { me: null, selectedEventId: 'b', rsvp: FULL })).whatIfs;
  assert.equal(w.status, 'context');
  assert.deepEqual(w.reachedBy, [{ flow: 'a full event refuses', step: 2, context: ['me'], absent: ['me'], emptyHere: ['me'] }]);
});

test('context the what-if SETS where every flow leaves it empty is named the other way round', () => {
  // A section picked, where no flow ever picks one: reached, but only with the section empty.
  const [w] = place(whatIf('full, in the archive', { section: 'archive', selectedEventId: 'b', rsvp: FULL })).whatIfs;
  assert.equal(w.status, 'context');
  assert.deepEqual(w.reachedBy, [{ flow: 'a full event refuses', step: 2, context: ['section'], absent: ['section'], emptyHere: [] }]);
});

test('a match the flow did nothing to earn is the seed, not a reach', () => {
  // Nothing selected, no RSVP — true at every flow's start, and at no step a flow moved it to.
  const [w] = place(whatIf('nothing picked', { selectedEventId: null, rsvp: null })).whatIfs;
  assert.equal(w.status, 'seeded');
  assert.deepEqual(w.reachedBy, []);
});

test('a step that holds the situation only because the flow left it alone is not a reach', () => {
  // `rsvp: null` and `selectedEventId: 'a'` at "picking" step 1 — the flow moved selectedEventId, so this IS reached.
  const [moved] = place(whatIf('a picked, no rsvp', { selectedEventId: 'a', rsvp: null })).whatIfs;
  assert.equal(moved.status, 'reached');
  // `rsvp: null` alone holds at step 1 of both flows, but neither flow moved rsvp to get there.
  const [still] = place(whatIf('no rsvp', { rsvp: null })).whatIfs;
  assert.equal(still.status, 'seeded');
});

test('unreached names the nearest step, preferring a flow that moved the key that differs', () => {
  const saving = { pending: 'b', error: null };
  const [w] = place(whatIf('saving', { selectedEventId: 'b', rsvp: saving })).whatIfs;
  assert.equal(w.status, 'unreached');
  // Both "a full event refuses" steps hold selectedEventId 'b'; step 2 also moved rsvp (to a
  // different value), which makes it the nearer one.
  assert.deepEqual(w.nearest, { flow: 'a full event refuses', step: 2, differs: ['rsvp'] });
});

test('what cannot be placed by keys says why, instead of reading as unreached', () => {
  const { whatIfs } = place(
    whatIf('defaults', {}),
    whatIf('only data', { events: CALENDAR, me: DENNIS }),
    whatIf('page prop', { selectedEventId: 'a' }, { unbound: ['variant'] }),
    whatIf('clicked', { selectedEventId: 'a' }, { interactions: true }),
  );
  assert.deepEqual(whatIfs.map((w) => w.status), ['not-comparable', 'not-comparable', 'not-comparable', 'not-comparable']);
  assert.match(whatIfs[0].reason, /no region key/);
  assert.match(whatIfs[1].reason, /only data and context/);
  assert.match(whatIfs[2].reason, /"variant".*does not bind/);
  assert.match(whatIfs[3].reason, /interactions/);
});

test('object keys compare by value, whatever order they were written in', () => {
  const [w] = place(whatIf('full, keys reordered', { selectedEventId: 'b', rsvp: { error: { reason: 'full', eventId: 'b' }, pending: null } })).whatIfs;
  // The snapshot side was JSON-stringified in declaration order; the comparison must not care.
  assert.notEqual(w.status, 'unreached');
});
