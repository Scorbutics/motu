# The lagoon host, with accounts

**Status: phases 0, 1, 2, 2b and 3 shipped; 4 planned.** This is the design record for turning `@motu/host` from a
personal preview server into something several people can log into and see only what they should.

The rule this document exists to protect is the one the host already keeps: **a lagoon is one
self-contained HTML file you can open.** Nothing below changes that. Accounts decide who may *fetch*
the file; they do not change what it is.

---

## What exists today

`@motu/host` is 2,334 lines of plain ESM node with no build step.

| file | lines | owns |
|---|---|---|
| `store.mjs` | 701 | content-addressed blobs, `/<repo>/<sha>/<slug>` immutable + `latest` alias, retention, coverage-corpus merge |
| `server.mjs` | 753 | 17 routes |
| `views.mjs` | 448 | the index and group pages |
| `access.mjs` | 138 | per-repo public/private, hashed tokens, constant-time compare |
| `document.mjs` | 65 | wraps the stored fragment in a doctype at serve time |

Two things about it are load-bearing and easy to throw away by accident.

**Private lagoons already work.** `access.mjs` does per-repo visibility and has already solved the
awkward part: *a browser cannot set a header when it follows a link*, so a person reading a private
lagoon carries a cookie. Whatever replaces it must keep that property.

**`store.mjs` should not be rewritten.** Its retention rule — never evict what an alias or a composed
manifest points at, and order eviction by LAST ACCESS rather than publish date — is the kind of
invariant normally learned from an incident. The six-week-old lagoon somebody bookmarked is exactly
the one that must survive ten builds from this morning.

So the gap is not storage and not visibility. It is **identity**: the host has *secrets* (a host-wide
read secret, per-repo ingest tokens) and not *accounts*. "Which private lagoons may I see" is
unanswerable because there is no "I".

---

## What is NOT being used, and why

Read this section before adding anything. Every line here is a decision, not an omission.

- **Supabase Storage — no.** Blobs stay on the filesystem, owned by `store.mjs`. Moving them into
  Storage creates a second source of truth for what exists, and it silently discards the retention
  invariant above, which Storage has no concept of.

  The line is not "files bad, database good". It is **what the data is**: a lagoon blob is large and
  opaque — nobody ever asks it a question, they fetch it whole. Identity and the coverage corpus are
  small and structured, and the whole point of them is being asked questions. So blobs stay on disk,
  and everything you would want to `WHERE` or `ORDER BY` goes in Postgres.
- **PostgREST — no.** A Next app talks to Postgres directly. Nothing here needs a generated REST API.
- **Realtime — no.** Nothing in this product is live.
- **Supabase for scaling — no.** The load is serving static HTML; the bottleneck is disk and
  bandwidth. The tables below are tiny and low-QPS. Connection pooling and read replicas solve a
  problem this workload does not have. Supabase is chosen for **auth parity**, and for nothing else.
- **A managed/hosted database — no.** Postgres is self-hosted beside the host, which keeps the whole
  thing on the tailnet. Hosted Postgres would mean the host needs internet egress, which changes its
  security posture for no gain at this size.

The one component that justifies the stack is **GoTrue**. If the eight-container compose file ever
feels heavy, the honest smaller version is **GoTrue + Postgres only**, with GoTrue served at
`/auth/v1` behind the app's own gateway: `@supabase/ssr` works against that unchanged. Everything
else in the Supabase stack is convenience.

---

## Schema

Org-shaped from the first migration even though there will be one org for a long time. Adding orgs
later means migrating every row that assumed a single tenant; adding them now costs one column.

```sql
orgs         (id, slug, name, created_at)
profiles     (id → auth.users, display_name, github_login)
memberships  (org_id, user_id, role)              -- owner | admin | member | viewer
projects     (id, org_id, repo, visibility)       -- repo = 'Scorbutics/peps_ta_boite_app'
share_links  (id, project_id, sha, slug, token_hash,
              expires_at, revoked_at, created_by)
```

`share_links` is scoped to a **record**, not a project. That is what keeps "the link I sent still
resolves" true without handing over the whole repo. `sha`/`slug` null means the whole project, which
should be rare and worth a second look when it appears.

Hash share-link tokens exactly the way `access.mjs` already hashes ingest tokens — same helper, same
constant-time compare over fixed-width digests. That code is tested (`test/access.test.mjs`, 276
lines) and the failure mode it avoids (a length mismatch throwing a 500 that distinguishes a wrong
token from a wrong-length one) is not obvious enough to re-derive.

---

## Coverage moves out of files and into a table

Today a corpus is `coverage/<repo>/<region>/<keysHash>.json`, read-merged-written with a tmp+rename,
and the accepted set is a second file beside it, `<keysHash>.accepted.json`. That is the part of the
host that should become rows.

**One row per STATE, not one row per corpus.**

```sql
coverage_states (
  project_id   references projects(id) on delete cascade,
  region       text,
  keys_hash    text,
  state_id     text,          -- fingerprintId(fingerprint)
  fingerprint  jsonb,
  count        bigint,
  first_at     timestamptz,
  last_at      timestamptz,
  accepted_at  timestamptz,   -- null = still on the worklist
  primary key (project_id, region, keys_hash, state_id)
)
```

Four things fall out of that primary key, and each of them is a current problem going away:

**`keysHash` bucketing survives, and gets cheaper.** It is in the key, so a corpus recorded against a
different key list still cannot mix with this one. "Add a key to a region and its old rows simply
stop being written to" stays true, and "one file to delete" becomes one `DELETE WHERE keys_hash = …`.

**The accepted set stops being a second file.** It is a nullable column on the state it is about.
That deletes the `<keysHash>.json` versus `<keysHash>.accepted.json` suffix hazard the code already
carries a comment about — a bare `.json` test matches both.

**`forget` becomes a `DELETE`** instead of read, filter, rewrite.

**Concurrent ingest stops losing writes.** This is a genuine correctness fix, not tidiness. Today two
POSTs that arrive together both read the same stored corpus, both merge, and the second rename wins —
the first one's states are gone, silently. An upsert cannot do that.

### The rule that must not be broken

`store.mjs` carries this, and it is right:

> THE FOLD IS NOT REIMPLEMENTED HERE. Merging two corpora is arithmetic on motu's own format, and the
> moment a second copy of it exists the two stop agreeing.

An `ON CONFLICT … DO UPDATE SET count = count + excluded.count, last_at = greatest(…)` **is a second
copy of the fold**, written in SQL. It happens to agree with `mergeCorpora` today. It will not
necessarily agree tomorrow.

Two honest ways to live with that:

- **Row-per-state with a SQL upsert** — what the schema above assumes. Fast, queryable, fixes
  concurrency. It requires a test that folds the same two corpora both ways — through `mergeCorpora`
  in node, and through the upsert — and asserts the results are identical. When `mergeCorpora` grows
  a rule, that test fails and someone decides, instead of the two drifting quietly.
- **Row-per-corpus as `jsonb`** — read, `mergeCorpora` in node, write back. Zero divergence risk and
  the single implementation is preserved, but you keep the lost-update problem and gain no
  queryability. This is the fallback if the divergence test turns out to be hard to keep honest.

Take the first. Write the test in the same commit as the upsert, not after — it is the only thing
standing between this and the exact failure the comment warns about.

### What this unlocks

`motu region coverage` today has to fetch a corpus and fold it client-side to answer "which states did
production reach that no flow previews". As rows, that is a query — per region, ordered by count,
filtered by `accepted_at is null` — which is what makes the corpus useful in the console rather than
only at the CLI.

---

## The one route that matters

Everything security-relevant is this:

```
resolve(repo, ref, slug) → authorize(viewer, project) → store.read(...) → stream
```

`authorize`, in order:

1. project is public → yes
2. viewer has a session and a membership in the project's org → yes
3. a valid, unexpired, unrevoked share link scoping this record → yes
4. otherwise → **404, not 403**

Four is deliberate. A 403 confirms that a private lagoon exists at that address, which is a fact the
asker has not earned.

Then: `Cache-Control: private, no-store`, and the route must never sit behind a shared cache. This
handful of lines is the entire security surface of the host — everything else is presentation.

**Share links and the browser.** A share link arrives as `?k=<token>`. Resolve it once, then set an
httpOnly cookie scoped to that project, because the page's own asset requests follow without the
query string — the same reason `access.mjs` uses a cookie today.

---

## Identity: GitHub OAuth first

The host's projects **are** GitHub repos — `projects.repo` is literally `Scorbutics/peps_ta_boite_app`.
So GitHub identity answers two questions at once: who someone is, and what they may see. If you can
read the repo, you can read its lagoons.

What that buys in phase 1:

- **No SMTP.** Self-hosting GoTrue otherwise means running mail for magic links, password resets and
  invitations — the most annoying half of self-hosting it, and a classic "works locally, breaks in
  prod".
- **No invitations flow.** Access is granted by adding someone to the GitHub repo.
- **Revocation that cannot be forgotten.** Removing a teammate from the repo removes their access
  here, rather than depending on somebody remembering to touch this host too.

The trade-off, stated: access now depends on a third party being reachable, and on a GitHub token
scope that can read repo membership. Cache the answer with a short TTL so a GitHub outage degrades to
stale-but-working rather than locked-out.

`memberships` stays in the schema regardless — it is what guests who are not on the repo will need,
and it is what `share_links` hangs off. Just don't build the invitation UI yet.

### What comes from peps, and what does not

Phase 1 "is the phase already done once" is true of the **plumbing** and false of the **screens**, and
the distinction is worth being exact about because the screens are the tempting half.

Take, more or less verbatim:

- `lib/supabase/server.ts` + `client.ts` (74 + 45 lines) — the `@supabase/ssr` cookie wiring.
- The `createServerClient` block in `middleware.ts` — that `getAll`/`setAll` dance, including
  re-creating `NextResponse.next({ request })` *after* `setAll`. Getting it subtly wrong loses the
  session silently, on some requests, which is the worst shape a bug can have.
- The PKCE half of `app/auth/callback/route.ts` — `exchangeCodeForSession`, plus the `error_description`
  branch for when GoTrue bounces the user back. NOT the `verifyOtp` half: that is the email path.
- The **split between `lib/auth/client.ts` and `lib/auth/server.ts` as a privilege boundary, with no
  barrel index that would let one import reach both.** A decision, not code, and it costs nothing now
  and a refactor later.

Do not take the screens. Peps' `components/auth/` is 2,692 lines and almost all of it is email/password
machinery this plan has already decided against: a Turnstile captcha, a show/hide password toggle,
register, forgot-password, reset-password, email-change. `login.archipelago.ts` says in its own header
what its region is FOR — *"a member arriving with a dead invite link lands somewhere with a way
forward"* — which is an **invitation** promise, and phase 1 has no invitations. What survives the
translation to GitHub-only is `oauth-buttons.tsx`, 106 lines of which about half is a Google SVG and a
LinkedIn SVG, feature-flagged off by default, ending in a `ou avec un email` divider with nothing to
put beneath it. motu's sign-in screen is one button.

Imitate the SHAPE, though — that part is worth copying deliberately. Peps' login region splits the act
from what follows it: the source reports `signedIn` as a FACT and the screen decides the navigation,
because the router lives in React and the source does not. That is what makes a successful sign-in
something a region flow can assert on, and what keeps every failure state previewable. It is about
thirty lines of archipelago.

### The one thing peps does not do

Peps calls `signInWithOAuth({ provider, options: { redirectTo } })` with **no `scopes`**, and
`provider_token` appears nowhere in its codebase. But the whole identity argument above — *if you can
read the repo, you can read its lagoons* — needs a GitHub token that can read repo membership, asked
for at sign-in and used at `authorize` time.

So the piece phase 1 would most like handed over is the piece that gets written here first. Two things
about it that are decisions rather than details:

- **The provider token is a credential for somebody else's service.** It must not end up anywhere the
  browser can read it, and it is not the session. What `authorize` needs is not the token but the
  ANSWER — "may this user read `owner/name`" — so cache the answer server-side against the user and
  the repo, short TTL, and let the token stay wherever it was minted.
- **A GitHub outage must degrade to stale-but-working.** That is what the TTL is for, and it means the
  cache is load-bearing rather than an optimisation: a cold cache during an outage is a locked-out
  team. Decide what a MISS does during an outage before shipping it, not after.

### The sign-in region

One region, `signin`, one slot, one island — and it goes through motu, for the reason below.

```
region signin
  keys        signingIn (produced by the source), signInError (source), authError (page)
  slot  form  x-github-sign-in
              bind    { error: 'signInError', isSubmitting: 'signingIn' }
              intents { 'sign-in-requested': 'signin-start' }
  source      signinSource   -> port: { signInWithGitHub }
```

The island renders one button, a pending state, and a failure. Three scenarios in its
`*.evidence.ts` — idle, in flight, refused — and a region flow that ends on `expectRender`, since
`signedIn` is asserted by the screen navigating rather than by a key the island shows.

The port is what keeps this previewable: production hands the source `signInWithOAuth`, the lagoon
hands it a stub, and the failure a human looks at is the one production produces.

---

## motu's own UI is built with motu

Not a preference. **A UI framework that does not use itself on its own surfaces is testing a claim it
never makes.** Every screen this host grows — sign-in first, then the project list, the share-link
manager, the coverage worklist — is islands and archipelagos, declared, with evidence, checked by
`motu check`.

The argument is not symmetry, it is coverage of a specific gap:

- **`@motu/adapter-next` has exactly one real consumer, and it is in another repository.** peps runs
  `"host": "next"` and proves the adapter works; peps is not in this repo's CI. So a framework change
  that breaks the Next adapter is invisible here until somebody happens to build peps. `host-app`
  puts a Next consumer inside motu's own tree, which is precisely the argument `pnpm-workspace.yaml`
  already makes out loud for `review-console` — *"the one consumer that cannot drift from them
  unnoticed"*. review-console is Vite. Next is the host half nothing in this repo exercises.
- **The RSC boundary has never been checked in this repo.** `@motu/adapter-next/verify` exists to
  police what an island may import inside a React Server Components app — the check that only has
  something to say in a Next host, and the one no Vite consumer can run.
- **A login screen is the honest test case.** It is the surface where a framework's weaknesses show:
  a form, a pending state, a failure that arrives from a server, and a success whose consequence is a
  navigation rather than a rendered key. If motu is awkward here, that is a finding about motu, and
  the point of using it on our own screens is that we are the ones who feel it.

Concretely, following peps' layout exactly, because it is the shape known to work in Next:

```
host-app/motu/motu.config.json    { "app": ".", "host": "next", "hostRoot": "..",
                                    "removable": false, "publishAs": { "repo": "motu-host" } }
host-app/motu/src/islands/        x-github-sign-in.island.ts + .evidence.ts
host-app/motu/src/archipelagos/   signin/signin.archipelago.ts + signin.evidence.ts
host-app/motu/roots/lagoon/       the preview root
host-app/components/motu/         the region binding — motu imports only
host-app/app/signin/              the screen: the port, the real components, `<R.Island>`
```

`removable: false` is the declaration that makes this honest rather than a failing check.
`removal-check` asks *"delete motu — does the host still compile?"*, which is the right question for
an app that ADOPTED motu and a meaningless one here: motu is load-bearing on its own host by choice.
review-console already says this, and the config loader already explains why it is reported as a SKIP
rather than a pass. `host-app` is the second project entitled to it — and the entitlement is narrow:
it is for motu's own surfaces, not a hatch for an adopting app that finds removal inconvenient.

What it costs, stated plainly: `host-app` today is 530 lines with no React component and no
stylesheet. This adds a UI stack to what is currently a proxy. That is the price of the rule, it is
paid once, and phase 4 pays it anyway — mounting `review-console` puts a full motu app in this
process regardless.

The phase-0 catch-all does not change. A screen the app owns is a route the app owns; everything else
still falls through to `store.mjs`.

---

## Phases

Each ships independently. Phase 0 exists so nothing breaks while the rest happens.

| | what | notes |
|---|---|---|
| **0** | Next app proxies unknown routes to the running host | **done** — `host-app/`, see below |
| **1** | Next shell + GoTrue + schema; serves **public** lagoons via `store.mjs`; GitHub OAuth; the `signin` region, in motu | **done** — 1b then 1a |
| **2** | private via membership; visibility moves to the DB; retire the host-wide read secret | **done** — see below |
| **2b** | coverage corpus into `coverage_states`; `/api/coverage*` reads and writes rows; migrate existing `.json` corpora in; delete the files | **done** — see below |
| **3** | share links | **done** — see below |
| **4** | mount `review-console` (2,812 lines, already a motu app — a route, not a port); delete `server.mjs` + `views.mjs` | mounting and deleting |

Phase 1 dominates because it is the skeleton, and it is the phase already done once — it is peps' own
stack, for the plumbing though not for the screens. Phases 2 and 3 are about a day each **if** phase 1
got `authorize` right; if it didn't, they are where that is discovered.

Phase 1 is worth splitting when it is picked up, because the halves fail differently and one of them
blocks nothing: **1a** the session (GoTrue, schema, `@supabase/ssr` wiring, the callback, the
repo-membership answer and its cache) and **1b** the `signin` region (island, archipelago, evidence,
the lagoon root, the Next adapter wired up). 1b can start against a stub port before 1a exists — that
is what the port is for — and 1a is provably done when the callback sets a session, with no screen
built at all.

---

## Phase 0, as built

`host-app/` — a Next 16 app whose only route is `app/[[...path]]/route.ts`, handing everything to
`proxyToHost` in `src/upstream.ts`. Roughly 120 lines of proxy and 16 tests, no page and no UI.

**Two ports, and the numbers matter.** The Next app takes **8817** — the address that was already
public — and the node host moves to **8818 on loopback**, where the app is the only thing that can
reach it. That is what makes phase 2 possible at all: once `authorize` lives in the app, a host still
listening on a public interface is a way around it. Set `MOTU_HOST_UPSTREAM` to point elsewhere.

Each route moves into the app on its own commit; until it does it falls through. The catch-all
forwards PUT/PATCH/DELETE/OPTIONS too, even though the host 405s them — so the host stays the only
thing deciding what it serves, rather than Next answering 405 from in front of it.

**`skipTrailingSlashRedirect: true` is load-bearing.** `/motu-review/` is a repo's group page and
`/motu-review` is not; Next's default is to 308 one to the other *before* any route handler runs.
Without it, the first link anybody clicks from the index answers a redirect to nothing. It was not
predicted — it was found by fetching every link on the index through the proxy and diffing the bytes
against the host, which is the check to repeat after every phase.

Three hazards are the tests, because each of them is a way "nothing changes" quietly stops being
true: the publish body is forwarded as a **stream** with its `content-encoding` untouched (buffering
it would defeat the host's own decompressed-size ceiling), redirects use `redirect: 'manual'` (the
host answers `?k=` with a 302 whose `set-cookie` does the unlocking, and following it here consumes
the cookie in the wrong process), and an SSE live frame is passed through without being collected.
`test/publish.integration.test.ts` runs a real host in a temp directory and publishes a real gzip
stream through the proxy, because the stub can only prove which headers were copied.

## Phase 2, as built — and the answer that was missing

`authorize` is a pure decision over ports (`src/auth/authorize.ts`), called from the phase-0 catch-all
for paths that parse as records. Everything else still falls through.

**A THIRD OUTCOME: `abstain`.** The plan's list had allow and deny and nothing for "the database has
never heard of this repo" — and denying that would 404 every lagoon published before `projects` was
populated, the exact regression phase 0 exists to prevent. So the app steps aside and the host answers
from `access.json` as it always has. A database OUTAGE takes the same path for the same reason. It is
a MIGRATION STATE, not a design: the open question below about two sources of truth is precisely this,
and `abstain` is the thing to count until it is always zero.

**The bytes still come from `store.mjs`.** Its retention bookkeeping must have one owner, so the app
decides and the host serves — presenting the host's read secret as a bearer once the answer is yes.
`access.mjs` already offers that transport. The secret therefore stops being something a PERSON is
handed and becomes a credential for one hop between two processes on one machine, with the host's own
gate left in place behind the app's. That is what "retire the host-wide read secret" turned out to
mean.

**A 404 is not achieved by a status code.** The first refusal answered 326 bytes of `text/plain` where
a genuine miss answers 24,946 of HTML — a 403 wearing a 404, leaking the one fact it was written to
withhold. It now renders through `views.mjs`'s own `errorPage`, imported rather than copied. The host
had a smaller version of the same divergence (its refusal printed the request path, its not-found
printed `repo/ref/slug`, one character apart) and it is fixed there too.

**PostgREST, again.** The first policy stores used `supabase-js`'s `.from()`, which is PostgREST — so
every record request went to `<app>/rest/v1/projects`, was proxied to the lagoon host, and 404'd. The
"PostgREST — no" decision above is load-bearing and easy to violate by reaching for the familiar
client. There is a `pg` pool now.

## Phase 3, as built

`authorize` rule 3, and the `?k=` exchange. `src/auth/share-links.ts` is the rules as pure functions
over a row; the database's only job is to find it.

**Checked BEFORE the session rules.** Somebody following a link may also be signed in as somebody with
no access, and the link is what they are presenting. But a bad link FALLS THROUGH rather than denying:
a person with real access following a stale link to their own project must not have the link subtract
from what their session already gave them.

**A lookup, not a compare.** Ingest tokens in `access.mjs` need a constant-time compare because the
host holds one expected hash and tests a candidate against it. Here the digest IS the lookup key —
nothing is compared against a secret, and fetching every row so `secretMatches` could run over them
would be slower and no safer. `digest` itself is imported from `access.mjs`, not re-derived.

**The cookie is path-scoped to the project**, which is what "scoped to that project" means in the only
vocabulary a browser has — and it is what lets somebody hold several links at once, since two cookies
of one name under different paths are two cookies. Its `Max-Age` is bounded by the link's expiry:
not for safety (`authorize` re-checks the row every request) but so the credential disappears at the
same moment the link does.

**A bad token redirects exactly like a good one, with no cookie.** Answering it differently would say
"that link is wrong AND this record exists" to anybody who guesses.

**`latest` is not the sha it points at.** A link to `latest` follows the alias; a link to a sha is
immutable. Resolving the alias would silently turn the second kind into the first.

Minting is `infra/mint-share-link.mjs`, for the reason `motu-host access` exists: the hashes are not
hand-writable, and the token is printed once. `--expires` or `--never` is required — a permanent
bearer credential should have to be said out loud.

## Phase 2b, as built

Row-per-state with the SQL upsert, and the divergence test in the same commit — which is the only
thing that makes the second copy of the fold allowable at all.

**The test had to be taught to fail.** The first fixture used one shared state whose incoming window
was both earlier and later than the stored one. That distinguishes `least`/`greatest` from "keep the
stored value" and NOT from "take the incoming value" — so replacing `least(first_at, …)` with
`excluded.first_at` left the divergence test GREEN, and was caught two tests later by accident. The
fixture now carries two shared states with opposite windows (one incoming window strictly inside the
stored one, one strictly around it), and all five wrong arithmetic choices — either column, either
direction, plus overwriting the count — were confirmed to fail it, one at a time.

**`/api/coverage*` takes over PER PROJECT**, the same `abstain` shape as `authorize`: a repo with a
`projects` row is served from rows, one without falls through to the host and its files. The
credential model is the host's, imported — an ingest token stays scoped to one repo and one act, and
accepting still takes the admin token, because a reporting path that can mark its own findings
resolved reports nothing. `accepted_at` is left out of the upsert's update list, which is how that
survives becoming a column on the row it used to be a separate file from.

**The importer is not a migration file** — it reads the host's store directory, which is not the
database's business. Two bugs found by testing it rather than by reading it: `readdirSync` yields
`abc123.accepted.json` BEFORE `abc123.json`, so a single pass applied the accepted set to states that
did not exist yet, matched nothing, and reported "0 accepted" while looking like it worked; and
`--delete-after-import` left the accepted file orphaned beside a corpus that was gone.

**It does not delete by default.** A corpus is the one thing here no rebuild recreates. The upsert
SUMS, so the script is not idempotent — running it twice doubles the counts — and deleting the file
is what makes a second run a no-op. That is the honest argument for the flag: not tidiness, the only
thing that makes re-running safe.

## Two constraints that break everything if lost

**`/api/publish` must stay byte-compatible.** `uploadLagoon` in the CLI posts to it, and every
`~/.config/motu/host.json` in existence points at it. Change its contract and every published URL and
every developer's config break at the same moment.

**Machines never have a session.** A laptop publishes; CI publishes. Keep `access.mjs`'s
ingest-token path alongside accounts. Accounts are for humans *reading*; tokens are for pipelines
*writing*. They are not the same problem, and merging them is how a service account ends up able to
read everything — which is precisely what `access.mjs` was written to stop:

> With one global token, a leak from any adopting app is write access to EVERY repo here.

---

## Open

- Two sources of truth for visibility, which phase 2 did not remove — it made the overlap explicit as
  `abstain`. Every repo without a `projects` row is still answered from `access.json`. Backfill them
  and the second source stops being consulted; until then, count the abstains.
- With no stored provider token, `repo_access` refreshes only at sign-in. Fine while sessions are
  short, and the thing to decide properly if session lifetime grows.
- Backups become two things — Postgres and the blob directory — and they must be consistent with each
  other, because a restored database referencing evicted blobs is a host full of dead links. Once
  coverage is in Postgres, the database also holds data that cannot be regenerated: a corpus is a
  record of what production actually did, and no rebuild recreates it.
- `/api/coverage` ingest is the one write that arrives from an adopting application's own server,
  carrying a per-repo token. It must keep working through the whole migration — a coverage proxy in
  someone else's deployment does not redeploy on your schedule.
