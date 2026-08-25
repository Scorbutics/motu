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
//   of it with one route and one environment variable.
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
  /** Which repo this application publishes as. Defaults to `MOTU_COVERAGE_REPO`. */
  repo?: string;
  /**
   * Restrict which regions may be forwarded. Absent, any region the client names is accepted.
   *
   * The endpoint is reachable by anyone who can load the page, so this is the difference between
   * "our regions" and "whatever a stranger types".
   */
  regions?: readonly string[];
  /** Largest body accepted, in bytes. A corpus is small; this is the flood guard. Default 256 kB. */
  maxBytes?: number;
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
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const answer = (status: number, body: CoverageServerResult['body']) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  if (request.method !== 'POST') return answer(405, { ok: false, error: 'POST only' });
  // MISCONFIGURATION IS 503, NOT 500. "The host is not configured" is a deployment fact the operator
  // can act on, and it must not read as a bug in the page that reported.
  if (!host || !token || !repo) {
    return answer(503, {
      ok: false,
      error: 'coverage forwarding is not configured — set MOTU_HOST_URL, MOTU_COVERAGE_TOKEN and MOTU_COVERAGE_REPO',
    });
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

  const url = `${host}/api/coverage?repo=${encodeURIComponent(repo)}&region=${encodeURIComponent(corpus.regionId)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: text,
    });
    if (!res.ok) {
      // 502, because the failure is upstream. The client learns the report did NOT land, which is what
      // stops it marking the state as reported and never offering it again — the difference between a
      // dropped report and a lost one.
      return answer(502, { ok: false, error: `the motu host answered ${res.status}` });
    }
    const body = (await res.json().catch(() => ({}))) as { states?: number };
    return answer(200, { ok: true, states: body.states ?? corpus.entries.length });
  } catch (err) {
    return answer(502, { ok: false, error: `the motu host is unreachable: ${(err as Error)?.message ?? 'failed'}` });
  }
}
