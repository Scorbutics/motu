/**
 * Which declared writes no flow exercises — the decision behind `writes-covered`, kept pure so the
 * cases that decide it can be tested without a project on disk.
 *
 * A write `{ slot, event, key }` counts as exercised when a flow step either:
 *  - `emit`s that slot's event (the region applies the declared write), or
 *  - `expect`s the key in a scenario where neither the seed nor any `provide` hands it a value.
 *    One producer per key is enforced statically, so such an expectation can only hold if the
 *    producing component emitted the event ITSELF — a stronger proof than an `emit`, which enters
 *    past the component's own handler.
 *
 * Counting only `emit` reported writes as "never exercised" in a region whose flow failed the moment
 * the component stopped emitting them.
 *
 * @param {{ slot: string, event: string, key: string }[]} declared
 * @param {{ seed?: Record<string, unknown>, steps?: { emit?: { slot?: string, event?: string }, provide?: Record<string, unknown>, expect?: Record<string, unknown> }[] }[]} scenarios
 */
export function undrivenWrites(declared, scenarios) {
  const driven = new Set();
  const assertedFromProducer = new Set();
  for (const scenario of scenarios) {
    const handed = new Set(Object.keys(scenario.seed ?? {}));
    for (const st of scenario.steps ?? []) {
      for (const k of Object.keys(st.provide ?? {})) handed.add(k);
    }
    for (const st of scenario.steps ?? []) {
      if (st.emit?.slot && st.emit?.event) driven.add(`${st.emit.slot}\u0000${st.emit.event}`);
      for (const k of Object.keys(st.expect ?? {})) if (!handed.has(k)) assertedFromProducer.add(k);
    }
  }
  return declared.filter((d) => !driven.has(`${d.slot}\u0000${d.event}`) && !assertedFromProducer.has(d.key));
}
