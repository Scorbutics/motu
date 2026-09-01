// WHAT THE REGION ON SCREEN HAS ACTUALLY BEEN, against what it is being previewed as.
//
// Every other section of the lens reads the region's DECLARATION and the region as it is running.
// This one adds the only input neither of those contains: a corpus of the states production reached,
// folded from beacons and baked into the build by `motu archipelago coverage <id> --save`.
//
// WHY THIS BELONGS IN THE LENS AND NOT ONLY IN THE CLI. `motu archipelago coverage` compares a corpus to
// the region's FLOWS — a file to a file, and a fine answer to "what should we preview?". It cannot
// answer the question a person standing in front of the lagoon actually has, because it has no
// running region: *is the state I am looking at right now one that happens?* A scenario that renders
// beautifully in a state production never reaches is the fixture-inventing-a-vocabulary failure, and
// it passes every check motu has. Here it is one line.
//
// THE CORPUS IS DATA, NEVER AN ADDRESS. It arrives as a build constant read from a file the CLI
// sanitised; nothing here fetches, and there is no URL or token to leak into a published page.
import { fingerprintRegion, fingerprintId, type CoverageCorpus, type CoverageEntry, type RegionFingerprint, type KeyState } from '@motu/coverage';

declare const __MOTU_CORPUS__: Record<string, CoverageCorpus> | undefined;

/** The baked corpora, by region. `{}` in any build that has none — which is most of them. */
export function corpora(): Record<string, CoverageCorpus> {
  return typeof __MOTU_CORPUS__ === 'undefined' ? {} : (__MOTU_CORPUS__ ?? {});
}

export function corpusFor(regionId: string | null): CoverageCorpus | null {
  if (!regionId) return null;
  return corpora()[regionId] ?? fetched.get(regionId) ?? null;
}

// --- the corpus this host already holds -------------------------------------------------------
//
// A published lagoon is served BY the lagoon host, so it can ask that host about itself on its OWN
// origin: no address in the page, and no credential — whoever is reading was already let in (or not)
// by the same cookie that opened the page. That is what lets a corpus reach a published lagoon
// without the page carrying either of the two things it must never carry.
//
// The baked corpus still wins. `motu archipelago coverage --save` writes a file the build inlines, which
// is what makes `lagoon dev` on a laptop work at all — there is no host in front of it to ask.

const fetched = new Map<string, CoverageCorpus>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

/** The repo this page belongs to — stamped by the host as it served the bytes. */
function servedRepo(): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLMetaElement>('meta[name="motu-repo"]')?.content?.trim() || null;
}

/**
 * Ask the host for this region's corpus, at most once per region per page.
 *
 * NOTHING HERE MAY THROW INTO THE LENS. A panel that disappears because a fetch failed is worse than
 * a panel with one section missing, and this runs in a browser where the host may be a tunnel that is
 * simply not up.
 */
export function ensureCorpus(regionId: string | null): void {
  if (!regionId || asked.has(regionId)) return;
  if (corpora()[regionId]) return; // baked at build time; nothing to ask
  const repo = servedRepo();
  if (!repo) return; // not served by a host — `lagoon dev`, or a page opened from disk
  asked.add(regionId);
  const url = `/api/coverage?repo=${encodeURIComponent(repo)}&region=${encodeURIComponent(regionId)}`;
  void fetch(url, { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (!body?.corpus?.entries) return;
      fetched.set(regionId, body.corpus as CoverageCorpus);
      version++;
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // The host is not answering. The section renders nothing, which is the honest outcome.
    });
}

/** Subscribe to corpora arriving — the lens re-reads when one does. */
export function subscribeCorpus(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** A version number, so `useSyncExternalStore` has something stable to compare. */
export function corpusVersion(): number {
  return version;
}

export interface LiveCoverage {
  /** This region's state right now, as the same fold production records. */
  fingerprint: RegionFingerprint;
  id: string;
  /** The corpus row for this exact state, when production has been in it. */
  entry: CoverageEntry | null;
  /** This state's share of everything recorded, 0 when it was never recorded. */
  share: number;
  /** Total occurrences across the corpus — the denominator, worth showing so a share means something. */
  total: number;
  /**
   * The corpus was recorded against a DIFFERENT set of keys than the region now declares.
   *
   * Reported rather than worked around: a fingerprint over seven keys is not comparable to one over
   * eight, so every verdict below it would be confidently wrong. Naming both sides is the only useful
   * thing to say.
   */
  drift: { onlyRecorded: string[]; onlyDeclared: string[] } | null;
  /** Recorded states ranked by share, richest first — the worklist, next to the region it is about. */
  ranked: Array<{ entry: CoverageEntry; id: string; share: number; diff: string; current: boolean }>;
}

/**
 * Fold the live region and place it in the corpus.
 *
 * `enums` is deliberately not guessed. A key whose VALUE is kept is one the archipelago declared a
 * closed set; taking the value of anything else would put a customer's data on a preview page.
 */
export function liveCoverage(
  corpus: CoverageCorpus,
  /**
   * What the region declares TODAY. Separate from `corpus.keys` on purpose, and the whole point of
   * the drift check: the fold below must run over the CORPUS' keys or the fingerprints are not
   * comparable, while the question "is this corpus still about this region?" can only be answered
   * against the live declaration. Passing one list for both jobs makes the check compare a list to
   * itself and report no drift, ever — which is exactly what it did until a region declaring
   * `selectedShot` was placed against a corpus recording `error` and the notice stayed silent.
   */
  declaredKeys: readonly string[],
  read: (key: string) => unknown,
  enums: readonly string[] = [],
): LiveCoverage {
  const fingerprint = fingerprintRegion(corpus.keys, read, { enums });
  const id = fingerprintId(fingerprint);
  const total = corpus.entries.reduce((n, e) => n + e.count, 0) || 0;
  const entry = corpus.entries.find((e) => fingerprintId(e.fingerprint) === id) ?? null;

  const recorded = new Set(corpus.keys);
  const declared = new Set(declaredKeys);
  const onlyRecorded = corpus.keys.filter((k) => !declared.has(k));
  const onlyDeclared = declaredKeys.filter((k) => !recorded.has(k));
  const drift = onlyRecorded.length || onlyDeclared.length ? { onlyRecorded, onlyDeclared } : null;

  const ranked = corpus.entries
    .map((e) => {
      const eid = fingerprintId(e.fingerprint);
      return {
        entry: e,
        id: eid,
        share: total ? e.count / total : 0,
        diff: diffAgainst(fingerprint, e.fingerprint),
        current: eid === id,
      };
    })
    .sort((a, b) => b.share - a.share);

  return { fingerprint, id, entry, share: entry && total ? entry.count / total : 0, total, drift, ranked };
}

/**
 * How a recorded state differs from the one on screen — only the keys that disagree.
 *
 * The whole fingerprint is unreadable at a glance and mostly identical row to row; the deviation is
 * the part that tells you what to preview next. Same reasoning as the CLI report's per-row diff.
 */
function diffAgainst(current: RegionFingerprint, other: RegionFingerprint): string {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(other)])].sort();
  const parts: string[] = [];
  for (const k of keys) {
    const a = current[k] as KeyState | undefined;
    const b = other[k] as KeyState | undefined;
    if (a !== b) parts.push(`${k}:${b ?? 'absent'}`);
  }
  return parts.join(' ');
}
