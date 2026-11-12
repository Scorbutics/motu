// WHAT THE WORDS OF share-links.req.toml MEAN, for the fast-check runner — the only hand-written part
// of the property tests. The rules themselves are generated (share-links.req.rules.ts).
//
// A world: some links already on record, a sequence of things the owner does (create, revoke,
// dismiss), and the port answering in an order fast-check chooses (fc.scheduler) — each answer may fail.
// Commands arrive between macrotasks, as user input does.
import fc from "fast-check"
import { createShareLinksSource, type CreateRequest, type ShareLinkRow } from "../src/share/share-links-source.ts"

type State = ReturnType<ReturnType<typeof createShareLinksSource>["getState"]>

export interface Ctx {
  s: State
  now: Date
  /** The id of the link the last create made, when that create answered — else null. */
  created: string | null
  /** The token that create answered with. */
  token: string | null
  /** The token was dismissed after that create. */
  dismissed: boolean
  /** Which of the last command's calls failed, if any. */
  failed: "create" | "revoke" | null
  message: string | null
  /** The state just before the last command (only when it was issued on a settled state). */
  before: State
  /** The id the last revoke named, when the last command was a revoke. */
  revoked: string | null
  /** The list has answered successfully at least once. */
  listed: boolean
  /** What the port holds now. */
  port: { links: ShareLinkRow[] }
  same: (a: unknown, b: unknown) => boolean
}
export interface Rule {
  id: string
  says: string
  at: "creation" | "settled"
  when: (c: Ctx) => boolean
  then: (c: Ctx) => boolean
}

const NOW = new Date("2026-11-12T10:00:00.000Z")
const iso = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const rowArb = (k: number) =>
  fc.record({
    sha: fc.option(fc.constantFrom("9f3c2ab", "41d07e5"), { nil: null }),
    slug: fc.option(fc.constantFrom("cart", "checkout"), { nil: null }),
    expiresAt: fc.option(fc.integer({ min: -20_000, max: 20_000 }).map(iso), { nil: null }),
    revokedAt: fc.option(fc.integer({ min: -20_000, max: -1 }).map(iso), { nil: null }),
    createdAt: fc.integer({ min: -40_000, max: -1 }).map(iso),
  }).map((r): ShareLinkRow => ({ id: `sl_${k}`, ...r }))
const requestArb: fc.Arbitrary<CreateRequest> = fc.record({
  sha: fc.option(fc.constantFrom("9f3c2ab", "41d07e5"), { nil: null }),
  slug: fc.option(fc.constantFrom("cart", "checkout"), { nil: null }),
  expiry: fc.constantFrom("1d" as const, "7d" as const, "30d" as const, "never" as const),
})
const stepArb = fc.oneof(
  fc.record({ kind: fc.constant("create" as const), req: requestArb }),
  fc.record({ kind: fc.constant("revoke" as const), pick: fc.integer({ min: 0, max: 6 }) }),
  fc.constant({ kind: "dismiss" as const }),
  fc.constant({ kind: "settle" as const }),
  fc.constant({ kind: "deliver" as const }),
)
export const worldArb = fc.record({
  rows: fc.integer({ min: 0, max: 4 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, k) => rowArb(k)))),
  // what each port call does, in call order
  outcomes: fc.array(fc.oneof({ arbitrary: fc.constant("ok" as const), weight: 5 }, fc.constant("fail" as const)), { minLength: 30, maxLength: 30 }),
  steps: fc.array(stepArb, { minLength: 1, maxLength: 8 }),
})
export type World = typeof worldArb extends fc.Arbitrary<infer W> ? W : never

/** One run of one world against one rule; false at the first violation, so fast-check shrinks it. */
export async function runOnce(w: World, s: fc.Scheduler, rule: Rule, tally: { applied: number }): Promise<boolean> {
  let table: ShareLinkRow[] = w.rows.map((r) => ({ ...r }))
  let calls = 0
  let tokens = 0
  // What the LAST command led to, read from the port's side.
  let last = { created: null as string | null, token: null as string | null, failed: null as "create" | "revoke" | null, message: null as string | null, revoked: null as string | null }
  let dismissedAfter = false
  const answer = <T,>(kind: "list" | "create" | "revoke", ok: () => T): Promise<T> => {
    const fail = w.outcomes[calls++ % w.outcomes.length] === "fail"
    const p = fail ? Promise.reject(new Error(`${kind} refused (${calls})`)) : Promise.resolve().then(ok)
    p.catch(() => {})
    return s.schedule(p, kind).then(
      (v) => {
        // A token DELIVERED after a dismiss is a new reveal, not the dismissed one coming back. At
        // delivery — `ok` above runs when the call is made, which is not when the page learns of it.
        if (kind === "create") dismissedAfter = false
        return v
      },
      (e) => {
        if (kind !== "list") { last.failed = kind; last.message = (e as Error).message }
        throw e
      },
    )
  }
  let listed = false
  const port = {
    list: () => answer("list", () => { listed = true; return table.map((r) => ({ ...r })) }),
    create: (req: { sha: string | null; slug: string | null; expiresAt: string | null }) =>
      answer("create", () => {
        tokens++
        const link: ShareLinkRow = { id: `sl_new_${tokens}`, ...req, revokedAt: null, createdAt: new Date(NOW.getTime() + tokens * 1000).toISOString() }
        table = [link, ...table]
        const token = `shr_${tokens}`
        last.created = link.id; last.token = token
        return { link: { ...link }, token }
      }),
    revoke: (id: string) =>
      answer("revoke", () => {
        const row = table.find((r) => r.id === id)
        if (!row) throw new Error("No such link")
        table = table.map((r) => (r.id === id && !r.revokedAt ? { ...r, revokedAt: NOW.toISOString() } : r))
        return { ...table.find((r) => r.id === id)! }
      }).catch((e) => {
        // a refusal that came from the table rather than the outcome plan is a failure all the same
        last.failed = "revoke"; last.message = (e as Error).message
        throw e
      }),
  }

  const source = createShareLinksSource(port, { now: () => NOW })
  const tick = () => new Promise<void>((r) => setImmediate(r))
  let before = source.getState()
  let clean = false // the last command was issued on a settled state
  let ok = true
  const check = (at: Rule["at"]) => {
    if (rule.at !== at || !ok) return
    const c: Ctx = {
      s: source.getState(), now: NOW,
      created: clean ? last.created : null, token: clean ? last.token : null, dismissed: dismissedAfter,
      failed: clean ? last.failed : null, message: last.message, before, revoked: clean ? last.revoked : null, listed,
      port: { links: table }, same,
    }
    if (!rule.when(c)) return
    tally.applied++
    if (!rule.then(c)) ok = false
  }
  const settle = async () => { do { await s.waitAll(); await tick() } while (s.count() > 0); check("settled") }
  let settled = false
  for (const st of w.steps) {
    if (!ok) break
    if (st.kind === "settle") { await settle(); settled = true; continue }
    if (st.kind === "deliver") { if (s.count() > 0) { await s.waitOne(); await tick() } settled = false; continue }
    // a command
    clean = settled
    before = source.getState()
    last = { created: null, token: null, failed: null, message: null, revoked: null }
    if (st.kind === "create") { dismissedAfter = false; void source.create(st.req) }
    else if (st.kind === "revoke") { const ids = source.getState().links.map((l) => l.id); const id = ids[st.pick % Math.max(ids.length, 1)] ?? "sl_unknown"; last.revoked = id; void source.revoke(id) }
    // You can only dismiss a token that is on screen: the button exists only then.
    else { const shown = source.getState().revealedToken !== null; source.dismiss(); dismissedAfter = shown }
    settled = false
    await tick()
  }
  if (ok) await settle()
  return ok
}
