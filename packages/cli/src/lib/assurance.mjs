// ASSURANCE — one row per DECLARED THING, with the strongest evidence that holds it.
//
// A check report has one row per CHECK, and "green" means "nothing contradicted what was checked" —
// the reader cannot see how much was. This inverts the axis (docs/proposals/constraint-loop.md, item
// 3): every slot, write, shared key and flow's calls, each with a LEVEL, the evidence behind it, and
// what is missing. A residual motu cannot hold — a handler driven only through `emit` — is then SHOWN
// as such instead of passing green, and a person can decide about it (a unit test, or accept it).
//
// Derived from the declarations and the evidence files alone, so it is static and fast. A level says
// what the evidence CLAIMS; `motu check --runtime` is what confirms the claim holds.
//
//   unchecked     nothing in the evidence exercises it
//   static        declared, typed and placed — the static checks hold it, no flow does
//   runtime·emit  a flow drives it through the island's DECLARED OUTPUT — past the component's handler
//   runtime       a flow asserts it (a slot's render, a key a reader shows)
//   runtime·user  a flow reaches it by the path a person takes: a `click` on the rendered control
//
// KNOWN LIMIT: a `click` is credited to a write only when its step `expect`s the written key. A click
// asserted by its render alone (demo-app's "sorting by level ranks the whole club") cannot be tied to a
// declared write without running it — the runtime trace `motu diff` records is where that belongs.
//
// Pure: everything it reads is passed in, so it is tested without a project.

export const LEVELS = ['unchecked', 'static', 'runtime·emit', 'runtime', 'runtime·user'];
const rank = (l) => LEVELS.indexOf(l);

const where = (flow, i) => `"${flow.name ?? 'flow'}" step ${i + 1}`;
const keyOf = (target) => (typeof target === 'string' ? target : (target?.key ?? Object.keys(target ?? {})[0] ?? '?'));

/** The region keys a slot's island READS — its `bind` (both forms) and its declared `reads`. */
function readKeys(island) {
  const out = new Set(island.reads ?? []);
  for (const entry of [].concat(island.bind ?? [])) {
    if (typeof entry === 'string') out.add(entry);
    else if (entry && typeof entry === 'object') for (const v of Object.values(entry)) if (typeof v === 'string') out.add(v);
  }
  return out;
}

/**
 * Rows for one region. `region` is what `readRegions` returns (`islands` with slot, element, writes,
 * bind, reads, planned); `flows` is the region's declared scenarios.
 */
export function assuranceRows(region, flows) {
  const rows = [];
  const islands = (region?.islands ?? []).filter((i) => !i.planned);
  const steps = flows.flatMap((f) => (f.steps ?? []).map((st, i) => ({ flow: f, st, i })));

  // Who produces each key, so a slot can be asked about the coupling it actually HAS.
  const producerOf = new Map();
  for (const isl of islands) for (const t of Object.values(isl.writes ?? {})) producerOf.set(keyOf(t), isl.slot);

  // SLOTS — does any flow assert what this slot renders?
  for (const isl of islands) {
    // Only a slot that READS another island's key has a coupling to show; a pure producer (a search
    // box) does not, and saying it is missing one was noise on every region.
    const coupled = [...readKeys(isl)].some((k) => producerOf.has(k) && producerOf.get(k) !== isl.slot);
    const asserting = steps.filter(({ st }) => st.expectRender && Object.hasOwn(st.expectRender, isl.slot));
    const driven = asserting.filter(({ st }) => st.emit && st.emit.slot !== isl.slot);
    rows.push(
      asserting.length
        ? {
            kind: 'slot',
            subject: isl.slot,
            level: 'runtime',
            evidence: `expectRender in ${asserting.length} step(s), first ${where(asserting[0].flow, asserting[0].i)}` +
              (driven.length ? `; asserted after ANOTHER island moved in ${driven.length}` : ''),
            missing: coupled && !driven.length ? 'it reads another island’s key, and no step asserts it after that island moved — the coupling is not shown' : null,
          }
        : {
            kind: 'slot',
            subject: isl.slot,
            level: 'static',
            evidence: 'declared and placed',
            missing: 'no flow asserts what it renders — it could show a neighbour’s data and stay green',
          },
    );
  }

  // WRITES — is the island's declared output exercised, and by which path?
  for (const isl of islands) {
    for (const [event, target] of Object.entries(isl.writes ?? {})) {
      const key = keyOf(target);
      const subject = `${isl.slot} · ${event} → ${key}`;
      const clicked = steps.filter(({ st }) => st.click && st.expect && Object.hasOwn(st.expect, key));
      const emitted = steps.filter(({ st }) => st.emit?.slot === isl.slot && st.emit?.event === event);
      if (clicked.length) {
        rows.push({ kind: 'write', subject, level: 'runtime·user', evidence: `a click moves ${key} in ${where(clicked[0].flow, clicked[0].i)}`, missing: null });
      } else if (emitted.length) {
        rows.push({
          kind: 'write',
          subject,
          level: 'runtime·emit',
          evidence: `emitted in ${emitted.length} step(s), first ${where(emitted[0].flow, emitted[0].i)}`,
          missing: 'the component’s own handler is never driven — `emit` enters past it, so a handler that ignores its input passes. A `click` step, or a unit test',
        });
      } else {
        rows.push({ kind: 'write', subject, level: 'static', evidence: 'declared and typed (`wiring`)', missing: 'no flow drives it — the island could stop producing it and nothing would change' });
      }
    }
  }

  // SHARED KEYS — a key one island writes and another reads: is a reader shown REACTING to it?
  for (const [key, producer] of producerOf) {
    const readers = islands.filter((i) => i.slot !== producer && readKeys(i).has(key)).map((i) => i.slot);
    if (!readers.length) {
      rows.push({ kind: 'key', subject: key, level: 'unchecked', evidence: `written by ${producer}`, missing: 'no other island reads it — a key nobody reads is not shared state' });
      continue;
    }
    const writers = new Set(Object.entries(islands.find((i) => i.slot === producer)?.writes ?? {}).filter(([, t]) => keyOf(t) === key).map(([e]) => e));
    const shown = steps.find(
      ({ st }) =>
        ((st.emit?.slot === producer && writers.has(st.emit?.event)) || (st.click && st.expect && Object.hasOwn(st.expect, key))) &&
        readers.some((r) => st.expectRender && Object.hasOwn(st.expectRender, r)),
    );
    rows.push(
      shown
        ? { kind: 'key', subject: key, level: shown.st.click ? 'runtime·user' : 'runtime', evidence: `${producer} → ${readers.join(', ')}: a reader’s render is asserted as it moves, ${where(shown.flow, shown.i)}`, missing: null }
        : { kind: 'key', subject: key, level: 'static', evidence: `${producer} → ${readers.join(', ')}, declared`, missing: 'no flow moves it and asserts what a reader then shows' },
    );
  }

  // CALLS — what each flow's states ask the backend for. `flow-calls` holds every call to an ANSWER;
  // only `expectCalls` holds a state to WHICH calls it makes.
  for (const f of flows) {
    const n = (f.steps ?? []).length;
    const declared = (f.steps ?? []).filter((st) => st.expectCalls !== undefined).length;
    rows.push({
      kind: 'calls',
      subject: `flow "${f.name ?? 'flow'}"`,
      level: declared ? 'runtime' : 'static',
      evidence: declared ? `${declared}/${n} step(s) declare \`expectCalls\`` : 'every call is held to an answer (`flow-calls`)',
      missing: declared === n ? null : `${n - declared}/${n} step(s) do not say which calls they make — an extra request that is answered goes unseen`,
    });
  }
  return rows;
}

/** Counts per level, for the summary line. */
export function summarize(rows) {
  const by = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const r of rows) by[r.level]++;
  return { total: rows.length, byLevel: by, weakest: rows.reduce((m, r) => (rank(r.level) < rank(m) ? r.level : m), 'runtime·user') };
}
