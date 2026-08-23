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
import { wrapFragment } from './document.mjs';
import { composedPage, rootIndexPage, repoIndexPage, errorPage } from './views.mjs';

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

const MAX_WIRE = 24 * 1024 * 1024;
const MAX_DECOMPRESSED = 64 * 1024 * 1024;

function send(res, status, type, body, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(status, { 'content-type': type, 'content-length': buf.length, ...extra });
  res.end(buf);
}

const html = (res, status, body, extra) => send(res, status, 'text/html; charset=utf-8', body, extra);
const json = (res, status, obj) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj, null, 2));

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
      if (bytes) return void html(res, 200, wrapFragment(bytes, { title: member.title }), NO_STORE);
      return void html(res, 502, errorPage(502, 'the live lagoon for this member stopped answering'), NO_STORE);
    }
    const type = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8';
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

    if (path === '/favicon.ico') return void res.writeHead(204).end();
    if (path === '/api/health') return json(res, 200, { ok: true, ...store.stats() });
    // The two read APIs the CLI needs to build a gallery without scraping the HTML index.
    if (path === '/api/repos') return json(res, 200, { repos: store.listRepos() });
    if (path === '/api/baselines') {
      const repo = normalizeRepo(url.searchParams.get('repo'));
      if (!repo) return json(res, 400, { error: 'repo is required' });
      return json(res, 200, { repo, shots: store.listShots(repo, url.searchParams.get('island') || null) });
    }
    if (path === '/api/groups') return json(res, 200, { groups: store.listGroups() });
    // GUARDED BY METHOD, unlike its neighbours, because this path also takes a POST. Without the guard
    // the read branch answered the registration too — a cheerful 200 with an empty list, so the CLI
    // reported itself live and the host had never heard of it.
    if (path === '/api/live' && req.method === 'GET') return json(res, 200, { live: live.list() });

    if (req.method === 'POST') {
      if (!token) return json(res, 503, { error: 'this host accepts no uploads — start it with a token' });
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!tokenMatches(auth, token)) return json(res, 401, { error: 'bad or missing token' });
      if (path === '/api/publish') return void (await publish(req, res, url));
      if (path === '/api/group') return void (await group(req, res, url));
      if (path === '/api/baseline') return void (await baseline(req, res, url));
      if (path === '/api/baseline/accept') return void (await acceptBaseline(req, res, url));
      if (path === '/api/live' || path === '/api/live/off') {
        const repo = normalizeRepo(url.searchParams.get('repo'));
        const slug = normalizeSegment(url.searchParams.get('slug'));
        if (!repo || !slug) return json(res, 400, { error: 'repo and slug are required' });
        if (path === '/api/live/off') return json(res, 200, { ok: true, cleared: live.clear(repo, slug) });
        let where;
        try {
          where = JSON.parse((await readBody(req, 4096)).toString('utf8'))?.url;
        } catch {
          where = null;
        }
        // LOOPBACK ONLY. This host proxies to whatever it is told, so anything else would make it an
        // open relay for the machine it runs on — pointed at a metadata endpoint, say, by anyone who
        // has the token. A dev server on another machine is not a case this needs to serve.
        if (typeof where !== 'string' || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(where.replace(/\/+$/, '')))
          return json(res, 400, { error: 'url must be http://127.0.0.1:<port>' });
        live.set(repo, slug, where.replace(/\/+$/, ''));
        return json(res, 200, { ok: true, member: `${repo}/${slug}`, url: where, ttlMs: 90_000 });
      }
      return json(res, 404, { error: `no route for POST ${path}` });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(res, 405, { error: `${req.method} not allowed` });

    if (path === '/') {
      return html(res, 200, rootIndexPage({ repos: store.listRepos(), groups: store.listGroups(), stats: store.stats() }), NO_STORE);
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
      const members = store.resolveGroup(name, live.endpointFor);
      if (!members.length)
        return html(res, 404, errorPage(404, `group "${name}" resolves to nothing yet — no member has published`), NO_STORE);

      // A frame, and the reload stream that belongs to it.
      if (segments[2] === 'f') {
        const i = Number.parseInt(segments[3] ?? '', 10);
        const member = Number.isInteger(i) ? members[i] : null;
        if (!member) return html(res, 404, errorPage(404, 'no such frame'), NO_STORE);
        if (member.live) return void (await proxyLive(member.live, segments[4] ? `/${segments[4]}` : '/', req, res, member));
        if (!member.hash) return html(res, 404, errorPage(404, 'this member has never published'), NO_STORE);
        const bytes = store.readHash(member.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'this frame’s object is gone'), NO_STORE);
        // NOT immutable here: the group means today, and today's `latest` moves.
        return html(res, 200, wrapFragment(bytes, { title: member.title }), NO_STORE);
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
      if (segments[2] === 'f') {
        const i = Number.parseInt(segments[3] ?? '', 10);
        const member = Number.isInteger(i) ? found.members[i] : null;
        if (!member) return html(res, 404, errorPage(404, 'no such frame'), NO_STORE);
        const bytes = store.readHash(member.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'this frame’s object is gone'), NO_STORE);
        return html(res, 200, wrapFragment(bytes, { title: member.title }), IMMUTABLE);
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
      const slug = normalizeSegment(segments[segments.length - 1]);
      const ref = normalizeSegment(segments[segments.length - 2]);
      const repo = normalizeRepo(segments.slice(0, -2).join('/'));
      if (repo && ref && slug) {
        const rec = store.resolveRef(repo, ref, slug);
        if (!rec) return html(res, 404, errorPage(404, `nothing at ${repo}/${ref}/${slug}`), NO_STORE);
        const bytes = store.read(repo, rec.id, rec.hash);
        if (!bytes) return html(res, 410, errorPage(410, 'the object behind this URL has been swept'), NO_STORE);
        return html(res, 200, wrapFragment(bytes, { title: rec.title }), rec.mutable ? NO_STORE : IMMUTABLE);
      }
    }

    const repo = normalizeRepo(segments.join('/'));
    const listing = repo && store.listRepo(repo);
    if (listing) return html(res, 200, repoIndexPage(listing), NO_STORE);

    return html(res, 404, errorPage(404, `nothing at ${path}`), NO_STORE);
  }

  async function publish(req, res, url) {
    const repo = normalizeRepo(url.searchParams.get('repo'));
    const slug = normalizeSegment(url.searchParams.get('slug'));
    if (!repo) return json(res, 400, { error: 'repo must be `name` or `owner/name`, [A-Za-z0-9._-]' });
    if (!slug) return json(res, 400, { error: 'slug must be [A-Za-z0-9._-]' });
    const title = (url.searchParams.get('title') || slug).slice(0, 200);
    const sha = normalizeSegment(url.searchParams.get('sha') || '') || null;
    const branch = normalizeSegment(url.searchParams.get('branch') || '') || null;

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

    const out = store.publish(repo, slug, body, { title, sha, branch });
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
