/**
 * What `data-flow` concludes from one comparison — kept pure so the cases that decide it can be tested
 * without a browser. Both lanes (the browser's `differentiateLagoon` and `--fast`'s harness) hand in
 * `{ differentiates, distinctOutputs, scenarioCount, empty }`; the caller has already dealt with a
 * comparison that never happened (`differentiates == null`).
 *
 * AN EMPTY RENDER IS AN OUTPUT. An island whose correct answer to some input is nothing (no
 * invitation, nothing closed, not frozen) renders "" for that scenario, and "" differs from every
 * scenario that renders something — so it counts as one distinct render rather than sinking the
 * comparison. It used to be an ERROR, reachable only once islands that render nothing by DEFAULT
 * stopped being skipped silently; turned on, it made twelve correct islands in one project red,
 * every one of them for a deliberate empty state. Still named, as a warning: an empty scenario is
 * also what a seed that never reached the island looks like, and only its author can tell which.
 *
 * @param {{ differentiates?: boolean | null, distinctOutputs?: number, scenarioCount: number, empty?: string[] }} r
 * @returns {{ level: 'ok' | 'warn' | 'error', msg: string, seen?: { n: number, of: string } }[]}
 */
export function dataFlowFindings(r) {
  const out = [];
  const empty = r.empty ?? [];
  const distinct = r.distinctOutputs ?? (r.differentiates ? r.scenarioCount : 1);

  if (distinct > 1) {
    if (empty.length) {
      out.push({
        level: 'warn',
        msg:
          `${empty.length} of ${r.scenarioCount} scenario(s) render NOTHING — ${empty.join(', ')}. Right if that ` +
          `is the island's empty state; if the seed should have produced content, it is not reaching the island`,
      });
    }
    // Duplicates are not a failure — two seeds may legitimately normalise to one output — but they are
    // not evidence either, and the ok line used to cover for them.
    if (distinct < r.scenarioCount) {
      out.push({
        level: 'warn',
        msg:
          `${r.scenarioCount} scenarios produced only ${distinct} distinct render(s) — ` +
          `${r.scenarioCount - distinct} of them show nothing the others do not`,
      });
    }
    out.push({
      level: 'ok',
      msg: `distinct inputs produce distinct output (${r.scenarioCount} scenarios) — data flows past the seam`,
      seen: { n: distinct, of: 'distinct render(s)' },
    });
    return out;
  }

  if (empty.length === r.scenarioCount) {
    out.push({
      level: 'error',
      msg:
        `every scenario rendered NOTHING (${r.scenarioCount}) — no seed reaches the island, or none ` +
        `describes a state with content to show`,
    });
    return out;
  }

  out.push({
    level: 'error',
    msg:
      `${r.scenarioCount} scenarios rendered identically — inputs don't reach the output: the seam is wired ` +
      "but data doesn't flow (bind gap, or fixtures aren't request-keyed with `match`)",
  });
  return out;
}
