// Postgres, directly.
//
// NOT THROUGH THE SUPABASE DATA API, and this is the plan's decision rather than a preference:
// "PostgREST — no. A Next app talks to Postgres directly. Nothing here needs a generated REST API."
//
// It is worth recording how that got tested. The first version of the policy stores used
// `supabase-js`'s `.from('projects')`, which is PostgREST — so every record request went to
// `<app>/rest/v1/projects`, which the phase-0 catch-all dutifully proxied to the lagoon host, which
// answered `nothing at rest/v1/projects`. The app stopped serving anything at all. There is no
// PostgREST in this stack, by design, and reaching for its client is how you find that out.
//
// SERVER ONLY. Nothing here may be reached from a browser module: it holds a superuser connection
// string and there is no row-level security between it and the tables.
import { Pool } from 'pg'

let pool: Pool | null = null

/**
 * One pool for the process.
 *
 * Small on purpose. The plan is explicit that pooling and read replicas "solve a problem this
 * workload does not have" — the tables are tiny and low-QPS, and the bottleneck is disk and
 * bandwidth for blobs the database never sees. What this pool is for is not throughput; it is not
 * opening a TCP connection per lagoon anyone reads.
 */
export function db(): Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required — copy .env.example to .env.local')
  pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000 })
  // A pool that emits an unhandled 'error' takes the process down. An idle client dropped by the
  // server is normal — the pool replaces it — and must not be fatal to a host serving static HTML.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message))
  return pool
}

/** One query, one row or null. The shape every policy lookup in this app has. */
export async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await db().query(sql, params)
  return (rows[0] as T) ?? null
}
