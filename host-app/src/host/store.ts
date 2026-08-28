// The lagoon store, opened by the APP.
//
// PHASE 4 CHANGES WHO DRIVES store.mjs, and nothing about store.mjs itself. Phases 2 and 3 proxied to
// the node host for bytes precisely because its retention bookkeeping — never evict what an alias
// points at, order eviction by LAST ACCESS — must have exactly one writer, and there were two
// processes. Deleting `server.mjs` removes the second one, so the app becomes that single writer.
//
// That was verified rather than assumed: `next start` runs ONE process with zero children on this
// host, so there is no worker pool quietly turning one writer back into several. If that ever stops
// being true — a clustered deploy, a second replica behind a load balancer — the tmp+rename in
// `store.mjs` stops being sufficient and this decision has to be revisited BEFORE scaling out, not
// after.
import { resolve } from 'node:path'
// @motu/host is plain ESM node; tsc reads it through allowJs.
import { openStore } from '@motu/host/src/store.mjs'
import { loadAccess } from '@motu/host/src/access.mjs'

/**
 * Where the host keeps its store — configured, no default.
 *
 * Same rule as the coverage route, and for the same reason: `store.mjs`'s own default is
 * `~/.motu/host`, this machine's host runs with `~/.local/share/motu-host`, and both directories
 * exist. A wrong guess here would open an EMPTY store and serve a host with no lagoons in it, which
 * looks like data loss rather than a misconfiguration.
 */
export function storeDir(): string {
  const dir = process.env.MOTU_HOST_DIR
  if (!dir) throw new Error('MOTU_HOST_DIR is required — it is where the lagoon host keeps its store')
  return dir
}

/**
 * One store for the process.
 *
 * `openStore` reads an index from disk and caches it, so opening one per request would both cost a
 * read and — worse — give two requests two different views of what exists.
 */
let cached: ReturnType<typeof openStore> | null = null

export function store() {
  if (!cached) {
    // Cast at the boundary: `openStore` is plain JS and DOES take `dir` (store.mjs:91), but tsc
    // infers the parameter type from the destructure's defaults, which omit it.
    cached = (openStore as (o: { dir: string; maxRecords?: number }) => ReturnType<typeof openStore>)({
      dir: storeDir(),
      maxRecords: Number(process.env.MOTU_HOST_MAX_RECORDS ?? 1000),
    })
  }
  return cached
}

/** The host's access policy, re-read per request: an operator may change it without a restart. */
export function access() {
  return loadAccess(storeDir())
}

/** `store.mjs`'s SEGMENT, so both sides accept exactly the same characters. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function normalizeRepo(raw: string): string | null {
  const parts = raw.split('/').filter(Boolean)
  if (parts.length < 1 || parts.length > 2) return null
  if (!parts.every((p) => SEGMENT.test(p) && p.length <= 64)) return null
  return parts.join('/')
}

export function normalizeSegment(raw: string | undefined, max = 128): string | null {
  const s = String(raw ?? '')
  return SEGMENT.test(s) && s.length <= max ? s : null
}
