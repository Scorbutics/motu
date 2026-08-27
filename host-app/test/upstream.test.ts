// WHAT A NAIVE PROXY BREAKS. Phase 0's whole claim is that nothing changes, so every case here is
// a way the bytes could arrive different from how the host sent them. See docs/plan-lagoon-host.md.
//
// The stub is a `fetch` that records its arguments — no socket, because the thing under test is
// what gets copied from one message to the next, not whether TCP works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyToHost, upstreamOrigin, DEFAULT_UPSTREAM } from '../src/upstream.ts';

const ORIGIN = 'http://127.0.0.1:8818';

type Call = { url: string; init: RequestInit & { duplex?: string } };

function stub(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as Call['init'] };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const run = (request: Request, respond: (call: Call) => Response | Promise<Response>) => {
  const s = stub(respond);
  return proxyToHost(request, { fetchImpl: s.impl, origin: ORIGIN }).then((res) => ({ res, calls: s.calls }));
};

/** The one call the proxy made. Asserting it happened is why this is a function and not `calls[0]`. */
function only(calls: Call[]): Call {
  assert.equal(calls.length, 1, 'exactly one upstream request');
  return calls[0] as Call;
}

test('the origin is configurable, and a trailing slash never doubles the path', () => {
  assert.equal(upstreamOrigin({}), DEFAULT_UPSTREAM);
  assert.equal(upstreamOrigin({ MOTU_HOST_UPSTREAM: 'http://box:9000///' }), 'http://box:9000');
});

test('path and query reach the host unchanged — `?k=` is how a private link unlocks', async () => {
  const { calls } = await run(
    new Request('https://lagoon.example/acme/repo/latest/cart?k=SECRET&x=1'),
    () => new Response('ok'),
  );
  assert.equal(only(calls).url, `${ORIGIN}/acme/repo/latest/cart?k=SECRET&x=1`);
});

test('hop-by-hop headers describe THIS hop and are not copied to the next', async () => {
  const { calls } = await run(
    new Request('https://lagoon.example/', {
      headers: { connection: 'keep-alive', 'x-motu-token': 'ING', cookie: 'motu_read=R' },
    }),
    () => new Response('ok'),
  );
  const sent = only(calls).init.headers as Headers;
  assert.equal(sent.get('connection'), null);
  assert.equal(sent.get('host'), null);
  // The credentials the host authenticates with must survive: an ingest token and a read cookie.
  assert.equal(sent.get('x-motu-token'), 'ING');
  assert.equal(sent.get('cookie'), 'motu_read=R');
});

test('a publish body is STREAMED, not buffered, and its content-encoding is forwarded untouched', async () => {
  // 24 MB of gzip must not be read into this process, and must not be re-encoded: the host does its
  // own gunzip and its own decompressed-size accounting.
  const body = new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } });
  const request = new Request(`${ORIGIN}/api/publish`, {
    method: 'POST',
    body,
    headers: { 'content-encoding': 'gzip', 'content-type': 'application/json', 'content-length': '3' },
    // @ts-expect-error duplex is required by node's fetch for a stream body and absent from the DOM lib
    duplex: 'half',
  });
  const { calls } = await run(request, () => new Response('{}'));
  const { init } = only(calls);
  assert.equal(init.body, request.body, 'the same stream object, so nothing was collected on the way through');
  assert.equal(init.duplex, 'half');
  const sent = init.headers as Headers;
  assert.equal(sent.get('content-encoding'), 'gzip');
  // Re-derived by the client from the stream; a stale copy is a protocol error.
  assert.equal(sent.get('content-length'), null);
});

test('a GET carries no body and no duplex', async () => {
  const { calls } = await run(new Request('https://lagoon.example/'), () => new Response('ok'));
  assert.equal(only(calls).init.body, undefined);
  assert.equal(only(calls).init.duplex, undefined);
});

test('a redirect is handed to the browser, never followed here', async () => {
  // The host answers `?k=` with a 302 whose set-cookie does the unlocking. Following it in this
  // process would consume the cookie and hand the browser a page it may not keep reading.
  const { res, calls } = await run(
    new Request('https://lagoon.example/acme/repo/latest/cart?k=SECRET'),
    () =>
      new Response(null, {
        status: 302,
        headers: { location: '/acme/repo/latest/cart', 'set-cookie': 'motu_r_acme=1; HttpOnly; Path=/' },
      }),
  );
  assert.equal(only(calls).init.redirect, 'manual');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/acme/repo/latest/cart');
  assert.deepEqual(res.headers.getSetCookie(), ['motu_r_acme=1; HttpOnly; Path=/']);
});

test('several set-cookie survive as several, and none is duplicated', async () => {
  const headers = new Headers({ 'content-type': 'text/html' });
  headers.append('set-cookie', 'a=1; Path=/');
  headers.append('set-cookie', 'b=2; Path=/');
  const { res } = await run(new Request('https://lagoon.example/'), () => new Response('hi', { headers }));
  assert.deepEqual(res.headers.getSetCookie(), ['a=1; Path=/', 'b=2; Path=/']);
});

test('the response content-encoding and length are dropped — fetch already decoded the body', async () => {
  const { res } = await run(
    new Request('https://lagoon.example/'),
    () => new Response('decoded', { headers: { 'content-encoding': 'gzip', 'content-length': '3', etag: '"abc"' } }),
  );
  assert.equal(res.headers.get('content-encoding'), null);
  assert.equal(res.headers.get('content-length'), null);
  assert.equal(res.headers.get('etag'), '"abc"');
  assert.equal(await res.text(), 'decoded');
});

test('a live frame is passed through as a stream, not collected', async () => {
  // `/m/<manifest>/f/<i>` proxies to somebody's dev server, reload stream included. A response read
  // to completion before it is forwarded never arrives.
  let push!: (chunk: string) => void;
  const upstreamBody = new ReadableStream<Uint8Array>({
    start(c) {
      push = (chunk) => c.enqueue(new TextEncoder().encode(chunk));
    },
  });
  const { res } = await run(
    new Request('https://lagoon.example/m/abc/f/0'),
    () => new Response(upstreamBody, { headers: { 'content-type': 'text/event-stream' } }),
  );
  // proxyToHost has already returned while the upstream body is still open — that is the assertion.
  push('data: reload\n\n');
  const reader = res.body!.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), 'data: reload\n\n');
  await reader.cancel();
});

for (const [method, status] of [['GET', 204], ['GET', 304], ['HEAD', 200]] as const) {
  test(`${method} ${status} answers without a body`, async () => {
    const { res } = await run(
      new Request('https://lagoon.example/', { method }),
      () => new Response(status === 200 ? 'body' : null, { status }),
    );
    assert.equal(res.status, status);
    assert.equal(res.body, null);
  });
}

test('the host being down is the migration failing, and says so instead of rendering a shell', async () => {
  const { res } = await run(new Request('https://lagoon.example/'), () => {
    throw new Error('ECONNREFUSED');
  });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(await res.text(), /8818 is not answering/);
});
