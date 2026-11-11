// A CHUNKED lagoon, as the host stores and serves it.
//
// `motu lagoon publish --remote` (and a pushed draft) sends a MANIFEST rather than one self-contained
// page: the page's HTML, and each file it loads named by the sha256 of its content. The chunks
// themselves arrive first, as blobs, so an edit in one region costs that region's chunk.
//
//   { "motu": "lagoon-manifest/1", "html": "<fragment>", "files": { "region-members.js": "<sha256>" } }
//
// The page's references read `__MOTU_ASSETS__/<file>`; serving fills that with
// `/__motu_assets/<manifest hash>`, and that route answers each file from the manifest. The address is
// keyed by the manifest's content, so it can be cached forever, and a `latest` page that moves on
// never mixes chunks from two builds. The CLI side is `packages/cli/src/lib/lagoon-bundle.mjs`; the
// format strings below must match it.

export const MANIFEST_FORMAT = 'lagoon-manifest/1';
export const MANIFEST_TYPE = 'application/vnd.motu.lagoon+json';
export const ASSETS_PLACEHOLDER = '__MOTU_ASSETS__';

const HASH = /^[0-9a-f]{64}$/;
const NAME = /^[A-Za-z0-9._@+-][A-Za-z0-9._@+/-]*$/;

/** The manifest in these bytes, or null when they are a single-file page (or not a manifest). */
export function parseManifest(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  // Cheap test first: a page is HTML and never starts with `{`.
  let i = 0;
  while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x09)) i++;
  if (buf[i] !== 0x7b) return null;
  let m;
  try {
    m = JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
  if (!m || m.motu !== MANIFEST_FORMAT || typeof m.html !== 'string' || !m.files || typeof m.files !== 'object') return null;
  for (const [name, h] of Object.entries(m.files)) {
    if (!NAME.test(name) || name.includes('..') || typeof h !== 'string' || !HASH.test(h)) return null;
  }
  return { html: m.html, files: m.files };
}

/** The page of a manifest, with its chunks' address filled in. */
export function manifestPage(manifest, manifestHash) {
  return manifest.html.split(ASSETS_PLACEHOLDER).join(`/__motu_assets/${manifestHash}`);
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
