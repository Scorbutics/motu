// WHICH STATES A REGION HAS ACTUALLY BEEN IN.
//
// The question this answers is the one the lagoon structurally cannot: not "does the region do what
// it declares" — every check already asks that — but "is what it declares the set of things that
// HAPPEN". A scenario set describes the states someone thought of. Production is the only witness to
// the ones nobody did, and it is the environment that runs without anybody watching.
//
// WHY A FINGERPRINT AND NOT A RECORDING. Recording responses means recording customer data, in
// unbounded volume, in a vocabulary that does not match a scenario — so comparing the two would be
// guesswork even if you were willing to store it. A region is different, and this is the one place
// motu's own design pays a dividend it could not otherwise: the archipelago DECLARES its keys, so the
// state space is enumerable and small. Reduce each key to a CATEGORY and a region's state becomes a
// short row of words. Two consequences fall out for free:
//
//   * there is nothing to flood. You accumulate distinct STATES, not events — the ten-thousandth user
//     in the same state increments an integer.
//   * there is almost nothing to leak. `criteria: set`, never the criteria. A value only survives for
//     a key the caller explicitly allowlists as an enum, and only if it is short.
//
// And the comparison is apples to apples, because a SCENARIO is also a seed of region keys. The same
// function fingerprints both sides.

/**
 * What a key holds, reduced to something safe to count.
 *
 * `absent` and `null` are deliberately different: a key nothing has ever written and a key explicitly
 * emptied are different states of a region, and conflating them hides the one that usually breaks.
 * Booleans keep their value because a boolean cannot identify anybody and `busy: true` is exactly the
 * kind of state nobody writes a scenario for.
 */
export type KeyState = 'absent' | 'null' | 'empty' | 'set' | 'true' | 'false' | `= ${string}`;

/** One region state: every declared key, categorised. */
export type RegionFingerprint = Record<string, KeyState>;

export interface FingerprintOptions {
  /**
   * Keys whose VALUE may be kept, because it is a closed set the application chose — `viewMode`,
   * `status`, a tab name. Opt-in per key, never inferred: motu cannot tell an enum from an email by
   * looking at one string, and guessing wrong writes a customer's data into a coverage report.
   */
  enums?: readonly string[];
  /** Longest enum value kept verbatim. Anything longer is `set` — a long string is not a closed set. */
  maxEnumLength?: number;
}

const DEFAULT_MAX_ENUM = 32;

/** Reduce one value to its category. Exported for the same reason the fingerprint is: both sides use it. */
export function keyState(value: unknown, keepValue = false, maxEnumLength = DEFAULT_MAX_ENUM): KeyState {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    if (value === '') return 'empty';
    return keepValue && value.length <= maxEnumLength ? `= ${value}` : 'set';
  }
  if (typeof value === 'number') return keepValue ? `= ${value}` : 'set';
  if (Array.isArray(value)) return value.length ? 'set' : 'empty';
  if (typeof value === 'object') return Object.keys(value as object).length ? 'set' : 'empty';
  return 'set';
}

/**
 * Fingerprint a region state.
 *
 * `keys` is the DECLARATION — the archipelago's own key list — not whatever happens to be in the
 * store. That is what bounds the output and what makes two fingerprints comparable: a state is a row
 * with one column per declared key, always the same columns, so a corpus and a scenario set line up
 * without any reconciliation step.
 */
export function fingerprintRegion(
  keys: readonly string[],
  read: (key: string) => unknown,
  opts: FingerprintOptions = {},
): RegionFingerprint {
  const enums = new Set(opts.enums ?? []);
  const max = opts.maxEnumLength ?? DEFAULT_MAX_ENUM;
  const out: RegionFingerprint = {};
  for (const key of [...keys].sort()) out[key] = keyState(read(key), enums.has(key), max);
  return out;
}

/** A fingerprint as one stable line — the identity a corpus counts by, and what a report prints. */
export function fingerprintId(fp: RegionFingerprint): string {
  return Object.keys(fp)
    .sort()
    .map((k) => `${k}:${fp[k]}`)
    .join(' ');
}

/** The corpus format. Bumped when a reader could misread an older one, never for an addition. */
export const CORPUS_VERSION = 1;

/**
 * A short stable stamp for a DECLARATION — the sorted key list a corpus was recorded against.
 *
 * The `keys` array already carries this and `mergeCorpora` already compares it, so nothing is proved
 * by the hash that the array does not prove. What it buys is a place to PUT it: a server upserting on
 * `(region, keysHash, fingerprint)` buckets automatically, so the deploy that adds a key starts a new
 * bucket instead of silently mixing states that fingerprint differently — and the old bucket becomes
 * a thing you can drop in one statement rather than a set you would have to reason about.
 *
 * It is also what makes drift cheap to CHECK. Comparing declarations otherwise means pulling the
 * corpus; comparing eight characters does not.
 *
 * FNV-1a, not a crypto hash: this identifies a declaration, it does not protect one, and a dependency
 * would be a strange price for eight characters.
 */
export function keysHash(keys: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of [...keys].sort().join('\u0000')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** One state, and how much of it there was. */
export interface CoverageEntry {
  fingerprint: RegionFingerprint;
  /** How many times this state was entered. Not how many users — a fold, not a log. */
  count: number;
  /** First and last time it was seen, as epoch ms. Enough to tell "still happening" from "used to". */
  firstAt: number;
  lastAt: number;
}

export interface CoverageCorpus {
  /**
   * Format version. Present because a corpus now crosses a PROCESS boundary — written by a browser,
   * merged by something else, read by the CLI — and the three can be deployed at different times. A
   * merge that silently folds two incompatible shapes is worse than one that refuses.
   */
  v?: number;
  /** Which DECLARATION this was recorded against — see `keysHash`. Absent in a v1 corpus written
   *  before the stamp existed, which is why every reader falls back to comparing `keys`. */
  keysHash?: string;
  regionId: string;
  /** Declared keys at the time of recording — a corpus taken against a different declaration is not
   *  comparable, and this is what lets the check say so instead of reporting nonsense. */
  keys: string[];
  entries: CoverageEntry[];
}

/**
 * The fold. Bounded by construction, and by a cap for the case the bound is wrong.
 *
 * `limit` is not expected to bind: the state space is the product of the declared keys' categories,
 * which for a seven-key region is dozens of rows in practice. It exists because "in practice" is
 * doing work in that sentence — one allowlisted enum with more members than its author remembered
 * would otherwise grow this without limit in the one environment nobody is watching.
 */
export class CoverageRecorder {
  #seen = new Map<string, CoverageEntry>();
  #dropped = 0;

  constructor(
    private readonly keys: readonly string[],
    private readonly opts: FingerprintOptions & { limit?: number } = {},
  ) {}

  /** Record the state the region is in now. Cheap enough to call on every store change. */
  record(read: (key: string) => unknown, at: number): void {
    const fp = fingerprintRegion(this.keys, read, this.opts);
    const id = fingerprintId(fp);
    const hit = this.#seen.get(id);
    if (hit) {
      hit.count++;
      hit.lastAt = at;
      return;
    }
    if (this.#seen.size >= (this.opts.limit ?? 500)) {
      this.#dropped++;
      return;
    }
    this.#seen.set(id, { fingerprint: fp, count: 1, firstAt: at, lastAt: at });
  }

  /** How many distinct states were refused by the cap. Non-zero means the corpus is INCOMPLETE. */
  get dropped(): number {
    return this.#dropped;
  }

  corpus(regionId: string): CoverageCorpus {
    return {
      v: CORPUS_VERSION,
      keysHash: keysHash(this.keys),
      regionId,
      keys: [...this.keys].sort(),
      entries: [...this.#seen.values()].sort((a, b) => b.count - a.count),
    };
  }
}

export interface CoverageFinding {
  fingerprint: RegionFingerprint;
  id: string;
  count: number;
  /** This state's share of everything recorded — what decides whether it is worth a scenario. */
  share: number;
  /**
   * What distinguishes this state from the nearest previewed one — the line worth printing.
   *
   * A systemic key is suppressed here ONLY where this row carries its ordinary value. Suppressing it
   * outright was the first attempt and it deleted the finding: `busy` is systemic (no flow shows it at
   * all), production is mostly `busy:false`, and the row that mattered was the 13% at `busy:true` —
   * which came out looking identical to the rows around it. The ordinary value is noise repeated on
   * every line; the deviation is the point.
   */
  diff: string;
}

export interface CoverageReport {
  /** Recorded states no scenario produces. THE finding: what the region does that nobody previewed. */
  uncovered: CoverageFinding[];
  /** Scenario states never recorded. Weak — rare, seasonal or aspirational states look like this. */
  unreachable: string[];
  /** States present on both sides. */
  covered: number;
  /** Recorded against a different key set: the two sides are not comparable and the caller must say so. */
  keysDiffer: { onlyRecorded: string[]; onlyDeclared: string[] } | null;
  /**
   * Keys that differ the SAME WAY in every uncovered state — one cause, not many findings.
   *
   * Found by running this for the first time. The review console's flows seed four of seven keys; its
   * application seeds all seven. So `busy` and `error` are `absent` in every previewed state and
   * present in every real one, every recorded row came back uncovered, and the ranked list repeated
   * `busy:false error:null` eight times. All true, and useless — the reader has to notice the pattern
   * themselves before the report means anything.
   *
   * Surfaced separately, and subtracted from the per-row diffs, because it is a different KIND of
   * finding: not "this state was never previewed" but "no state was previewed in the shape the
   * application actually creates".
   */
  systemic: { key: string; recorded: KeyState; scenarios: KeyState[] }[];
}

/**
 * Compare what happened against what was previewed.
 *
 * RANKED BY SHARE, and that is not presentation. Production always holds states a scenario set does
 * not, so a report that lists all of them is noise on the first run and ignored on the second — the
 * same way a permanently red check teaches people to stop reading it. The number that decides whether
 * a state deserves a scenario is how much of the traffic is in it.
 */
export function compareCoverage(
  corpus: CoverageCorpus,
  scenarioStates: readonly RegionFingerprint[],
  declaredKeys: readonly string[],
): CoverageReport {
  const declared = [...declaredKeys].sort();
  const onlyRecorded = corpus.keys.filter((k) => !declared.includes(k));
  const onlyDeclared = declared.filter((k) => !corpus.keys.includes(k));
  const keysDiffer = onlyRecorded.length || onlyDeclared.length ? { onlyRecorded, onlyDeclared } : null;

  const scenarioIds = new Set(scenarioStates.map(fingerprintId));
  const total = corpus.entries.reduce((n, e) => n + e.count, 0) || 1;

  const uncovered: CoverageFinding[] = [];
  let covered = 0;
  for (const e of corpus.entries) {
    const id = fingerprintId(e.fingerprint);
    if (scenarioIds.has(id)) {
      covered++;
      continue;
    }
    uncovered.push({ fingerprint: e.fingerprint, id, count: e.count, share: e.count / total, diff: '' });
  }
  uncovered.sort((a, b) => b.count - a.count);

  const recordedIds = new Set(corpus.entries.map((e) => fingerprintId(e.fingerprint)));
  const unreachable = [...scenarioIds].filter((id) => !recordedIds.has(id));

  // A key is SYSTEMIC when the two sides are DISJOINT on it: the scenarios have never shown this key
  // in ANY state production produces. Not "every uncovered row agrees on it" — that was the first
  // rule and it was too strict, because production shows `busy` both true and false while the flows
  // show it neither way. Disjointness is the property that actually means "one cause": no amount of
  // picking a different scenario to compare against gets you closer on this key.
  const systemic: CoverageReport['systemic'] = [];
  for (const key of declared) {
    const inScenarios = [...new Set(scenarioStates.map((s) => s[key]))].filter(Boolean) as KeyState[];
    const inRecorded = [...new Set(uncovered.map((u) => u.fingerprint[key]))].filter(Boolean) as KeyState[];
    if (!inRecorded.length) continue;
    if (inRecorded.some((v) => inScenarios.includes(v))) continue;
    systemic.push({ key, recorded: inRecorded.join(' | ') as KeyState, scenarios: inScenarios });
  }

  // The per-row line, computed here so a caller cannot wire the three pieces together wrongly: the
  // modal value of each systemic key is the one that repeats on every row and says nothing.
  const modal = new Map<string, KeyState>();
  for (const { key } of systemic) {
    const tally = new Map<KeyState, number>();
    for (const u of uncovered) {
      const v = u.fingerprint[key];
      if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + u.count);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) modal.set(key, top[0]);
  }
  for (const u of uncovered) {
    u.diff = diffFromNearest(
      u.fingerprint,
      scenarioStates,
      systemic.filter(({ key }) => u.fingerprint[key] === modal.get(key)).map(({ key }) => key),
    );
  }

  return { uncovered, unreachable, covered, keysDiffer, systemic };
}

/**
 * What makes an uncovered state READABLE: only the columns that differ from what the scenarios show.
 *
 * A seven-key row is already hard to scan and a real region has more. Almost every uncovered state
 * differs from a covered one in one or two keys — `error: set`, `busy: true` — and printing the other
 * five buries the answer in things the reader already agrees with.
 */
export function diffFromNearest(
  fp: RegionFingerprint,
  scenarioStates: readonly RegionFingerprint[],
  /** Keys already reported as systemic. Subtracted here so each row shows what is left. */
  ignore: readonly string[] = [],
): string {
  if (!scenarioStates.length) return fingerprintId(fp);
  const skip = new Set(ignore);
  let best: { diff: string[]; n: number } | null = null;
  for (const s of scenarioStates) {
    const diff = Object.keys(fp)
      .filter((k) => !skip.has(k) && s[k] !== fp[k])
      .map((k) => `${k}:${fp[k]}`);
    if (!best || diff.length < best.n) best = { diff, n: diff.length };
  }
  // Everything that differed was systemic: the row IS the systemic cause, nothing else distinguishes it.
  return best && best.diff.length ? best.diff.join(' ') : '(differs only in the systemic keys above)';
}

// --- THE BEACON ----------------------------------------------------------------------------------

import { archipelagoConfigs, getArchipelagoStore, bindEntries, writtenKeys, isSandbox, setRegionCoverageInstaller } from '@motu/core';

/**
 * Every region key the archipelago declares: what islands READ (bind), what they PRODUCE (writes),
 * what a `reads` claim names, and what a declared source promises.
 *
 * Derived rather than configured, for the same reason the fingerprint's columns are the declaration:
 * a key list someone maintains by hand drifts from the region, and a corpus recorded against a drifted
 * list is not comparable to anything. `compareCoverage` can then SAY the two sides disagree instead of
 * quietly reporting nonsense.
 */
export function declaredRegionKeys(regionId: string): string[] {
  const config = archipelagoConfigs().find((c) => c.id === regionId) as
    | { islands?: { bind?: unknown; reads?: readonly string[] }[]; sources?: Record<string, { produces?: readonly string[] }> }
    | undefined;
  if (!config) return [];
  const keys = new Set<string>();
  for (const island of config.islands ?? []) {
    for (const [, key] of bindEntries(island as never)) keys.add(key);
    for (const key of writtenKeys(island as never)) keys.add(key);
    for (const key of island.reads ?? []) keys.add(key);
  }
  for (const source of Object.values(config.sources ?? {})) {
    for (const key of source.produces ?? []) keys.add(key);
  }
  return [...keys].sort();
}

export interface RegionCoverageOptions extends FingerprintOptions {
  /** Override the derived key list. Rarely right — see `declaredRegionKeys`. */
  keys?: readonly string[];
  /** Distinct-state cap. See CoverageRecorder. */
  limit?: number;
  /** Where a corpus goes when it is flushed. Omit to keep it in memory and read it yourself. */
  sink?: (corpus: CoverageCorpus) => void;
  /**
   * Fingerprints already accounted for — covered by a flow, or accepted by someone who looked. A
   * state in here is not a finding, so it is never sent. This is what turns the steady state into
   * zero requests rather than merely fewer.
   */
  known?: ReadonlySet<string>;
  /**
   * Remember what this browser has already reported, so a returning visitor does not re-send a state
   * on every visit. Turns "novel per session" into "novel per browser", which is both cheaper and the
   * more useful denominator.
   */
  remember?: boolean;
  /**
   * Hard cap on beacons per session. Not expected to bind — a session cannot reach many novel states
   * — but the environment this runs in is the one nobody is watching, and a cap is cheaper than
   * finding out.
   */
  maxReports?: number;
  /**
   * Where the CURRENT known set comes from, when it should not be frozen at build time.
   *
   * `known` ships with the bundle and therefore only shrinks the traffic when you redeploy. A source
   * is asked once per session and can answer from anywhere — a cached GET, a file, a value the host
   * already had — so a state that gets accepted stops being reported without a release.
   *
   * A FUNCTION, not a URL, for the same reason `StoreAdapter` is a pair of functions and not a
   * database: motu asks the question and the application answers it however it likes. Nothing here
   * knows what a bucket is.
   *
   * Best-effort by construction. A source that throws or never resolves leaves the build-time set in
   * place, which is the behaviour without one.
   */
  knownSource?: () => Promise<readonly string[]> | readonly string[];
  /** Also flush on a timer. Off by default: the page-leave flush is enough and costs nothing idle. */
  flushEveryMs?: number;
}

export interface RegionCoverageHandle {
  /** The corpus so far. Safe to call any time. */
  corpus(): CoverageCorpus;
  /** Send what has accumulated, if there is anything and a sink to send it to. */
  flush(): void;
  /** Unsubscribe and stop flushing. Does NOT flush — call it first if you want what is held. */
  stop(): void;
}

/**
 * Watch a region and fold every state it enters.
 *
 * OFF UNLESS CALLED, and it should stay behind whatever build constant the host already uses to strip
 * dev code — this is the one piece of motu designed to run in production, and a thing that runs in
 * production has to be a thing someone switched on.
 *
 * COALESCED TO THE END OF THE TURN. A handler that writes three keys passes through two states that
 * never reached a screen, and counting them would fill the corpus with combinations nobody can
 * reproduce or write a scenario for. What is recorded is the state the region SETTLED in.
 *
 * NOTHING HERE MAY THROW INTO THE APPLICATION. A coverage probe that breaks a page is worse than no
 * coverage, so the fold and the sink are both wrapped: a corpus is a nice-to-have and the page is not.
 */
export function observeRegionCoverage(regionId: string, opts: RegionCoverageOptions = {}): RegionCoverageHandle {
  const store = getArchipelagoStore(regionId);
  const keys = opts.keys ?? declaredRegionKeys(regionId);
  const recorder = new CoverageRecorder(keys, opts);
  const noop: RegionCoverageHandle = { corpus: () => recorder.corpus(regionId), flush: () => {}, stop: () => {} };
  if (!store || !keys.length) return noop;

  let queued = false;
  const capture = () => {
    queued = false;
    try {
      recorder.record((k) => store.get(k), Date.now());
    } catch {
      // A key whose getter throws is the application's problem, not a reason to break it further.
    }
  };
  const onChange = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(capture);
  };

  capture(); // the state the region STARTS in — the one a seed establishes, and the one flows skip
  const unsubscribe = store.subscribe(onChange);

  // ONLY WHAT IS NEW — the property that makes this affordable to run on a metered backend.
  //
  // The client is told which fingerprints are already accounted for: the ones the region's flows
  // cover, plus the ones somebody looked at and accepted. That set is small (a list of short hashes)
  // and is a build-time fact, so it ships with the bundle. A state already in it is not a finding,
  // and reporting it is pure cost.
  //
  // The consequence is worth stating plainly, because it is not "fewer requests": once every state a
  // user reaches is known, THE BEACON NEVER FIRES. Cost is bounded by NOVELTY rather than by traffic
  // — a new deploy produces a burst and then silence, and a busy day on unchanged code produces
  // nothing at all. That is the axis the bill should be on.
  //
  // WHAT IT COSTS IN RETURN: in-session counts stop being the frequency signal, because a state is
  // reported once and then never again. The signal moves to how many BEACONS name a fingerprint —
  // one per browser that ever reached it — which is a better number anyway. "How many distinct people
  // hit this" is the question; "how many times did one tab re-enter it" never was.
  const remembered = (): Set<string> => {
    if (!opts.remember) return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(`motu:coverage:${regionId}`) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  };
  const reported = remembered();
  const known = new Set<string>(opts.known ?? []);
  // Asked once, merged in whenever it answers. The flush that matters happens at page-leave, so an
  // answer arriving a second later is still in time; one that never arrives costs nothing.
  if (opts.knownSource) {
    void (async () => {
      try {
        for (const id of (await opts.knownSource!()) ?? []) known.add(id);
      } catch {
        // The build-time set stands. A coverage probe does not get to care about a failed fetch.
      }
    })();
  }
  let reports = 0;

  const flush = () => {
    if (!opts.sink) return;
    if (opts.maxReports != null && reports >= opts.maxReports) return;
    const corpus = recorder.corpus(regionId);
    const novel = corpus.entries.filter((e) => {
      const id = fingerprintId(e.fingerprint);
      return !known.has(id) && !reported.has(id);
    });
    // THE ZERO-REQUEST PATH, and the common one. Nothing novel means nothing to say.
    if (!novel.length) return;
    reports++;
    for (const e of novel) reported.add(fingerprintId(e.fingerprint));
    if (opts.remember) {
      try {
        localStorage.setItem(`motu:coverage:${regionId}`, JSON.stringify([...reported]));
      } catch {
        // A browser refusing storage just means this one reports a state it already has.
      }
    }
    try {
      opts.sink({ ...corpus, entries: novel });
    } catch {
      // Egress is best-effort by construction — see `beaconSink`.
    }
  };

  // ON THE WAY OUT, which is the only moment a session's corpus is complete. `pagehide` fires where
  // `unload` is unreliable (bfcache, mobile Safari) and `visibilitychange` catches a backgrounded tab
  // that never comes back, which on a phone is most of them.
  const onLeave = () => flush();
  const onHidden = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onHidden);
  }
  const timer = opts.flushEveryMs ? setInterval(flush, opts.flushEveryMs) : null;

  return {
    corpus: () => recorder.corpus(regionId),
    flush,
    stop() {
      unsubscribe();
      if (timer) clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onLeave);
        document.removeEventListener('visibilitychange', onHidden);
      }
    },
  };
}

/**
 * A sink that posts the corpus and does not care what happens next.
 *
 * `sendBeacon` rather than `fetch`, because the flush that matters happens as the page goes away:
 * a fetch is cancelled on unload, and one kept alive with `keepalive` still competes with the
 * navigation. A beacon is queued by the browser and sent whether or not the document survives — and
 * it cannot be read, which is correct here. Nothing about a coverage corpus needs a response.
 *
 * Falls back to a keepalive fetch where `sendBeacon` is unavailable, and gives up quietly if that
 * fails too. There is no error path worth taking: the alternative to a lost corpus is a broken page.
 */
export function beaconSink(url: string): (corpus: CoverageCorpus) => void {
  return (corpus) => {
    const body = JSON.stringify(corpus);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
      void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(
        () => {},
      );
    } catch {
      /* the page is leaving; there is nowhere to report this to and nothing to do about it */
    }
  };
}

// --- CONFIGURED, NOT CALLED ----------------------------------------------------------------------

/**
 * What `motu.config.json` says about coverage, baked into the generated island registry by
 * `motu island sync` and applied by IMPORTING it — the same route `setDefaultIsolation` takes, and
 * for the same reason: importing the registry is already what a host does, so no application file
 * has to mention coverage and no host's bundler has to define a constant.
 *
 * NOT A BUILD CONSTANT, deliberately, and the difference from `__MOTU_DEBUG__` is worth stating
 * because it looks inconsistent. That flag exists so the seam lens' whole import tree DEAD-CODE
 * ELIMINATES: the lens must not ship. Coverage is meant to ship — running in production is the entire
 * point of it — so elimination is not the goal and a runtime switch is the honest mechanism.
 *
 * Only DEPLOYMENT facts live here. Whether a key is a closed set is a fact about the key, so `enums`
 * is declared on the archipelago beside the keys themselves, where it survives the region moving
 * between projects.
 */
export interface CoverageConfig {
  /** Off unless this is true. A thing that runs in production is a thing somebody switched on. */
  enabled?: boolean;
  /**
   * Where a corpus is posted. Normally ABSENT here and read from a `motu-coverage-endpoint` meta tag
   * instead — see `metaContent` for why an address must not be baked into the island registry.
   */
  endpoint?: string;
  /** Region ids to watch. Absent means every region. */
  regions?: readonly string[];
  /**
   * Fingerprints the project already knows about — generated from the region's flows plus whatever
   * was accepted. Baked in with the rest of this, so the client can stay silent about states nobody
   * needs to hear about again.
   */
  known?: readonly string[];
  /** Beacons per session, capped. Default 4. */
  maxReports?: number;
  /**
   * Where the CURRENT known set is served from — a cached GET of a JSON array of fingerprint ids.
   *
   * Optional, and orthogonal to `known`: the baked list is the offline default and this refreshes it,
   * so a state that gets accepted stops being reported without a redeploy. Anything that serves a
   * file can serve it. motu does not know or care what.
   */
  knownUrl?: string;
}

let coverageConfig: CoverageConfig = {};

/**
 * WHERE THE ADDRESSES COME FROM, and why they are not in the config.
 *
 * `motu island sync` bakes the coverage config into the generated island registry — and the LAGOON
 * imports that registry. A published lagoon is one self-contained HTML file on a host anybody can
 * reach, so anything in that config becomes a public string. Grepping a real one found exactly that:
 *
 *   wI({enabled:!0,endpoint:"/api/motu/coverage",knownUrl:"/api/motu/coverage/known",…})
 *
 * Inert there — the lagoon is a sandbox and refuses egress — but published all the same, and an
 * internal route name is not something a preview page should hand out.
 *
 * So the SWITCH is baked (it is not a secret and it must survive into production) and the ADDRESSES
 * are read from the document at runtime. A page that wants coverage renders two meta tags; the
 * lagoon renders neither, so it has nowhere to send anything even if the sandbox rule were removed.
 * Defence that does not depend on a flag being right.
 *
 *   <meta name="motu-coverage-endpoint" content="/api/motu/coverage" />
 *   <meta name="motu-coverage-known"    content="/api/motu/coverage/known" />
 */
function metaContent(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
  return value && value.trim() ? value.trim() : undefined;
}
const installed = new Map<string, RegionCoverageHandle>();

/**
 * Turn coverage on for this application — the ONE call the generated island registry makes, and the
 * only reason this package is ever imported.
 *
 * That is the whole point of it living outside `@motu/core`. Core called `installRegionCoverage`
 * unconditionally from `defineArchipelago`, which put this module in every project's graph whether or
 * not the project had enabled anything: no bundler can drop a module something calls. Here, a project
 * with coverage off never generates the import, and pays nothing.
 *
 * Core keeps only a seam — see `setRegionCoverageInstaller` — so it still knows nothing about this
 * package. The same shape as the seam lens, which core also never imports.
 */
export function configureCoverage(config: CoverageConfig): void {
  coverageConfig = config ?? {};
  setRegionCoverageInstaller((regionId, opts) => installRegionCoverage(regionId, opts));
}

/**
 * Whether egress is permitted. False in the lagoon, and false with nowhere to send anything.
 *
 * THE LAGOON RULE IS NOT A CONFIG FIELD, because no configuration should be able to arrange the
 * alternative: `enabled: true` lives in a committed file, so it is true in the lagoon too, and a
 * lagoon that beacons posts the states its own FLOWS produce into the corpus. The next comparison
 * then reports them as covered in production — the tool validating itself, with a report that looks
 * better rather than broken. `isSandbox()` is core's, set by the lagoon entries before anything
 * mounts. The FOLD still runs there; only egress is refused.
 */
export function coverageEgressAllowed(endpoint = coverageConfig.endpoint ?? metaContent('motu-coverage-endpoint')): boolean {
  return !isSandbox() && !!endpoint;
}

/**
 * Start watching a region, if the project asked for it. Called from `defineArchipelago`, which is the
 * one place both mount paths meet — so this is per-region by construction rather than by wiring, and
 * a host gets it whichever route it composes through.
 */
export function installRegionCoverage(
  regionId: string,
  opts: { enums?: readonly string[] } = {},
): RegionCoverageHandle | null {
  if (!coverageConfig.enabled) return null;
  if (coverageConfig.regions && !coverageConfig.regions.includes(regionId)) return null;
  const already = installed.get(regionId);
  if (already) return already;
  const endpoint = coverageConfig.endpoint ?? metaContent('motu-coverage-endpoint');
  const knownUrl = coverageConfig.knownUrl ?? metaContent('motu-coverage-known');
  const handle = observeRegionCoverage(regionId, {
    enums: opts.enums,
    sink: coverageEgressAllowed(endpoint) ? beaconSink(endpoint!) : undefined,
    known: new Set(coverageConfig.known ?? []),
    knownSource: knownUrl && !isSandbox() ? fetchKnown(knownUrl) : undefined,
    remember: true,
    maxReports: coverageConfig.maxReports ?? 4,
  });
  installed.set(regionId, handle);
  return handle;
}

/** Every region being watched, for a lens or a test that wants to read the fold. */
export function regionCoverage(): Map<string, RegionCoverageHandle> {
  return new Map(installed);
}

/** Forget every installed watcher. Test seam; the lagoon re-mounts regions constantly. */
export function resetRegionCoverage(): void {
  for (const h of installed.values()) h.stop();
  installed.clear();
}

// --- WHAT A BACKEND HAS TO DO, AND NOTHING ABOUT WHICH ONE --------------------------------------

/**
 * Fold corpora into one. PURE, and the whole of the server-side logic.
 *
 * Whatever collects beacons — a scheduled job over a bucket of objects, a queue consumer, a person
 * with a directory of JSON files — needs exactly this and nothing else. Keeping it here rather than
 * in an adapter is the difference between motu defining the ANSWER and motu defining the QUESTION:
 * merging fingerprint counts is arithmetic on motu's own format, and every backend would otherwise
 * reimplement it slightly differently.
 *
 * Refuses to fold corpora that disagree about the declaration. Two recordings taken against different
 * key sets are not summable — the same state has different fingerprints on each side — and a merge
 * that quietly proceeded would produce a corpus whose rows mean nothing, which no later check could
 * detect.
 */
export function mergeCorpora(corpora: readonly CoverageCorpus[]): CoverageCorpus {
  if (!corpora.length) throw new Error('motu: mergeCorpora needs at least one corpus');
  const [first] = corpora;
  const keys = first!.keys.join(',');
  const regionId = first!.regionId;
  const entries = new Map<string, CoverageEntry>();
  for (const corpus of corpora) {
    if (corpus.regionId !== regionId) {
      throw new Error(`motu: cannot merge corpora from different regions (${regionId} and ${corpus.regionId})`);
    }
    if (corpus.keys.join(',') !== keys) {
      throw new Error(
        `motu: cannot merge corpora recorded against different declarations for ${regionId}. ` +
          `One has [${keys}], another [${corpus.keys.join(',')}]. The same state fingerprints ` +
          `differently on each side, so the counts are not summable — re-record, or keep them apart.`,
      );
    }
    if ((corpus.v ?? 1) !== CORPUS_VERSION) {
      throw new Error(`motu: corpus format v${corpus.v ?? 1} cannot be merged by a v${CORPUS_VERSION} reader`);
    }
    for (const e of corpus.entries) {
      const id = fingerprintId(e.fingerprint);
      const hit = entries.get(id);
      if (!hit) {
        entries.set(id, { ...e });
        continue;
      }
      hit.count += e.count;
      hit.firstAt = Math.min(hit.firstAt, e.firstAt);
      hit.lastAt = Math.max(hit.lastAt, e.lastAt);
    }
  }
  return {
    v: CORPUS_VERSION,
    keysHash: first!.keysHash ?? keysHash(first!.keys),
    regionId,
    keys: first!.keys,
    entries: [...entries.values()].sort((a, b) => b.count - a.count),
  };
}

/**
 * The known set to publish back to clients: everything the flows cover, plus everything somebody
 * looked at and accepted.
 *
 * The other half of the round trip, and the reason it is here rather than in a backend: "known" has
 * to mean the same thing to the client suppressing a report and to the job producing the list, and
 * that agreement is a motu fact.
 *
 * THE ONE INVARIANT THAT KEEPS THE LOOP HONEST: nothing may promote a state to "known" except a flow
 * or a person. The GET/POST cycle is a SUPPRESSION loop, not a learning one — it exists so a state
 * already accounted for stops costing a request, and for no other purpose.
 *
 * It would be trivial for a merge job to pass the corpus' own fingerprints as `accepted`, and the
 * result would look like success: the report empties, the beacons stop, every state is "known". It
 * would also be the tool validating itself for the third time in this design — after the lagoon
 * beaconing its own flows, and after a fingerprint auto-expanded into a scenario. All three have the
 * same shape, which is why it is worth naming: a system that can mark its own findings resolved
 * reports nothing, and reporting nothing is indistinguishable from having nothing to report.
 *
 * `accepted` is an explicit argument for that reason. There is no way to derive it.
 */
export function knownIds(
  scenarioStates: readonly RegionFingerprint[],
  accepted: readonly RegionFingerprint[] = [],
): string[] {
  return [...new Set([...scenarioStates, ...accepted].map(fingerprintId))].sort();
}

/**
 * A `knownSource` that reads a URL. A CONVENIENCE, not a dependency — the same standing `beaconSink`
 * has. It is one `fetch` of a JSON array, so anything that can serve a file can serve it: a bucket, a
 * CDN, the application's own origin, a `public/` directory.
 *
 * Cache-friendly on purpose. This is the request that makes the steady state cheap, so it must not
 * itself become the cost: served with an ETag it is a 304 on almost every load, and served from a
 * CDN it never reaches an origin at all.
 */
export function fetchKnown(url: string): () => Promise<readonly string[]> {
  return async () => {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body.filter((v) => typeof v === 'string') as string[]) : [];
  };
}
