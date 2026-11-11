// Values in plain words, and where a key comes from — what the island card and the region sheet say.
// Against dist, like the rest of this package's tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainValue, keyOrigins } from '../dist/model.js';

const EVENTS = [
  { id: 'e1', title: 'Chapter meetup' },
  { id: 'e3', title: 'Newcomers’ welcome evening' },
  { id: 'e4', title: 'Coastal walk and talk' },
];
const REGION = { events: EVENTS, me: { id: 'm1', name: 'Dennis Shaw' } };

test('an id is said as the record it names, found in the region’s own lists', () => {
  assert.equal(plainValue('e3', REGION), 'Newcomers’ welcome evening');
  // …and stays itself when nothing names it, rather than inventing a meaning.
  assert.equal(plainValue('e9', REGION), 'e9');
});

test('a record is said by its title or name — or a person by first name and surname', () => {
  assert.equal(plainValue(REGION.me, REGION), 'Dennis Shaw');
  // The demo's members carry firstname/surname and no `name`; the card read "id: 0000…, firstname: …".
  assert.equal(plainValue({ id: 'm1', firstname: 'Dennis', surname: 'Shaw', photo: null }), 'Dennis Shaw');
  assert.equal(plainValue({ firstName: 'Ada', lastName: 'Lovelace' }), 'Ada Lovelace');
});

test('an id is never listed among an object’s fields', () => {
  assert.equal(plainValue({ id: 'x9', scope: 'all' }), 'scope: all');
});

test('a list by its count and first entries; ids in it are resolved too', () => {
  assert.equal(plainValue(EVENTS, REGION), '3 — Chapter meetup, Newcomers’ welcome evening, …');
  assert.equal(plainValue(['e4', 'e1'], REGION), '2 — Coastal walk and talk, Chapter meetup');
  assert.equal(plainValue([{ x: 1 }, { x: 2 }], REGION), '2 items');
  assert.equal(plainValue([], REGION), 'none');
});

test('an object with nothing set says so; otherwise its set fields', () => {
  assert.equal(plainValue({ pending: null, error: null }), 'nothing set');
  assert.equal(plainValue({ scope: 'all', kind: null }), 'scope: all');
  assert.equal(plainValue({ pending: null, error: { eventId: 'e3', reason: 'full' } }, REGION), 'error: 2 fields');
});

test('the empty cases are words, not JSON', () => {
  assert.equal(plainValue(null), 'nothing');
  assert.equal(plainValue(undefined), 'not given');
  assert.equal(plainValue(false), 'no');
  assert.equal(plainValue(0), '0');
});

test('a key comes from the island that writes it, else the source that produces it, else the page', () => {
  const o = keyOrigins(
    [{ slot: 'event-list', keys: ['selectedEventId'] }, { slot: 'event-filters', keys: ['filter'] }],
    { events: ['events', 'rsvp'] },
  );
  assert.deepEqual(o.get('selectedEventId'), { owner: 'event-list', said: 'chosen by event-list' });
  assert.deepEqual(o.get('rsvp'), { owner: 'source:events', said: 'fed by source:events' });
  assert.equal(o.get('me'), undefined); // the caller says "set by the page"
});
