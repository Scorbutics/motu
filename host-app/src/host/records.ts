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
  const parts = isReload ? segments.slice(0, -1) : segments;
  if (parts.length < 3) return null;

  const slug = normalizeSegment(parts[parts.length - 1]);
  const ref = normalizeSegment(parts[parts.length - 2]);
  const repo = normalizeRepo(parts.slice(0, -2).join('/'));
  if (!repo || !ref || !slug) return null;
  return { repo, ref, slug, isReload };
}
