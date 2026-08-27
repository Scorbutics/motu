// WHAT GETS PAST THE GATE, enumerated.
//
// docs/plan-lagoon-host.md calls `authorize` the entire security surface of the host. Every case here
// is one way in or one way out, and the ones that matter most are the refusals: a gate is judged by
// what it stops, and none of those are visible on any screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, refusalMessage, type AuthorizeDeps, type Project } from '../src/auth/authorize.ts';
import type { AccessStore, CachedAnswer } from '../src/auth/repo-access.ts';
import { FRESH_FOR_MS } from '../src/auth/repo-access.ts';
import { parseRecordPath } from '../src/host/records.ts';

const NOW = new Date('2026-08-27T12:00:00Z');
const ORG = 'org-1';

const PUBLIC: Project = { id: 'p1', orgId: ORG, repo: 'acme/open', visibility: 'public' };
const PRIVATE: Project = { id: 'p2', orgId: ORG, repo: 'acme/secret', visibility: 'private' };

function deps(opts: {
  projects?: Project[];
  members?: Array<[string, string]>;
  access?: Record<string, CachedAnswer>;
} = {}): AuthorizeDeps {
  const projects = opts.projects ?? [PUBLIC, PRIVATE];
  const members = new Set((opts.members ?? []).map(([u, o]) => `${u}:${o}`));
  const access: AccessStore = {
    async get(userId, repo) {
      return opts.access?.[`${userId}:${repo}`] ?? null;
    },
    async put() {},
  };
  return {
    projects: { async byRepo(repo) { return projects.find((p) => p.repo === repo) ?? null; } },
    memberships: { async isMember(u, o) { return members.has(`${u}:${o}`); } },
    access,
    now: NOW,
  };
}

const fresh = (canRead: boolean): CachedAnswer => ({ canRead, checkedAt: NOW });
const stale = (canRead: boolean): CachedAnswer => ({
  canRead,
  checkedAt: new Date(NOW.getTime() - FRESH_FOR_MS - 60_000),
});

// --- the ways in ---------------------------------------------------------------------------------

test('a public project is readable by a stranger, and costs nothing else to decide', async () => {
  // Rule 1, and the "costs nothing else" half matters: a public lagoon must not depend on a
  // membership lookup or on GitHub being reachable. The stores here would throw if consulted.
  const d = deps();
  d.memberships = { async isMember() { throw new Error('membership must not be consulted'); } };
  d.access = { async get() { throw new Error('repo access must not be consulted'); }, async put() {} };
  assert.deepEqual(await authorize(null, 'acme/open', d), { outcome: 'allow', because: 'public' });
});

test('a member of the org reads a private project', async () => {
  const d = deps({ members: [['u1', ORG]] });
  assert.deepEqual(await authorize({ userId: 'u1' }, 'acme/secret', d), {
    outcome: 'allow',
    because: 'membership',
  });
});

test('GitHub saying yes is enough on its own — nobody has to maintain a list', async () => {
  const d = deps({ access: { 'u1:acme/secret': fresh(true) } });
  assert.deepEqual(await authorize({ userId: 'u1' }, 'acme/secret', d), {
    outcome: 'allow',
    because: 'repo-access',
  });
});

test('a stale grant still opens a private lagoon', async () => {
  // The outage rule, reaching all the way through `authorize` rather than only through `decide`.
  const d = deps({ access: { 'u1:acme/secret': stale(true) } });
  assert.equal((await authorize({ userId: 'u1' }, 'acme/secret', d)).outcome, 'allow');
});

// --- the ways out --------------------------------------------------------------------------------

test('a stranger is refused a private project', async () => {
  assert.deepEqual(await authorize(null, 'acme/secret', deps()), {
    outcome: 'deny',
    because: 'no-session',
  });
});

test('a signed-in stranger is refused, and it is not the same refusal', async () => {
  // Same answer to them, different fact for us: `never-asked` means no cached answer exists at all,
  // which is a reason to look at the callback logs rather than a working gate.
  const d = deps();
  assert.deepEqual(await authorize({ userId: 'nobody' }, 'acme/secret', d), {
    outcome: 'deny',
    because: 'never-asked',
  });
});

test('GitHub saying no is a refusal, distinct from never having asked', async () => {
  const d = deps({ access: { 'u1:acme/secret': fresh(false) } });
  assert.deepEqual(await authorize({ userId: 'u1' }, 'acme/secret', d), {
    outcome: 'deny',
    because: 'refused',
  });
});

test('membership in ANOTHER org does not open this project', async () => {
  // The case a `isMember(userId)` lookup that forgot the org would get wrong, handing every private
  // project to anybody who belongs to any org at all.
  const d = deps({ members: [['u1', 'some-other-org']] });
  assert.equal((await authorize({ userId: 'u1' }, 'acme/secret', d)).outcome, 'deny');
});

test('repo access to ANOTHER repo does not open this one', async () => {
  const d = deps({ access: { 'u1:acme/open': fresh(true) } });
  assert.equal((await authorize({ userId: 'u1' }, 'acme/secret', d)).outcome, 'deny');
});

// --- the third answer ----------------------------------------------------------------------------

test('a repo the database has never heard of is an ABSTAIN, not a denial', async () => {
  // What keeps phase 2 from being a migration that has to be perfect on the first try: every lagoon
  // published before `projects` was populated keeps working, answered by the host from access.json.
  assert.deepEqual(await authorize(null, 'acme/never-seen', deps()), {
    outcome: 'abstain',
    because: 'unknown-project',
  });
});

test('abstain does not depend on who is asking', async () => {
  // It is a statement about the DATABASE, not about the viewer. If it ever started varying by session
  // it would be a decision wearing the costume of an absence.
  const d = deps({ members: [['u1', ORG]], access: { 'u1:acme/never-seen': fresh(true) } });
  assert.equal((await authorize({ userId: 'u1' }, 'acme/never-seen', d)).outcome, 'abstain');
});

// --- what counts as a record at all ---------------------------------------------------------------

test('the app and the host read a record path the same way', async () => {
  // Parsed FROM THE RIGHT: everything before the last two segments is the repo. A parser that read
  // from the left would call `/acme/web/latest/all` a repo named `acme` and gate the wrong project.
  assert.deepEqual(parseRecordPath('/acme/web/latest/all'), {
    repo: 'acme/web',
    ref: 'latest',
    slug: 'all',
    isReload: false,
  });
  assert.deepEqual(parseRecordPath('/motu-review/0d7f715fef5e/all'), {
    repo: 'motu-review',
    ref: '0d7f715fef5e',
    slug: 'all',
    isReload: false,
  });
});

test('the reload stream is the same resource, and is gated as one', async () => {
  // `/<repo>/<ref>/<slug>/__motu_reload` must not parse as a repo called `<repo>/latest` — the host
  // strips it for the same reason. Left ungated it would be a live channel into a private project.
  assert.deepEqual(parseRecordPath('/acme/web/latest/all/__motu_reload'), {
    repo: 'acme/web',
    ref: 'latest',
    slug: 'all',
    isReload: true,
  });
});

test("the host's own namespaces are never records", () => {
  // These have their own gating in server.mjs, already tested there. Claiming them here would mean
  // two gates on one URL, and the group route deliberately FILTERS where this one refuses.
  for (const p of ['/g/everything', '/m/abc/f/0', '/api/coverage/known', '/shot/deadbeef']) {
    assert.equal(parseRecordPath(p), null, p);
  }
});

test('what is not a record is not the app’s business', () => {
  for (const p of ['/', '/motu-review/', '/motu-review', '/a/b']) {
    assert.equal(parseRecordPath(p), null, p);
  }
});

test('a path that cannot be decoded is not a record', () => {
  // A malformed escape must not reach the normaliser as something it might accept while the host
  // decodes it into something else — two parsers disagreeing about one URL is a gate bypass.
  assert.equal(parseRecordPath('/acme/%E0%A4%A/latest/all'), null);
});

test('a segment the host would reject is not a record here either', () => {
  // store.mjs's SEGMENT requires an alphanumeric first character. Accepting more than the host does
  // would mean gating a path the host then reads as something else.
  assert.equal(parseRecordPath('/acme/.hidden/latest/all'), null);
  assert.equal(parseRecordPath('/a/b/c/d/latest/all'), null, 'a repo is at most two segments');
});

// --- and what the refusal SAYS ---------------------------------------------------------------------

test('a refusal says what an absence says, down to the leading slash', async () => {
  // The status code alone does not hide anything. Both this app and server.mjs independently rendered
  // their refusal from the request PATH and their not-found from `repo/ref/slug` — one character
  // apart, and enough to tell somebody the repo exists and is private, which is the single fact the
  // 404 was chosen to withhold. Measured before the fix: 326 bytes of text/plain against 24,946 of
  // HTML, which was not even close.
  const message = refusalMessage({ repo: 'acme/secret', ref: 'latest', slug: 'all' });
  assert.equal(message, 'nothing at acme/secret/latest/all');
  assert.ok(!message.includes(' /'), 'no leading slash — that is the whole tell');
});
