// A lagoon as CHUNKS: the page, the files it loads, and a manifest naming each file by its content.
//
// WHY. A lagoon used to travel as one self-contained file, so a one-line edit in one region re-sent
// (and the host re-stored) the whole thing: every dependency, the framework, every other region. The
// build now cuts stable chunks (`chunkOf` in lagoon-vite.mjs), and this module turns that output into
// something a content-addressed host can take a piece at a time:
//
//   manifest  { motu: 'lagoon-manifest/1', html, files: { 'region-members.js': '<sha256>', … } }
//
// The host is asked which hashes it lacks, is sent only those, and then the manifest. An edit in one
// region sends that region's chunk and the manifest; everything else is already there.
//
// THE PAGE DOES NOT KNOW WHERE ITS CHUNKS LIVE. Its references read `__MOTU_ASSETS__/<file>`, and
// whoever serves the page fills that in: the host with `/__motu_assets/<manifest hash>`, the local
// `lagoon serve` with its own. Chunks find each other relatively, so only the page needs filling.
//
// The self-contained single file still exists (`motu lagoon publish` without --remote, `--single`):
// it is what an Artifact needs, and what opens from disk with nothing behind it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

export const MANIFEST_FORMAT = 'lagoon-manifest/1';
export const MANIFEST_TYPE = 'application/vnd.motu.lagoon+json';
/** What the page says where a server must say where its chunks are. */
export const ASSETS_PLACEHOLDER = '__MOTU_ASSETS__';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Read a CHUNKED build's output into `{ html, files }`.
 *
 * `html` is the fragment (no doctype/html/head/body, like the single-file artifact) with every
 * `./assets/x` reference rewritten to the placeholder. `files` maps a flat name to its bytes.
 */
export function readChunkedBuild(htmlPath, title) {
  const distDir = resolve(htmlPath, '..');
  const assetsDir = resolve(distDir, 'assets');
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/(["'])\.?\/assets\//g, `$1${ASSETS_PLACEHOLDER}/`);
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(?:html|head|body)\b[^>]*>\s*/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .trim() + '\n';
  const files = new Map();
  if (existsSync(assetsDir)) {
    for (const name of readdirSync(assetsDir)) {
      const file = resolve(assetsDir, name);
      if (statSync(file).isFile()) files.set(name, readFileSync(file));
    }
  }
  // THE SAME CHECK THE SINGLE FILE MAKES: a page still pointing at /assets/ is one whose chunks the
  // server will not find, and it renders blank rather than failing.
  const dangling = html.match(/["'(]\/assets\/[^"')]+/g);
  if (dangling) throw new Error(`chunked page still references ${[...new Set(dangling)].join(', ')}`);
  return { html, files };
}

/** The manifest for a page whose html has already been through whatever the caller injects. */
export function manifestOf(html, files) {
  const hashes = {};
  for (const [name, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) hashes[name] = sha256(bytes);
  const json = JSON.stringify({ motu: MANIFEST_FORMAT, html, files: hashes });
  return { json, hash: sha256(Buffer.from(json, 'utf8')), hashes };
}

/** Fill the placeholder: where this server serves the chunks of the manifest it is serving. */
export function placeAssets(html, base) {
  return html.split(ASSETS_PLACEHOLDER).join(base.replace(/\/+$/, ''));
}

const TYPES = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
export const contentTypeOf = (name) => TYPES[String(name).split('.').pop().toLowerCase()] ?? 'application/octet-stream';

/**
 * Send a host the chunks it does not have yet. Returns what was sent and what was already there.
 *
 * Asked first, in one request, so an unchanged chunk costs one hash on the wire. A host older than
 * this protocol answers 404 to the question, which is reported as such rather than as a failed upload.
 */
export async function sendMissingChunks({ base, token, files, hashes }) {
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  const all = [...new Set(Object.values(hashes))];
  const ask = await fetch(`${base}/api/blobs/missing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ hashes: all }),
  });
  if (ask.status === 404) {
    throw Object.assign(new Error('this host stores single files only — update it, or publish with --single'), { oldHost: true });
  }
  if (!ask.ok) throw new Error(`host refused the chunk check (${ask.status}): ${(await ask.text()).slice(0, 200)}`);
  const { missing = [] } = await ask.json();
  const wanted = new Set(missing);
  let sentBytes = 0;
  let sent = 0;
  const byHash = new Map();
  for (const [name, h] of Object.entries(hashes)) if (!byHash.has(h)) byHash.set(h, files.get(name));
  // A FEW AT ONCE: one request per chunk, but a cold upload is dozens of them.
  const queue = [...wanted];
  const worker = async () => {
    for (let h = queue.shift(); h; h = queue.shift()) {
      const gz = gzipSync(byHash.get(h));
      const res = await fetch(`${base}/api/blobs/${h}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip', ...auth },
        body: gz,
      });
      if (!res.ok) throw new Error(`host refused chunk ${h.slice(0, 12)} (${res.status}): ${(await res.text()).slice(0, 200)}`);
      sentBytes += gz.length;
      sent++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { sent, reused: all.length - sent, total: all.length, sentBytes };
}
