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

  async function handle(req, res) {
    const url = new URL(req.url, 'http://host');
    const path = url.pathname;

    if (path === '/favicon.ico') return void res.writeHead(204).end();
    if (path === '/api/health') return json(res, 200, { ok: true, ...store.stats() });
    // The two read APIs the CLI needs to build a gallery without scraping the HTML index.
    if (path === '/api/repos') return json(res, 200, { repos: store.listRepos() });
    if (path === '/api/groups') return json(res, 200, { groups: store.listGroups() });

    if (req.method === 'POST') {
      if (!token) return json(res, 503, { error: 'this host accepts no uploads — start it with a token' });
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!tokenMatches(auth, token)) return json(res, 401, { error: 'bad or missing token' });
      if (path === '/api/publish') return void (await publish(req, res, url));
      if (path === '/api/group') return void (await group(req, res, url));
      return json(res, 404, { error: `no route for POST ${path}` });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(res, 405, { error: `${req.method} not allowed` });

    if (path === '/') {
      return html(res, 200, rootIndexPage({ repos: store.listRepos(), groups: store.listGroups(), stats: store.stats() }), NO_STORE);
    }

    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);

    // --- composed views ---------------------------------------------------------------------
    if (segments[0] === 'g') {
      const name = normalizeSegment(segments[1]);
      if (!name) return html(res, 400, errorPage(400, 'bad group name'), NO_STORE);
      const snap = store.snapshot(name);
      if (!snap) return html(res, 404, errorPage(404, `no group "${name}"`), NO_STORE);
      if (!snap.id) return html(res, 404, errorPage(404, `group "${name}" resolves to nothing yet — no member has published`), NO_STORE);
      // Assemble, then hand out the IMMUTABLE id. The group URL always means "today"; the manifest it
      // redirects to keeps rendering what today looked like. Identical resolution → identical id, so
      // viewing a stable group a thousand times adds one manifest, not a thousand.
      return void res.writeHead(302, { location: `/m/${snap.id}/`, 'cache-control': 'no-store' }).end();
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

  async function group(req, res, url) {
    const name = normalizeSegment(url.searchParams.get('name'));
    if (!name) return json(res, 400, { error: 'name must be [A-Za-z0-9._-]' });
    let members;
    try {
      members = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8'));
    } catch (e) {
      return json(res, 400, { error: `body must be JSON: ${e.message}` });
    }
    if (!Array.isArray(members) || !members.length) return json(res, 400, { error: 'body must be a non-empty array of {repo, slug, ref?}' });
    const clean = [];
    for (const m of members) {
      const repo = normalizeRepo(m?.repo);
      const slug = normalizeSegment(m?.slug);
      const ref = m?.ref ? normalizeSegment(m.ref) : 'latest';
      if (!repo || !slug || !ref) return json(res, 400, { error: `bad member ${JSON.stringify(m)}` });
      clean.push({ repo, slug, ref });
    }
    store.putGroup(name, clean);
    const snap = store.snapshot(name);
    return json(res, 200, { ok: true, name, members: clean, url: `/g/${name}`, manifest: snap?.id ?? null, missing: snap?.missing ?? [] });
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
