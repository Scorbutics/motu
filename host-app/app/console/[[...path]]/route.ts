// THE REVIEW CONSOLE, MOUNTED — a route, not a port.
//
// docs/plan-lagoon-host.md's phase 4 calls it that, and it is accurate: `review-console` is already a
// motu app with its own build, so bringing it here is serving what Vite produced rather than
// rewriting anything. It stays a Vite app, in the workspace, built by its own toolchain.
//
// WHY A HANDLER AND NOT `public/`. Next serves `public/` by exact filename, so `/console/anything`
// would miss, fall through the catch-all, and be handed to the lagoon host — which would answer a
// 404 for a route the console owns. An SPA needs the miss to become `index.html`, which is the one
// thing this file does that a static directory cannot.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Where the console's build is.
 *
 * NOT `require.resolve('motu-review/package.json')`, which is what this tried first and is the
 * obviously correct answer in plain node: Turbopack rewrites `require.resolve` at build time into a
 * bundled module ID, so the path this function returned at runtime was the number 89066 and every
 * request 500'd on `The "path" argument must be of type string`. A bundler resolves modules; it does
 * not resolve filesystem paths, and asking it to does not fail at build time.
 *
 * So it is configuration with a default, which is also the thing a deployment needs — the console's
 * build does not have to sit beside this app once neither is a checkout.
 */
function distRoot(): string {
  return process.env.MOTU_REVIEW_DIST || resolve(process.cwd(), '../review-console/dist');
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

export async function GET(request: Request) {
  const root = distRoot();
  if (!existsSync(root)) {
    // A missing build is the migration's own failure, not the application's — say so plainly rather
    // than 404ing, which would read as "there is no console" to somebody who is looking at one.
    return new Response(`the review console has not been built — pnpm --filter motu-review build\n`, {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const rel = new URL(request.url).pathname.replace(/^\/console\/?/, '');
  // CONTAINED, and checked after normalising rather than by looking for `..` in the input: an escape
  // can be spelled several ways in a URL and exactly one way in a resolved path.
  const candidate = normalize(join(root, rel));
  const inside = candidate === root || candidate.startsWith(root + sep);

  const file =
    inside && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, 'index.html');
  if (!existsSync(file)) return new Response('not found\n', { status: 404 });

  const ext = extname(file).toLowerCase();
  const isEntry = file.endsWith('index.html');
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      // Vite fingerprints its assets, so everything but the entry is immutable. The entry must not be
      // cached or a deploy is invisible until somebody hard-refreshes.
      'cache-control': isEntry ? 'no-store' : 'public, max-age=31536000, immutable',
    },
  });
}
