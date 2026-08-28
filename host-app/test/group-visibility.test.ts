// WHO A GALLERY SHOWS, and in what order.
//
// THE BUG THIS PINS. Signed in, the front page listed `Scorbutics/peps_ta_boite_app` — private in
// access.json, readable to that viewer because a `repo_access` row from the GitHub grant says so —
// and the `everything` group did not. The page and the gallery disagreed about one person, because
// the group view was rendered by the node host, whose `readable()` is `canRead(access.json, …)` and
// has never heard of a session, a membership or a share link.
//
// It failed SAFE, which is why it survived: it showed less than the viewer may see, never more. A
// leak gets reported; a silent omission gets shrugged at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMembers, type Member } from '../src/host/group-routes.ts';

const member = (repo: string, slug = 'all'): Member => ({
  repo,
  slug,
  hash: `hash-${repo}`,
  title: repo,
  sha: 'abcdef0',
  live: null,
});

const GROUP: Member[] = [
  member('acme/public-one'),
  member('acme/private'),
  member('acme/public-two'),
];

test('a member the viewer may not see is dropped, not refused', async () => {
  const seen = await visibleMembers(GROUP, async (repo) => repo !== 'acme/private');
  assert.deepEqual(
    seen.map((m) => m.repo),
    ['acme/public-one', 'acme/public-two'],
    'a gallery of three with one you may not see is still a gallery of the two you may',
  );
});

test('a member the DATABASE grants is kept, which is the whole bug', async () => {
  // The predicate the app builds says yes where access.json says no. That difference is the grant.
  const seen = await visibleMembers(GROUP, async () => true);
  assert.equal(seen.length, 3);
  assert.ok(seen.some((m) => m.repo === 'acme/private'));
});

test('frame indices come from the filtered list, so dropping one shifts the rest', async () => {
  // THE REASON THE SHELL AND THE FRAMES HAD TO MOVE TOGETHER. `/g/x/f/1` is the second READABLE
  // member. If one side filtered with access.json and the other with the app's gate, index 1 would
  // mean different lagoons on the two sides — and it would render perfectly while being wrong.
  const denied = await visibleMembers(GROUP, async (repo) => repo !== 'acme/public-one');
  assert.equal(denied[0]?.repo, 'acme/private', 'the list re-indexes from zero after a drop');
  assert.equal(denied[1]?.repo, 'acme/public-two');

  const all = await visibleMembers(GROUP, async () => true);
  assert.notEqual(all[1]?.repo, denied[1]?.repo, 'index 1 is a different member under a different gate');
});

test('nobody sees anything when the gate refuses everything', async () => {
  assert.deepEqual(await visibleMembers(GROUP, async () => false), []);
});
