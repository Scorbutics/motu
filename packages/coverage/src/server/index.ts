// THE HOP THAT CARRIES THE TOKEN.
//
// A browser reports a novel region state to the application's OWN origin, and this forwards it to the
// motu host. That is the whole job, and every part of the shape is there for a reason:
//
//   SAME ORIGIN FOR THE BROWSER. Pointing production browsers straight at the motu host would mean a
//   third-party domain in the page — CORS, ad blockers, corporate proxies, and a destination the
//   application's privacy policy does not mention. The destination is the disclosure, not the
//   payload. So the browser only ever talks to the application, and the application talks to the host.
//
//   THE TOKEN NEVER ENTERS A PAGE, because the hop that carries it is server to server. It is read
//   from the environment here and appears in no bundle.
//
//   NO DATABASE. An adopting application used to need a table, four functions, RLS policies, grants
//   and a migration — around four hundred lines before a single state was recorded. This replaces all
//   of it with one route and ONE secret (none at all in `log` mode).
//
// WEB STANDARD REQUEST AND RESPONSE, so the same function serves a Next route handler, a Vercel
// function, a Cloudflare Worker, Deno, Bun, or anything behind a small adapter. A backend that cannot
// import TypeScript at all deploys this as a standalone function and points a path rule at it — the
// browser still sees only its own origin.
import type { CoverageCorpus } from '../index';

export interface CoverageServerOptions {
  /** The motu host, e.g. `https://motu.example.ts.net`. Defaults to `MOTU_HOST_URL`. */
  host?: string;
  /** A write-only ingest token for ONE repo — `motu-host access --repo <r> --ingest`. */
  token?: string;
  /**
   * Which repo this application publishes as. Defaults to `MOTU_COVERAGE_REPO`, and may be left out:
   * an ingest token belongs to exactly one repo, so the host reads the repo from the token.
   */
  repo?: string;
  /**
   * `forward` posts each report to the motu host (one secret, the ingest token, and outbound network
   * to the host). `log` writes one `motu-coverage {…}` line to this server's own log instead: no
   * secret, no outbound network, and `motu coverage pull` folds those lines later from wherever the
   * logs are. Defaults to `MOTU_COVERAGE_MODE`, then `forward`.
   */
  mode?: 'forward' | 'log';
  /** Where a `log`-mode line goes. Defaults to `console.log` — stdout, which every platform collects. */
  log?: (line: string) => void;
  /**
   * Restrict which regions may be forwarded. Absent, any region the client names is accepted.
   *
   * The endpoint is reachable by anyone who can load the page, so this is the difference between
   * "our regions" and "whatever a stranger types".
   */
  regions?: readonly string[];
  /** Largest body accepted, in bytes. A corpus is small; this is the flood guard. Default 256 kB. */
  maxBytes?: number;
  /**
   * The host's READ secret, for serving the accepted set back. Defaults to `MOTU_HOST_READ_TOKEN`.
   *
   * Deliberately not the ingest token: that one is write-only so a credential sitting in an
   * application's environment cannot read what the host holds for anyone. Unnecessary when the repo
   * is public on the host.
   */
  readToken?: string;
}

/** What a caller must know without reading the code: the answer is always JSON, never a throw. */
export interface CoverageServerResult {
  status: number;
  body: { ok: true; states: number } | { ok: false; error: string };
}

const DEFAULT_MAX_BYTES = 256 * 1024;

/**
 * Validate a corpus enough to refuse nonsense, and no further.
 *
 * DELIBERATELY SHALLOW. This endpoint is public — anyone who can load the page can post to it — so it
 * checks the shape it is about to forward and nothing about whether the contents are TRUE. It cannot
 * know that: a fingerprint is whatever the client's region held. Pretending otherwise would be
 * security theatre in front of a store whose worst case is a worklist with a junk row in it.
 */
function readCorpus(value: unknown, regions: readonly string[] | undefined): string | CoverageCorpus {
  if (!value || typeof value !== 'object') return 'body must be a JSON corpus';
  const c = value as Partial<CoverageCorpus>;
  if (typeof c.regionId !== 'string' || !c.regionId) return 'corpus.regionId is required';
  if (!Array.isArray(c.keys) || !c.keys.every((k) => typeof k === 'string')) return 'corpus.keys must be strings';
  if (!Array.isArray(c.entries)) return 'corpus.entries must be an array';
  if (regions && !regions.includes(c.regionId)) return `region "${c.regionId}" is not forwarded by this endpoint`;
  return c as CoverageCorpus;
}

/**
 * Handle one coverage report.
 *
 * NEVER THROWS, and never reports anything but its own outcome. A coverage probe that can break a
 * page — or a route that 500s and fills a log with a tunnel's downtime — is worse than no coverage.
 */
export async function handleCoverage(request: Request, opts: CoverageServerOptions = {}): Promise<Response> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const host = (opts.host ?? env.MOTU_HOST_URL ?? '').replace(/\/+$/, '');
  const token = opts.token ?? env.MOTU_COVERAGE_TOKEN ?? '';
  const repo = opts.repo ?? env.MOTU_COVERAGE_REPO ?? '';
  const mode = opts.mode ?? (env.MOTU_COVERAGE_MODE === 'log' ? 'log' : 'forward');
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  // `x-motu-coverage` says which path a report took, so `motu coverage doctor` can tell a forwarded
  // report from a logged one without reading this server's logs.
  const answer = (status: number, body: CoverageServerResult['body'], took?: 'forwarded' | 'logged') =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(took ? { 'x-motu-coverage': took } : {}) },
    });

  if (request.method !== 'POST') return answer(405, { ok: false, error: 'POST only' });
  // A DOCTOR'S REPORT is synthetic: it proves the path and must never land in a real corpus.
  const doctor = request.headers.get('x-motu-doctor') === '1';
  // MISCONFIGURATION IS 503, NOT 500. "The host is not configured" is a deployment fact the operator
  // can act on, and it must not read as a bug in the page that reported. Log mode needs nothing.
  //
  // ONE SECRET. The repo is no longer required — an ingest token belongs to exactly one repo and the
  // host reads it from the token — and the host URL is not a secret, so `motu coverage init` writes it
  // into the route. Four values used to have to be right in production; the host never stored a corpus.
  if (mode === 'forward' && (!host || !token)) {
    const missing = [!host && 'the host URL (`host` in the route, or MOTU_HOST_URL)', !token && 'MOTU_COVERAGE_TOKEN']
      .filter(Boolean)
      .join(' and ');
    return answer(503, { ok: false, error: `coverage forwarding is not configured — missing ${missing}` });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return answer(400, { ok: false, error: 'unreadable body' });
  }
  if (text.length > maxBytes) return answer(413, { ok: false, error: `corpus larger than ${maxBytes} bytes` });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return answer(400, { ok: false, error: 'body must be JSON' });
  }
  const corpus = readCorpus(parsed, opts.regions);
  if (typeof corpus === 'string') return answer(400, { ok: false, error: corpus });

  if (mode === 'log') {
    // ONE LINE, prefixed, so a grep over any log finds it among everything else. Shapes, never values:
    // a fingerprint holds only what the archipelago declared a closed set. `motu coverage pull` reads
    // these lines back, so the prefix and the single-line JSON are the format.
    const write = opts.log ?? ((line: string) => console.log(line));
    write(`${doctor ? 'motu-coverage-doctor' : 'motu-coverage'} ${JSON.stringify(corpus)}`);
    return answer(200, { ok: true, states: corpus.entries.length }, 'logged');
  }

  const url =
    `${host}/api/coverage?region=${encodeURIComponent(corpus.regionId)}` +
    (repo ? `&repo=${encodeURIComponent(repo)}` : '') +
    (doctor ? '&dryRun=1' : '');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: text,
    });
    if (res.status === 401) {
      return answer(502, { ok: false, error: 'the motu host refused the ingest token (401) — mint one with `motu coverage init`' }, 'forwarded');
    }
    if (!res.ok) {
      // 502, because the failure is upstream. The client learns the report did NOT land, which is what
      // stops it marking the state as reported and never offering it again — the difference between a
      // dropped report and a lost one.
      return answer(502, { ok: false, error: `the motu host answered ${res.status}` }, 'forwarded');
    }
    const body = (await res.json().catch(() => ({}))) as { states?: number };
    return answer(200, { ok: true, states: body.states ?? corpus.entries.length }, 'forwarded');
  } catch (err) {
    return answer(502, { ok: false, error: `the motu host is unreachable: ${describe(err)}` }, 'forwarded');
  }
}

/**
 * What actually went wrong, rather than "fetch failed".
 *
 * `fetch` reports every transport failure with that one string and puts the real reason in `cause` —
 * so a DNS miss, a refused connection, an expired certificate and an unroutable address are
 * indistinguishable at the top level. Running through a tunnel makes them all plausible at once, and
 * the difference decides what to do: ENOTFOUND is a wrong URL, ECONNREFUSED is a host that is down,
 * ETIMEDOUT or EHOSTUNREACH from a serverless function is usually an address family it cannot route
 * to, and a certificate error is neither.
 *
 * Cost us a round of guessing, which is the only reason it is worth the lines.
 */
function describe(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 4; depth++) {
    const e = cur as { message?: string; code?: string; cause?: unknown };
    if (e.code) parts.push(e.code);
    else if (e.message) parts.push(e.message);
    cur = e.cause;
  }
  return parts.length ? parts.join(' → ') : 'failed';
}


/**
 * Serve the accepted set — the states somebody has looked at and chosen not to preview.
 *
 * A client unions this with the flow-covered set baked into its bundle and stays silent about
 * anything in either. That union is what makes the steady state cost NOTHING rather than merely less:
 * once every state a user reaches is known, the beacon never fires. The baked half only shrinks
 * traffic on a redeploy; this half is why accepting a state takes effect at once.
 *
 * SAME HOP, SAME REASON as the forwarder. The browser asks its own origin; this reads the host with a
 * credential that never enters a page. The credential is the READ secret, not the ingest token —
 * ingest is write-only precisely so that a token living in an application's environment cannot read
 * back what the host holds.
 *
 * AN EMPTY SET IS THE SAFE ANSWER TO EVERYTHING, and the only safe one. Failing loudly would turn a
 * reporting tool's outage into a broken page; claiming a state is known when it is not would silently
 * delete a finding. At worst this costs one extra beacon; it can never cause a wrong silence.
 */
export async function handleKnown(request: Request, opts: CoverageServerOptions = {}): Promise<Response> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const host = (opts.host ?? env.MOTU_HOST_URL ?? '').replace(/\/+$/, '');
  const repo = opts.repo ?? env.MOTU_COVERAGE_REPO ?? '';
  // THE INGEST TOKEN READS THE ACCEPTED SET of its own repo (the host allows exactly that), so a
  // deployment needs no second secret for it. A read token still wins when one is set.
  const readToken = opts.readToken ?? env.MOTU_HOST_READ_TOKEN ?? opts.token ?? env.MOTU_COVERAGE_TOKEN ?? '';

  const empty = (cache: string) =>
    new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': cache } });

  const url = new URL(request.url);
  const region = url.searchParams.get('region') ?? '';
  const keysHash = url.searchParams.get('h') ?? '';
  if (!host || !region || !keysHash || (!repo && !readToken)) return empty('no-store');
  if (opts.regions && !opts.regions.includes(region)) return empty('no-store');

  const target =
    `${host}/api/coverage/known?region=${encodeURIComponent(region)}&h=${encodeURIComponent(keysHash)}` +
    (repo ? `&repo=${encodeURIComponent(repo)}` : '');
  try {
    const res = await fetch(target, { headers: readToken ? { authorization: `Bearer ${readToken}` } : {} });
    if (!res.ok) return empty('no-store');
    const ids = (await res.json()) as unknown;
    if (!Array.isArray(ids)) return empty('no-store');
    // CACHED, because this is the request that makes the rest cheap and must not become the cost
    // itself. The set changes when a human accepts something, so minutes of staleness cost one extra
    // beacon — a generous window that revalidates in the background is the right trade.
    return new Response(JSON.stringify(ids.filter((i) => typeof i === 'string')), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' },
    });
  } catch {
    return empty('no-store');
  }
}
