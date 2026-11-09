// The `data-flow` judgement, shared by both lanes (the browser in playwright-lagoon.mjs and the
// browser-free `--fast` harness in runtime-harness.mjs) so they cannot disagree about one island.
//
// DISTINCT INPUTS MUST PRODUCE DISTINCT OUTPUT, and a scenario that renders NOTHING cannot be compared
// — unless it says so. `blank: 'why'` on a scenario declares that rendering nothing IS its answer (a
// banner silent when nothing is wrong, a palette closed). Declared, the empty render is a value like
// any other in the comparison — and it is ASSERTED: a blank scenario that renders something fails,
// so the declaration cannot go stale quietly. Undeclared, an empty render is still an error.
//
// This exists because two of motu's own checks disagreed: `data-flow` refused every empty scenario
// while `input-coverage` asked for exactly those states, and Peps (13 islands) and motu's host-app
// (2) were red on scenarios their authors had pinned on purpose. Deleting them was the only way out,
// and it threw away the state the input-coverage check had asked for.

/** The scenario's declared reason for rendering nothing, or null. An empty reason is no declaration. */
export const blankReason = (scenario) =>
  typeof scenario?.blank === 'string' && scenario.blank.trim() !== '' ? scenario.blank.trim() : null;

/**
 * @param {string[]} outputs  the normalised render of each scenario, in order
 * @param {object[]} scenarios
 */
export function judgeRenders(outputs, scenarios) {
  const name = (i) => scenarios[i]?.name ?? `#${i + 1}`;
  const empty = []; // rendered nothing and did not say it would
  const blankButRendered = []; // said it would render nothing, and rendered something
  outputs.forEach((o, i) => {
    const isEmpty = !o.trim().length;
    const declared = blankReason(scenarios[i]) !== null;
    if (isEmpty && !declared) empty.push(name(i));
    if (!isEmpty && declared) blankButRendered.push(name(i));
  });
  const distinctOutputs = new Set(outputs).size;
  // Declared-blank scenarios all promise the SAME render — nothing — so several of them are one
  // expected value, not duplicate evidence. Counted once when asking "did any two scenarios collide?".
  const blanks = scenarios.filter((s, i) => blankReason(s) !== null && !outputs[i]?.trim()).length;
  const comparedCount = outputs.length - Math.max(0, blanks - 1);
  const differentiates = empty.length === 0 && blankButRendered.length === 0 && distinctOutputs > 1;
  return { differentiates, empty, blankButRendered, distinctOutputs, comparedCount };
}

/**
 * Every input a scenario hands the island — its `seed` and what arrives `afterMount` — for the checks
 * that ask about inputs rather than about WHEN they land (seed transport, input coverage, the keys a
 * reset must forget). The later value wins, as it does on screen.
 */
export const scenarioInputs = (scenario) => ({ ...(scenario?.seed ?? {}), ...(scenario?.afterMount ?? {}) });
