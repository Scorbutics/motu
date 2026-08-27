// The coverage corpus, as rows.
//
// THE RULE THIS FILE BREAKS, ON PURPOSE, AND WHAT PAYS FOR IT
//
// `store.mjs` carries a warning that is right:
//
//   THE FOLD IS NOT REIMPLEMENTED HERE. Merging two corpora is arithmetic on motu's own format, and
//   the moment a second copy of it exists the two stop agreeing.
//
// The `on conflict ... do update set count = count + excluded.count` below IS a second copy of that
// fold, written in SQL. It happens to agree with `mergeCorpora` today. It will not necessarily agree
// tomorrow — someone adds a rule to the fold, and this quietly keeps doing the old arithmetic.
//
// The plan takes that trade knowingly, for what row-per-state buys (a queryable worklist, a `forget`
// that is a DELETE, and concurrent ingest that stops losing writes) — and it names the price:
//
//   It requires a test that folds the same two corpora both ways — through `mergeCorpora` in node,
//   and through the upsert — and asserts the results are identical. When `mergeCorpora` grows a rule,
//   that test fails and someone decides, instead of the two drifting quietly.
//
// That test is `test/coverage-divergence.test.ts`, and it landed in the same commit as this file. If
// you are reading this because you are about to change the arithmetic on either side: the test is the
// thing that was supposed to stop you doing it in only one place.
import { db, one } from '../db.ts'
// @motu/coverage compiles to plain ESM; bare node reads it exactly as the browser does.
import { fingerprintId, type RegionFingerprint } from '@motu/coverage'

/** One state, as @motu/coverage's own format has it. */
export type CoverageEntry = {
  // THE PACKAGE'S OWN TYPE, not `Record<string, string>`. `KeyState` is a closed set — 'absent',
  // 'null', 'set', '= <value>' and so on — and widening it here would let a corpus that motu's own
  // fingerprinter could never produce be stored, then read back out and handed to `mergeCorpora`,
  // which would reject it. A shape only one side accepts is a divergence of a different kind.
  fingerprint: RegionFingerprint
  count: number
  firstAt: number
  lastAt: number
}

export type CoverageCorpus = {
  v?: number
  keysHash?: string
  regionId: string
  keys: string[]
  entries: CoverageEntry[]
}

/** `store.mjs`'s own rule, copied so a corpus cannot be filed under a key the host would reject. */
export function normalizeKeysHash(raw: unknown): string {
  const keysHash = String(raw ?? '').trim() || 'unstamped'
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(keysHash)) throw new Error('keysHash must be [A-Za-z0-9_-]')
  return keysHash
}

/**
 * Fold a corpus into the rows.
 *
 * ONE STATEMENT. That is the correctness fix: two POSTs arriving together are two upserts, and
 * neither can lose the other's states the way two read-merge-rename cycles do.
 *
 * `accepted_at` IS NOT TOUCHED on conflict. An ingest write must never be able to promote its own
 * states to accepted — the file version kept the two apart in separate documents for exactly this
 * reason, and leaving the column out of the update list is how that survives the move.
 */
export async function ingest(
  projectId: string,
  region: string,
  corpus: CoverageCorpus,
): Promise<{ states: number; keysHash: string }> {
  const keysHash = normalizeKeysHash(corpus.keysHash)
  const entries = corpus.entries ?? []
  if (entries.length) {
    await db().query(
      `insert into coverage_states
         (project_id, region, keys_hash, state_id, fingerprint, count, first_at, last_at)
       select $1, $2, $3, t.state_id, t.fingerprint::jsonb, t.count, t.first_at, t.last_at
         from unnest($4::text[], $5::jsonb[], $6::bigint[], $7::bigint[], $8::bigint[])
              as t(state_id, fingerprint, count, first_at, last_at)
       on conflict (project_id, region, keys_hash, state_id)
       do update set
         count    = coverage_states.count + excluded.count,
         first_at = least(coverage_states.first_at, excluded.first_at),
         last_at  = greatest(coverage_states.last_at, excluded.last_at)`,
      [
        projectId,
        region,
        keysHash,
        entries.map((e) => fingerprintId(e.fingerprint) as string),
        entries.map((e) => JSON.stringify(e.fingerprint)),
        entries.map((e) => e.count),
        entries.map((e) => e.firstAt),
        entries.map((e) => e.lastAt),
      ],
    )
  }
  const total = await one<{ n: string }>(
    'select count(*)::text as n from coverage_states where project_id = $1 and region = $2 and keys_hash = $3',
    [projectId, region, keysHash],
  )
  return { states: Number(total?.n ?? 0), keysHash }
}

/**
 * The rows back as a corpus, in the shape `mergeCorpora` produces.
 *
 * SORTED BY COUNT DESCENDING, because that is what `mergeCorpora` returns and the divergence test
 * compares the two documents. A different order would be a difference the test would report, which is
 * the test doing its job over a distinction nobody meant to make.
 */
export async function readCorpus(
  projectId: string,
  region: string,
  keysHash: string,
  keys: string[],
): Promise<CoverageCorpus> {
  const { rows } = await db().query(
    `select state_id, fingerprint, count, first_at, last_at
       from coverage_states
      where project_id = $1 and region = $2 and keys_hash = $3
      order by count desc`,
    [projectId, region, keysHash],
  )
  return {
    v: 1,
    keysHash,
    regionId: region,
    keys,
    entries: rows.map((r) => ({
      fingerprint: r.fingerprint as RegionFingerprint,
      count: Number(r.count),
      firstAt: Number(r.first_at),
      lastAt: Number(r.last_at),
    })),
  }
}

/**
 * Mark states as accepted. Idempotent, and it never un-accepts — `forget` is the destructive one.
 *
 * A PERSON'S DECISION, which is why the route behind it takes the admin token and not the ingest one:
 * nothing promotes a state to "known" except a flow or a person, and a system whose reporting path
 * can mark its own findings resolved reports nothing.
 */
export async function accept(
  projectId: string,
  region: string,
  keysHash: string,
  ids: string[],
): Promise<{ accepted: number }> {
  if (!ids.length) return { accepted: 0 }
  const { rowCount } = await db().query(
    `update coverage_states set accepted_at = now()
      where project_id = $1 and region = $2 and keys_hash = $3
        and state_id = any($4::text[]) and accepted_at is null`,
    [projectId, region, normalizeKeysHash(keysHash), ids],
  )
  return { accepted: rowCount ?? 0 }
}

/** The accepted set — what `motu region coverage` calls "known". */
export async function known(projectId: string, region: string, keysHash: string): Promise<string[]> {
  const { rows } = await db().query(
    `select state_id from coverage_states
      where project_id = $1 and region = $2 and keys_hash = $3 and accepted_at is not null`,
    [projectId, region, normalizeKeysHash(keysHash)],
  )
  return rows.map((r) => r.state_id as string)
}

/**
 * Remove states the instrument recorded wrongly. A DELETE, where the file version was a read, a
 * filter and a rewrite.
 *
 * An empty id list drops the whole declaration, matching `store.mjs`'s `forgetCoverage` — which is
 * what "one file to delete" becomes when there is no file.
 */
export async function forget(
  projectId: string,
  region: string,
  keysHash: string,
  ids: string[] | null,
): Promise<{ forgotten: number }> {
  const hash = normalizeKeysHash(keysHash)
  const { rowCount } = ids?.length
    ? await db().query(
        `delete from coverage_states
          where project_id = $1 and region = $2 and keys_hash = $3 and state_id = any($4::text[])`,
        [projectId, region, hash, ids],
      )
    : await db().query(
        'delete from coverage_states where project_id = $1 and region = $2 and keys_hash = $3',
        [projectId, region, hash],
      )
  return { forgotten: rowCount ?? 0 }
}
