// THE COVERAGE CORPUS, AS ROWS — and the one write that arrives from somebody else's deployment.
//
// docs/plan-lagoon-host.md, in the constraints that break everything if lost:
//
//   `/api/coverage` ingest is the one write that arrives from an adopting application's own server,
//   carrying a per-repo token. It must keep working through the whole migration — a coverage proxy in
//   someone else's deployment does not redeploy on your schedule.
//
// So this route does not replace the host's; it takes over PER PROJECT. A repo with a `projects` row
// is served from `coverage_states`; a repo without one falls through to the host and its files,
// exactly as before. Same `abstain` shape as `authorize`, for the same reason: a migration that has to
// be complete before anything works is one that cannot be done in an afternoon.
//
// THE CREDENTIAL MODEL IS THE HOST'S, imported rather than re-derived. An ingest token is scoped to
// one repo and can do exactly one thing, and accepting a state takes the ADMIN token — because
// nothing promotes a state to "known" except a flow or a person, and a reporting path that could mark
// its own findings resolved reports nothing.
import { loadAccess, canIngest, secretMatches } from '@motu/host/src/access.mjs';
import { proxyToHost } from '@/src/upstream';
import { postgresProjectStore } from '@/src/auth/stores';
import { ingest, readCorpus, accept, known, forget, normalizeKeysHash } from '@/src/coverage/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

/**
 * Where the host keeps its store — CONFIGURED, with no default, and that is the fix rather than the
 * inconvenience.
 *
 * This used to fall back to `~/.motu/host`, which is `store.mjs`'s own default and is NOT where this
 * machine's host actually stores: its unit sets `MOTU_HOST_DIR=~/.local/share/motu-host`. Both
 * directories existed, so nothing errored — the app simply read an access.json that was not there,
 * got `{ repos: {} }`, and refused every ingest token as unrecognised. Fail-closed, silent, and
 * indistinguishable from "that token is wrong".
 *
 * A default that is right on a fresh install and wrong on every configured one is worse than none.
 */
function storeDir(): string | null {
  return process.env.MOTU_HOST_DIR || null;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const normalizeRepo = (raw: string | null): string | null => {
  const parts = String(raw ?? '').split('/').filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  return parts.every((p) => SEGMENT.test(p) && p.length <= 64) ? parts.join('/') : null;
};
const normalizeSegment = (raw: string | null): string | null =>
  SEGMENT.test(String(raw ?? '')) ? String(raw) : null;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function bearerOf(request: Request): string {
  return String(request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
}

/** Does this caller hold the host's admin token? Compared the host's way, over fixed-width digests. */
function isAdmin(request: Request): boolean {
  const token = process.env.MOTU_HOST_TOKEN;
  if (!token) return false;
  // The host holds the token itself rather than a digest, so hash it to reuse the constant-time
  // compare instead of writing a second, variable-time one here.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return secretMatches(bearerOf(request), createHash('sha256').update(token, 'utf8').digest('hex'));
}

const handler = async (request: Request) => {
  const url = new URL(request.url);
  const op = url.pathname.replace(/^\/api\/coverage\/?/, '');
  const method = request.method.toUpperCase();

  const repo = normalizeRepo(url.searchParams.get('repo'));
  if (!repo) return json(400, { error: 'repo must be `name` or `owner/name`, [A-Za-z0-9._-]' });

  // NO PROJECT ROW: not this app's corpus yet. Falls through untouched, credential and all — the host
  // authenticates it exactly as it did before, because the token never left the request.
  let project;
  try {
    project = await postgresProjectStore().byRepo(repo);
  } catch (err) {
    // A database outage is not a verdict here either. The host still has the files.
    console.error('[coverage] could not resolve the project:', (err as Error)?.message ?? err);
    return proxyToHost(request);
  }
  if (!project) return proxyToHost(request);

  // WITHOUT THE STORE we cannot evaluate the credential, so we do not pretend to. Falling through
  // hands the request to the host WITH its token intact, which authenticates it exactly as before —
  // the same reasoning as `abstain` in `authorize`: not knowing is not a verdict.
  const dir = storeDir();
  if (!dir) {
    console.error('[coverage] MOTU_HOST_DIR is not set — cannot read the host access policy, falling through');
    return proxyToHost(request);
  }
  const access = loadAccess(dir);
  const admin = isAdmin(request);
  const region = normalizeSegment(url.searchParams.get('region'));

  if (op === '' && method === 'POST') {
    // INGEST IS ITS OWN DOOR, checked before the admin gate and never falling through to it. This is
    // the credential most likely to leak — it lives in an adopting application's environment — so it
    // is scoped to one repo and can do exactly one thing.
    if (!admin && !canIngest(access, repo, bearerOf(request)))
      return json(401, { error: 'bad or missing ingest token for this repo' });
    if (!region) return json(400, { error: 'region is required' });
    let incoming;
    try {
      incoming = JSON.parse(await request.text());
    } catch {
      return json(400, { error: 'body must be a JSON corpus' });
    }
    if (!Array.isArray(incoming?.entries) || !Array.isArray(incoming?.keys))
      return json(400, { error: 'a corpus needs `keys` and `entries`' });
    try {
      const result = await ingest(project.id, region, incoming);
      // NOTHING ABOUT THE CORPUS COMES BACK, byte-for-byte the host's answer. The caller is an
      // application server forwarding on behalf of a browser; it needs to know the write LANDED so the
      // client can stop re-reporting that state, and it has no business reading what anyone else's
      // browser has reached.
      return json(200, { ok: true, states: result.states });
    } catch (err) {
      return json(400, { error: String((err as Error)?.message ?? err) });
    }
  }

  if (op === 'known' && method === 'GET') {
    if (!region) return json(400, { error: 'region is required' });
    const h = url.searchParams.get('h');
    try {
      return json(200, await known(project.id, region, normalizeKeysHash(h)));
    } catch (err) {
      return json(400, { error: String((err as Error)?.message ?? err) });
    }
  }

  if (op === '' && method === 'GET') {
    // READING BACK is the admin's, not the ingest token's: an app's environment holds a credential to
    // report its own states, never to read what every other browser has reached.
    if (!admin) return json(401, { error: 'reading a corpus needs the admin token' });
    if (!region) return json(400, { error: 'region is required' });
    const h = normalizeKeysHash(url.searchParams.get('h'));
    const keys = (url.searchParams.get('keys') ?? '').split(',').filter(Boolean);
    return json(200, await readCorpus(project.id, region, h, keys));
  }

  if ((op === 'accept' || op === 'forget') && method === 'POST') {
    if (!admin)
      return json(401, { error: `${op === 'accept' ? 'accepting' : 'forgetting'} a state needs the admin token` });
    if (!region) return json(400, { error: 'region is required' });
    const h = url.searchParams.get('h');
    let ids: string[] | null = null;
    try {
      const raw = JSON.parse(await request.text());
      if (Array.isArray(raw)) ids = raw.filter((i) => typeof i === 'string');
    } catch {
      ids = null;
    }
    try {
      const hash = normalizeKeysHash(h);
      if (op === 'accept') {
        if (!ids) return json(400, { error: 'body must be a JSON array of fingerprint ids' });
        return json(200, { ok: true, ...(await accept(project.id, region, hash, ids)) });
      }
      return json(200, { ok: true, ...(await forget(project.id, region, hash, ids)) });
    } catch (err) {
      return json(400, { error: String((err as Error)?.message ?? err) });
    }
  }

  // Anything else under /api/coverage is the host's to answer or refuse — this app has not claimed it.
  return proxyToHost(request);
};

export { handler as GET, handler as POST };
