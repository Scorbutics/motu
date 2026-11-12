// share-links.req.toml's `rule`s, each as a fast-check property over the source. One property per rule
// so a failure shrinks to THAT rule's minimal case; a rule that barely applied is "could not test".
import { test } from "node:test"
import assert from "node:assert/strict"
import fc from "fast-check"
import { RULES } from "./share-links.req.rules.ts"
import { runOnce, worldArb } from "./share-links.req.meaning.ts"

const NUM_RUNS = Number(process.env.FC_RUNS ?? 4000)
const MIN_APPLIED = 25

for (const rule of RULES) {
  test(`${rule.id} — ${rule.says}`, async () => {
    const tally = { applied: 0 }
    const details = await fc.check(fc.asyncProperty(worldArb, fc.scheduler(), (w, s) => runOnce(w, s, rule, tally)), { numRuns: NUM_RUNS, seed: 20261112 })
    assert.equal(details.failed, false, fc.defaultReportMessage(details) ?? "")
    assert.ok(tally.applied >= MIN_APPLIED, `COULD NOT TEST ${rule.id}: applied ${tally.applied}× in ${NUM_RUNS} runs`)
  })
}
