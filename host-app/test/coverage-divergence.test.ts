// THE SAME TWO CORPORA, FOLDED BOTH WAYS.
//
// `store.mjs` says the fold is not to be reimplemented, and `src/coverage/store.ts` reimplements it
// in SQL anyway, knowingly, for what row-per-state buys. docs/plan-lagoon-host.md names the price:
//
//   It requires a test that folds the same two corpora both ways — through `mergeCorpora` in node,
//   and through the upsert — and asserts the results are identical. When `mergeCorpora` grows a rule,
//   that test fails and someone decides, instead of the two drifting quietly.
//
// This is that test, and it is the whole reason the SQL is allowed to exist. It runs against a REAL
// database, because a test of the SQL that does not execute the SQL tests nothing — the divergence
// this is guarding against would live precisely in the difference between what the statement says and
// what someone believed it said.
//
// WITHOUT A DATABASE IT SKIPS, LOUDLY, and never passes. A green run that quietly did not check is
// the exact failure mode this whole arrangement is built to avoid.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mergeCorpora } from '@motu/coverage'
import { db } from '../src/db.ts'
import { ingest, readCorpus, accept, known, forget } from '../src/coverage/store.ts'
import type { CoverageCorpus } from '../src/coverage/store.ts'

const REGION = 'actions'
const KEYS = ['busy', 'week']
const KEYS_HASH = '7f46c60a'

const corpus = (entries: CoverageCorpus['entries']): CoverageCorpus => ({
  v: 1,
  keysHash: KEYS_HASH,
  regionId: REGION,
  keys: KEYS,
  entries,
})

/**
 * TWO SHARED STATES WITH OPPOSITE WINDOWS, and the reason is a hole this fixture had on the first
 * attempt.
 *
 * The original pair had one shared state whose second window was both earlier and later than the
 * first. That distinguishes `least`/`greatest` from "keep the existing value" — and NOT from "take
 * the incoming value", because for that state the incoming value happened to be the extreme one on
 * both ends. Replacing `least(first_at, ...)` with `excluded.first_at` left this test green. It was
 * caught two tests later, by accident, on a third fold.
 *
 * So: `inside` has an incoming window strictly INSIDE the stored one (only `least`/`greatest` keep
 * the stored bounds) and `outside` has one strictly AROUND it (only `least`/`greatest` take the
 * incoming bounds). Between them, all four wrong choices — keep existing, take incoming, on either
 * column — change a value this test compares.
 */
// `= <value>` is one of @motu/coverage's own KeyState forms, so these are fingerprints the real
// fingerprinter could have produced rather than shapes only this test believes in.
const INSIDE = { busy: 'true', week: '= 1' } as const
const OUTSIDE = { busy: 'false', week: '= 1' } as const
const ONLY_A = { busy: 'false', week: '= 0' } as const
const ONLY_B = { busy: 'true', week: '= 2' } as const

const A = corpus([
  { fingerprint: INSIDE, count: 3, firstAt: 1000, lastAt: 5000 },
  { fingerprint: OUTSIDE, count: 7, firstAt: 4000, lastAt: 4500 },
  { fingerprint: ONLY_A, count: 2, firstAt: 100, lastAt: 200 },
])
const B = corpus([
  { fingerprint: INSIDE, count: 5, firstAt: 2000, lastAt: 3000 },
  { fingerprint: OUTSIDE, count: 2, firstAt: 1000, lastAt: 9000 },
  { fingerprint: ONLY_B, count: 1, firstAt: 4000, lastAt: 4000 },
])

let projectId: string | null = null
let orgId: string | null = null
let reachable = false

before(async () => {
  try {
    // A project row is a foreign key away, so the fixture needs one. Its own org, its own repo name,
    // so a run cannot collide with the seeded data or with another run.
    const org = await db().query(
      "insert into orgs (slug, name) values ($1, 'divergence fixture') returning id",
      [`divergence-${randomUUID().slice(0, 8)}`],
    )
    orgId = org.rows[0].id
    const project = await db().query(
      "insert into projects (org_id, repo, visibility) values ($1, $2, 'private') returning id",
      [orgId, `fixture-${randomUUID().slice(0, 8)}`],
    )
    projectId = project.rows[0].id
    reachable = true
  } catch {
    reachable = false
  }
})

after(async () => {
  // The org cascades to the project, which cascades to the states. One delete, nothing left behind.
  if (orgId) await db().query('delete from orgs where id = $1', [orgId]).catch(() => {})
  await db().end().catch(() => {})
})

const NO_DB =
  'SKIPPED — no database. This test is the ONLY thing keeping the SQL fold and `mergeCorpora` ' +
  'in step; a run without it has not checked that they agree. Start it with ' +
  '`docker compose -f infra/docker-compose.yml up -d` and set DATABASE_URL.'

test('the SQL upsert and mergeCorpora fold the same two corpora identically', async (t) => {
  if (!reachable) return t.skip(NO_DB)

  // Through the upsert: two writes, in order, exactly as two ingests would arrive.
  await ingest(projectId!, REGION, A)
  await ingest(projectId!, REGION, B)
  const viaSql = await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)

  // Through the fold motu already owns.
  const viaNode = mergeCorpora([A, B] as never) as unknown as CoverageCorpus

  assert.deepEqual(
    viaSql.entries,
    viaNode.entries,
    'the SQL fold and mergeCorpora disagree — one of them has grown a rule the other has not',
  )
  // And the envelope, so a corpus read back out of rows is one `mergeCorpora` would accept as input.
  assert.equal(viaSql.regionId, viaNode.regionId)
  assert.equal(viaSql.keysHash, viaNode.keysHash)
  assert.deepEqual(viaSql.keys, viaNode.keys)
})

test('both shared states summed, and each kept the WIDER window', async (t) => {
  if (!reachable) return t.skip(NO_DB)
  // Stated separately from the deepEqual above so a failure says WHICH clause of the fold broke,
  // rather than printing two documents and leaving somebody to diff them. Each assertion below is
  // false under exactly one of the four wrong choices.
  const read = await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)
  const at = (f: { busy: string; week: string }) =>
    read.entries.find((e) => e.fingerprint.busy === f.busy && e.fingerprint.week === f.week)!

  const inside = at(INSIDE)
  assert.equal(inside.count, 8, '3 + 5')
  assert.equal(inside.firstAt, 1000, 'the STORED bound — incoming 2000 is later, and must not win')
  assert.equal(inside.lastAt, 5000, 'the STORED bound — incoming 3000 is earlier, and must not win')

  const outside = at(OUTSIDE)
  assert.equal(outside.count, 9, '7 + 2')
  assert.equal(outside.firstAt, 1000, 'the INCOMING bound — stored 4000 is later, and must not win')
  assert.equal(outside.lastAt, 9000, 'the INCOMING bound — stored 4500 is earlier, and must not win')

  assert.equal(at(ONLY_A).count, 2, 'a state only the first corpus had survives')
  assert.equal(at(ONLY_B).count, 1, 'a state only the second corpus had arrives')
})

test('a third ingest of the same corpus keeps summing — the upsert is not an overwrite', async (t) => {
  if (!reachable) return t.skip(NO_DB)
  await ingest(projectId!, REGION, A)
  const read = await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)
  const shared = read.entries.find((e) => e.fingerprint.busy === 'true' && e.fingerprint.week === '= 1')
  assert.equal(shared!.count, 11, '8 + 3')
  const viaNode = mergeCorpora([A, B, A] as never) as unknown as CoverageCorpus
  assert.deepEqual(read.entries, viaNode.entries, 'still agreeing after three folds')
})

test('a different keysHash is a different bucket, not a merge', async (t) => {
  if (!reachable) return t.skip(NO_DB)
  // "Add a key to a region and its old rows simply stop being written to" — the property the file
  // layout gave for free and the primary key has to carry now. The same state fingerprints
  // differently on each side, so the counts are not summable and must not be summed.
  await ingest(projectId!, REGION, { ...A, keysHash: 'other000' })
  const original = await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)
  const other = await readCorpus(projectId!, REGION, 'other000', KEYS)
  const sharedIn = (c: CoverageCorpus) =>
    c.entries.find((e) => e.fingerprint.busy === 'true' && e.fingerprint.week === '= 1')!.count
  assert.equal(sharedIn(original), 11, 'untouched by the other bucket')
  assert.equal(sharedIn(other), 3, 'and the other bucket started from nothing')
})

test('accepting is a person’s decision, and an ingest cannot make it', async (t) => {
  if (!reachable) return t.skip(NO_DB)
  // The rule the file layout enforced by keeping two documents: an ingest write must never promote
  // its own states to accepted. Here it is one column left out of the upsert's update list, which is
  // a much easier thing to lose — so it is pinned.
  const read = await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)
  const id = (await known(projectId!, REGION, KEYS_HASH)).length
  assert.equal(id, 0, 'nothing accepted yet')

  const target = read.entries[0]!
  const { fingerprintId } = (await import('@motu/coverage')) as { fingerprintId: (f: unknown) => string }
  const targetId = fingerprintId(target.fingerprint)
  assert.deepEqual(await accept(projectId!, REGION, KEYS_HASH, [targetId]), { accepted: 1 })
  assert.deepEqual(await known(projectId!, REGION, KEYS_HASH), [targetId])

  // Now ingest again over the top. The count must move and the acceptance must not.
  await ingest(projectId!, REGION, A)
  assert.deepEqual(
    await known(projectId!, REGION, KEYS_HASH),
    [targetId],
    'an ingest did not un-accept, and did not accept anything either',
  )
  assert.deepEqual(await accept(projectId!, REGION, KEYS_HASH, [targetId]), { accepted: 0 }, 'idempotent')
})

test('forget is a delete, and an empty list drops the whole declaration', async (t) => {
  if (!reachable) return t.skip(NO_DB)
  const before = await readCorpus(projectId!, REGION, 'other000', KEYS)
  assert.ok(before.entries.length > 0)
  const { forgotten } = await forget(projectId!, REGION, 'other000', null)
  assert.equal(forgotten, before.entries.length)
  assert.equal((await readCorpus(projectId!, REGION, 'other000', KEYS)).entries.length, 0)
  // And it took only its own bucket with it.
  assert.ok((await readCorpus(projectId!, REGION, KEYS_HASH, KEYS)).entries.length > 0)
})
