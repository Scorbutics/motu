// The lagoon host: upload a published fragment, serve it back at a URL that survives your laptop.
//
// This exists to replace the tunnel. `motu lagoon serve --host` plus an ssh -R gives a URL that is
// public while the tunnel runs and gone when the lid closes; a hosted lagoon is a URL you can put in
// a PR. What it serves is the SAME artifact — one self-contained page, mock fixtures, no backend —
// so hosting is a bucket and a route table, not a platform. There is no server-side browser here and
// there must not be one: Playwright runs on the publisher's machine, as it already does.
//
// ROUTES
//   POST /api/publish?repo=&slug=&title=&sha=&branch=   body: the fragment (text/html, gzip ok)
//   POST /api/group?name=                               body: JSON [{repo, slug, ref?}, …]
//   GET  /                                              repositories + composed groups
//   GET  /<repo>/                                       one repo: latest per slug, plus history
//   GET  /<repo>/<ref>/<slug>                           the page (`latest`, a branch, or a commit)
//   GET  /g/<group>                                     assemble now → 302 to the snapshot it made
//   GET  /m/<manifest>/                                 the composed lagoon (immutable)
//   GET  /m/<manifest>/f/<i>                            one member's document (the frame src)
//
// WRITES ARE AUTHENTICATED, READS ARE NOT. The lagoon has no backend and no session, which is what
// makes it safe to host at all — but its fixtures were recorded from somewhere, so a URL is unlisted
// rather than public: unguessable, not access-controlled. That is the right posture for one person
// and the wrong one for a team, and closing it is the accounts work that gates external teams.
import { createServer } from 'node:http';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import { openStore, normalizeRepo, normalizeSegment, DEFAULT_MAX_RECORDS, DEFAULT_MAX_BYTES } from './store.mjs';
import { wrapFragment, withRepoMeta } from './document.mjs';
import { composedPage, rootIndexPage, repoIndexPage, errorPage } from './views.mjs';
import { loadAccess, isPublic, canRead, canIngest, cookieValue, readSecretFrom, READ_COOKIE } from './access.mjs';

/**
 * Two limits, because one of them was measuring the wrong thing.
 *
 * The wire limit alone let a 19.2 MB Twenty lagoon through at 5.9 MB gzipped — correct for that
 * upload, and an open door for a compression bomb, since the decompressed size was never checked at
 * all. So: a bound on what arrives, and a separate bound on what it becomes.
 *
 * The decompressed ceiling is sized for a real outlier (Twenty's record page inlines its whole
 * front-end) rather than for the ~430 kB typical case.
 */
/**
 * WHO IS SERVING WHAT, LIVE — in memory, on purpose.
 *
 * A dev server is ephemeral. Writing it to the store would leave a dead endpoint behind every crash
 * and every closed laptop, and the store is the thing that outlives the laptop. So this lives for as
 * long as the host process does, and no longer.
 *
 * TTL rather than trust: `motu lagoon serve --watch` deregisters on exit, but a killed process cannot,
 * so an entry that stops being refreshed simply expires and the member falls back to its last
 * published build. That is also what happens when a proxy attempt fails — a dev server that died mid
 * request should degrade to static, not to an error page.
 */
function liveRegistry(ttlMs = 90_000) {
  const entries = new Map(); // "repo/slug" -> { url, at }
  const key = (repo, slug) => `${repo}/${slug}`;
  return {
    set(repo, slug, url) {
      entries.set(key(repo, slug), { url, at: Date.now() });
    },
    clear(repo, slug) {
      return entries.delete(key(repo, slug));
    },
    /** The endpoint serving this member right now, or null. Expiry is checked on read. */
    endpointFor(repo, slug) {
      const e = entries.get(key(repo, slug));
      if (!e) return null;
      if (Date.now() - e.at > ttlMs) {
        entries.delete(key(repo, slug));
        return null;
      }
      return e.url;
    },
    list() {
      const now = Date.now();
      return [...entries]
        .filter(([, e]) => now - e.at <= ttlMs)
        .map(([k, e]) => ({ member: k, url: e.url, ageMs: now - e.at }));
    },
  };
}

/**
 * DRAFTS: a live lagoon for a machine this host cannot reach.
 *
 * The other kind of live is a PULL — the dev server announces a URL and this host fetches it, which
 * needs host -> dev reachability and is what `liveRegistry` above is for. This is the push: the dev
 * machine sends the built artifact after every save, over the same outbound connection it already
 * uses to announce itself, and the host serves those bytes. Nothing has to be able to reach the
 * laptop, which is the whole point — a tunnel, a tailnet or a LAN route stops being a requirement.
 *
 * IT ONLY WORKS BECAUSE A LAGOON IS ONE SELF-CONTAINED FILE. Assets are inlined and `publish` refuses
 * to ship a page still pointing at /assets/, so there is nothing else for a viewer to ask for. Push
 * and proxy are therefore indistinguishable from the outside — which would be false for an ordinary
 * dev server, where you would lose asset granularity, HMR and any route the page calls.
 *
 * IN MEMORY, NOT IN THE STORE, and that is the decision worth defending. A draft is replaced every
 * few seconds and means nothing an hour later; putting it in the blob store would mean a record per
 * save, a retention cap churning against real history, and a GC liveness rule to teach about a thing
 * that is not an artifact. Held here it costs a few hundred kB, expires like the live registry, and a
 * host restart forgets it — which is correct, because the next save re-sends it within seconds.
 *
 * BOUNDED, because anyone with the upload token can push. A cap on the number of drafts and on each
 * one's size turns "memory grows until the host dies" into "the oldest draft is dropped".
 */
function draftRegistry(ttlMs = 90_000, maxDrafts = 32) {
  const entries = new Map(); // "repo/slug" -> { body, type, at }
  const key = (repo, slug) => `${repo}/${slug}`;
  const fresh = (e) => e && Date.now() - e.at <= ttlMs;
  return {
    set(repo, slug, body) {
      // Insertion order is Map order, so the first key is the least recently REPLACED. Dropping it is
      // the honest eviction: a draft nobody has refreshed is a dev server that stopped.
      if (!entries.has(key(repo, slug)) && entries.size >= maxDrafts) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key(repo, slug), { body, at: Date.now() });
    },
    clear(repo, slug) {
      return entries.delete(key(repo, slug));
    },
    /** The bytes being drafted for this lagoon, or null. Expiry is checked on read, like `live`. */
    bytesFor(repo, slug) {
      const e = entries.get(key(repo, slug));
      if (!fresh(e)) {
        entries.delete(key(repo, slug));
        return null;
      }
      return e.body;
    },
    list() {
      const now = Date.now();
      return [...entries]
        .filter(([, e]) => fresh(e))
        .map(([k, e]) => ({ member: k, bytes: e.body.length, ageMs: now - e.at }));
    },
  };
}

/**
 * WHO IS WATCHING WHAT, so a new draft can tell them.
 *
 * When a lagoon is PROXIED, the reload channel belongs to the dev server and this host only forwards
 * it. When it is PUSHED there is no dev server on the other end of the request, so the host has to
 * own the channel itself: viewers hold an SSE open, and the arrival of a draft is the event.
 *
 * The client is unchanged — it is the same relative `__motu_reload` the CLI injects, which is what
 * makes the two kinds of live interchangeable to a browser.
 */
function reloadChannels() {
  const waiting = new Map(); // "repo/slug" -> Set<res>
  const key = (repo, slug) => `${repo}/${slug}`;
  return {
    open(repo, slug, res) {
      const k = key(repo, slug);
      if (!waiting.has(k)) waiting.set(k, new Set());
      waiting.get(k).add(res);
      // A DISCONNECT IS THE NORMAL CASE, not an error: viewers close tabs. Without this the set grows
      // for the life of the process and every draft writes to sockets nobody is reading.
      res.on('close', () => {
        waiting.get(k)?.delete(res);
        if (waiting.get(k)?.size === 0) waiting.delete(k);
      });
    },
    fire(repo, slug) {
      const set = waiting.get(key(repo, slug));
      if (!set) return 0;
      for (const res of set) res.write('data: reload\n\n');
      return set.size;
    },
  };
}

const MAX_WIRE = 24 * 1024 * 1024;
const MAX_DECOMPRESSED = 64 * 1024 * 1024;

function send(res, status, type, body, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(status, { 'content-type': type, 'content-length': buf.length, ...extra });
  res.end(buf);
}

const html = (res, status, body, extra) => send(res, status, 'text/html; charset=utf-8', body, extra);
// `extra` matters here, unlike when this only ever answered API calls: the accepted set is fetched by
// browsers on every page load and is the request that makes the rest cheap, so it must be cacheable.
// Without this parameter a caller passing headers is silently ignored — which is how it was written
// first, and the symptom would have been a cache-control header that simply never appeared.
const json = (res, status, obj, extra) =>
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj, null, 2), extra);

/** Constant-time compare so the token cannot be recovered a byte at a time from response timing. */
function tokenMatches(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req, limit = MAX_WIRE, decompressedLimit = MAX_DECOMPRESSED) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error(`body exceeds ${limit} bytes`), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      let buf = Buffer.concat(chunks);
      const enc = String(req.headers['content-encoding'] ?? '').toLowerCase();
      try {
        // maxOutputLength makes the decompressor itself refuse the bomb, rather than allocating the
        // whole thing first and checking afterwards.
        if (enc === 'gzip') buf = gunzipSync(buf, { maxOutputLength: decompressedLimit });
        else if (enc === 'br') buf = brotliDecompressSync(buf, { maxOutputLength: decompressedLimit });
      } catch (e) {
        const tooBig = /maxOutputLength|buffer.*too large/i.test(e.message);
        reject(
          Object.assign(new Error(tooBig ? `decompressed body exceeds ${decompressedLimit} bytes` : `could not decode ${enc} body: ${e.message}`), {
            status: tooBig ? 413 : 400,
          }),
        );
        return;
      }
      resolve(buf);
    });
    req.on('error', reject);
  });
}

/**
 * Cache policy follows MUTABILITY, which is the point of having two axes at all.
 * A commit URL is immutable, so it can be cached for a year; `latest` must never be cached, or a
 * republish behind the bookmark serves yesterday's page and looks like a working one.
 */
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' };
const NO_STORE = { 'cache-control': 'no-store' };

export function createLagoonHost({ dir, maxRecords = DEFAULT_MAX_RECORDS, maxBytes = DEFAULT_MAX_BYTES, token = null } = {}) {
  const store = openStore({ dir, maxRecords, maxBytes });
  const live = liveRegistry();
  const drafts = draftRegistry();
  const reload = reloadChannels();

  /**
   * Hand a request to whatever dev server is serving this member, and hand its answer straight back.
   *
   * The reload stream goes through here too, which is the point: the composed view is same-origin, so
   * the page's `EventSource` reaches its own dev server without CORS and without the frame knowing it
   * is inside a gallery. Streamed rather than buffered — an SSE response that is collected before it
   * is forwarded never arrives.
   */
  async function proxyLive(base, subPath, req, res, member) {
    const target = `${String(base).replace(/\/+$/, '')}${subPath}`;
    let upstream;
    try {
      upstream = await fetch(target, { headers: { accept: req.headers.accept ?? '*/*' } });
    } catch {
      // The dev server went away between resolving and asking. Fall back to what it last published,
      // rather than showing an error for a frame that has perfectly good bytes in the store.
      live.clear(member.repo, member.slug);
      const bytes = member.hash ? store.readHash(member.hash) : null;
      if (bytes) return void html(res, 200, withRepoMeta(wrapFragment(bytes, { title: member.title }), member.repo), NO_STORE);
      return void html(res, 502, errorPage(502, 'the live lagoon for this member stopped answering'), NO_STORE);
    }
    const type = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8';
    // A LIVE PAGE NEEDS THE SAME STAMP A STORED ONE GETS. `withRepoMeta` is what tells a lagoon which
    // repo it belongs to, so it can ask this host for its own coverage corpus — and it was applied
    // only on the stored path. A live frame therefore rendered without the one section that made
    // going live worth doing, and the reason was invisible: the page works, the lens works, and the
    // coverage section simply is not there.
    //
    // Buffered rather than streamed, for HTML only. The document has to be whole before a tag can go
    // into its head, and it is one self-contained page that `fetch` has buffered anyway. Everything
    // else — the reload stream above all — keeps streaming, because an SSE response collected before
    // it is forwarded never arrives.
    if (type.includes('text/html')) {
      const body = withRepoMeta(Buffer.from(await upstream.arrayBuffer()), member.repo);
      return void send(res, upstream.status, type, body, NO_STORE);
    }
    res.writeHead(upstream.status, {
      'content-type': type,
      'cache-control': 'no-store',
      // Same reason the dev server sets it: without this the stream is buffered and nothing arrives.
      ...(type.includes('text/event-stream') ? { 'x-accel-buffering': 'no', connection: 'keep-alive' } : {}),
    });
    if (!upstream.body) return void res.end();
    const reader = upstream.body.getReader();
    req.on('close', () => reader.cancel().catch(() => {}));
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://host');
    const path = url.pathname;

    // THE ACCESS POLICY, re-read per request so editing it does not need a restart. See access.mjs;
    // absent, every repo is public and the global token admits every write, which is what the host
    // did before any of this existed.
    // `store.root`, NOT the `dir` parameter. The parameter is undefined whenever the directory comes
    // from MOTU_HOST_DIR instead of --dir — which is exactly how the systemd unit runs this — and
    // `resolve(undefined, …)` throws, so EVERY request became a 500. The store already resolved it
    // through the same precedence; asking it is the only way the two cannot disagree.
    const access = loadAccess(store.root);
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const adminOk = Boolean(token) && tokenMatches(bearer, token);
    const readSecret = readSecretFrom({ cookieHeader: req.headers.cookie, bearer });
    /** A reader's verdict for one repo, and the 404 that hides a private one's existence. */
    const readable = (repo) => canRead(access, repo, { adminOk, readSecret });

    // UNLOCKING A PRIVATE LINK. A browser following a URL cannot set a header, so the secret arrives
    // once as `?k=`, becomes an HttpOnly cookie, and is redirected away — so it stops appearing in the
    // address bar, in history, and in any Referer the page later sends.
    if (url.searchParams.has('k')) {
      const clean = new URL(url.href);
      clean.searchParams.delete('k');
      res.writeHead(302, {
        location: clean.pathname + clean.search + clean.hash,
        'set-cookie': `${READ_COOKIE}=${encodeURIComponent(url.searchParams.get('k') ?? '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
        'cache-control': 'no-store',
      });
      return void res.end();
    }

    if (path === '/favicon.ico') return void res.writeHead(204).end();
    if (path === '/api/health') return json(res, 200, { ok: true, ...store.stats() });
    // The two read APIs the CLI needs to build a gallery without scraping the HTML index.
    if (path === '/api/repos')
      return json(res, 200, { repos: store.listRepos().filter((r) => readable(r.repo)) });
    if (path === '/api/baselines') {
      const repo = normalizeRepo(url.searchParams.get('repo'));
      if (!repo) return json(res, 400, { error: 'repo is required' });
      if (!readable(repo)) return json(res, 404, { error: 'no such repo' });
      return json(res, 200, { repo, shots: store.listShots(repo, url.searchParams.get('island') || null) });
    }
    // THE ACCEPTED SET — what somebody has looked at and chosen not to preview.
    //
    // A client unions this with the flow-covered set baked into its bundle and stays silent about
    // anything in either. That union is what makes the steady state cost NOTHING rather than merely
    // less: once every state a user reaches is known, the beacon never fires again. The baked half
    // only shrinks traffic on a redeploy; this half is why accepting a state takes effect at once.
    if (path === '/api/coverage/known' && req.method === 'GET') {
      const repo = normalizeRepo(url.searchParams.get('repo'));
      const region = normalizeSegment(url.searchParams.get('region') || '');
      const keysHash = normalizeSegment(url.searchParams.get('h') || '');
      // AN EMPTY SET IS THE SAFE ANSWER for every kind of no, and the only safe one. Refusing loudly
      // would turn a reporting tool's outage into a broken page; claiming a state is known when it is
      // not would silently delete a finding. So: at worst one extra beacon, never a wrong silence.
      if (!repo || !region || !keysHash || !readable(repo)) return json(res, 200, [], NO_STORE);
      return json(res, 200, store.readAccepted(repo, region, keysHash), {
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      });
    }

    // THE CORPUS, READ BACK. Same gate as the pages: if you may not see this repo's lagoon, you may
    // not see what its region has been through either. A published lagoon calls this on its OWN
    // origin, so the page carries no address and no credential — the reader's cookie is the answer.
    if (path === '/api/coverage' && req.method === 'GET') {
      const repo = normalizeRepo(url.searchParams.get('repo'));
      const region = normalizeSegment(url.searchParams.get('region') || '');
      if (!repo || !region) return json(res, 400, { error: 'repo and region are required' });
      // ONE ANSWER FOR EVERY KIND OF NOTHING. A private repo, a repo that does not exist, and a repo
      // with no corpus yet all get the same 404. Answering 404 for private and 200 for unknown is a
      // name oracle: guess a repo, and the status tells you whether it exists and is being hidden —
      // which is exactly what the page route's 404 was chosen to avoid, given away by its neighbour.
      const corpora = readable(repo) ? store.readCoverage(repo, region) : [];
      if (!corpora.length) return json(res, 404, { error: 'no corpus here' });
      // The newest DECLARATION only. Older key lists are kept (they are not comparable, and mixing
      // them is nonsense) but a reader wants the one that describes the region as it is now.
      return json(res, 200, { repo, region, corpus: corpora[0], declarations: corpora.length });
    }
    if (path === '/api/groups')
      return json(res, 200, {
        groups: store
          .listGroups()
          .map((g) => ({ ...g, members: (g.members ?? []).filter((m) => readable(m.repo)) }))
          .filter((g) => g.members.length),
      });
    // GUARDED BY METHOD, unlike its neighbours, because this path also takes a POST. Without the guard
    // the read branch answered the registration too — a cheerful 200 with an empty list, so the CLI
    // reported itself live and the host had never heard of it.
    if (path === '/api/live' && req.method === 'GET')
      // ONE LIST, TWO MECHANISMS. A viewer cannot tell a pushed lagoon from a proxied one and neither
      // should anything downstream: the app draws the same badge from this, and `url` is simply absent
      // for a draft because there is nowhere to fetch it from.
      return json(res, 200, { live: [...live.list(), ...drafts.list().map((d) => ({ ...d, draft: true }))] });

    if (req.method === 'POST') {
      // INGEST IS ITS OWN DOOR, checked before the admin gate and never falling through to it.
      //
      // This is the one write an application's server makes, so its credential lives in that
      // application's environment rather than on this machine. It is therefore the credential most
      // likely to leak, and it is scoped to match: one repo, one route, no reads. An ingest token
      // cannot publish a lagoon, register a live frame, accept a baseline, or touch another project.
      //
      // The admin token still works here — one credential that can do everything is exactly what it
      // is for — but nothing an app holds needs to be that credential.
      if (path === '/api/coverage') {
        const repo = normalizeRepo(url.searchParams.get('repo'));
        if (!repo) return json(res, 400, { error: 'repo must be `name` or `owner/name`, [A-Za-z0-9._-]' });
        if (!adminOk && !canIngest(access, repo, bearer))
          return json(res, 401, { error: 'bad or missing ingest token for this repo' });
        return void (await ingestCoverage(req, res, url, repo));
      }
      // ACCEPTING IS A PERSON'S DECISION, so it takes the ADMIN token and not the ingest one.
      //
      // The rule this enforces is the one the whole design rests on: nothing promotes a state to
      // "known" except a flow or a person. An ingest credential that could also accept would let the
      // reporting path mark its own findings resolved — and a system that can do that reports
      // nothing, which is indistinguishable from having nothing to report.
      // FORGETTING IS DESTRUCTIVE, so it takes the admin token — never the ingest one, which sits in an
      // application's environment. A credential that can both write a corpus and delete from it could
      // quietly rewrite what the region is known to have done.
      if (path === '/api/coverage/forget') {
        if (!token) return json(res, 503, { error: 'this host accepts no uploads — start it with a token' });
        if (!adminOk) return json(res, 401, { error: 'forgetting a state needs the admin token' });
        const repo = normalizeRepo(url.searchParams.get('repo'));
        const region = normalizeSegment(url.searchParams.get('region') || '');
        const keysHash = normalizeSegment(url.searchParams.get('h') || '');
        if (!repo || !region || !keysHash) return json(res, 400, { error: 'repo, region and h are required' });
        let ids = null;
        try {
          const raw = JSON.parse((await readBody(req, 100_000)).toString('utf8'));
          if (Array.isArray(raw)) ids = raw.filter((i) => typeof i === 'string');
        } catch {
          ids = null;
        }
        return json(res, 200, { ok: true, ...store.forgetCoverage(repo, region, keysHash, ids) });
      }
      if (path === '/api/coverage/accept') {
        if (!token) return json(res, 503, { error: 'this host accepts no uploads — start it with a token' });
        if (!adminOk) return json(res, 401, { error: 'accepting a state needs the admin token' });
        const repo = normalizeRepo(url.searchParams.get('repo'));
        const region = normalizeSegment(url.searchParams.get('region') || '');
        const keysHash = normalizeSegment(url.searchParams.get('h') || '');
        if (!repo || !region || !keysHash) return json(res, 400, { error: 'repo, region and h are required' });
        let ids;
        try {
          ids = JSON.parse((await readBody(req, 100_000)).toString('utf8'));
        } catch {
          ids = null;
        }
        if (!Array.isArray(ids)) return json(res, 400, { error: 'body must be a JSON array of fingerprint ids' });
        try {
          return json(res, 200, { ok: true, ...store.acceptCoverage(repo, region, keysHash, ids) });
        } catch (err) {
          return json(res, 400, { error: String(err?.message ?? err) });
        }
      }
      if (!token) return json(res, 503, { error: 'this host accepts no uploads — start it with a token' });
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!tokenMatches(auth, token)) return json(res, 401, { error: 'bad or missing token' });
      if (path === '/api/publish') return void (await publish(req, res, url));
      if (path === '/api/group') return void (await group(req, res, url));
      if (path === '/api/baseline') return void (await baseline(req, res, url));
      if (path === '/api/baseline/accept') return void (await acceptBaseline(req, res, url));
      if (path === '/api/live/draft') {
        const repo = normalizeRepo(url.searchParams.get('repo'));
        const slug = normalizeSegment(url.searchParams.get('slug'));
        if (!repo || !slug) return json(res, 400, { error: 'repo and slug are required' });
        // A TOUCH IS A HEARTBEAT, not a push. A draft expires the way a live URL does, and re-sending
        // half a megabyte every thirty seconds to say "still here" would be absurd — so the beat that
        // keeps a PULLED member alive has a pushed equivalent that carries no bytes.
        //
        // 404 when there is nothing to keep alive, rather than a silent success: the alternative is a
        // registry reporting a live lagoon with no bytes behind it, which serves a 404 to whoever
        // follows the badge.
        if (url.searchParams.get('touch') === '1') {
          const held = drafts.bytesFor(repo, slug);
          if (!held) return json(res, 404, { error: 'no draft to keep alive — send one first' });
          drafts.set(repo, slug, held);
          return json(res, 200, { ok: true, member: `${repo}/${slug}`, touched: true, ttlMs: 90_000 });
        }
        // The same wire limit publishing uses. A lagoon is one file and a large one is ~1 MB; the cap
        // is here so a token holder cannot push the host's memory over instead of a page.
        const body = await readBody(req, 8 * 1024 * 1024);
        if (!body?.length) return json(res, 400, { error: 'a draft needs a body' });
        drafts.set(repo, slug, body);
        // TELL THE PEOPLE LOOKING. This is the half a proxied live lagoon gets for free, because
        // there the dev server owns the channel; pushed, the arrival of the bytes IS the event.
        const told = reload.fire(repo, slug);
        return json(res, 200, { ok: true, member: `${repo}/${slug}`, bytes: body.length, reloaded: told, ttlMs: 90_000 });
      }
      if (path === '/api/live' || path === '/api/live/off') {
        const repo = normalizeRepo(url.searchParams.get('repo'));
        const slug = normalizeSegment(url.searchParams.get('slug'));
        if (!repo || !slug) return json(res, 400, { error: 'repo and slug are required' });
        if (path === '/api/live/off') {
          // BOTH KINDS. `--live-push` and `--live-url` are two ways to be the same thing to a viewer,
          // so stopping is one act: leaving a draft behind after the announcement went would keep the
          // badge on and serve bytes from a process that has exited.
          const cleared = live.clear(repo, slug);
          const draftCleared = drafts.clear(repo, slug);
          return json(res, 200, { ok: true, cleared: cleared || draftCleared });
        }
        let where;
        try {
          where = JSON.parse((await readBody(req, 4096)).toString('utf8'))?.url;
        } catch {
          where = null;
        }
        // LOOPBACK BY DEFAULT, and that default does not move. This host FETCHES whatever it is told,
        // so an unrestricted registry makes it an open relay for the machine it runs on — pointed at a
        // cloud metadata endpoint, say, by anyone holding the token. The rule stays; what is new is
        // that an operator can widen it deliberately, for the case it was refusing: a dev server on
        // somebody's laptop, reachable over a tailnet or a tunnel.
        //
        // AN ALLOWLIST THE OPERATOR WRITES, not a flag the caller sets. "I trust these names" is a
        // different claim from "anyone with the token may point me anywhere", and only the person
        // running the host can make the first one. Unset means today's behaviour exactly.
        //
        //     MOTU_LIVE_ALLOW=.tailnet.ts.net,laptop.lan
        //
        // KNOW WHAT THIS DOES NOT BUY YOU. A name on the list is checked as a NAME; it is not
        // resolved, so a name you allow that later resolves somewhere else is a URL this host will
        // fetch. That is why the list is names rather than a subnet, why it is opt-in, and why the
        // metadata range below is refused whatever the list says — a broad suffix should not be able
        // to open the one address that turns SSRF into credentials.
        const liveAllowed = (candidate) => {
          let u;
          try {
            u = new URL(candidate);
          } catch {
            return false;
          }
          if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
          // NEVER, on any list. 169.254.0.0/16 is where cloud metadata lives; 0.0.0.0 and [::] mean
          // "this machine" by another spelling.
          if (/^(169\.254\.|0\.0\.0\.0$|\[?::\]?$)/.test(u.hostname)) return false;
          if (/^(127\.0\.0\.1|localhost|\[?::1\]?)$/.test(u.hostname)) return true;
          const allow = String(process.env.MOTU_LIVE_ALLOW ?? '')
            .split(',')
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);
          const host = u.hostname.toLowerCase();
          // A leading dot is a SUFFIX ("any name under this tailnet"); anything else is exact.
          return allow.some((a) => (a.startsWith('.') ? host.endsWith(a) : host === a));
        };
        if (typeof where !== 'string' || !liveAllowed(where.replace(/\/+$/, '')))
          return json(res, 400, {
            error: process.env.MOTU_LIVE_ALLOW
              ? 'url must be loopback or a host named in MOTU_LIVE_ALLOW'
              : 'url must be http://127.0.0.1:<port> — set MOTU_LIVE_ALLOW to permit named hosts',
          });
        live.set(repo, slug, where.replace(/\/+$/, ''));
        return json(res, 200, { ok: true, member: `${repo}/${slug}`, url: where, ttlMs: 90_000 });
      }
      return json(res, 404, { error: `no route for POST ${path}` });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(res, 405, { error: `${req.method} not allowed` });

    if (path === '/') {
      // FILTERED, or the gate leaks the very thing it hides: a private repo the visitor cannot open
      // would still be listed here by name, with its lagoon count.
      const repos = store.listRepos().filter((r) => readable(r.repo));
      // A GROUP'S SUMMARY NAMES ITS MEMBERS — "2 lagoons · acme/secret + acme/open" — so filtering the
      // repo list alone still printed the private repo on the front page. The gallery itself was
      // already filtered; this is the line ABOUT it, which is the easier one to forget. A group left
      // with nothing readable is dropped rather than shown empty: "a gallery you may not see" is
      // itself the fact being withheld.
      const groups = store
        .listGroups()
        .map((g) => ({ ...g, members: (g.members ?? []).filter((m) => readable(m.repo)) }))
        .filter((g) => g.members.length);
      return html(res, 200, rootIndexPage({ repos, groups, stats: store.stats() }), NO_STORE);
    }

    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);

    // The bytes of one shot, by content hash — immutable, so cache it for a year.
    if (segments[0] === 'shot' && segments[1]) {
      const bytes = store.readHash(segments[1]);
      if (!bytes) return html(res, 404, errorPage(404, 'no such shot'), NO_STORE);
      return send(res, 200, 'image/png', bytes, IMMUTABLE);
    }

    // --- composed views ---------------------------------------------------------------------
    //
    // TWO AXES, and they mean different things. `/g/<name>` is TODAY: resolved per request, so a member
    // someone is running `motu lagoon serve --watch` on is served LIVE from that dev server, hot reload
    // and all, while the rest come from their last published build. `/m/<id>` is what a day LOOKED
    // like: stored bytes, pinned, immutable, and deliberately never live — making it live would break
    // the one guarantee its URL exists to make.
    //
    // The group used to 302 to the manifest, which made those two the same URL and left no place for a
    // live frame to live.
    if (segments[0] === 'g') {
      const name = normalizeSegment(segments[1]);
      if (!name) return html(res, 400, errorPage(400, 'bad group name'), NO_STORE);
      const group = store.getGroup(name);
      if (!group) return html(res, 404, errorPage(404, `no group "${name}"`), NO_STORE);
      // A GALLERY MUST NOT BE A WAY ROUND THE GATE. A group is a list of members by repo, and serving
      // its frames without this check would hand out exactly the pages the per-repo route refuses —
      // `motu lagoon group <name> --all` composes EVERY published project, so a private one joins a
      // public gallery by default rather than by anyone choosing it.
      //
      // Filtered rather than refused: a gallery of five projects, one of them private, is still a
      // gallery of the four you may see. Frame indices come from this same filtered list, so /f/2
      // means the third READABLE member and cannot be walked past the end of it.
      const members = store.resolveGroup(name, live.endpointFor).filter((m) => readable(m.repo));
      if (!members.length)
        return html(res, 404, errorPage(404, `group "${name}" resolves to nothing yet — no member has published`), NO_STORE);

      // A frame, and the reload stream that belongs to it.
      if (segments[2] === 'f') {
        const i = Number.parseInt(segments[3] ?? '', 10);
        const member = Number.isInteger(i) ? members[i] : null;
        if (!member) return html(res, 404, errorPage(404, 'no such frame'), NO_STORE);
        if (member.live) {
          // THE WHOLE REMAINING PATH, and the query with it. This forwarded `segments[4]` alone — one
          // segment — so anything nested arrived truncated. It costs nothing today, because the
          // process behind a live frame answers every path with the same self-contained artifact
          // (`lagoon serve --watch`), and the one path it distinguishes it matches with `endsWith`.
          // It is here so that stays true of a frame served by something that does route on a path.
          const rest = segments.slice(4).join('/');
          return void (await proxyLive(member.live, `/${rest}${url.search}`, req, res, member));
        }
        if (!member.hash) return html(res, 404, errorPage(404, 'this member has never published'), NO_STORE);
        const bytes = store.readHash(member.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'this frame’s object is gone'), NO_STORE);
        // NOT immutable here: the group means today, and today's `latest` moves.
        return html(res, 200, withRepoMeta(wrapFragment(bytes, { title: member.title }), member.repo), NO_STORE);
      }

      // The trailing slash is LOAD-BEARING — the shell's frame src is relative (`f/<i>`).
      if (segments.length === 2 && !path.endsWith('/'))
        return void res.writeHead(302, { location: `/g/${name}/`, 'cache-control': 'no-store' }).end();
      if (segments.length > 2) return html(res, 404, errorPage(404, 'no such group view'), NO_STORE);

      // The pin: what this view would be if it were frozen now. Live members pin their last published
      // build, because a dev server has nothing to pin — and the footer says so.
      const snap = store.snapshot(name);
      return html(
        res,
        200,
        composedPage({ id: snap?.id ?? null, group: name, members, live: true }),
        NO_STORE,
      );
    }

    if (segments[0] === 'm') {
      const id = normalizeSegment(segments[1]);
      const found = id && store.manifest(id);
      if (!found) return html(res, 404, errorPage(404, 'unknown manifest'), NO_STORE);
      // A pinned manifest is a snapshot of a group, so it carries the same risk and takes the same
      // filter. Its immutability is about the BYTES, never about who may see them.
      found.members = (found.members ?? []).filter((m) => readable(m.repo));
      if (!found.members.length) return html(res, 404, errorPage(404, 'unknown manifest'), NO_STORE);
      if (segments[2] === 'f') {
        const i = Number.parseInt(segments[3] ?? '', 10);
        const member = Number.isInteger(i) ? found.members[i] : null;
        if (!member) return html(res, 404, errorPage(404, 'no such frame'), NO_STORE);
        const bytes = store.readHash(member.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'this frame’s object is gone'), NO_STORE);
        return html(res, 200, withRepoMeta(wrapFragment(bytes, { title: member.title }), member.repo), IMMUTABLE);
      }
      if (segments.length === 2) {
        // The trailing slash is LOAD-BEARING: the shell's frame src is relative (`f/<i>`), so at
        // /m/<id> it would resolve to /m/f/<i> and every frame would 404. `filter(Boolean)` cannot
        // see the difference, so the raw path is what decides — and testing the segment count here
        // instead is how this redirected to itself.
        if (!path.endsWith('/')) return void res.writeHead(302, { location: `/m/${id}/`, 'cache-control': 'no-store' }).end();
        // NOT immutable, even though the manifest is. The frames are stored bytes and can be cached
        // for a year; this SHELL is rendered by the host's own code, so caching it for a year means a
        // host upgrade never reaches anyone holding the link — which is how a fixed layout bug kept
        // rendering broken in a browser that had the old page.
        return html(res, 200, composedPage({ id, group: found.group, members: found.members }), NO_STORE);
      }
      return html(res, 404, errorPage(404, `nothing at ${path}`), NO_STORE);
    }

    // --- per-repo ---------------------------------------------------------------------------
    // Parsed FROM THE RIGHT: a repo id may carry an owner segment (`acme/web`), so the last two
    // segments are ref and slug and everything before them is the repo.
    if (segments.length >= 3) {
      // The reload stream hangs off the page's own path, so strip it before parsing repo/ref/slug —
      // otherwise `/<repo>/latest/all/__motu_reload` parses as a repo called `<repo>/latest`.
      const isReload = segments[segments.length - 1] === '__motu_reload';
      const parts = isReload ? segments.slice(0, -1) : segments;
      const slug = normalizeSegment(parts[parts.length - 1]);
      const ref = normalizeSegment(parts[parts.length - 2]);
      const repo = normalizeRepo(parts.slice(0, -2).join('/'));
      if (repo && ref && slug) {
        // 404, NOT 403, for a private repo somebody cannot read. A 403 confirms the repo exists,
        // which is the one thing a private host should not tell an unauthenticated stranger — and the
        // name of an unreleased project is often the interesting part.
        //
        // AND IT HAS TO SAY WHAT A MISS SAYS. This used to render `nothing at ${path}` — with the
        // leading slash — while the not-found below renders `nothing at ${repo}/${ref}/${slug}`
        // without one. One character apart, and enough: a refusal was distinguishable from an absence
        // by reading the page, so the status code withheld what the body then handed over. The two
        // are now the same string, which is the property the 404 was chosen for in the first place.
        if (!readable(repo)) return html(res, 404, errorPage(404, `nothing at ${repo}/${ref}/${slug}`), NO_STORE);

        // LIVE ON THE CANONICAL URL, not only inside a gallery.
        //
        // `latest` already means "always current"; it just meant current as of the last publish. A
        // project being worked on right now has a dev server that IS the answer, and the only way to
        // see it was to compose a group and open a frame — so the URL a person actually bookmarks
        // was the one place liveness did not reach.
        //
        // `latest` ONLY. An immutable URL keyed by content must never be live: being able to say
        // "this exact page, forever" is the entire reason that URL exists, and serving something else
        // from it would break the one promise it makes.
        // A PUSHED DRAFT WINS OVER A PULLED ONE, and over the store. Precedence rather than exclusion
        // because both can briefly be true — a dev server that announced a URL and then switched to
        // pushing keeps its registry entry until the TTL runs out — and the draft is the newer fact.
        //
        // `latest` ONLY, exactly as below: an immutable URL keyed by content must never be live.
        const draft = ref === 'latest' ? drafts.bytesFor(repo, slug) : null;
        if (draft) {
          if (isReload) {
            // THE HOST OWNS THIS CHANNEL when it is serving bytes rather than forwarding a request.
            // Headers first and flushed, or the browser holds the connection as pending and the
            // EventSource never reaches `open` — which looks exactly like a server that never reloads.
            res.writeHead(200, {
              'content-type': 'text/event-stream',
              'cache-control': 'no-store',
              connection: 'keep-alive',
              'x-accel-buffering': 'no',
            });
            res.write(': open\n\n');
            reload.open(repo, slug, res);
            return; // held open on purpose; `reloadChannels` drops it when the socket closes
          }
          return html(res, 200, withRepoMeta(wrapFragment(draft, { title: slug }), repo), NO_STORE);
        }

        const liveUrl = ref === 'latest' ? live.endpointFor(repo, slug) : null;
        if (liveUrl) {
          const rec = store.resolveRef(repo, ref, slug);
          // The stored record travels with it so `proxyLive` can fall back to the last published
          // bytes if the dev server has gone away between resolving and asking.
          const member = { repo, slug, hash: rec?.hash ?? null, title: rec?.title ?? slug };
          const sub = isReload ? '/__motu_reload' : `/${url.search}`;
          return void (await proxyLive(liveUrl, sub, req, res, member));
        }
        if (isReload) return html(res, 404, errorPage(404, 'nothing is serving this page live'), NO_STORE);

        const rec = store.resolveRef(repo, ref, slug);
        if (!rec) return html(res, 404, errorPage(404, `nothing at ${repo}/${ref}/${slug}`), NO_STORE);
        const bytes = store.read(repo, rec.id, rec.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'the object behind this URL has been swept'), NO_STORE);
        return html(res, 200, withRepoMeta(wrapFragment(bytes, { title: rec.title }), repo), rec.mutable ? NO_STORE : IMMUTABLE);
      }
    }

    const repo = normalizeRepo(segments.join('/'));
    const listing = repo && readable(repo) && store.listRepo(repo);
    if (listing) return html(res, 200, repoIndexPage(listing), NO_STORE);

    return html(res, 404, errorPage(404, `nothing at ${path}`), NO_STORE);
  }

  /**
   * Accept a coverage corpus for one repo and fold it into what is already stored.
   *
   * FOLDED HERE, NOT APPENDED. A corpus is a set of distinct states with counts, and two corpora for
   * the same declaration are added by merging their entries — which is arithmetic on motu's own
   * format, and the reason `mergeCorpora` lives in @motu/coverage rather than in each backend that
   * ever stores one. Appending would give a file that grows with traffic and a report that counts the
   * same state many times.
   *
   * BUCKETED BY DECLARATION. `keysHash` stamps which key list a corpus was recorded against; a
   * corpus taken against a different declaration is not comparable to this one, so it is kept
   * separately rather than mixed. That also makes cleanup after a region changes a single delete.
   */
  async function ingestCoverage(req, res, url, repo) {
    const region = normalizeSegment(url.searchParams.get('region') || '');
    if (!region) return json(res, 400, { error: 'region is required' });
    let incoming;
    try {
      incoming = JSON.parse((await readBody(req, 1_000_000)).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'body must be a JSON corpus' });
    }
    if (!Array.isArray(incoming?.entries) || !Array.isArray(incoming?.keys))
      return json(res, 400, { error: 'a corpus needs `keys` and `entries`' });
    try {
      const result = store.mergeCoverage(repo, region, incoming);
      // NOTHING ABOUT THE CORPUS COMES BACK. The caller is an application server forwarding on behalf
      // of a browser; it needs to know the write LANDED so the client can stop re-reporting that
      // state, and it has no business reading what anyone else's browser has reached.
      return json(res, 200, { ok: true, states: result.states });
    } catch (err) {
      return json(res, 400, { error: String(err?.message ?? err) });
    }
  }

  async function publish(req, res, url) {
    const repo = normalizeRepo(url.searchParams.get('repo'));
    const slug = normalizeSegment(url.searchParams.get('slug'));
    if (!repo) return json(res, 400, { error: 'repo must be `name` or `owner/name`, [A-Za-z0-9._-]' });
    if (!slug) return json(res, 400, { error: 'slug must be [A-Za-z0-9._-]' });
    const title = (url.searchParams.get('title') || slug).slice(0, 200);
    const sha = normalizeSegment(url.searchParams.get('sha') || '') || null;
    const branch = normalizeSegment(url.searchParams.get('branch') || '') || null;
    // A CSS COLOUR, not a segment: the value is whatever the project declared, which can be a hex, an
    // hsl() or a color-mix(). Bounded and screened for the two characters that could break out of the
    // custom-property declaration it ends up in; anything else is the project's business, not ours.
    const rawBrand = (url.searchParams.get('brand') || '').slice(0, 120).trim();
    const brand = rawBrand && !/[;{}<>]/.test(rawBrand) ? rawBrand : null;

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, e.status ?? 400, { error: e.message });
    }
    if (!body.length) return json(res, 400, { error: 'empty body — expected the published fragment' });
    // The one content check worth REFUSING on: a fragment still pointing at /assets/ is a build whose
    // inlining did not happen, and it renders blank here exactly as it would under an artifact CSP.
    const text = body.toString('utf8');
    const dangling = text.match(/["'(]\/assets\/[^"')]+/);
    if (dangling) return json(res, 422, { error: `not self-contained — still references ${dangling[0].slice(1)}` });

    // Everything else absolute is a WARNING, not a refusal, and the distinction is load-bearing.
    // Twenty's lagoon references /images/placeholders/*.png — decorative art the bundler never
    // inlines because it is an <img src>, not a CSS asset. Those 404 against the host while the page
    // itself works, so rejecting the upload would block a real lagoon over missing placeholder art;
    // staying silent claimed "self-contained" about a page that is not. Say it, and publish it.
    //
    // Matched by FILE EXTENSION, not by "starts with a slash". The first cut flagged `/login`,
    // `/verify` and a bare `/-/g` regex literal — router strings and JS, none of them ever fetched.
    // A warning that fires on those is a warning nobody reads, and the one real hit (a .png) was
    // buried among nine false ones.
    const absolute = [...new Set((text.match(/["'(](\/[A-Za-z0-9_][^"')\s]*\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm|json|css|js|mjs))/g) ?? []).map((m) => m.slice(1)))]
      .filter((u) => !u.startsWith('/assets/'))
      .slice(0, 10);

    const out = store.publish(repo, slug, body, { title, sha, branch, brand });
    return json(res, 200, {
      ok: true,
      repo,
      slug,
      deduped: out.deduped,
      bytes: out.bytes,
      ...(absolute.length ? { warnings: [`references ${absolute.length} absolute path(s) that will 404 when hosted: ${absolute.join(', ')}`] } : {}),
      urls: {
        latest: `/${repo}/latest/${slug}`,
        immutable: `/${repo}/${out.sha}/${slug}`,
        ...(branch ? { branch: `/${repo}/${branch}/${slug}` } : {}),
      },
    });
  }

  /**
   * Record one rendered shot. Does NOT move the baseline — storing and accepting are separate acts,
   * which is the whole point: `--update` overwriting everything is why a stale baseline and a real
   * regression look identical today.
   */
  async function baseline(req, res, url) {
    const repo = normalizeRepo(url.searchParams.get('repo'));
    const island = normalizeSegment(url.searchParams.get('island'));
    // `<scenario>@<viewport>` — one extra character over a plain segment, and it keeps the shot's
    // identity readable in every listing and URL.
    const shot = url.searchParams.get('shot');
    if (!repo || !island) return json(res, 400, { error: 'repo and island are required' });
    if (!shot || !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,128}$/.test(shot))
      return json(res, 400, { error: 'shot must look like <scenario>@<viewport>' });

    let body;
    try {
      body = await readBody(req, 8 * 1024 * 1024, 16 * 1024 * 1024);
    } catch (e) {
      return json(res, e.status ?? 400, { error: e.message });
    }
    // A PNG or nothing: this endpoint stores images, and a helpful error beats a stored HTML page.
    if (body.length < 8 || body.readUInt32BE(0) !== 0x89504e47)
      return json(res, 415, { error: 'body must be a PNG' });

    const out = store.putShot(repo, island, shot, body, {
      sha: normalizeSegment(url.searchParams.get('sha') || '') || null,
      branch: normalizeSegment(url.searchParams.get('branch') || '') || null,
    });
    return json(res, 200, { ok: true, repo, island, shot, ...out, url: `/shot/${out.hash}` });
  }

  /** Move the accepted pointer — the deliberate act that makes a later diff mean something. */
  async function acceptBaseline(req, res, url) {
    const repo = normalizeRepo(url.searchParams.get('repo'));
    const island = normalizeSegment(url.searchParams.get('island'));
    if (!repo) return json(res, 400, { error: 'repo is required' });
    const shots = store.listShots(repo, island);
    const wanted = url.searchParams.get('shot');
    const targets = shots.filter((s) => (!wanted || s.shot === wanted) && s.status !== 'match' && s.last);
    const accepted = [];
    for (const t of targets) {
      const r = store.acceptShot(repo, t.island, t.shot);
      if (r) accepted.push(`${t.island}/${t.shot}`);
    }
    return json(res, 200, { ok: true, repo, accepted, count: accepted.length });
  }

  async function group(req, res, url) {
    const name = normalizeSegment(url.searchParams.get('name'));
    if (!name) return json(res, 400, { error: 'name must be [A-Za-z0-9._-]' });
    let members;
    try {
      members = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8'));
    } catch (e) {
      return json(res, 400, { error: `body must be JSON: ${e.message}` });
    }
    // Two body shapes. The array is the original and still works; the object can also say `all: true`,
    // which means EVERY repository resolved at assembly time rather than a list frozen at definition.
    const spec = Array.isArray(members) ? { members } : members && typeof members === 'object' ? members : null;
    if (!spec) return json(res, 400, { error: 'body must be an array of {repo, slug, ref?} or {all?, members?, exclude?}' });
    const all = !!spec.all;
    if (!all && (!Array.isArray(spec.members) || !spec.members.length))
      return json(res, 400, { error: 'body must be a non-empty array of {repo, slug, ref?}, or set all:true' });

    const cleanList = (list, needSlug) => {
      const out = [];
      for (const m of list ?? []) {
        const repo = normalizeRepo(m?.repo);
        const slug = m?.slug ? normalizeSegment(m.slug) : null;
        const ref = m?.ref ? normalizeSegment(m.ref) : 'latest';
        if (!repo || (needSlug && !slug) || !ref) return null;
        out.push(slug ? { repo, slug, ref } : { repo });
      }
      return out;
    };
    const clean = cleanList(spec.members, true);
    const exclude = cleanList(spec.exclude, false);
    if (!clean || !exclude) return json(res, 400, { error: 'bad member or exclusion in body' });

    store.putGroup(name, { members: clean, all, exclude });
    const snap = store.snapshot(name);
    const effective = store.listGroups().find((g) => g.name === name)?.members ?? clean;
    return json(res, 200, { ok: true, name, all, members: effective, url: `/g/${name}`, manifest: snap?.id ?? null, missing: snap?.missing ?? [] });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      // Never leak a stack to an unauthenticated reader; the operator has the console.
      console.error(`✗ ${req.method} ${req.url} — ${err.stack || err.message}`);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
      else res.end();
    });
  });

  return { server, store };
}
