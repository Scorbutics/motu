// `contract.effects` / `reaches`, between the form people WRITE and the form checks COMPARE.
//
// Authored as objects — `{ table: 'shots', operation: 'select' }` — so a misspelled kind is a build
// error rather than an entry nothing recognises. Compared as a canonical STRING, because that is what
// the runtime records: the fake fetch tags every request at the moment it is made and has no view of
// anyone's declaration. Normalising the declaration to the observation, rather than the other way
// round, is what keeps `@motu/runtime` free of this vocabulary entirely.
//
// The canonical forms, which are exactly `reachEntry()` in `postgrest-fetch.ts`:
//
//   '@/lib/x'              a host module — the bare form, unchanged
//   'scope:search'
//   'table:shots(select)'  and 'table:shots' when no operation is named
//   'rpc:accept_shots'
//   'fn:notify'
//   'route:GET /api/x'     and 'route:/api/x' when no method is named

/** The kinds that are NOT a host module. A bare entry has no prefix, which is what makes it a module. */
const KINDS = /^(scope|table|rpc|fn|route):/;

/** True for a canonical entry that names something other than a host module. */
export const isKinded = (canonical) => KINDS.test(String(canonical));

/** True for a canonical entry the runtime can observe — the data kinds, as opposed to scope/module. */
export const isDataKind = (canonical) => /^(table|rpc|fn|route):/.test(String(canonical));

/**
 * One authored entry as its canonical string, or null when it is not a shape we know.
 *
 * `null` rather than a throw: this runs over source text the user is mid-edit in, and a check that
 * crashes on a half-written declaration is worse than one that ignores it — the TYPE is what rejects a
 * bad entry, and it does so at the line where it was written.
 */
export function canonicalEffect(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  if (entry.scope) return `scope:${entry.scope}`;
  if (entry.rpc) return `rpc:${entry.rpc}`;
  if (entry.fn) return `fn:${entry.fn}`;
  if (entry.table) return entry.operation ? `table:${entry.table}(${entry.operation})` : `table:${entry.table}`;
  if (entry.route) return entry.method ? `route:${entry.method} ${entry.route}` : `route:${entry.route}`;
  return null;
}

/**
 * Does a DECLARED entry account for an OBSERVED one?
 *
 * Equal, or the declaration is the same thing with its qualifier left off — `{ table: 'shots' }` covers
 * every operation on that table, `{ route: '/api/x' }` every method on that route. Naming a dependency
 * without pinning how it is used is a legitimate declaration, and the qualifier sits in a different
 * place for each kind (a suffix for a table, a prefix for a route), which is why this is a function
 * rather than a string comparison.
 */
export function coversEffect(declared, observed) {
  if (declared === observed) return true;
  const d = String(declared);
  const o = String(observed);
  if (d.startsWith('table:') && o.startsWith('table:')) return o.replace(/\(.*\)$/, '') === d;
  if (d.startsWith('route:') && o.startsWith('route:')) return o.replace(/^route:\S+ /, 'route:') === d;
  return false;
}

/**
 * The entries in an `effects: [...]` / `reaches: [...]` array, read from SOURCE TEXT.
 *
 * A tolerant reader rather than a parser: the array holds literals only — quoted strings and flat
 * object literals of quoted values — because that is all the type admits. It is used on the island
 * file, on a source module, and on the generated contracts, so the one implementation keeps those
 * three from disagreeing about what a declaration says.
 */
export function readEffectEntries(arrayBody) {
  if (!arrayBody) return [];
  const out = [];
  for (const [, obj] of arrayBody.matchAll(/\{([^}]*)\}/g)) {
    const fields = {};
    for (const [, k, v] of obj.matchAll(/(\w+)\s*:\s*['"]([^'"]*)['"]/g)) fields[k] = v;
    const canonical = canonicalEffect(fields);
    if (canonical) out.push(canonical);
  }
  // Bare strings are whatever is quoted OUTSIDE an object literal — the module entries.
  for (const [, str] of arrayBody.replace(/\{[^}]*\}/g, '').matchAll(/['"]([^'"]+)['"]/g)) out.push(str);
  return out;
}

/** Serialise a canonical entry back to the AUTHORED form, for anything that generates a declaration. */
export function writeEffectEntry(canonical) {
  const s = String(canonical);
  if (!isKinded(s)) return `'${s}'`;
  const [, kind, rest] = s.match(/^(\w+):(.*)$/);
  if (kind === 'scope' || kind === 'rpc' || kind === 'fn') return `{ ${kind}: '${rest}' }`;
  if (kind === 'table') {
    const m = rest.match(/^(.*)\((.*)\)$/);
    return m ? `{ table: '${m[1]}', operation: '${m[2]}' }` : `{ table: '${rest}' }`;
  }
  const m = rest.match(/^(\S+) (.*)$/);
  return m ? `{ route: '${m[2]}', method: '${m[1]}' }` : `{ route: '${rest}' }`;
}
