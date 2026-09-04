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
  outboundCalls,
  regionIdOfStore,
  archipelagoConfigs,
} from '@motu/core';
import { readWireCalls, subscribeWireCalls } from '@motu/runtime/postgrest-fetch';
import { corpusFor, liveCoverage, ensureCorpus, subscribeCorpus } from './coverage';
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

  // WHAT THE REGION PROMISED ITS DATA WOULD COME FROM, against what a channel actually produced.
  // Both halves are already in this document — the archipelago config carries `sources`, the channel
  // registry carries the keys each installed channel has written — so this needs no CLI and no
  // report file: the page can answer it about itself, live, which is the only place a person is
  // looking when it matters.
  const stores = new Set(lens.activeStores());
  const channelKeys = new Set<string>();
  for (const channel of getChannels()) {
    if (stores.size && !stores.has(channel.store)) continue;
    for (const key of channel.keys) channelKeys.add(key);
  }
  const sources = new Map<string, string[]>();
  for (const config of archipelagoConfigs()) {
    // Only the region on screen. `regionIdOfStore` is how everything else here scopes itself.
    const mine = [...stores].some((store) => regionIdOfStore(store) === config.id);
    if (stores.size && !mine) continue;
    for (const [name, src] of Object.entries(config.sources ?? {})) {
      // Both declared forms expose `produces` at RUNTIME — the imported source object carries its
      // own, and the `{ module, produces }` form states it inline. The CLI has to regex the file for
      // this; here it is just a property.
      const produces = (src as { produces?: readonly string[] })?.produces ?? [];
      sources.set(name, [...produces]);
    }
  }

  return { islands, writes, verdicts, calls: lens.calls.length, traced, sources, channelKeys };
}

/**
 * TELL ME WHEN ANY OF THIS CHANGES.
 *
 * Everything the lens exports is a snapshot of a moving thing — a store write, a channel firing, a
 * call landing. Inside the artifact the panel re-rendered on each of those. A panel in ANOTHER
 * document has no such subscription, so without this it paints once and then quietly describes a
 * region that has moved on, which is worse than showing nothing: it is a stale answer that looks
 * live.
 */
export function watchSeams(fn: () => void): () => void {
  // TWO SOURCES, ONE SUBSCRIPTION. The lens fires on store writes; the corpus arrives separately and
  // asynchronously from the host. A panel watching only the first shows "no corpus" forever on a page
  // whose corpus landed a second after it opened.
  const offLens = lens.subscribe(fn);
  const offCorpus = subscribeCorpus(fn);
  // THREE SOURCES NOW. The lens fires on store writes and the corpus arrives asynchronously — and a
  // WIRE CALL is neither: a request whose response changes no region key writes nothing, so the
  // Network list stayed on the state before the save that produced it. A panel that is a moment
  // behind is worse than one that shows nothing, because it looks current.
  const offWire = subscribeWireCalls(fn);
  return () => {
    offLens();
    offCorpus();
    offWire();
  };
}

/**
 * COVERAGE: what production does that you are not looking at.
 *
 * A different question from the rest of the lens, and the only one that compares this region against
 * the world rather than against its own declaration.
 *
 * THREE VERDICTS, NOT TWO. Under drift the honest answer is neither "recorded" nor "never recorded":
 * a state folded over one key list cannot be looked up in a corpus folded over another, so "never
 * recorded" would be a finding manufactured by the mismatch. It read exactly that way before the
 * drift notice existed to contradict it.
 */
export function currentCoverage() {
  const islands = getMountedIslands();
  const store = islands.length ? islands[0].store : null;
  const regionId = store ? regionIdOfStore(store) : null;
  // Ask the host once; `watchSeams` re-paints when the answer lands.
  ensureCorpus(regionId);
  const corpus = corpusFor(regionId);
  if (!store || !corpus) return null;

  // THE SAME UNION THE SHEET IS BUILT FROM, so the two cannot disagree about what this region is.
  const declaredKeys = new Set<string>();
  for (const info of islands.filter((i) => i.store === store)) {
    for (const key of writtenKeys(info.spec)) declaredKeys.add(key);
    for (const key of bindKeys(info)) declaredKeys.add(key);
  }
  // THE REGION'S DECLARED ENUMS, not none. A key the archipelago declares a closed set fingerprints
  // as "= last"; folding without them produces "set" for exactly those keys, so every state would
  // miss its corpus row and this would read "never recorded" for a region whose coverage is perfect.
  const enums = archipelagoConfigs().find((c) => c.id === regionId)?.coverage?.enums ?? [];
  const cov = liveCoverage(corpus, [...declaredKeys].sort(), (k) => store.get(k), enums);
  const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

  return {
    states: corpus.entries.length,
    occurrences: cov.total,
    fingerprint: cov.id,
    verdict: cov.drift ? 'not-comparable' : cov.entry ? 'reached' : 'never-recorded',
    reached: cov.entry ? { count: cov.entry.count, share: pct(cov.share) } : null,
    drift: cov.drift
      ? { gone: cov.drift.onlyRecorded, added: cov.drift.onlyDeclared }
      : null,
    // Each row shows only the keys that DIFFER from the state on screen, so the heading has to name
    // the comparison: a bare "64% busy:true" reads as "64% of production has busy:true", which is a
    // different and much stronger claim than the true one.
    ranked: cov.ranked
      .filter((r) => !r.current)
      .slice(0, 6)
      .map((r) => ({ share: pct(r.share), diff: r.diff || '— identical to this one' })),
  };
}

/**
 * THE COUPLING TABLE, as data.
 *
 * Naming the islands is the whole point: "1r/1w" is the same string whether one island reads a key
 * nobody else touches or one island writes what ANOTHER one reads — and the second is the only
 * genuine coupling an archipelago has. Counts alone made that case read as a demotion candidate, so
 * the view flagged the one real coupling on the page as removable.
 */
export function currentCoupling() {
  const islands = getMountedIslands();
  if (!islands.length) return [];
  const store = islands[0].store;
  const here = islands.filter((i) => i.store === store);

  const readers = new Map<string, Set<string>>();
  for (const info of here) {
    for (const key of bindKeys(info)) {
      const set = readers.get(key) ?? new Set<string>();
      set.add(info.slot);
      readers.set(key, set);
    }
  }
  const writes = lens.writes.get(store) ?? new Map<string, Set<string>>();
  const keys = [...new Set<string>([...readers.keys(), ...writes.keys()])].sort();

  return keys.map((key) => {
    const rd = readers.get(key) ?? new Set<string>();
    const wr = writes.get(key) ?? new Set<string>();
    // Host- and channel-origin writes are the OCEAN feeding the region, not an island: they say the
    // key is externally fed, never that two islands are entangled.
    const islandWriters = [...wr].filter((w) => w !== 'host' && w !== 'channel');
    const external = wr.size > islandWriters.length;
    const touchers = new Set<string>([...rd, ...islandWriters]);
    return {
      key,
      reads: rd.size,
      writes: wr.size,
      from: external ? ['host'] : islandWriters,
      readers: [...rd],
      // An externally fed key is not a demotion candidate: bind IS how the ocean reaches one island.
      tag: touchers.size >= 3 ? 'coupled' : touchers.size <= 1 && !external ? 'demote?' : '',
    };
  });
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
  // ALL THREE DOORS, ONE BLOCK, AND NOBODY DROPPED.
  //
  // This read two lists and filtered both on `c.island != null` — which is not a filter, it is a
  // deletion. A declared SOURCE reads inside a channel, at region level, under `runWithSource`, so its
  // ambient island is null by construction and every one of its calls was discarded. On a region fed
  // by a source that produced the worst screen in the lens: FEEDS said the page's week feed had fired
  // ×44 a second ago, and ASKED FOR said 0 with "everything on screen came from the seed" — an empty
  // list with a confident wrong explanation, in the surface built to say where data came from.
  //
  // The WIRE was not read at all, so a project mocking beneath its own client (`createPostgrestFetch`)
  // saw none of its reads here however many it made.
  //
  // One ledger fixes both: `outboundCalls()` carries the door AND the owner, so a source's reads are
  // ATTRIBUTED rather than dropped, and a wire reach sits beside the contract call it is an
  // alternative to. Ordered by door so the block reads as the three seams it is.
  const doorOrder: Record<string, number> = { contract: 0, 'host-module': 1, wire: 2 };
  const asked = outboundCalls()
    .filter((o) => {
      // An ISLAND's ask belongs to this region only if that island is mounted in it.
      if (o.owner.startsWith('island:')) return tags.has(o.owner.slice('island:'.length));
      // A SOURCE's and an unowned ask are region-level: the lens shows one region at a time, and
      // hiding an ask because nobody claimed it is the failure above in a smaller costume.
      return true;
    })
    .slice(-24)
    .map((o) => ({
      via: o.via,
      label: o.name,
      detail: o.args,
      owner: o.owner,
      // UNATTRIBUTED IS A FINDING, not a row like the others: something asked the outside for data
      // while no island's and no source's window was open, so nothing here can say what needs it.
      tone: o.owner === 'unattributed' ? 'warn' : 'ok',
    }))
    .sort((a, b) => (doorOrder[a.via] ?? 9) - (doorOrder[b.via] ?? 9));

  // Which doors were SILENT, so the empty state can say what it looked at instead of guessing why.
  const doorsUsed = [...new Set(asked.map((a) => a.via))];

  // ── what it pushed back ──────────────────────────────────────────────────────────────────────
  const slots = new Set(getMountedIslands().map((i) => i.slot));
  const intents = lens.intents
    .filter((i) => i.source != null && slots.has(i.source))
    .slice(-8)
    .map((i) => ({ label: i.name ?? String(i.kind ?? 'intent'), from: i.source ?? '' }));

  // `calls`/`traced` stay for a dock built before `asked` existed — an older chrome bundle against a
  // newer overlay should degrade to the two-door view, not throw reading `undefined`.
  const calls = asked.filter((a) => a.via === 'contract').map((a) => ({ label: a.label, island: a.owner, detail: a.detail }));
  const traced = asked.filter((a) => a.via === 'host-module').map((a) => ({ label: a.label, island: a.owner, detail: a.detail }));
  // ── the calls themselves ─────────────────────────────────────────────────────────────────────
  //
  // `asked` above is the DECLARATION ledger — a set of targets, comparable to what an island or a
  // source declares it reaches. This is the other question, and no other tool can answer it: what
  // was actually sent, in what order, with what payload, and what came back.
  //
  // It has no counterpart in devtools BECAUSE of motu: the fake fetch answers without touching the
  // network, so the browser's Network panel is empty by construction. Newest first — a person opens
  // this straight after doing something, and what they did is the last row.
  const wire = readWireCalls()
    .slice(-60)
    .reverse()
    .map((c) => ({
      seq: c.seq,
      target: c.target,
      method: c.method,
      by: c.by,
      // TWO SHAPES OF THE SAME PAYLOAD. The row shows as much as one line holds; the panel expands to
      // the pretty-printed whole, which is the only form in which a nested `p_sessions` is readable.
      request: c.request === undefined ? '' : typeof c.request === 'string' ? c.request : JSON.stringify(c.request),
      detail:
        c.request === undefined
          ? ''
          : typeof c.request === 'string'
            ? c.request
            : JSON.stringify(c.request, null, 2),
      at: c.at,
      status: c.status ?? 0,
      response: c.response ?? '',
      // A 4xx/5xx is the row worth seeing: an RPC no fixture answers 404s here and the app's own
      // error handling swallows it, which is one of the ways a screen goes quiet.
      tone: (c.status ?? 0) >= 400 ? 'broken' : 'ok',
    }));

  return { channels, asked, doorsUsed, calls, traced, intents, wire };
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
