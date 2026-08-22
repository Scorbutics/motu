// The lagoon store: content-addressed blobs, mutable aliases on top, and a retention cap that can
// never break a URL someone is holding.
//
// WHAT IS STORED is the artifact `motu lagoon publish` already produces — one self-contained HTML
// FRAGMENT (assets inlined, mock transport, no doctype/html/head/body: see `inlineToArtifact` in
// the CLI). The document skeleton is supplied at serve time, so the same bytes publish to a hosted
// page here and to an Artifact, and neither host has to know about the other.
//
// TWO AXES, deliberately:
//   /<repo>/<sha>/<slug>     immutable — the reviewable artifact, still renders in six months
//   /<repo>/latest/<slug>    mutable alias — the bookmark that keeps working
// Content addressing does the deduplication: republishing an unchanged lagoon costs zero new bytes.
//
// RETENTION counts publish RECORDS per repo, not blobs, and never evicts a record an alias or a
// composed manifest points at. That rule is the whole point — a cap that can quietly delete what a
// link resolves to is worse than no cap, because the failure lands on whoever you sent the link to,
// not on you. Eviction orders by LAST ACCESS rather than publish date: the six-week-old lagoon
// somebody bookmarked is exactly the one that must survive ten builds from this morning.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';

/** Default cap: publish records kept PER REPO. */
export const DEFAULT_MAX_RECORDS = 1000;

/**
 * Second cap, on BYTES per repo — because records are not a proxy for size.
 *
 * A typical lagoon is ~430 kB, which is where 1000 records came from. Twenty's record page inlines
 * its whole front-end and publishes at 19.2 MB; a thousand of those is 19 GB, from a cap that reads
 * as conservative. Whichever limit binds first wins, so the count keeps history shallow on ordinary
 * repos and the byte ceiling keeps an outlier from quietly filling the disk.
 */
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024 * 1024;

const INDEX_VERSION = 1;

/**
 * One index file for the whole store, rewritten atomically.
 *
 * Not many small files: referential integrity here is a cross-cutting question ("is this blob still
 * pointed at by ANY repo's alias or ANY manifest?") and answering it by walking a directory tree
 * would make every sweep an O(files) stat storm. The server is a single process, so there is one
 * writer; a few MB of JSON at a thousand records per repo is nothing.
 */
function emptyIndex() {
  return { version: INDEX_VERSION, blobs: {}, repos: {}, groups: {}, manifests: {} };
}

/** A path segment that is safe to join: no separators, no dots-only, no surprises. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Repo ids carry one optional owner segment (`acme/web`), which is how git remotes name things. */
export function normalizeRepo(raw) {
  const parts = String(raw ?? '').split('/').filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  if (!parts.every((p) => SEGMENT.test(p) && p.length <= 64)) return null;
  return parts.join('/');
}

export function normalizeSegment(raw, max = 128) {
  const s = String(raw ?? '');
  return SEGMENT.test(s) && s.length <= max ? s : null;
}

function nowIso() {
  return new Date().toISOString();
}

export function hashBytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function openStore({ dir, maxRecords = DEFAULT_MAX_RECORDS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const root = resolve(dir || process.env.MOTU_HOST_DIR || resolve(homedir(), '.motu/host'));
  const indexPath = resolve(root, 'index.json');
  mkdirSync(resolve(root, 'objects'), { recursive: true });

  let index = emptyIndex();
  if (existsSync(indexPath)) {
    try {
      const loaded = JSON.parse(readFileSync(indexPath, 'utf8'));
      if (loaded && loaded.version === INDEX_VERSION) index = { ...emptyIndex(), ...loaded };
    } catch {
      // A corrupt index must not take the blobs with it: keep them on disk, start the index over.
      // Anything unreferenced is then sweepable, and nothing already served silently changes bytes.
      index = emptyIndex();
    }
  }

  function save() {
    const tmp = `${indexPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(index), 'utf8');
    renameSync(tmp, indexPath); // atomic: a killed process leaves the previous index, never a half one
  }

  function blobPath(hash) {
    return resolve(root, 'objects', hash.slice(0, 2), hash);
  }

  function repoEntry(repo) {
    if (!index.repos[repo]) index.repos[repo] = { history: [], aliases: {}, nextId: 1 };
    return index.repos[repo];
  }

  /** Every hash a manifest member points at — pinned across every repo, forever. */
  function manifestPinned() {
    const pinned = new Set();
    for (const m of Object.values(index.manifests)) for (const member of m.members) pinned.add(member.hash);
    return pinned;
  }

  /** Record ids this repo's mutable aliases resolve to — `latest`, branch heads, anything named. */
  function aliasPinned(entry) {
    const pinned = new Set();
    for (const slugs of Object.values(entry.aliases)) for (const id of Object.values(slugs)) pinned.add(id);
    return pinned;
  }

  /**
   * Store a fragment and point `latest` (and the branch alias, and the commit) at it.
   *
   * Returns `deduped: true` when the bytes were already here — the common case for a republish with
   * no UI change, and worth surfacing so the CLI can say so instead of implying work happened.
   */
  function publish(repo, slug, bytes, { title = slug, sha = null, branch = null } = {}) {
    const entry = repoEntry(repo);
    const hash = hashBytes(bytes);
    const file = blobPath(hash);
    const deduped = existsSync(file);
    if (!deduped) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    const at = nowIso();
    index.blobs[hash] = { bytes: bytes.length, createdAt: index.blobs[hash]?.createdAt ?? at };

    const record = {
      id: entry.nextId++,
      slug,
      hash,
      title,
      sha: sha || hash.slice(0, 12), // no git? the content hash IS a usable immutable ref
      branch,
      publishedAt: at,
      lastAccess: at,
    };
    entry.history.push(record);

    // Aliases always move on publish. `latest` is the bookmark; the branch alias is what a PR link
    // wants. The commit is NOT an alias — it is found in history, so it cannot be repointed later.
    setAlias(entry, 'latest', slug, record.id);
    if (branch && normalizeSegment(branch)) setAlias(entry, branch, slug, record.id);

    sweepRepo(repo);
    save();
    return { hash, bytes: bytes.length, deduped, sha: record.sha, record };
  }

  function setAlias(entry, ref, slug, id) {
    if (!entry.aliases[ref]) entry.aliases[ref] = {};
    entry.aliases[ref][slug] = id;
  }

  /** Resolve `<ref>/<slug>` — an alias name first, then a commit (prefix-matched) in history. */
  function resolveRef(repo, ref, slug) {
    const entry = index.repos[repo];
    if (!entry) return null;
    const aliased = entry.aliases[ref]?.[slug];
    if (aliased != null) {
      const rec = entry.history.find((r) => r.id === aliased);
      if (rec) return { ...rec, mutable: true };
    }
    // Newest first: a short sha that matches two records should give the recent one, not the ancient.
    for (let i = entry.history.length - 1; i >= 0; i--) {
      const rec = entry.history[i];
      if (rec.slug === slug && (rec.sha === ref || rec.sha.startsWith(ref) || rec.hash.startsWith(ref)))
        return { ...rec, mutable: false };
    }
    return null;
  }

  /** Read a blob and stamp the access time that eviction orders by. */
  function read(repo, recordId, hash) {
    const file = blobPath(hash);
    if (!existsSync(file)) return null;
    const entry = index.repos[repo];
    const rec = entry?.history.find((r) => r.id === recordId);
    if (rec) {
      rec.lastAccess = nowIso();
      save();
    }
    return readFileSync(file);
  }

  /** Read a blob by hash alone — what a composed manifest serves, since members span repos. */
  function readHash(hash) {
    const file = blobPath(hash);
    return existsSync(file) ? readFileSync(file) : null;
  }

  /**
   * Trim one repo to the cap, then collect blobs nothing points at any more.
   *
   * Pinned = targeted by a mutable alias, or a member of a stored manifest. Everything else is
   * history, and history is what the cap is allowed to forget.
   */
  function sweepRepo(repo) {
    const entry = index.repos[repo];
    if (!entry) return { removed: 0 };
    const pinnedIds = aliasPinned(entry);
    const pinnedHashes = manifestPinned();

    const evictable = entry.history
      .filter((r) => !pinnedIds.has(r.id) && !pinnedHashes.has(r.hash))
      .sort((a, b) => (a.lastAccess < b.lastAccess ? -1 : a.lastAccess > b.lastAccess ? 1 : a.id - b.id));

    // Distinct blobs, not the sum of records: two records sharing content occupy one blob, and
    // charging the repo twice for it would evict history that costs nothing to keep.
    const bytesOf = (recs) => {
      const seen = new Set();
      let total = 0;
      for (const r of recs) {
        if (seen.has(r.hash)) continue;
        seen.add(r.hash);
        total += index.blobs[r.hash]?.bytes ?? 0;
      }
      return total;
    };

    let over = entry.history.length - maxRecords;
    let overBytes = bytesOf(entry.history) - maxBytes;
    const drop = new Set();
    for (const rec of evictable) {
      if (over <= 0 && overBytes <= 0) break;
      drop.add(rec.id);
      over--;
      // Only credit the bytes back if no SURVIVING record still points at that blob.
      const stillUsed = entry.history.some((r) => !drop.has(r.id) && r.hash === rec.hash);
      if (!stillUsed) overBytes -= index.blobs[rec.hash]?.bytes ?? 0;
    }
    if (!drop.size) return { removed: 0, blobs: gcBlobs() };
    entry.history = entry.history.filter((r) => !drop.has(r.id));
    return { removed: drop.size, blobs: gcBlobs() };
  }

  /** Delete blobs no surviving record and no manifest references. Runs after any history change. */
  function gcBlobs() {
    const live = manifestPinned();
    for (const entry of Object.values(index.repos)) for (const r of entry.history) live.add(r.hash);
    let removed = 0;
    for (const hash of Object.keys(index.blobs)) {
      if (live.has(hash)) continue;
      try {
        rmSync(blobPath(hash), { force: true });
      } catch {
        /* a blob already gone is the state we wanted */
      }
      delete index.blobs[hash];
      removed++;
    }
    return removed;
  }

  // --- composition ------------------------------------------------------------------------------

  /** Define a group: an ordered list of `{repo, slug}` the server resolves at assembly time. */
  function putGroup(name, members) {
    index.groups[name] = { members, updatedAt: nowIso() };
    save();
    return index.groups[name];
  }

  function getGroup(name) {
    return index.groups[name] ?? null;
  }

  /**
   * Assemble a group into an IMMUTABLE manifest: resolve every member's `latest` NOW, and store the
   * resolved hashes.
   *
   * This is what makes server-side assembly reproducible. The group URL always reflects today; the
   * manifest it resolves to keeps rendering what today looked like. The manifest is itself content-
   * addressed, so viewing an unchanged group twice yields the same id and adds nothing to the store.
   * Members are PINNED by the manifest, which is why a snapshot can never be hollowed out by the cap.
   */
  function snapshot(name) {
    const group = getGroup(name);
    if (!group) return null;
    const members = [];
    const missing = [];
    for (const m of group.members) {
      const rec = resolveRef(m.repo, m.ref || 'latest', m.slug);
      if (!rec) {
        missing.push(m);
        continue;
      }
      members.push({ repo: m.repo, slug: m.slug, hash: rec.hash, title: rec.title, sha: rec.sha });
    }
    if (!members.length) return { id: null, members, missing };
    const id = hashBytes(Buffer.from(JSON.stringify(members))).slice(0, 32);
    if (!index.manifests[id]) {
      index.manifests[id] = { group: name, members, createdAt: nowIso() };
      save();
    }
    return { id, members, missing };
  }

  function manifest(id) {
    return index.manifests[id] ?? null;
  }

  function listRepos() {
    return Object.entries(index.repos).map(([repo, entry]) => ({
      repo,
      records: entry.history.length,
      slugs: [...new Set(Object.keys(entry.aliases.latest ?? {}))].sort(),
    }));
  }

  function listRepo(repo) {
    const entry = index.repos[repo];
    if (!entry) return null;
    return {
      repo,
      aliases: entry.aliases,
      history: entry.history.slice().reverse(),
    };
  }

  function listGroups() {
    return Object.entries(index.groups).map(([name, g]) => ({ name, members: g.members }));
  }

  function stats() {
    const bytes = Object.values(index.blobs).reduce((n, b) => n + b.bytes, 0);
    return {
      root,
      maxRecords,
      maxBytes,
      repos: Object.keys(index.repos).length,
      blobs: Object.keys(index.blobs).length,
      manifests: Object.keys(index.manifests).length,
      bytes,
    };
  }

  return {
    root,
    maxRecords,
    maxBytes,
    publish,
    resolveRef,
    read,
    readHash,
    putGroup,
    getGroup,
    snapshot,
    manifest,
    listRepos,
    listRepo,
    listGroups,
    stats,
    sweepRepo,
    save,
  };
}
