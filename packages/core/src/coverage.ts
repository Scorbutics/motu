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

import { archipelagoConfigs, getArchipelagoStore, bindEntries, writtenKeys } from './archipelago';

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

  let sent = 0;
  const flush = () => {
    if (!opts.sink) return;
    const corpus = recorder.corpus(regionId);
    // Nothing new since the last flush: a beacon that repeats itself is pure cost.
    if (corpus.entries.length === sent) return;
    sent = corpus.entries.length;
    try {
      opts.sink(corpus);
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
  /** Where a corpus is posted. Absent means fold in memory and send nothing. */
  endpoint?: string;
  /** Region ids to watch. Absent means every region. */
  regions?: readonly string[];
}

let coverageConfig: CoverageConfig = {};
let sandbox = false;
const installed = new Map<string, RegionCoverageHandle>();

/** Apply the project's coverage configuration. Called by the generated registry; idempotent. */
export function configureCoverage(config: CoverageConfig): void {
  coverageConfig = config ?? {};
}

/**
 * THIS IS THE LAGOON. Called by both lagoon entries, and the reason it is a framework rule rather
 * than a config field.
 *
 * `enabled: true` lives in a committed file, so it is true in the lagoon too — and a lagoon that
 * beacons records exactly the states the FLOWS produce and posts them into the corpus. The next
 * comparison then reports those states as covered in production. The tool would silently validate
 * itself, and the report would look better rather than broken, which is the worst way for a check to
 * fail. No configuration should be able to arrange that.
 *
 * The FOLD is still allowed here: it costs nothing and a preview that knows which states it reached
 * is useful. Only egress is refused.
 */
export function markCoverageSandbox(): void {
  sandbox = true;
}

/** Whether egress is permitted. False in the lagoon, and false with nowhere to send anything. */
export function coverageEgressAllowed(): boolean {
  return !sandbox && !!coverageConfig.endpoint;
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
  const handle = observeRegionCoverage(regionId, {
    enums: opts.enums,
    sink: coverageEgressAllowed() ? beaconSink(coverageConfig.endpoint!) : undefined,
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
