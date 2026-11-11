// A CHUNKED lagoon: the chunks first, then a manifest that names them, and a page that loads them.
//
// The point of the protocol is that an edit in one region sends one chunk. Everything here is a way
// that promise could quietly break: a chunk accepted under the wrong hash (a page that loads someone
// else's code), a manifest accepted before its chunks (a page that loads and then 404s on a module),
// a sweep that deletes chunks a live record still names, or a page served with its placeholder intact.
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createLagoonHost } from '../src/server.mjs';
import { openStore } from '../src/store.mjs';

const dir = mkdtempSync(resolve(tmpdir(), 'motu-chunks-'));
const { server } = createLagoonHost({ dir, token: 'ADMIN' });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const B = `http://127.0.0.1:${server.address().port}`;
const AUTH = { authorization: 'Bearer ADMIN' };

let pass = 0;
let fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
const TYPE = 'application/vnd.motu.lagoon+json';

const vendor = 'export const v = 1;';
const region = 'import { v } from "./vendor.js"; document.body.dataset.v = v;';
const manifestFor = (files) =>
  JSON.stringify({
    motu: 'lagoon-manifest/1',
    html: '<script type="module" src="__MOTU_ASSETS__/region.js"></script><p>chunked</p>',
    files: Object.fromEntries(Object.entries(files).map(([n, body]) => [n, sha(body)])),
  });

// 1. WHAT IS MISSING, asked before anything is sent.
{
  const res = await fetch(`${B}/api/blobs/missing`, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ hashes: [sha(vendor), sha(region), 'not-a-hash'] }) });
  const { missing } = await res.json();
  t('a fresh host is missing every chunk', missing.length === 2 && missing.includes(sha(vendor)), JSON.stringify(missing));
  const anon = await fetch(`${B}/api/blobs/missing`, { method: 'POST', body: '{"hashes":[]}' });
  t('and will not say without the token', anon.status === 401, String(anon.status));
}

// 2. A CHUNK IS STORED ONLY AT ITS OWN ADDRESS.
{
  const wrong = await fetch(`${B}/api/blobs/${sha(region)}`, { method: 'PUT', headers: AUTH, body: vendor });
  t('bytes sent to another chunk’s address are refused', wrong.status === 422, String(wrong.status));
  const ok = await fetch(`${B}/api/blobs/${sha(vendor)}`, { method: 'PUT', headers: { ...AUTH, 'content-encoding': 'gzip' }, body: gzipSync(vendor) });
  t('a gzipped chunk at its own address is stored', ok.status === 200, String(ok.status));
}

// 3. NO MANIFEST BEFORE ITS CHUNKS.
{
  const early = await fetch(`${B}/api/publish?repo=acme/web&slug=all`, { method: 'POST', headers: { ...AUTH, 'content-type': TYPE }, body: manifestFor({ 'vendor.js': vendor, 'region.js': region }) });
  const body = await early.json();
  t('a manifest naming a chunk the host lacks is refused', early.status === 422 && body.missing?.[0] === sha(region), JSON.stringify(body));
}

// 4. PUBLISHED, AND SERVED.
let manifestHash;
{
  await fetch(`${B}/api/blobs/${sha(region)}`, { method: 'PUT', headers: AUTH, body: region });
  const m = manifestFor({ 'vendor.js': vendor, 'region.js': region });
  manifestHash = sha(m);
  const res = await fetch(`${B}/api/publish?repo=acme/web&slug=all&sha=abc123`, { method: 'POST', headers: { ...AUTH, 'content-type': TYPE }, body: m });
  const out = await res.json();
  t('the manifest publishes once its chunks are here', res.ok && out.hash === manifestHash && out.chunks === 2, JSON.stringify(out));

  const page = await (await fetch(`${B}/acme/web/latest/all/__motu_frame`)).text();
  t('the page names its chunks by the manifest’s hash', page.includes(`/__motu_assets/${manifestHash}/region.js`), page.slice(0, 200));
  t('and no placeholder survives', !page.includes('__MOTU_ASSETS__'));

  const chunk = await fetch(`${B}/__motu_assets/${manifestHash}/region.js`);
  t('a chunk is served as JavaScript', chunk.ok && (chunk.headers.get('content-type') ?? '').startsWith('text/javascript'), chunk.headers.get('content-type'));
  t('cached forever, because its address is its content', /immutable/.test(chunk.headers.get('cache-control') ?? ''));
  t('and is the bytes that were sent', (await chunk.text()) === region);
  const stray = await fetch(`${B}/__motu_assets/${manifestHash}/../index.json`);
  t('a name the manifest does not list is not a path into the store', stray.status === 404, String(stray.status));
}

// 5. AN EDIT IN ONE REGION SENDS ONE CHUNK.
{
  const edited = region.replace('= v', '= v + 1');
  const res = await fetch(`${B}/api/blobs/missing`, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ hashes: [sha(vendor), sha(edited)] }) });
  const { missing } = await res.json();
  t('only the edited chunk is missing on republish', missing.length === 1 && missing[0] === sha(edited), JSON.stringify(missing));
}

server.close();

// 6. A SWEEP KEEPS WHAT A RECORD NAMES, and lets go of what nothing does once its grace has passed.
{
  const indexFile = resolve(dir, 'index.json');
  openStore({ dir }).putBlob(Buffer.from('orphan chunk'));
  // Age every chunk past its grace, so only a record's `refs` can keep one.
  const idx = JSON.parse(readFileSync(indexFile, 'utf8'));
  for (const b of Object.values(idx.blobs)) b.seenAt = '2000-01-01T00:00:00.000Z';
  writeFileSync(indexFile, JSON.stringify(idx));
  const swept = openStore({ dir });
  swept.sweepRepo('acme/web');
  t('chunks a published manifest names survive the sweep', !!swept.readHash(sha(vendor)) && !!swept.readHash(sha(region)));
  t('an orphan chunk past its grace does not', swept.readHash(sha('orphan chunk')) === null);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${fail ? 'FAIL' : 'PASS'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
