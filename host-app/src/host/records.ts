// Which URLs are RECORDS — the ones `authorize` has an opinion about.
//
// This mirrors `store.mjs`'s own parsing, deliberately and exactly, because the app and the host must
// agree on what a given URL means. Two parsers that disagree would let a path the app read as a group
// page arrive at the host as a record, which is a gate bypass rather than a rendering bug.
//
// PARSED FROM THE RIGHT, which is the rule that makes it work at all: a repo id may carry an owner
// segment (`acme/web`), so the last two segments are ref and slug and everything before them is the
// repo. Parsing from the left cannot tell `/acme/web/latest/all` from `/web/latest/all/extra`.

/** `store.mjs`'s SEGMENT, copied so both sides accept exactly the same characters. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type RecordPath = {
  /** `name` or `owner/name`. */
  repo: string;
  /** A sha, or the `latest` alias. */
  ref: string;
  slug: string;
  /** The live-reload stream hangs off the page's own path and is the same resource for gating. */
  isReload: boolean;
  /**
   * The page WITHOUT its shell — what the frame inside the shell asks for.
   *
   * The same resource for gating, deliberately: it is the identical bytes at a different address, so
   * anything that refuses the page must refuse this too, and `authorize` sees one record either way.
   */
  bare: boolean;
};

function normalizeRepo(raw: string): string | null {
  const parts = raw.split('/').filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  if (!parts.every((p) => SEGMENT.test(p) && p.length <= 64)) return null;
  return parts.join('/');
}

function normalizeSegment(raw: string | undefined, max = 128): string | null {
  const s = String(raw ?? '');
  return SEGMENT.test(s) && s.length <= max ? s : null;
}

/**
 * The host's own namespaces. Never records, whatever their segment count, and left to the host —
 * which is where their gating already lives and is tested (`test/access.test.mjs`).
 */
const HOST_NAMESPACES = new Set(['shot', 'g', 'm', 'api']);

/**
 * Read a request path as a record, or null if it is not one.
 *
 * Null means "the app has no opinion about this URL" — the index, a group, `/shot/<hash>`, an API
 * route — and those keep falling through to the host untouched. Only the record route moves into the
 * app in phase 2.
 */
export function parseRecordPath(pathname: string): RecordPath | null {
  const raw = pathname.split('/').filter(Boolean);
  const segments: string[] = [];
  for (const s of raw) {
    try {
      segments.push(decodeURIComponent(s));
    } catch {
      // A malformed escape is not a record. Keeping the raw segment instead would hand the
      // normaliser something it might accept while the host decodes it into something else.
      return null;
    }
  }
  if (segments.length < 3) return null;
  if (HOST_NAMESPACES.has(segments[0] as string)) return null;

  const isReload = segments[segments.length - 1] === '__motu_reload';
  const afterReload = isReload ? segments.slice(0, -1) : segments;
  // THE BYTES, WITHOUT THE SHELL. Every lagoon page is a rail plus a frame now, and the frame has to
  // be able to ask for the page ALONE or it would load the shell inside itself, for ever. It is an
  // app-level address: the host has never heard of it, and the proxy strips it back off before the
  // hop.
  //
  // `__motu_frame` AND NOT `f`, which is what this was for an hour. A slug is any segment, so `f` is
  // a legal lagoon name — and `/acme/web/latest/f` then parsed as a BARE request for
  // `acme/latest/web` instead of the lagoon called f. A test written to check exactly that found it.
  // The `__motu_` prefix is the reserved namespace `__motu_reload` already established; it carries
  // the same theoretical collision and the same answer to it.
  const bare = afterReload[afterReload.length - 1] === '__motu_frame';
  const parts = bare ? afterReload.slice(0, -1) : afterReload;
  if (parts.length < 3) return null;

  const slug = normalizeSegment(parts[parts.length - 1]);
  const ref = normalizeSegment(parts[parts.length - 2]);
  const repo = normalizeRepo(parts.slice(0, -2).join('/'));
  if (!repo || !ref || !slug) return null;
  return { repo, ref, slug, isReload, bare };
}

/**
 * A live member's ASSET path — the member prefix, plus a tail that belongs to its dev server.
 *
 * `parseRecordPath` answers null for these, because the tail is arbitrary: `/@vite/client` has no
 * valid ref, `/src/main.tsx` puts four segments where a repo takes two. The route then treated them
 * as "not a record, no opinion" and proxied them WITHOUT a credential — which is correct for a public
 * repo and fatal for a private one. The host refuses the anonymous request, the browser gets HTML
 * where it asked for a module, and the frame renders nothing:
 *
 *     __motu_frame    200  html          <- the page arrives
 *     @vite/client    404  html          <- NS_ERROR_CORRUPTED_CONTENT
 *     main.tsx        404  html
 *
 * Only a PRIVATE repo with a LIVE member is affected, which is why it survived every test against
 * the public ones.
 *
 * Parsed around `latest` exactly as the host parses it (`server.mjs`, the live prefix proxy), last
 * occurrence winning, so a repository whose own name ends in `latest` still resolves.
 */
export function parseMemberAssetPath(pathname: string): { repo: string; ref: string; slug: string } | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 5) return null
  const at = segments.lastIndexOf('latest')
  // `at >= 1` leaves room for a repo before it; `> at + 2` means there is a tail after the slug, which
  // is what makes this an ASSET rather than the member itself (that one parses as a record already).
  if (at < 1 || segments.length <= at + 2) return null
  // THE RESERVED TAILS ARE NOT ASSETS. `__motu_frame` and `__motu_reload` are addresses this app and
  // the host own between them, and both already parse as a RECORD — so a path ending in one is never
  // an asset, and saying so here keeps the two parsers from disagreeing about the same URL.
  const tail = segments.slice(at + 2)
  if (tail.some((s) => s === '__motu_frame' || s === '__motu_reload')) return null
  const repo = normalizeRepo(segments.slice(0, at).join('/'))
  const slug = normalizeSegment(segments[at + 1])
  if (!repo || !slug) return null
  return { repo, ref: 'latest', slug }
}
