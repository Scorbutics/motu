// WHAT IS BEING SERVED LIVE RIGHT NOW, and how to hand a request to it.
//
// A LIVE LAGOON is a `motu lagoon serve --watch` running on somebody's machine: it rebuilds on every
// save, serves one self-contained artifact for every path, injects an SSE reload client at a RELATIVE
// `__motu_reload`, and re-announces itself to the host every few seconds. The host's job is to put
// that process behind the URL people already use, so the page a colleague has open updates while you
// type — without them changing the address, and without you publishing.
//
// WHY THIS FILE EXISTS. Liveness works today on every path, and on the direct link it works because
// the app GATES records and then proxies them — `record()` in read-routes.ts is written, imported and
// never called, waiting for the phase-4 step that switches record serving over. On the day that step
// lands, a route with no notion of liveness would take hot reload away from the URL people actually
// bookmark, silently: the page still renders, it is just yesterday's, and no check looks at whether a
// document is the current one. So the knowledge goes in BEFORE the switch, not after it.
//
// This is also why the group view already needed it: that route DID move, yesterday, and had to carry
// liveness across with it.
//
// THE CO-LOCATION THIS DEPENDS ON, said out loud: the host fetches `http://127.0.0.1:<port>`, so it
// works because the host and the dev server are on the same machine. Reaching a dev server on
// somebody ELSE's laptop needs that laptop to publish a reachable URL — a tunnel — and the registry
// already stores a URL rather than a port precisely so that stays possible.
import { upstreamOrigin } from '../upstream.ts'
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { wrapFragment, withRepoMeta } from '@motu/host/src/document.mjs'
import { errorPage } from '@motu/host/src/views.mjs'

/** `repo/slug` -> the URL serving it. Empty when nothing is live, or when the registry is unreachable. */
export type LiveMap = Map<string, string>

/** Where the registry lives today. See `docs/plan-lagoon-host.md` — moving it here is phase 4's tail. */
const REGISTRY_TIMEOUT_MS = 1500

/**
 * Ask the process that owns the registry which members are live.
 *
 * THE REGISTRY STAYS IN THE NODE HOST for now, and that is a deliberate hold rather than an
 * oversight: it is in-memory state fed by `POST /api/live`, and the CLI announces to whatever
 * `~/.config/motu/host.json` names — so moving the map here means repointing every developer's config
 * and breaking watch mode for anyone who has not. One request per render against a process on the
 * same machine buys the correctness now and leaves the move to when the CLI moves with it.
 *
 * A FAILURE IS "NOTHING IS LIVE", never an error. Every member then resolves to its last published
 * build, which is what the page shows the rest of the time — a far better answer than refusing it.
 */
export async function liveMap(): Promise<LiveMap> {
  try {
    const res = await fetch(`${upstreamOrigin()}/api/live`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    })
    if (!res.ok) return new Map()
    const body = (await res.json()) as { live?: Array<{ member: string; url: string }> }
    return new Map((body.live ?? []).map((e) => [e.member, e.url]))
  } catch {
    return new Map()
  }
}

/**
 * The endpoint serving this exact lagoon, or null.
 *
 * `latest` ONLY, and this is the rule the whole feature hangs off. An immutable URL keyed by content
 * must never be live: being able to say "this exact page, forever" is the entire reason that URL
 * exists, and serving something else from it would break the one promise it makes.
 */
export function liveFor(map: LiveMap, repo: string, ref: string, slug: string): string | null {
  if (ref !== 'latest') return null
  return map.get(`${repo}/${slug}`) ?? null
}

/**
 * Hand a request to the dev server, and stamp what comes back.
 *
 * HTML IS BUFFERED, everything else STREAMS. The document has to be whole before `withRepoMeta` can
 * put a tag in its head — that stamp is how a lagoon knows which repo it belongs to, and without it a
 * live page renders without the coverage section, which is invisible because the page otherwise
 * works. Everything else streams, the reload channel above all: an SSE response collected before it
 * is forwarded never arrives at all.
 */
export async function proxyLive(
  liveUrl: string,
  subPath: string,
  request: Request,
  fallback: { repo: string; slug: string; hash: string | null; title: string; bytes: () => Buffer | null },
): Promise<Response> {
  const target = `${liveUrl.replace(/\/+$/, '')}${subPath}`
  let upstream: Response
  try {
    upstream = await fetch(target, {
      headers: { accept: request.headers.get('accept') ?? '*/*' },
      // NO TIMEOUT ON THE RELOAD CHANNEL. It is an open stream that says nothing for minutes at a
      // time; a deadline here would close it on schedule and the page would reconnect for ever.
      signal: subPath.endsWith('__motu_reload') ? undefined : AbortSignal.timeout(10_000),
    })
  } catch {
    // THE DEV SERVER WENT AWAY between resolving and asking — Ctrl-C, a crash, a laptop lid. Fall
    // back to what it last published rather than showing an error for a page with perfectly good
    // bytes in the store. The registry entry expires on its own; this request does not wait for it.
    const bytes = fallback.bytes()
    if (bytes) {
      return new Response(withRepoMeta(wrapFragment(bytes, { title: fallback.title }), fallback.repo) as string, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    return new Response(errorPage(502, 'the live lagoon for this page stopped answering'), {
      status: 502,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  const type = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8'
  if (type.includes('text/html')) {
    const body = withRepoMeta(Buffer.from(await upstream.arrayBuffer()), fallback.repo)
    return new Response(body as unknown as string, {
      status: upstream.status,
      headers: { 'content-type': type, 'cache-control': 'no-store' },
    })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': type,
      'cache-control': 'no-store',
      // SSE through a proxy needs both of these or an intermediary will hold the stream until it
      // thinks it has enough to be worth forwarding, which for a reload channel is never.
      ...(type.includes('text/event-stream') ? { 'x-accel-buffering': 'no', connection: 'keep-alive' } : {}),
    },
  })
}
