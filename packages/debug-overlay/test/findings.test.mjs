// The findings, driven as the pure function they are.
//
// Tested against dist rather than src because this package is TypeScript and has no loader; the
// build runs first in every path that matters (build-packages, then the lagoon bundle), so what is
// exercised here is what ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findingsOf, tallyOf } from '../dist/findings.js';

/** One mounted island, in the shape the lens registry hands over. */
const island = (slot, binds = {}) => ({
  slot,
  spec: { bind: binds },
  store: { get: () => undefined },
});

const base = { islands: [], writes: new Map(), calls: 0, traced: 0, verdicts: new Map() };
const find = (out, id) => out.find((f) => f.id === id);

test('a key that is written and never read is a defect, and it names the key', () => {
  const out = findingsOf({ ...base, islands: [island('form')], writes: new Map([['passwordChanged', new Set(['channel'])]]) });
  const f = find(out, 'unread:passwordChanged');
  assert.ok(f, 'expected a finding for the unread key');
  assert.match(f.title, /passwordChanged/);
  assert.equal(f.tone, 'broken');
  assert.equal(f.decision, true);
  // BOTH WAYS OUT, because a finding that only says what is wrong leaves the reader to invent the fix.
  assert.match(f.detail, /bind it/);
  assert.match(f.detail, /stop/);
});

test('a key with a reader is not reported as unread', () => {
  const out = findingsOf({
    ...base,
    islands: [island('form', { value: 'passwordChanged' })],
    writes: new Map([['passwordChanged', new Set(['channel'])]]),
  });
  assert.equal(find(out, 'unread:passwordChanged'), undefined);
});

test('keys with one reader and no island writer are collapsed into ONE finding', () => {
  // One finding for the region, not one per key: listing four would bury the one that names a defect.
  const out = findingsOf({
    ...base,
    islands: [island('a', { p: 'k1', q: 'k2' }), island('b', { r: 'k3', s: 'k4' })],
  });
  const demote = out.filter((f) => f.id === 'demotion');
  assert.equal(demote.length, 1);
  assert.match(demote[0].title, /All 4 keys/);
  assert.equal(demote[0].decision, false, 'worth knowing, not a decision to make');
});

test('an externally fed key is not a demotion candidate', () => {
  // bind IS how the ocean reaches one island — there is nothing to demote it to.
  const out = findingsOf({
    ...base,
    islands: [island('a', { p: 'fed' })],
    writes: new Map([['fed', new Set(['host'])]]),
  });
  assert.equal(find(out, 'demotion'), undefined);
});

test('a key three islands touch is reported as coupling, and not as a fault', () => {
  const out = findingsOf({
    ...base,
    islands: [island('a', { p: 'shared' }), island('b', { p: 'shared' })],
    writes: new Map([['shared', new Set(['c'])]]),
  });
  const f = find(out, 'coupled:shared');
  assert.ok(f);
  assert.equal(f.tone, 'warn');
  assert.equal(f.decision, false, 'real coupling is worth being deliberate about, not necessarily wrong');
});

test('no findings at all when there is nothing to say', () => {
  assert.deepEqual(findingsOf(base), []);
});

test('the tally counts, and never summarises', () => {
  const out = findingsOf({ ...base, islands: [island('form')], writes: new Map([['k', new Set(['channel'])]]) });
  const t = tallyOf(out);
  assert.equal(t.broken, 1);
  assert.equal(t.decisions, 1);
  assert.deepEqual(Object.keys(t).sort(), ['broken', 'decisions', 'note', 'warn']);
});

test('findings come back loudest first', () => {
  const out = findingsOf({
    ...base,
    islands: [island('a', { p: 'shared' }), island('b', { p: 'shared' })],
    writes: new Map([['shared', new Set(['c'])], ['orphan', new Set(['channel'])]]),
  });
  const tones = out.map((f) => f.tone);
  assert.equal(tones[0], 'broken', 'the defect leads: ' + JSON.stringify(out.map((f) => f.id)));
});

// ── the context tests ────────────────────────────────────────────────────────────────────────
//
// THE WHOLE REASON THIS MODULE ASKS THE SANDBOX. "Nothing was fetched" is a defect on a real page
// and the design working in a lagoon, where the host module was replaced on purpose. A severity that
// ignores that reports a fault against a page behaving exactly as intended — which is how a panel
// teaches people to discount it.
//
// These two run in one file, so the order matters: markSandbox is one-way. Everything above this
// line runs outside a sandbox, and nothing may be added below that assumes otherwise.
test('outside a lagoon, nothing fetched is a fault someone has to resolve', () => {
  const out = findingsOf({ ...base, traced: 48, calls: 0 });
  const f = find(out, 'no-calls');
  assert.equal(f.tone, 'broken');
  assert.equal(f.decision, true);
  assert.match(f.detail, /never asked for/);
});

test('an island on all defaults is broken outside a lagoon', () => {
  const out = findingsOf({ ...base, verdicts: new Map([['form', 'broken']]) });
  const f = find(out, 'defaults:form');
  assert.equal(f.tone, 'broken');
  assert.equal(f.decision, true);
});

test('inside a lagoon the same two facts are notes, not faults', async () => {
  const { markSandbox } = await import('@motu/core');
  markSandbox();
  const out = findingsOf({ ...base, traced: 48, calls: 0, verdicts: new Map([['form', 'broken']]) });

  const calls = find(out, 'no-calls');
  assert.equal(calls.tone, 'neutral', 'a lagoon not fetching is the design working');
  assert.equal(calls.decision, false);
  assert.match(calls.detail, /what a lagoon is for/);

  const defaults = find(out, 'defaults:form');
  assert.equal(defaults.tone, 'warn', 'still worth seeing — but it points at the scenario, not the wiring');
  assert.equal(defaults.decision, false);
  assert.match(defaults.detail, /scenario/);
});

// ── a declared source that nothing installs ──────────────────────────────────────────────────
//
// The finding this list was missing. A region can seed its keys, render perfectly, and be inert
// because no channel was installed — every other signal looks healthy, which is why it needed a
// finding of its own rather than a grey "No channels installed." under a table.

test('a declared source with no channel is reported, and names its keys', () => {
  const out = findingsOf({
    ...base,
    sources: new Map([['teams', ['timelineEntries', 'invitations']]]),
    channelKeys: new Set(),
  });
  const f = find(out, 'source:teams');
  assert.ok(f, 'expected a finding for the uninstalled source');
  assert.match(f.title, /teams/);
  assert.match(f.detail, /timelineEntries/);
  assert.match(f.detail, /invitations/);
  // BOTH WAYS OUT, like every other finding here: install it, or accept the fixed preview.
  assert.match(f.detail, /channelFrom/);
  assert.match(f.detail, /accept/);
  assert.equal(f.decision, true);
});

test('a source a channel actually produced is not reported', () => {
  const out = findingsOf({
    ...base,
    sources: new Map([['teams', ['timelineEntries', 'invitations']]]),
    channelKeys: new Set(['timelineEntries']),
  });
  assert.equal(find(out, 'source:teams'), undefined);
});

test('a region declaring no sources says nothing about sources', () => {
  assert.equal(findingsOf(base).some((f) => f.id.startsWith('source:')), false);
});

// ── decisions outrank observations ───────────────────────────────────────────────────────────
//
// The ordering bug behind all of this: "4 keys could be props" is an optimisation and was sorting
// above a region that is not wired at all, because both are `warn`. Tone is loudness; `decision` is
// whether it is yours to answer, and that is what a reader needs first.

test('a decision sorts above a louder observation', () => {
  const out = findingsOf({
    ...base,
    islands: [island('a', { x: 'shared' }), island('b', { y: 'alsoShared' })],
    sources: new Map([['teams', ['timelineEntries']]]),
    channelKeys: new Set(),
  });
  const decision = out.findIndex((f) => f.decision);
  const observation = out.findIndex((f) => !f.decision);
  assert.ok(decision >= 0, 'expected at least one decision');
  assert.ok(observation >= 0, 'expected at least one observation to sort against');
  assert.ok(decision < observation, `decision at ${decision} should precede observation at ${observation}`);
});
