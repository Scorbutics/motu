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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
// THE FOLD IS NOT REIMPLEMENTED HERE. Merging two corpora is arithmetic on motu's own format, and the
// moment a second copy of it exists the two stop agreeing — which is the whole reason `mergeCorpora`
// lives in @motu/coverage instead of in every backend that stores one. The package compiles to plain
// ESM, so bare node reads it exactly as the browser does.
import { mergeCorpora } from '@motu/coverage';
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
  return { version: INDEX_VERSION, blobs: {}, repos: {}, groups: {}, manifests: {}, baselines: {} };
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

/**
 * Where the store lives when nobody says otherwise.
 *
 * Exported because `motu-host access` edits a file INSIDE it and must land in the same place the
 * server will read from. Two copies of this expression is two directories, and the symptom is a
 * policy that was written and appears to do nothing.
 */
export function storeDir(dir) {
  return resolve(dir || process.env.MOTU_HOST_DIR || resolve(homedir(), '.motu/host'));
}

export function openStore({ dir, maxRecords = DEFAULT_MAX_RECORDS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const root = storeDir(dir);
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
  function publish(repo, slug, bytes, { title = slug, sha = null, branch = null, brand = null } = {}) {
    const entry = repoEntry(repo);
    // THE PROJECT'S OWN COLOUR, on the repo rather than on the record: it is a property of the
    // project, not of one build, and a tool listing repositories should not have to fetch a record to
    // know what colour to be. Only overwritten when a publish actually carries one, so a project that
    // stops declaring it keeps the last thing it said rather than silently reverting to motu teal.
    if (brand) entry.brand = brand;
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
    // A baseline is only meaningful while its bytes exist. ACCEPTED is pinned forever; the recent
    // history is pinned so "what did it look like before" survives long enough to be looked at.
    for (const islands of Object.values(index.baselines)) {
      for (const shots of Object.values(islands)) {
        for (const shot of Object.values(shots)) {
          if (shot.accepted) live.add(shot.accepted);
          for (const h of shot.history ?? []) live.add(h);
        }
      }
    }
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

  // --- visual baselines ---------------------------------------------------------------------
  //
  // WHY THE HOST AND NOT THE REPOSITORY. Committed PNGs are what makes a visual tier unmaintainable:
  // re-recording is a binary diff nobody reviews, so baselines drift, the check goes permanently red,
  // and people stop looking — which is exactly the state peps was in, with one island baselined and
  // its baselines stale. Every hosted tool in this space (Chromatic, Percy) keeps them server-side for
  // the same reason.
  //
  // Content addressing is what makes it affordable: a shot that does not change costs zero new bytes,
  // forever. Storage grows with CHANGE, not with island count, so a thousand snapshot runs over a
  // hundred unchanged islands add nothing.
  //
  // ACCEPTED IS A DECISION, not a file write. `--update` overwriting everything is why "the baseline is
  // stale" and "you broke something" are the same red today; an accepted pointer that someone moved
  // deliberately separates them.

  /** `<island>/<scenario>@<viewport>` — one shot's identity within a repo. */
  function shotEntry(repo, island, shot) {
    const byRepo = (index.baselines[repo] ??= {});
    const byIsland = (byRepo[island] ??= {});
    return (byIsland[shot] ??= { accepted: null, acceptedAt: null, history: [], lastSeen: null });
  }

  /**
   * Record what a run rendered. This does NOT move the baseline — it stores the bytes and reports how
   * they compare, leaving the decision to a human or to an explicit accept.
   */
  function putShot(repo, island, shot, bytes, { sha = null, branch = null } = {}) {
    const hash = hashBytes(bytes);
    const file = blobPath(hash);
    const deduped = existsSync(file);
    if (!deduped) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    index.blobs[hash] = { bytes: bytes.length, createdAt: index.blobs[hash]?.createdAt ?? nowIso() };

    const entry = shotEntry(repo, island, shot);
    entry.lastSeen = { hash, at: nowIso(), sha, branch };
    if (!entry.history.includes(hash)) entry.history.unshift(hash);
    // Bounded: enough to look back at what it used to be, not a full archive.
    entry.history = entry.history.slice(0, 10);

    const status = !entry.accepted ? 'new' : entry.accepted === hash ? 'match' : 'changed';
    save();
    return { hash, bytes: bytes.length, deduped, status, accepted: entry.accepted };
  }

  /** Move the accepted pointer to what was last seen (or to an explicit hash). */
  function acceptShot(repo, island, shot, hash = null) {
    const entry = index.baselines[repo]?.[island]?.[shot];
    if (!entry) return null;
    const target = hash ?? entry.lastSeen?.hash;
    if (!target || !index.blobs[target]) return null;
    entry.accepted = target;
    entry.acceptedAt = nowIso();
    save();
    return { island, shot, accepted: target };
  }

  /** Every shot of a repo, with its status — what a review page and the CLI both read. */
  function listShots(repo, island = null) {
    const byIsland = index.baselines[repo] ?? {};
    const out = [];
    for (const [isl, shots] of Object.entries(byIsland)) {
      if (island && isl !== island) continue;
      for (const [shot, e] of Object.entries(shots)) {
        out.push({
          island: isl,
          shot,
          accepted: e.accepted,
          acceptedAt: e.acceptedAt,
          last: e.lastSeen,
          status: !e.accepted ? 'new' : e.lastSeen?.hash === e.accepted ? 'match' : 'changed',
        });
      }
    }
    return out.sort((a, b) => a.island.localeCompare(b.island) || a.shot.localeCompare(b.shot));
  }

  // --- composition ------------------------------------------------------------------------------

  /**
   * Define a group.
   *
   * Either an explicit list of `{repo, slug}`, or `all: true` — meaning EVERY repository, resolved
   * when the group is assembled rather than when it was defined.
   *
   * `--all` always claimed the second thing ("the host already knows which repositories have
   * published, so the gallery does not need to be maintained by hand") and did the first: it read
   * `/api/repos` once and froze the answer. A group called `everything` then held three repositories
   * out of four, and the only way to notice was to count them.
   */
  function putGroup(name, spec) {
    const { members = [], all = false, exclude = [] } = Array.isArray(spec) ? { members: spec } : (spec ?? {});
    index.groups[name] = { members, all, exclude, updatedAt: nowIso() };
    save();
    return index.groups[name];
  }

  function getGroup(name) {
    return index.groups[name] ?? null;
  }

  /**
   * A group's members AS OF NOW: the `all` expansion first (in repo order), then anything named
   * explicitly that it did not already cover, minus the exclusions.
   *
   * A repo with no `all` switcher entry contributes its first slug instead, so a project that only
   * ever publishes one focused archipelago is not silently left out of a composed view.
   */
  function membersOf(group) {
    const out = [];
    if (group.all) {
      for (const r of listRepos()) {
        const slug = r.slugs.includes('all') ? 'all' : r.slugs[0];
        if (slug) out.push({ repo: r.repo, slug, ref: 'latest' });
      }
    }
    for (const m of group.members ?? []) {
      if (!out.some((x) => x.repo === m.repo && x.slug === m.slug)) out.push({ ref: 'latest', ...m });
    }
    // A bare exclusion (no slug) drops every slug of that repo — the same rule `--remove` uses.
    return out.filter((m) => !(group.exclude ?? []).some((e) => e.repo === m.repo && (!e.slug || e.slug === m.slug)));
  }

  /**
   * A group's members AS THEY WOULD BE SERVED RIGHT NOW.
   *
   * The same expansion `snapshot` uses, but resolved for the mutable axis: each member carries its
   * latest published hash if it has one, and a `live` endpoint if something is currently serving it
   * with `motu lagoon serve --watch`. A member that is live but has never published is still a member
   * — that is the whole point of the live axis, and pinning is what needs a published build, not
   * looking.
   */
  function resolveGroup(name, endpointFor) {
    const group = getGroup(name);
    if (!group) return [];
    const out = [];
    for (const m of membersOf(group)) {
      const rec = resolveRef(m.repo, m.ref || 'latest', m.slug);
      const liveUrl = endpointFor ? endpointFor(m.repo, m.slug) : null;
      if (!rec && !liveUrl) continue;
      out.push({
        repo: m.repo,
        slug: m.slug,
        hash: rec?.hash ?? null,
        title: rec?.title ?? m.slug,
        sha: rec?.sha ?? null,
        live: liveUrl,
      });
    }
    return out;
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
    for (const m of membersOf(group)) {
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
      brand: entry.brand ?? null,
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
    // The EFFECTIVE members, so a caller counting them counts what the group actually composes. An
    // `all` group reporting its stored (empty) list is how a gallery of four reads as a gallery of none.
    return Object.entries(index.groups).map(([name, g]) => ({ name, all: !!g.all, members: membersOf(g) }));
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

  // --- coverage ------------------------------------------------------------------------------
  //
  // Small, sparse and per repo: motu's own review console reaches 7 states out of ~2,900 possible
  // ones. Kept as files beside the objects rather than in the index, so a corpus cannot bloat the one
  // document every request reads, and so a stale one is a file to delete.

  // `root`, NEVER `dir`. `dir` is openStore's raw parameter and is undefined whenever the directory
  // came from MOTU_HOST_DIR — which is how the service runs. `resolve(undefined, …)` throws, so these
  // three lines answered every coverage request with a 500 while the pages carried on working. The
  // same mistake, in the same shape, as the access loader: only `root` has been resolved.
  /** Where one declaration's corpus lives. Nested so a repo id with an owner segment stays a path. */
  function coveragePath(repo, region, keysHash) {
    return resolve(root, 'coverage', repo, region, `${keysHash}.json`);
  }

  /**
   * Fold an incoming corpus into the stored one for its declaration.
   *
   * BUCKETED BY `keysHash`, never mixed across it: a corpus recorded against a different key list is
   * not comparable to this one, and folding the two would produce counts that mean nothing. Add a key
   * to a region and its old rows simply stop being written to — visible, and one file to delete.
   */
  function mergeCoverage(repo, region, incoming) {
    const keysHash = String(incoming.keysHash ?? '').trim() || 'unstamped';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keysHash)) throw new Error('keysHash must be [A-Za-z0-9_-]');
    const file = coveragePath(repo, region, keysHash);
    let stored = null;
    if (existsSync(file)) {
      try {
        stored = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        // A corrupt corpus is a worklist nobody can read, not data anyone is owed. Start it again
        // rather than refuse every write from now on.
        stored = null;
      }
    }
    const merged = stored ? mergeCorpora([stored, incoming]) : incoming;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(merged), 'utf8');
    renameSync(tmp, file);
    return { states: merged.entries.length, keysHash };
  }

  /** Where a declaration's ACCEPTED set lives, beside the corpus it is about. */
  function acceptedPath(repo, region, keysHash) {
    return resolve(root, 'coverage', repo, region, `${keysHash}.accepted.json`);
  }

  /**
   * The fingerprints somebody has looked at and chosen not to preview.
   *
   * A SEPARATE FILE FROM THE CORPUS, and separate on purpose. "This happened" and "we decided this
   * needs no scenario" are different claims by different authors — one is written by browsers, the
   * other by a person — and folding them into one document would let an ingest write promote its own
   * states to accepted. The corpus is a worklist; this is the part of it somebody has closed.
   */
  function readAccepted(repo, region, keysHash) {
    const file = acceptedPath(repo, region, keysHash);
    if (!existsSync(file)) return [];
    try {
      const ids = JSON.parse(readFileSync(file, 'utf8'));
      return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
    } catch {
      // Unreadable means "nobody has accepted anything", which costs one extra beacon and never a
      // wrong silence — the failure that matters here is claiming a state is known when it is not.
      return [];
    }
  }

  /** Add to the accepted set. Idempotent, and never removes — see `forgetAccepted`. */
  function acceptCoverage(repo, region, keysHash, ids) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(keysHash))) throw new Error('keysHash must be [A-Za-z0-9_-]');
    const merged = [...new Set([...readAccepted(repo, region, keysHash), ...ids.filter((i) => typeof i === 'string')])];
    const file = acceptedPath(repo, region, keysHash);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(merged), 'utf8');
    renameSync(tmp, file);
    return { accepted: merged.length };
  }

  /**
   * Every declaration's corpus for a region, newest declaration first.
   *
   * Returns them separately rather than merged: they are not comparable, and a reader deciding which
   * one is current needs to see that there is more than one.
   */
  function readCoverage(repo, region) {
    const base = resolve(root, 'coverage', repo, region);
    if (!existsSync(base)) return [];
    const out = [];
    for (const name of readdirSync(base)) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(readFileSync(resolve(base, name), 'utf8')));
      } catch {
        // skipped: see mergeCoverage
      }
    }
    return out.sort((a, b) => (b.entries?.length ?? 0) - (a.entries?.length ?? 0));
  }

  return {
    root,
    maxRecords,
    maxBytes,
    mergeCoverage,
    readCoverage,
    readAccepted,
    acceptCoverage,
    publish,
    resolveRef,
    read,
    readHash,
    putShot,
    acceptShot,
    listShots,
    putGroup,
    getGroup,
    snapshot,
    manifest,
    listRepos,
    listRepo,
    listGroups,
    resolveGroup,
    stats,
    sweepRepo,
    save,
  };
}
