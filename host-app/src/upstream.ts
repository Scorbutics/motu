// PHASE 0 OF THE ACCOUNTS MIGRATION: the Next app sits in front, and everything it does not yet
// own is handed to the node host unchanged. See docs/plan-lagoon-host.md.
//
// The whole point of this file is that it changes NOTHING. `@motu/host` keeps serving every route
// it serves today — the index, the pages, `/api/publish`, the composed manifests, the live proxy —
// and the only difference is that the bytes arrive via one more hop. Each route moves into the app
// on its own commit, and until it does it falls through to here.
//
// Two of the host's contracts make a naive proxy wrong, so they are called out where they are kept:
//
//   `/api/publish` MUST STAY BYTE-COMPATIBLE. Every `~/.config/motu/host.json` in existence points
//   at it and the CLI posts a gzipped fragment up to 24 MB. So the request body is STREAMED, never
//   buffered and never re-encoded, and `content-encoding` is forwarded untouched — the host does
//   its own gunzip and its own size accounting, and a proxy that decompressed on the way through
//   would defeat the decompressed-size ceiling it checks.
//
//   A LIVE FRAME IS AN SSE STREAM. `/m/<manifest>/f/<i>` can be proxied to somebody's dev server,
//   reload stream included. A response collected before it is forwarded never arrives, so the
//   upstream body is passed through as a stream too.

/** Where the node host listens. Loopback by default: the app is the only thing that should reach it. */
export const DEFAULT_UPSTREAM = 'http://127.0.0.1:8818';

export function upstreamOrigin(env: Record<string, string | undefined> = process.env): string {
  return (env.MOTU_HOST_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '');
}

/**
 * Headers that describe THIS hop rather than the message, and must not be copied to the next one.
 *
 * `content-length` is in here for both directions and for different reasons. Outbound: the body is
 * a stream, so the length is re-derived (or chunked) by the client and a stale copy is a protocol
 * error. Inbound: `fetch` transparently decompresses a `content-encoding` response, so the length
 * that arrived describes bytes the caller will never see.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

function forwardRequestHeaders(request: Request): Headers {
  const out = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) out.append(name, value);
  });
  return out;
}

function forwardResponseHeaders(upstream: Response): Headers {
  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    // `set-cookie` is re-added below through getSetCookie(); appending it here as well would
    // duplicate every cookie the host sets — which is how a private link's `?k=` unlock arrives.
    if (lower === 'set-cookie') return;
    // See HOP_BY_HOP: fetch already decoded the body, so the encoding header is now a lie.
    if (lower === 'content-encoding') return;
    if (!HOP_BY_HOP.has(lower)) out.append(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  return out;
}

const BODYLESS = new Set(['GET', 'HEAD']);

export type ProxyOptions = {
  /** Injectable so the tests can drive a stub without a socket. */
  fetchImpl?: typeof fetch;
  origin?: string;
};

/**
 * Hand one request to the node host and hand its answer straight back.
 *
 * `redirect: 'manual'` is load-bearing: the host answers a private link's `?k=` with a 302 that
 * carries the `set-cookie` doing the unlocking. Following it here would consume the cookie in this
 * process and hand the browser a page it is not yet allowed to keep reading.
 */
export async function proxyToHost(request: Request, options: ProxyOptions = {}): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const origin = options.origin ?? upstreamOrigin();
  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const hasBody = !BODYLESS.has(request.method.toUpperCase()) && request.body !== null;
  let upstream: Response;
  try {
    upstream = await doFetch(target, {
      method: request.method,
      headers: forwardRequestHeaders(request),
      body: hasBody ? request.body : undefined,
      // Required by fetch whenever the body is a stream: we are not reading the response before we
      // have finished sending the request.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      signal: request.signal,
    } as RequestInit);
  } catch (err) {
    // The host is down or restarting. Say so plainly rather than rendering a shell around it — this
    // path is the migration's own failure, not the application's.
    return new Response(`the lagoon host at ${origin} is not answering\n`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // A 204/304 must not carry a body, and neither must the answer to a HEAD.
  const bodyless = upstream.status === 204 || upstream.status === 304 || request.method.toUpperCase() === 'HEAD';
  return new Response(bodyless ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardResponseHeaders(upstream),
  });
}
