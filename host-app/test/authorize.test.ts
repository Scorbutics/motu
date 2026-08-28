// WHAT GETS PAST THE GATE, enumerated.
//
// docs/plan-lagoon-host.md calls `authorize` the entire security surface of the host. Every case here
// is one way in or one way out, and the ones that matter most are the refusals: a gate is judged by
// what it stops, and none of those are visible on any screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, refusalMessage, type AuthorizeDeps, type Project } from '../src/auth/authorize.ts';
import type { ShareLink } from '../src/auth/share-links.ts';
import { tokenHash } from '../src/auth/share-links.ts';
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
  links?: Record<string, ShareLink>;
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
    // Keyed by the DIGEST, exactly as the real store is — so a test that hands `authorize` a token
    // exercises the hashing rather than working around it.
    shareLinks: { async byTokenHash(h) { return opts.links?.[h] ?? null; } },
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
  assert.deepEqual(await authorize({ viewer: null, shareToken: null }, { repo: 'acme/open', ref: 'latest', slug: 'all' }, d), { outcome: 'allow', because: 'public' });
});

test('a member of the org reads a private project', async () => {
  const d = deps({ members: [['u1', ORG]] });
  assert.deepEqual(await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d), {
    outcome: 'allow',
    because: 'membership',
  });
});

test('GitHub saying yes is enough on its own — nobody has to maintain a list', async () => {
  const d = deps({ access: { 'u1:acme/secret': fresh(true) } });
  assert.deepEqual(await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d), {
    outcome: 'allow',
    because: 'repo-access',
  });
});

test('a stale grant still opens a private lagoon', async () => {
  // The outage rule, reaching all the way through `authorize` rather than only through `decide`.
  const d = deps({ access: { 'u1:acme/secret': stale(true) } });
  assert.equal((await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d)).outcome, 'allow');
});

// --- the ways out --------------------------------------------------------------------------------

test('a stranger is refused a private project', async () => {
  assert.deepEqual(await authorize({ viewer: null, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, deps()), {
    outcome: 'deny',
    because: 'no-session',
  });
});

test('a signed-in stranger is refused, and it is not the same refusal', async () => {
  // Same answer to them, different fact for us: `never-asked` means no cached answer exists at all,
  // which is a reason to look at the callback logs rather than a working gate.
  const d = deps();
  assert.deepEqual(await authorize({ viewer: { userId: 'nobody' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d), {
    outcome: 'deny',
    because: 'never-asked',
  });
});

test('GitHub saying no is a refusal, distinct from never having asked', async () => {
  const d = deps({ access: { 'u1:acme/secret': fresh(false) } });
  assert.deepEqual(await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d), {
    outcome: 'deny',
    because: 'refused',
  });
});

test('membership in ANOTHER org does not open this project', async () => {
  // The case a `isMember(userId)` lookup that forgot the org would get wrong, handing every private
  // project to anybody who belongs to any org at all.
  const d = deps({ members: [['u1', 'some-other-org']] });
  assert.equal((await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d)).outcome, 'deny');
});

test('repo access to ANOTHER repo does not open this one', async () => {
  const d = deps({ access: { 'u1:acme/open': fresh(true) } });
  assert.equal((await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/secret', ref: 'latest', slug: 'all' }, d)).outcome, 'deny');
});

// --- the third answer ----------------------------------------------------------------------------

test('a repo the database has never heard of is an ABSTAIN, not a denial', async () => {
  // What keeps phase 2 from being a migration that has to be perfect on the first try: every lagoon
  // published before `projects` was populated keeps working, answered by the host from access.json.
  assert.deepEqual(await authorize({ viewer: null, shareToken: null }, { repo: 'acme/never-seen', ref: 'latest', slug: 'all' }, deps()), {
    outcome: 'abstain',
    because: 'unknown-project',
  });
});

test('abstain does not depend on who is asking', async () => {
  // It is a statement about the DATABASE, not about the viewer. If it ever started varying by session
  // it would be a decision wearing the costume of an absence.
  const d = deps({ members: [['u1', ORG]], access: { 'u1:acme/never-seen': fresh(true) } });
  assert.equal((await authorize({ viewer: { userId: 'u1' }, shareToken: null }, { repo: 'acme/never-seen', ref: 'latest', slug: 'all' }, d)).outcome, 'abstain');
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
    bare: false,
  });
  assert.deepEqual(parseRecordPath('/motu-review/0d7f715fef5e/all'), {
    repo: 'motu-review',
    ref: '0d7f715fef5e',
    slug: 'all',
    isReload: false,
    bare: false,
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
    bare: false,
  });
});

test('the bare address is the same resource, and is gated as one', () => {
  // `/f` is what the frame INSIDE a lagoon's shell asks for: the page without the shell, or the
  // frame would load the shell inside itself for ever. It is the identical bytes at a second
  // address, so it must parse to the identical record — anything that refuses the page has to
  // refuse this, and `authorize` must not be able to tell them apart.
  assert.deepEqual(parseRecordPath('/acme/web/latest/all/__motu_frame'), {
    repo: 'acme/web',
    ref: 'latest',
    slug: 'all',
    isReload: false,
    bare: true,
  });

  // Both suffixes at once: the frame's own reload channel.
  assert.deepEqual(parseRecordPath('/acme/web/latest/all/__motu_frame/__motu_reload'), {
    repo: 'acme/web',
    ref: 'latest',
    slug: 'all',
    isReload: true,
    bare: true,
  });

  // AND A SLUG ACTUALLY CALLED `f` IS UNTOUCHED. This is why the suffix is `__motu_frame` and not
  // `f`: a slug is any segment, so `f` is a legal lagoon name, and for an hour `/acme/web/latest/f`
  // parsed as a bare request for `acme/latest/web`. This assertion is the one that found it.
  assert.deepEqual(parseRecordPath('/acme/web/latest/f'), {
    repo: 'acme/web',
    ref: 'latest',
    slug: 'f',
    isReload: false,
    bare: false,
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

// --- share links -----------------------------------------------------------------------------------
//
// What a link opens, and — more importantly — what it does not.

const LINK_TOKEN = 'share-token-not-a-secret';
const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  projectId: 'p2',
  sha: null,
  slug: null,
  expiresAt: null,
  revokedAt: null,
  ...over,
});
const withLink = (l: ShareLink, over = {}) => deps({ links: { [tokenHash(LINK_TOKEN)]: l }, ...over });
const asker = (shareToken: string | null = null, viewer: { userId: string } | null = null) => ({
  viewer,
  shareToken,
});
const RECORD = { repo: 'acme/secret', ref: 'latest', slug: 'all' };

test('a link opens a private record WITH NO SESSION — that is what it is for', async () => {
  assert.deepEqual(await authorize(asker(LINK_TOKEN), RECORD, withLink(link())), {
    outcome: 'allow',
    because: 'share-link',
  });
});

test('a link is hashed, so the token itself is never what is stored', async () => {
  // The store is keyed by digest in the fixture exactly as in Postgres. Handing `authorize` the raw
  // token and having it find the row is the hashing being exercised rather than worked around.
  const d = deps({ links: { [LINK_TOKEN]: link() } }); // keyed by the RAW token — wrong on purpose
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, d)).outcome, 'deny');
});

test('a revoked link is dead', async () => {
  const d = withLink(link({ revokedAt: new Date(NOW.getTime() - 1000) }));
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, d)).outcome, 'deny');
});

test('an expired link is dead, and the boundary is exclusive', async () => {
  const dead = withLink(link({ expiresAt: NOW }));
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, dead)).outcome, 'deny', 'expiring now is expired');
  const alive = withLink(link({ expiresAt: new Date(NOW.getTime() + 1000) }));
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, alive)).outcome, 'allow');
});

test('a link scoped to a record does not open the record next to it', async () => {
  // The property the whole feature exists for: "the link I sent still resolves" WITHOUT handing over
  // the repo. If this ever passes, a share link is a project key.
  const d = withLink(link({ sha: 'abc123', slug: 'cart' }));
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/secret', ref: 'abc123', slug: 'cart' }, d)).outcome,
    'allow',
  );
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/secret', ref: 'abc123', slug: 'checkout' }, d)).outcome,
    'deny',
    'another slug in the same build',
  );
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/secret', ref: 'def456', slug: 'cart' }, d)).outcome,
    'deny',
    'the same slug in another build',
  );
});

test('null is a wildcard on each axis independently', async () => {
  const buildWide = withLink(link({ sha: 'abc123', slug: null }));
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/secret', ref: 'abc123', slug: 'anything' }, buildWide)).outcome,
    'allow',
  );
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/secret', ref: 'other', slug: 'anything' }, buildWide)).outcome,
    'deny',
  );
});

test('`latest` is not the sha it points at', async () => {
  // Two different intentions: a link to `latest` follows the alias, a link to a sha is immutable.
  // Resolving the alias here would silently turn the second kind into the first.
  const d = withLink(link({ sha: 'abc123' }));
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, d)).outcome, 'deny');
});

test('a link for ANOTHER project does not open this one', async () => {
  const d = withLink(link({ projectId: 'p1' }));
  assert.equal((await authorize(asker(LINK_TOKEN), RECORD, d)).outcome, 'deny');
});

test('a dead link does not take away what a session already gave', async () => {
  // Somebody with real access may follow a stale link to their own project. Denying on the bad token
  // would make the link subtract from what they already had.
  const d = withLink(link({ revokedAt: NOW }), { members: [['u1', ORG]] });
  assert.deepEqual(await authorize(asker(LINK_TOKEN, { userId: 'u1' }), RECORD, d), {
    outcome: 'allow',
    because: 'membership',
  });
});

test('a link does not make a project the database has never heard of readable', async () => {
  // Abstain is a statement about the database. A link cannot conjure a project row, and if it could
  // it would be a way past a gate that was never consulted.
  const d = withLink(link());
  assert.equal(
    (await authorize(asker(LINK_TOKEN), { repo: 'acme/never-seen', ref: 'latest', slug: 'all' }, d)).outcome,
    'abstain',
  );
});
