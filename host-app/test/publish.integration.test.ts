// `/api/publish` MUST STAY BYTE-COMPATIBLE — against a REAL host, not a stub.
//
// Every `~/.config/motu/host.json` in existence points at this route and the CLI posts a gzipped
// fragment through it. The stub tests next door prove which headers get copied; this one proves the
// bytes survive the trip: a real gzip stream, a real socket, a real `store.publish`, and the record
// read back out. If a proxy ever decompresses on the way through, the host's decompressed-size
// ceiling stops being checked and this is where that shows up.
//
// It talks to a throwaway host in a temp directory. Nothing here touches the machine's own store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
// The host is plain ESM node; tsc reads it through allowJs and infers from its JSDoc, which is why
// the options below are cast — `token` is inferred as null-only from its default.
import { createLagoonHost } from '../../packages/host/src/server.mjs';
import { proxyToHost } from '../src/upstream.ts';

const TOKEN = 'ADMIN-TOKEN';
const dir = mkdtempSync(resolve(tmpdir(), 'motu-host-app-'));
let server: { listen: Function; close: Function; address: Function };
let origin = '';

// A fragment big enough that gzip actually does something, and self-contained — a dangling
// `/assets/` reference is the one thing publish refuses on.
const FRAGMENT = `<div id="lagoon"><style>body{color:#123456}</style>${'<p>a lagoon</p>'.repeat(500)}</div>`;

before(async () => {
  ({ server } = createLagoonHost({ dir, token: TOKEN } as never) as any);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const through = (request: Request) => proxyToHost(request, { origin });

test('a gzipped fragment published THROUGH the proxy lands byte-identical', async () => {
  const gz = gzipSync(Buffer.from(FRAGMENT, 'utf8'));
  assert.ok(gz.length < FRAGMENT.length, 'the body really is compressed, so decoding it would show');

  const url = `${origin}/api/publish?repo=acme%2Fapp&slug=cart&title=Cart&sha=abc123&branch=main`;
  const res = await through(
    new Request(url, {
      method: 'POST',
      // A STREAM, the way the CLI sends 24 MB — not a Buffer the proxy could quietly collect.
      body: Readable.toWeb(Readable.from([gz])) as ReadableStream,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-encoding': 'gzip',
        'content-type': 'text/html; charset=utf-8',
      },
      // @ts-expect-error duplex is required by node's fetch for a stream body, absent from the DOM lib
      duplex: 'half',
    }),
  );

  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; repo: string; slug: string; url?: string };
  assert.equal(body.ok, true);
  assert.equal(body.repo, 'acme/app');
  assert.equal(body.slug, 'cart');

  // Read it back THROUGH the proxy. The host wraps the stored fragment in a doctype at serve time,
  // so the assertion is that the fragment is in there whole, not that the page equals the upload.
  const read = await through(new Request(`${origin}/acme/app/latest/cart`, { headers: { cookie: '' } }));
  assert.equal(read.status, 200);
  const html = await read.text();
  assert.ok(html.includes(FRAGMENT), 'the stored fragment came back exactly as it was sent');

  // And identical to what the host answers with no proxy in the way.
  const direct = await fetch(`${origin}/acme/app/latest/cart`);
  assert.equal(html, await direct.text());
});

test('the host still refuses a fragment that is not self-contained, through the proxy', async () => {
  // The refusal is the host's, and it has to survive the extra hop — a proxy that swallowed the 422
  // would let a blank lagoon publish successfully.
  const res = await through(
    new Request(`${origin}/api/publish?repo=acme%2Fapp&slug=broken`, {
      method: 'POST',
      body: '<div><img src="/assets/logo.png" /></div>',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/html' },
    }),
  );
  assert.equal(res.status, 422);
  assert.match(((await res.json()) as { error: string }).error, /not self-contained/);
});

test('a missing token is still 401 through the proxy — the gate is the host\'s, not the app\'s', async () => {
  const res = await through(
    new Request(`${origin}/api/publish?repo=acme%2Fapp&slug=cart`, {
      method: 'POST',
      body: FRAGMENT,
      headers: { 'content-type': 'text/html' },
    }),
  );
  assert.equal(res.status, 401);
});
