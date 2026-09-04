// WHAT THE LENS HAS NOTICED, as a list of named findings.
//
// The lens already derived all of this; it just showed it as tables. A table answers a question you
// already had — "what is passwordChanged doing?" — and says nothing to somebody who does not yet
// know which key to look at. These are the same facts, turned around: each one names its subject and
// says what to do about it, and carries the section of the panel it came from so the table is one
// click away rather than replaced.
//
// EVERY FINDING NAMES A SUBJECT, and that is the rule this module is built around rather than a
// style preference. "passwordChanged goes nowhere" can be contradicted by the region — either the
// key has a reader or it does not. "It renders, it is not wired" cannot be contradicted by anything,
// which is exactly why it is not trustworthy, and why there is no summary verdict in here. The panel
// shows the findings and the counts; it does not editorialise over them.
//
// SEVERITY IS CONTEXT-DEPENDENT, and getting that wrong is the same mistake one layer down. An
// island rendering entirely from its defaults means broken wiring in an application and is the
// ORDINARY case in a lagoon, where the seed is how a region is established and nothing fetches
// because the host module was replaced. `verdictOf` says as much in its own comment ("inside a real
// page"). So the sandbox is asked, and a finding that is only a defect outside one is demoted to a
// note rather than reported as a fault against a page that is behaving correctly.
import { isSandbox, type MountedIslandInfo } from '@motu/core';
import { bindKeys } from './model';
import type { Verdict } from './model';

/** Where in the lens panel the evidence for a finding lives. */
export type FindingSeam = 'sheet' | 'coupling' | 'requests' | 'islands';

export interface Finding {
  /** Stable id, so a list can be keyed and a finding can be linked to. */
  id: string;
  /** The subject, named. Never a verdict about the region as a whole. */
  title: string;
  /** What was observed and what the two ways out of it are. */
  detail: string;
  tone: Verdict;
  /** The panel section holding the table this came from. */
  seam: FindingSeam;
  /**
   * Whether this is something a person has to resolve, as opposed to something merely worth knowing.
   * The count of these is the only summary the panel shows.
   */
  decision: boolean;
}

export interface FindingsInput {
  islands: MountedIslandInfo[];
  /**
   * What the region DECLARED it gets from a source: source name -> the keys it promises.
   * Empty when the archipelago declares none.
   */
  sources?: Map<string, string[]>;
  /** Keys an installed channel has actually written — the runtime half of the promise above. */
  channelKeys?: Set<string>;
  /** key -> who has been seen writing it ('host' and 'channel' are the ocean, not islands). */
  writes: Map<string, Set<string>>;
  /** How many host calls the islands actually made. */
  calls: number;
  /** How many traced exports the stub offers, if anything is traced. */
  traced: number;
  /** Per-island verdicts, as the panel already computes them. */
  verdicts: Map<string, Verdict>;
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/**
 * Derive the findings. Pure: same input, same list, no DOM and no subscriptions — the same split
 * that let the panel become React.
 */
export function findingsOf(input: FindingsInput): Finding[] {
  const sandbox = isSandbox();
  const out: Finding[] = [];

  // ── keys nobody reads ──────────────────────────────────────────────────────────────────────
  const readers = new Map<string, Set<string>>();
  for (const info of input.islands) {
    for (const key of bindKeys(info)) {
      let set = readers.get(key);
      if (!set) readers.set(key, (set = new Set()));
      set.add(info.slot);
    }
  }
  const keys = new Set<string>([...readers.keys(), ...input.writes.keys()]);
  const demotions: string[] = [];
  for (const key of [...keys].sort()) {
    const rd = readers.get(key) ?? new Set<string>();
    const wr = input.writes.get(key) ?? new Set<string>();
    const islandWriters = [...wr].filter((w) => w !== 'host' && w !== 'channel');
    const external = wr.size > islandWriters.length;
    const touchers = new Set<string>([...rd, ...islandWriters]);

    // WRITTEN AND UNREAD. This one is a real defect in a lagoon as much as in an application: the
    // declaration says something produces the key and nothing consumes it, and no amount of
    // sandboxing makes that intentional.
    if (wr.size && !rd.size) {
      out.push({
        id: `unread:${key}`,
        title: `${key} goes nowhere`,
        detail: `${[...wr].join(', ')} writes it; no mounted island reads it. Either an island should bind it, or whatever writes it should stop.`,
        tone: 'broken',
        seam: 'sheet',
        decision: true,
      });
    }
    if (touchers.size >= 3) {
      out.push({
        id: `coupled:${key}`,
        title: `${key} is shared by ${plural(touchers.size, 'island')}`,
        detail: `Read or written by ${[...touchers].join(', ')}. That is real coupling — worth being deliberate about, not necessarily wrong.`,
        tone: 'warn',
        seam: 'coupling',
        decision: false,
      });
    }
    // An externally-fed key is not a demotion candidate: bind IS how the ocean reaches one island.
    if (touchers.size <= 1 && !external && rd.size) demotions.push(key);
  }

  // ONE FINDING FOR ALL OF THEM, not one each. A region where every key has a single reader is one
  // observation about the region; listing it per key would bury the findings that name a real defect.
  if (demotions.length) {
    out.push({
      id: 'demotion',
      title:
        demotions.length === keys.size
          ? `All ${plural(demotions.length, 'key')} could be props`
          : `${plural(demotions.length, 'key')} could be props`,
      detail: `${demotions.join(', ')} — each has exactly one reader and no island writer, so nothing here is actually shared.`,
      tone: 'warn',
      seam: 'coupling',
      decision: false,
    });
  }

  // ── a declared source nobody installed ─────────────────────────────────────────────────────
  //
  // THE FINDING THIS LIST WAS MISSING, and the one that cost a session. A region can declare
  // `sources: { teams: … }`, seed those keys, render perfectly, and be completely inert: the islands
  // emit, the intent leaves, and nothing answers it because no channel was ever installed. Every
  // other signal looks healthy — the page paints, the islands mount, the store holds values — so the
  // only way to notice was to act on the page and watch nothing happen.
  //
  // It is a DECISION, not an observation. Seeding is a legitimate answer ("this region previews
  // static data on purpose"), so it cannot be a defect; but somebody has to make that call, because
  // the alternative reading is "half the migration is missing" and the region cannot tell you which.
  for (const [name, produces] of input.sources ?? []) {
    const written = input.channelKeys ?? new Set<string>();
    const live = produces.filter((k) => written.has(k));
    if (live.length) continue;
    out.push({
      id: `source:${name}`,
      title: `${name} is declared but never installed`,
      detail:
        (produces.length
          ? `${produces.join(', ')} — held by the seed, produced by nothing. `
          : 'It produces no key here. ') +
        'Islands can still ask this source for something and no channel is listening, so the region ' +
        'looks wired and does not react. ' +
        // NAME THE SHAPE, not just the call. `channelFrom(...)` is what you type; a SOURCE is what you
        // have to build, and someone reading this is usually mid-migration and has never written one.
        // Three sentences is the most a 340px card can carry, so this is the outline and the doc has
        // the rest.
        `Install it: extract a source beside the page — a port the page and the lagoon fill ` +
        `differently, a factory holding the state with subscribe/getState, \`intents\` for what islands ` +
        `ask the host — then \`channelFrom({ to, id: '${name}', args: [...] })\` in the lagoon and drop ` +
        'those keys from the seed. See docs/05 “Writing a source”. Or accept that this region ' +
        'previews a fixed state.',
      tone: 'warn',
      seam: 'sheet',
      decision: true,
    });
  }

  // ── nothing fetched ────────────────────────────────────────────────────────────────────────
  //
  // THE FINDING THAT MOST NEEDS ITS CONTEXT. Outside a lagoon, islands that render while calling
  // nothing got their data from somewhere they never declared. Inside one, the host module was
  // replaced on purpose and calling nothing is the design working — so it is a note, not a fault.
  if (input.traced > 0 && input.calls === 0) {
    out.push({
      id: 'no-calls',
      title: 'Nothing was fetched',
      detail: sandbox
        ? `${plural(input.traced, 'traced export')} on the stub, none called. Everything on this screen came from the seed, which is what a lagoon is for — worth checking only if you expected a call.`
        : `${plural(input.traced, 'traced export')} available, none called. These islands render from data they never asked for, which is data arriving from somewhere they do not declare.`,
      tone: sandbox ? 'neutral' : 'broken',
      seam: 'requests',
      decision: !sandbox,
    });
  }

  // ── islands running on defaults ────────────────────────────────────────────────────────────
  for (const [slot, verdict] of input.verdicts) {
    if (verdict !== 'broken') continue;
    out.push({
      id: `defaults:${slot}`,
      title: `${slot} renders from its defaults`,
      detail: sandbox
        ? 'Every declared prop is at its default. In a lagoon that usually means this scenario seeds nothing for it — check the scenario before the wiring.'
        : 'Every declared prop is at its default, which on a real page almost always means the wiring never reached it.',
      tone: sandbox ? 'warn' : 'broken',
      seam: 'islands',
      decision: !sandbox,
    });
  }

  // DECISIONS FIRST, then loudest, and stable within both so the list does not reshuffle under the
  // cursor. Sorting by tone alone put "4 keys could be props" — an optimisation nobody has to act on —
  // above a region that is not wired at all, because both are `warn`. Tone says how loud a finding is;
  // `decision` says whether it is yours to answer, and that is the axis a reader needs first.
  const rank: Record<Verdict, number> = { broken: 0, warn: 1, neutral: 2, ok: 3 };
  return out.sort(
    (a, b) => Number(b.decision) - Number(a.decision) || rank[a.tone] - rank[b.tone],
  );
}

/** The tally the panel shows above the list. Counts, not a verdict. */
export function tallyOf(findings: Finding[]): { broken: number; warn: number; note: number; decisions: number } {
  return {
    broken: findings.filter((f) => f.tone === 'broken').length,
    warn: findings.filter((f) => f.tone === 'warn').length,
    note: findings.filter((f) => f.tone === 'neutral' || f.tone === 'ok').length,
    decisions: findings.filter((f) => f.decision).length,
  };
}
