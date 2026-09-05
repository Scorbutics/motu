// The scenario/flow crossing between node processes, and the two things JSON cannot carry.
//
// `readScenarios` spawns the harness under tsx, which prints the evidence as JSON, and parses it
// back. That hop is invisible and was lossy in two different ways:
//
//   A DATE came back as an ISO STRING, so an island that formats one threw on mount and rendered
//   nothing — which `data-flow` then reported as "scenarios rendered NOTHING" and `responsive` as
//   "renders nothing", neither naming a date. The lagoon a human opens BUNDLES the same evidence,
//   keeps the Date and renders perfectly, so the two disagreed and only the check lane was wrong.
//   Found in a project whose whole domain is meetings: every scenario carrying a séance was blank.
//
//   A SET, MAP OR FUNCTION came back as `{}` — genuinely untransportable, and `seed-transport`
//   exists to say so. But by the time that check ran it was looking at the `{}`, not at the Set, so
//   it could only ever catch one that survived a DIFFERENT loader. The value is marked here, where
//   the real object still exists, and the check reads the marker.
//
// Marker objects, not bare strings, in both cases: `"2026-08-19"` is indistinguishable from a string
// somebody meant to be a string, and `{}` is indistinguishable from an empty object.

const DATE = '__motuDate';
const LOST = '__motuLost';

/** What a value is, when JSON cannot carry it. Null for everything JSON handles. */
function lostKind(v) {
  if (v instanceof Set) return 'Set';
  if (v instanceof Map) return 'Map';
  if (typeof v === 'function') return 'function';
  return null;
}

/**
 * A `JSON.stringify` replacer that marks what the crossing would otherwise destroy.
 *
 * MUST be a plain function: `JSON.stringify` calls `Date.prototype.toJSON()` BEFORE handing the value
 * to a replacer, so for a Date `value` is already a string and only `this[key]` is still the Date.
 * A Set/Map has no `toJSON`, and a function is dropped entirely unless the replacer returns something
 * in its place — so those three are read from `value` as usual.
 */
export function markEvidence(key, value) {
  const raw = this?.[key];
  if (raw instanceof Date) return { [DATE]: raw.toISOString() };
  const lost = lostKind(value);
  return lost ? { [LOST]: lost } : value;
}

/**
 * The other half. Dates are rebuilt; a LOST marker is left standing on purpose — it is the evidence
 * `seed-transport` reports, and handing the island a plausible `{}` instead is what made that
 * failure arrive as three misleading findings somewhere else.
 */
export function reviveEvidence(_key, value) {
  return value && typeof value === 'object' && typeof value[DATE] === 'string'
    ? new Date(value[DATE])
    : value;
}

/** The kind a marked-lost value used to be, or null. */
export function lostMarker(v) {
  return v && typeof v === 'object' && typeof v[LOST] === 'string' ? v[LOST] : null;
}

/** Evidence out. */
export function stringifyEvidence(value) {
  return JSON.stringify(value, markEvidence);
}

/** Evidence in. Returns undefined on malformed input, so callers keep their existing fallbacks. */
export function parseEvidence(text) {
  try {
    return JSON.parse(text, reviveEvidence);
  } catch {
    return undefined;
  }
}
