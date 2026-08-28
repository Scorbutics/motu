#!/usr/bin/env node
// Remove a repository from the lagoon host, records and all.
//
// WHY THIS IS A SCRIPT AND NOT A ROUTE. Nothing else on the host deletes a repo: `sweepRepo` evicts
// history under a retention cap and `--remove` drops a member from a GROUP, but neither forgets that
// a repository ever existed. That is the right default — publishing is additive and history is the
// point — so the one operation that is genuinely destructive stays a deliberate, out-of-band act
// rather than an endpoint anybody can reach.
//
// WHAT IT REFUSES TO DO. A composed group pinning a record is exactly what `store.mjs`'s retention
// rule protects: "never evict what an alias or a composed manifest points at". Removing a repo out
// from under a gallery would leave that gallery resolving to nothing, so this checks first and stops.
// Re-compose the group (`motu lagoon group <name> --remove <repo>`) and run it again.
//
//   node infra/remove-repo.mjs --repo Scorbutics/motu            # dry run: says what would go
//   node infra/remove-repo.mjs --repo Scorbutics/motu --confirm  # remove it, if nothing pins it
//   node infra/remove-repo.mjs --repo X --confirm --force        # ...and drop the manifests that do
//
// `--force` is separate from `--confirm` on purpose. `--confirm` says "yes, delete this repo";
// `--force` says the additional, different thing: "and destroy the historical galleries that point
// at it". Collapsing them into one flag would let somebody who meant the first do the second.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from '@motu/host/src/store.mjs'

const here = dirname(fileURLToPath(import.meta.url))

function env(name) {
  if (process.env[name]) return process.env[name]
  for (const file of ['.env.local', '.env.example']) {
    const path = resolve(here, '..', file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m && m[1] === name) return m[2]
    }
  }
  return undefined
}

const argv = process.argv.slice(2)
const flag = (n) => {
  const i = argv.indexOf(`--${n}`)
  if (i < 0) return undefined
  const next = argv[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}

const repo = typeof flag('repo') === 'string' ? flag('repo') : null
const confirm = flag('confirm') === true
const force = flag('force') === true
if (!repo) {
  console.error('usage: node infra/remove-repo.mjs --repo <owner/name> [--confirm]')
  process.exit(1)
}

const dir = env('MOTU_HOST_DIR')
if (!dir) {
  console.error('✗ MOTU_HOST_DIR is not set — there is no safe default; guessing wrong opens an empty store')
  process.exit(1)
}

// THE HOST HOLDS THE INDEX IN MEMORY. `openStore` reads index.json once and caches it, writing the
// whole thing back on every change — so editing the file underneath a running host is not merely
// racy, it is guaranteed to be undone by that host's next publish. The first run of this script did
// exactly that: the file said the repo was gone and `/api/repos` still listed it, because the
// process that owns the index had never been told.
//
// Two writers again, which is the same failure phases 2 and 3 were built to avoid. So: stop it.
const HOST_UNIT = process.env.MOTU_HOST_UNIT ?? 'motu-host'
function hostIsRunning() {
  try {
    return execSync(`systemctl --user is-active ${HOST_UNIT}`, { encoding: 'utf8' }).trim() === 'active'
  } catch {
    return false
  }
}

const indexPath = resolve(dir, 'index.json')
if (!existsSync(indexPath)) {
  console.error(`✗ no store at ${dir} — index.json is missing, so this is not a host's directory`)
  process.exit(1)
}

const index = JSON.parse(readFileSync(indexPath, 'utf8'))
const entry = index.repos?.[repo]
if (!entry) {
  console.log(`· ${repo} is not on this host — nothing to remove`)
  process.exit(0)
}

// EVERY MANIFEST THAT PINS THIS REPO. A group resolves through a manifest, so this is the check that
// stops a gallery being stranded. Reported by name, because "re-compose these two" is actionable and
// "it is referenced somewhere" is not.
const pinning = []
for (const [id, manifest] of Object.entries(index.manifests ?? {})) {
  const members = manifest.members ?? []
  if (members.some((m) => m.repo === repo)) pinning.push(id)
}

const records = entry.history?.length ?? 0
const aliases = Object.keys(entry.aliases ?? {})
console.log(`  ${repo}`)
console.log(`    ${records} record(s), alias(es): ${aliases.join(', ') || '(none)'}`)

if (pinning.length && !force) {
  console.error('')
  console.error(`✗ refusing: ${pinning.length} composed manifest(s) still point at ${repo}`)
  console.error('  Removing it would leave those galleries resolving to nothing — the exact thing')
  console.error("  store.mjs's retention rule protects against. Re-compose them first:")
  console.error(`      motu lagoon group <name> --remove ${repo}`)
  console.error('  Re-composing a GROUP mints a new manifest and leaves the old ones standing, so if')
  console.error('  the history is what pins it, --force is the only way and it destroys those views.')
  process.exit(1)
}

if (pinning.length) {
  console.log(`    ${pinning.length} composed manifest(s) pin it and will be DESTROYED by --force:`)
  for (const id of pinning.slice(0, 5)) console.log(`      /m/${id}`)
  if (pinning.length > 5) console.log(`      … and ${pinning.length - 5} more`)
}

if (confirm && hostIsRunning()) {
  console.error('')
  console.error(`✗ ${HOST_UNIT} is running and holds this index in memory.`)
  console.error('  It would overwrite this edit on its next publish. Stop it, run this, start it:')
  console.error(`      systemctl --user stop ${HOST_UNIT}`)
  console.error(`      node infra/remove-repo.mjs --repo ${repo} --confirm${force ? ' --force' : ''}`)
  console.error(`      systemctl --user start ${HOST_UNIT}`)
  process.exit(1)
}

if (!confirm) {
  console.log('')
  console.log('  Dry run. Nothing was removed. Re-run with --confirm to delete these records and')
  console.log('  garbage-collect any blobs no other repo, manifest or baseline still references.')
  process.exit(0)
}

// A BACKUP OF THE INDEX, not of the blobs. The index is what makes blobs findable and is the only
// thing this script rewrites; blobs are content-addressed and are only deleted once nothing points
// at them, which is a decision this backup lets you reverse if it turns out to be wrong.
const backup = `${indexPath}.before-remove-${Date.now()}`
copyFileSync(indexPath, backup)
console.log(`  index backed up to ${backup}`)

// ORDER MATTERS, and the obvious order is wrong. Deleting the repo entry first and then calling
// `sweepRepo` collects nothing: sweepRepo early-returns on a repo it cannot find, so the blob GC
// never runs and every blob is orphaned on disk with no index entry to find it by. The first run of
// this script reported "0 blob(s) collected" and that is what it meant.
//
// So the entry is left in place and swept EMPTY first, which is the path that reaches `gcBlobs` —
// motu's own liveness rules across repos, manifests and baselines, rather than a second copy of them
// here. Aliases and pinning manifests are cleared beforehand because both PIN records against
// eviction, which is exactly their job everywhere else.
for (const id of pinning) delete index.manifests[id]
index.repos[repo].aliases = {}
writeFileSync(indexPath, JSON.stringify(index), 'utf8')

// `maxRecords: 0` makes every remaining record evictable. Nothing pins them now, so the sweep drops
// the whole history and the GC that follows it releases the blobs.
const store = openStore({ dir, maxRecords: 0, maxBytes: 0 })
const swept = store.sweepRepo(repo)

// Only now is the entry itself removed — re-reading what the store just wrote, so this does not
// clobber the sweep.
const after = JSON.parse(readFileSync(indexPath, 'utf8'))
delete after.repos[repo]
writeFileSync(indexPath, JSON.stringify(after), 'utf8')
console.log(
  `✓ removed ${repo} — ${records} record(s) gone, ${pinning.length} manifest(s) dropped, ` +
    `${swept.blobs ?? 0} blob(s) collected`,
)
