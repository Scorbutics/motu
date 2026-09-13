// The BACKEND'S OWN LIST OF OPERATIONS, and how a region's ask resolves to one of them.
//
// motu records what a region asked for (`recordOutbound`, `@motu/core`) and has never been able to
// say whether the thing it asked for EXISTS. It cannot know on its own: an operation is a fact about
// the backend, and motu has no view of one. So the list is read from a file the project already
// maintains, and this module is everything motu knows about it.
//
// ## Opaque, on purpose
//
// A name and nothing else. The file this is pointed at in practice is assay's
// `.assay/operations.json`, which also declares the tables each operation reads and writes, whether
// it runs with RLS bypassed, and prohibitions on how it may be keyed — and none of that is read
// here, because the moment motu interprets a declaration's CONTENTS it has married one backend tool.
// A list of names is a shape an OpenAPI document, a tRPC router or a hand-written array can also
// produce, and every one of them can fill this slot.
//
// ## Two kinds of name, because two doors carry an identifier
//
// The wire door records `route:<METHOD> <path>` and `fn:<name>` (`reachEntry()` in
// `@motu/runtime/postgrest-fetch`). Those are the only asks that can name an operation at all — a
// contract call is `service.method` and a traced host module is a bare function name, neither of
// which says which backend thing answered. This module resolves the two that can, and says nothing
// about the two that cannot.

/** A universe entry that looks like a Next route handler file. */
const ROUTE_FILE = /(^|\/)route\.(ts|tsx|js|mjs)$/;

/**
 * The operation names out of whatever the project pointed us at.
 *
 * Two accepted shapes and no more: an object whose KEYS are the names (assay's file, whose values
 * this deliberately ignores), or a plain array of names. Anything else returns an error rather than
 * an empty list — a universe that parsed to nothing would make every ask unreachable, which is a
 * wall of red that says the opposite of what happened.
 */
export function readOperationNames(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { names: [], error: `is not valid JSON (${String(err.message).split('\n')[0]})` };
  }
  if (Array.isArray(parsed)) return { names: parsed.filter((n) => typeof n === 'string') };
  if (parsed && typeof parsed === 'object') {
    const source = parsed.operations && typeof parsed.operations === 'object' ? parsed.operations : parsed;
    const names = Object.keys(source).filter((k) => k !== 'version');
    return { names };
  }
  return { names: [], error: 'is neither an object of operation names nor an array of them' };
}

/**
 * A universe split into the two things an ask can name.
 *
 * Routes are indexed by SEGMENTS rather than compared as strings, because a route file is a PATTERN
 * and a request is an instance of it: `app/api/admin/email-previews/[id]/route.ts` answers
 * `/api/admin/email-previews/9f3c`, and a string compare would report that real, declared,
 * successfully-answered ask as naming an operation nobody declares.
 */
export function indexOperations(names) {
  const routes = [];
  const fns = new Set();
  for (const name of names) {
    if (ROUTE_FILE.test(name)) routes.push({ name, segments: routeSegments(name) });
    else fns.add(name);
  }
  return { names, routes, fns };
}

/**
 * The URL segments a route FILE answers.
 *
 * Drops the `app/` (or `src/app/`) prefix and the trailing `route.ts`, and drops route GROUPS —
 * `app/(dashboard)/api/x/route.ts` answers `/api/x`, because a parenthesised segment organises files
 * and never appears in a URL. Getting that wrong would silently fail to match a whole directory's
 * worth of real operations.
 */
function routeSegments(name) {
  return String(name)
    .replace(/^src\//, '')
    .replace(/^app\//, '')
    .replace(ROUTE_FILE, '')
    .split('/')
    .filter((s) => s && !/^\(.*\)$/.test(s));
}

/** The path segments an ask actually requested. */
function askSegments(path) {
  return String(path).split('?')[0].split('#')[0].split('/').filter(Boolean);
}

/**
 * Does a route file's segment pattern answer this request's segments?
 *
 * `[id]` matches exactly one segment; `[...slug]` and `[[...slug]]` match one or more (and the
 * optional form matches none), which is what a catch-all route does.
 */
function segmentsMatch(pattern, actual) {
  let p = 0;
  let a = 0;
  while (p < pattern.length) {
    const seg = pattern[p];
    const catchAll = /^\[\[?\.\.\..*\]\]?$/.test(seg);
    if (catchAll) {
      // A catch-all is last by construction, so it takes whatever is left. The optional form
      // `[[...x]]` is allowed to take nothing.
      const optional = seg.startsWith('[[');
      return optional ? true : a < actual.length;
    }
    if (a >= actual.length) return false;
    if (!/^\[.*\]$/.test(seg) && seg !== actual[a]) return false;
    p += 1;
    a += 1;
  }
  return a === actual.length;
}

/** 'route' | 'fn' for an ask that can name an operation, null for one that cannot. */
export function askKind(canonical) {
  const s = String(canonical);
  if (s.startsWith('route:')) return 'route';
  if (s.startsWith('fn:')) return 'fn';
  return null;
}

/**
 * The operation a canonical wire entry names, or null when the universe has no such operation.
 *
 * Takes the canonical form the runtime records and `reaches`/`effects` declare — the same vocabulary
 * on both sides, which is the point of `lib/effects.mjs`.
 */
export function resolveOperation(canonical, index) {
  const s = String(canonical);
  if (s.startsWith('fn:')) {
    const name = s.slice(3);
    return index.fns.has(name) ? name : null;
  }
  if (!s.startsWith('route:')) return null;
  // `route:GET /api/x` and `route:/api/x` — the method is not part of the identity here. A route file
  // exports every verb it answers, so METHOD does not select between operations; assay keys the file.
  const path = s.slice(6).replace(/^\S+\s+/, '');
  const actual = askSegments(path);
  const hit = index.routes.find((r) => segmentsMatch(r.segments, actual));
  return hit ? hit.name : null;
}
