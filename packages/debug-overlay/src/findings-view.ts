// The findings, rendered into somebody else's panel.
//
// The dock hosts this, and the dock must not import this package — @motu/debug-overlay is dev-only
// and a production root has to shake it out entirely. So the direction is inverted: the lens is
// handed a container and mounts itself into it, exactly as the toolbar chips reach the dock through
// `setMotuToolbarHost`. The dock stays ignorant of what is inside, and this file stays the only place
// that knows what a finding looks like.
//
// PLAIN DOM, not a second React root. The panel is React because it re-renders wide tables on every
// store write; this is a short list inside a host that is itself plain DOM, and a second root inside
// it would buy diffing for a dozen nodes at the cost of a second reconciler in the page.
//
// The kit's classes are used bare: the dock has already injected `motuKitCss('#tide')` at its own
// scope, so anything mounted inside it is styled without this file shipping a stylesheet.
import {
  getMountedIslands,
  getIslandDefinition,
  writtenKeys,
  launderingSuspects,
  getChannels,
  hostCalls,
} from '@motu/core';
import { lens } from './store';
import { computeProps, verdictOf, bindKeys, preview, ago, isolationOf, type Verdict } from './model';
import { findingsOf, tallyOf, type Finding } from './findings';
import { toggleDebugOverlay, isDebugOverlayOpen } from './overlay';

const TONE_LABEL: Record<Verdict, string> = { broken: 'broken', warn: 'warning', neutral: 'note', ok: 'ok' };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

/** Everything findingsOf needs, gathered from the registries the lens already watches. */
function collect() {
  const islands = getMountedIslands();
  const verdicts = new Map<string, Verdict>();
  for (const info of islands) {
    verdicts.set(info.slot, verdictOf(computeProps(info, getIslandDefinition(info.element))));
  }
  // The writes map is per store; a dock panel is showing one region, so merge what is active.
  const writes = new Map<string, Set<string>>();
  for (const store of lens.activeStores()) {
    for (const [key, who] of lens.writes.get(store) ?? []) {
      const set = writes.get(key) ?? new Set<string>();
      for (const w of who) set.add(w);
      writes.set(key, set);
    }
  }
  const traced = new Set(lens.calls.map((c) => `${c.service}.${c.method}`)).size;
  return { islands, writes, verdicts, calls: lens.calls.length, traced };
}

/**
 * WHAT IS MOUNTED, per island — the lens's island scope, as data.
 *
 * A different question from the region sheet, which is why it earns its own tab rather than more
 * rows under Seams: the sheet asks how the region is WIRED, this asks what each island was actually
 * given. The same key answers both, from opposite ends — the sheet says who reads `shots`, this says
 * whether shot-list got it or is sitting at its default.
 */
export function currentIslands() {
  return getMountedIslands().map((info) => {
    const def = getIslandDefinition(info.element);
    const props = computeProps(info, def);
    return {
      slot: info.slot,
      tag: info.element,
      isolation: isolationOf(info.el),
      verdict: verdictOf(props),
      /** A declared reach the lagoon stubs and core cannot observe — visible only because it is declared. */
      risk: lens.externalRisk(info) || '',
      props: props.map((r) => ({
        name: r.name,
        state: r.state,
        storeKey: r.storeKey ?? '',
        value: preview(r.value),
      })),
      reads: bindKeys(info),
      writes: lens.islandWrites(info),
      emits: Object.entries(info.spec.on ?? {}).filter(([, h]) => h).map(([e]) => e),
      calls: lens.islandCalls(info).length,
      intents: lens.intents.filter((i) => i.source === info.slot).length,
    };
  });
}

/**
 * THE REST OF THE LENS, as data: what feeds the region, what it asked the outside for, what it pushed
 * back, and which keys are actually shared.
 *
 * One call rather than four, because every one of these crosses a document boundary to reach the
 * panel that shows them, and four round trips per repaint would be four chances to disagree about
 * which moment they describe.
 */
export function currentSeams() {
  const active = lens.activeStores();
  const tags = lens.activeIslandTags();

  // ── what feeds it ────────────────────────────────────────────────────────────────────────────
  // NEVER-FIRED FIRST, because that is the signal worth surfacing loudest: a channel installed and
  // never used is the silent-event bug, and it looks exactly like a working one in a list sorted by
  // name.
  const channels = getChannels()
    .filter((c) => active.has(c.store))
    .sort((a, b) => a.fireCount - b.fireCount)
    .map((c, i) => {
      const keys = [...c.keys];
      const boundKeys = lens.storeReaders(c.store);
      const connected = c.fireCount > 0 && keys.some((k) => boundKeys.has(k));
      const readers = lens.channelReaders(c).map((r) => r.slot);
      const bits: string[] = [];
      if (c.fireCount === 0) bits.push('never fired');
      else {
        bits.push(`×${c.fireCount}`);
        if (c.lastAt) bits.push(ago(c.lastAt));
        if (!connected) bits.push('no reader');
      }
      return {
        label: c.name || (keys.length ? '→ ' + keys.join(', ') : `channel #${c.index ?? i}`),
        tone: c.fireCount === 0 ? 'broken' : connected ? 'ok' : 'warn',
        detail: bits.join(' · '),
        payload: c.fireCount > 0 && c.lastKey !== undefined ? `${c.lastKey}=${preview(c.lastValue)}` : '',
        readers,
      };
    });

  // ── what it asked for ────────────────────────────────────────────────────────────────────────
  // BOTH ROUTES, one question. A contract call goes through the transport the lagoon swaps for
  // fixtures; a host call is an island importing a module directly and the lagoon standing it down.
  // Both are "this screen needs data it does not have", and separating them hid the second from
  // anyone looking for the first.
  const calls = lens.calls
    .filter((c) => c.island != null && tags.has(c.island))
    .slice(-16)
    .map((c) => ({ label: `${c.service}.${c.method}`, island: c.island ?? '', detail: c.argsKey || '' }));
  const traced = hostCalls()
    .filter((c) => c.island && tags.has(c.island))
    .slice(-16)
    .map((c) => ({
      label: `${c.module}.${c.fn}`,
      island: c.island ?? '',
      // Shallow args, which is the whole point of the trace: enough to see fetchClubFeed(11), not a log dump.
      detail: c.args.map((a) => preview(a)).join(', '),
    }));

  // ── what it pushed back ──────────────────────────────────────────────────────────────────────
  const slots = new Set(getMountedIslands().map((i) => i.slot));
  const intents = lens.intents
    .filter((i) => i.source != null && slots.has(i.source))
    .slice(-8)
    .map((i) => ({ label: i.name ?? String(i.kind ?? 'intent'), from: i.source ?? '' }));

  return { channels, calls, traced, intents };
}

/**
 * THE REGION SHEET, as data.
 *
 * The lens opens on this — one row per key: who owns it, who reads it, what it holds, whether it has
 * moved, and a flag where a declared write has never fired or the host answered an island. It is the
 * archipelago's own declaration, proved by the region that is running, which is why it is worth
 * reading before the archipelago itself.
 *
 * Serialised rather than rendered here, for the reason the findings are: the panel that shows it is
 * drawn by whoever hosts the lagoon, and that is usually a different document. What cannot move is
 * the derivation — the mount registry, the store, the move log and the laundering suspects are all
 * in HERE.
 */
export function currentSheet() {
  const islands = getMountedIslands();
  if (!islands.length) return { rows: [], owned: 0, total: 0 };
  const store = islands[0].store;
  const here = islands.filter((i) => i.store === store);

  // DECLARED: who writes each key, who reads it. Both come from the archipelago's own entries, so
  // this is the declaration rather than an approximation of it.
  const owner = new Map<string, string>();
  const readers = new Map<string, string[]>();
  for (const info of here) {
    for (const key of writtenKeys(info.spec)) owner.set(key, info.slot);
    for (const key of bindKeys(info)) readers.set(key, [...(readers.get(key) ?? []), info.slot]);
  }
  const moves = lens.moves.get(store) ?? new Map();
  const suspects = new Map(launderingSuspects().map((x) => [x.key, x]));
  const keys = [...new Set([...readers.keys(), ...owner.keys()])].sort();

  const rows = keys.map((key) => {
    const from = owner.get(key) ?? null;
    const m = moves.get(key);
    const suspect = suspects.get(key);
    return {
      key,
      owner: from ?? 'host',
      islandOwned: Boolean(from),
      readers: readers.get(key) ?? [],
      value: preview(store.get(key)),
      // "seed" is the honest word for a key nothing has been seen to move: it holds what the page
      // established, and no declared write has fired.
      moved: m ? `${m.by} · ${m.n}× · ${ago(m.at)}` : null,
      /** '' | 'laundering' | 'never-fired' — the two things a row can be flagged for. */
      flag: suspect
        ? 'laundering'
        : from && !m
          ? 'never-fired'
          : '',
      flagTitle: suspect
        ? `the host wrote this ${suspect.gapMs}ms after ${suspect.after.slot} emitted "${suspect.after.event}"`
        : from && !m
          ? `${from} declares this write; nothing has fired it yet`
          : '',
    };
  });
  return { rows, owned: rows.filter((r) => r.islandOwned).length, total: rows.length };
}

/**
 * The findings as DATA, for a panel that is not in this document.
 *
 * The host draws the lagoon's chrome from outside the artifact now, and findings are derived from
 * things that only exist in HERE: the mount registry, the store's write log, the call log. So the
 * derivation stays and only its result crosses — the same split the toolbar chips already use, and
 * the right one anyway, because the derivation is small and stable while the rendering is what churns.
 */
export function currentFindings() {
  const input = collect();
  const findings = findingsOf(input);
  return { findings, tally: tallyOf(findings), islands: input.islands.length };
}

/**
 * Render the findings into `container`, and keep them current. Returns the teardown.
 */
export function mountFindings(container: HTMLElement): () => void {
  const tally = el('div', { class: 'seam-tally' });
  const head = el('div', { class: 'sect__head' });
  const list = el('div', { class: 'list', role: 'list' });
  container.append(tally, head, list);

  const paint = () => {
    const input = collect();
    const findings = findingsOf(input);
    const t = tallyOf(findings);

    // THE TALLY IS COUNTS, and the counts are all it is. There is no headline over this: a sentence
    // summarising a region cannot be contradicted by the region, which is the whole reason it was
    // dropped from the design. What a person needs first is how many things are here and how many of
    // them are theirs to decide.
    tally.replaceChildren(
      ...([
        ['broken', t.broken],
        ['warn', t.warn],
        ['neutral', t.note],
      ] as const)
        .filter(([, n]) => n > 0)
        .map(([tone, n]) =>
          el('span', { class: 'seam-count', 'data-tone': tone }, el('i', {}), `${n} ${TONE_LABEL[tone]}${n === 1 ? '' : 's'}`),
        ),
      el('span', { class: 'seam-count', 'data-tone': 'ok' }, el('i', {}), `${input.islands.length} mounted`),
    );

    head.replaceChildren(
      el('span', { class: 'motu-cap' }, 'Findings'),
      el(
        'span',
        { class: 'count' },
        t.decisions ? `${findings.length} · ${t.decisions} needs a decision` : `${findings.length}`,
      ),
    );

    if (!findings.length) {
      list.replaceChildren(el('p', { class: 'motu-empty' }, 'Nothing to report about this region.'));
      return;
    }

    list.replaceChildren(
      ...findings.map((f: Finding) => {
        const card = el(
          'button',
          {
            class: 'seam-find',
            type: 'button',
            'data-tone': f.tone,
            title: 'Open the lens at the evidence for this',
          },
          el('span', { class: 'seam-find__t' }, el('i', {}), f.title),
          el('span', { class: 'seam-find__d' }, f.detail),
        );
        // THE FINDING IS THE WAY IN, not the whole story. Each one was derived from a table that is
        // still in the lens panel, so pressing it opens that panel rather than trying to reproduce a
        // wide table in a 340px column.
        card.addEventListener('click', () => {
          if (!isDebugOverlayOpen()) toggleDebugOverlay();
        });
        return card;
      }),
    );
  };

  paint();
  const stop = lens.subscribe(paint);
  return () => {
    stop();
    container.replaceChildren();
  };
}
