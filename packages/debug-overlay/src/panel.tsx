// The lens' panel, as React over motu's own kit.
//
// WHY THIS IS REACT NOW. The old `#renderPanel` did `panel.textContent = ''` and rebuilt nine hundred
// lines of DOM from scratch — on every store write, every channel firing, every host call, every
// contract-call phase change. That is a full re-render with no diffing, which is why it needed a
// dirty flag and a rAF loop to be affordable at all, and why the panel lost its scroll position, its
// focus and any text selection every time the application underneath it changed a key. None of that
// was a styling problem; it was the shape of the code. This file is the same content as a function of
// the same state, and the losses go away because React only touches what moved.
//
// WHAT DID NOT MOVE. The page layer — outlines, wires, hit-testing, the drag, the flood — is still
// imperative, in `geometry.ts` and `overlay.ts`. It measures the host's live DOM sixty times a second
// and React would add a component tree in between that renders nothing anyone can see.
//
// EVERY SHAPE HERE IS THE KIT'S (`@motu/chrome/react`). The panel used to draw its own pills,
// captions, rows and empty states from literals that happened to equal motu's tokens. What is left
// local is what only this panel has: the region sheet's columns, a channel row's two extra lines.
import { useCallback, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import {
  Button,
  Chips,
  Dot,
  Empty,
  Field,
  Group,
  Notice,
  PanelBody,
  PanelHead,
  Pill,
  Row,
  Sub,
  Table,
  Trail,
  type MotuDotTone,
} from '@motu/chrome/react';
import { corpusFor, liveCoverage } from './coverage';
import {
  getMountedIslands,
  regionIdOfStore,
  archipelagoConfigs,
  getChannels,
  getIslandDefinition,
  hostCalls,
  tracedExports,
  writtenKeys,
  launderingSuspects,
  unattributedWrites,
  foreignObservations,
  startSeedRecording,
  stopSeedRecording,
  type RecordedSeed,
  type ChannelInfo,
  type HostCall,
  type HostIntent,
  type MountedIslandInfo,
  type Store,
} from '@motu/core';
import { startRecording, stopRecording, type RecordedCall } from '@motu/runtime';
import {
  ago,
  bindKeys,
  computeProps,
  isolationOf,
  preview,
  renderRecordedFixtures,
  sourceLabel,
  type CallRecord,
  type PropState,
} from './model';
import { FLAG, lens, writeFlag } from './store';

/** Re-render whenever the lens has observed something. See `lens.getSnapshot` for why it is a number. */
function useLens(): number {
  return useSyncExternalStore(lens.subscribe, lens.getSnapshot, lens.getSnapshot);
}

/** A prop's state, as one of the kit's four verdicts. */
const PROP_TONE: Record<PropState, 'ok' | 'warn' | 'broken' | 'neutral'> = {
  bound: 'ok',
  'bound-empty': 'warn',
  static: 'neutral',
  default: 'broken',
};

/** A contract call's phase, as a dot. */
const PHASE_TONE: Record<string, MotuDotTone> = {
  start: 'pending',
  success: 'ok',
  error: 'broken',
};

export interface LensPanelProps {
  /** Close the lens entirely — the same act as the tab and the keyboard shortcut. */
  onClose: () => void;
}

/**
 * The panel's whole content.
 *
 * The `.panel` ELEMENT is not rendered here: the overlay owns it, because it is the thing that gets
 * dragged, clamped, position-persisted, flood-animated and measured to place the tab. React renders
 * into it. That split keeps the proven imperative bits proven and still lets everything visible be a
 * function of state.
 */
export function LensPanel({ onClose }: LensPanelProps) {
  useLens();
  const { selected, minimized, picking, recording, recStatus, showCoupling } = lens;

  const toggleCoupling = useCallback(() => {
    lens.showCoupling = !lens.showCoupling;
    writeFlag(FLAG.coupling, lens.showCoupling);
    lens.changedNow();
  }, []);

  const toggleMinimized = useCallback(() => {
    lens.minimized = !lens.minimized;
    writeFlag(FLAG.minimized, lens.minimized);
    lens.changedNow();
  }, []);

  return (
    <>
      <PanelHead title="motu debug" grab grabbing={lens.dragging}>
        <Button
          size="icon"
          on={picking}
          aria-pressed={picking}
          title="Pick an island on the page (Esc to cancel · or Alt-click any island)"
          onClick={() => setPicking(!picking)}
        >
          ⌖
        </Button>
        <Button
          size="icon"
          on={recording}
          tone="broken"
          aria-pressed={recording}
          title="Record contract calls → request-keyed fixtures"
          onClick={toggleRecording}
        >
          {recording ? '■' : '●'}
        </Button>
        <Button
          size="icon"
          on={showCoupling}
          aria-pressed={showCoupling}
          title="Show inter-island couplings (shared store keys)"
          onClick={toggleCoupling}
        >
          ⇄
        </Button>
        <Button
          size="icon"
          title={minimized ? 'Expand the panel' : 'Minimize to the title bar (lenses keep running)'}
          onClick={toggleMinimized}
        >
          {minimized ? '□' : '–'}
        </Button>
        <Button size="icon" title="Close (Cmd/Ctrl+Shift+G)" onClick={onClose}>
          ✕
        </Button>
      </PanelHead>

      {/* Minimized: the header IS the panel. Everything below it is the reading pane the user
          collapsed — and the page-wide lenses (the graph, the picker, the recorder) keep running. */}
      {minimized ? null : (
        <>
          {/* Picker mode is a MODE, and a mode that isn't visible is a trap — say so while it is armed. */}
          {picking && <Notice tone="info">⌖ click an island on the page — Esc to cancel</Notice>}
          {/* Recording status (human fixture capture): read-only — it only observes the call() seam. */}
          {(recording || recStatus) && (
            <Notice mono>
              {recording ? '● recording — interact with the app, then click ■ to export fixtures' : recStatus}
            </Notice>
          )}

          <PanelBody>
            {selected ? <IslandScope info={selected} /> : <RegionScope />}
          </PanelBody>
        </>
      )}
    </>
  );
}

// --- Island scope ------------------------------------------------------------------------------

/** One island's own input / output / requests / coupling. The way back is here, not in a list. */
function IslandScope({ info }: { info: MountedIslandInfo }) {
  const def = getIslandDefinition(info.element);
  const rows = computeProps(info, def);
  const risk = lens.externalRisk(info);
  const readKeys = bindKeys(info);
  const emits = Object.entries(info.spec.on ?? {})
    .filter(([, handler]) => handler)
    .map(([e]) => e);
  const writes = lens.islandWrites(info);
  const intents = lens.intents.filter((i) => i.source === info.slot);
  const calls = lens.islandCalls(info);
  const up = lens.upstream(info);
  const down = lens.downstream(info);
  const co = lens.coReaders(info);
  const hostScope = def?.coupling?.hostScope;

  return (
    <>
      <Button
        shape="pill"
        weight="quiet"
        title="Back to the whole region"
        onClick={() => {
          lens.selected = null;
          lens.changedNow();
        }}
      >
        ◂ All islands
      </Button>

      <div className="detail">
        <div className="detail__title">
          <span>{info.element}</span>
          <span className="detail__slot">
            {info.slot} · {isolationOf(info.el)}
          </span>
        </div>
        <FitControl info={info} />

        {/* INPUT — declared props (bound / default + live value), their ORIGIN (does the value cross
            the motu boundary from the ocean, or come from a sibling island?), and the channels
            feeding them. */}
        <Group seam="input">
          {risk && <Notice>⚠ {risk} — verify embedded</Notice>}
          {!rows.length && <Empty>No declared props.</Empty>}
          {rows.map((r) => {
            const origin = r.storeKey ? originOf(info.store, r.storeKey) : null;
            return (
              <Field
                key={r.name}
                label={r.name}
                trailing={
                  origin && (
                    <Pill size="micro" tone={origin.external ? 'neutral' : undefined} title={origin.title}>
                      {origin.text}
                    </Pill>
                  )
                }
              >
                <Pill size="micro" tone={PROP_TONE[r.state]}>
                  {r.state}
                </Pill>{' '}
                {r.storeKey ? `${r.storeKey} = ${preview(r.value)}` : preview(r.value)}
              </Field>
            );
          })}
          {lens.inboundChannels(info).map((c, i) => (
            <Field
              key={`ch${i}`}
              label={<span style={c.fireCount === 0 ? { color: 'var(--warn)' } : undefined}>via channel</span>}
              trailing={c.fireCount === 0 ? 'never fired' : ago(c.lastAt ?? Date.now())}
            >
              {[...c.keys].filter((k) => readKeys.includes(k)).join(', ')}
            </Field>
          ))}
          {/* Declared host-scope reach (AngularJS adapter coupling) — an EXTERNAL dependency the
              lagoon stubs and core can't observe at runtime; only visible because the island declares
              it in its contract. */}
          {!!hostScope?.length && (
            <Field label={<span style={{ color: '#7c5cbf' }}>via host scope</span>} trailing="ext · ocean">
              {hostScope.join(', ')}
            </Field>
          )}
        </Group>

        {/* OUTPUT — events it emits, store keys it has written (observed), and host intents it pushed
            OUT to the ocean. What it ASKED for is a request, not an output, and has its own group. */}
        <Group seam="output">
          {!!emits.length && (
            <>
              <Sub>emits events</Sub>
              <Chips>
                {emits.map((k) => (
                  <Pill key={k} mono>
                    {k}
                  </Pill>
                ))}
              </Chips>
            </>
          )}
          {!!writes.length && (
            <>
              <Sub>writes store</Sub>
              <Chips>
                {writes.map((k) => (
                  <Pill key={k} mono>
                    {k}
                  </Pill>
                ))}
              </Chips>
            </>
          )}
          {!!intents.length && (
            <>
              <Sub>host intents · → ocean</Sub>
              {intents.slice(0, 6).map((i, n) => (
                <IntentRow key={n} intent={i} />
              ))}
            </>
          )}
        </Group>

        {/* REQUESTS — what this island asked for, by either route. Same split as the region's panel. */}
        <Group seam="requests">
          <Sub>contract calls · → backend ({calls.length})</Sub>
          {!calls.length && <Empty>None observed.</Empty>}
          {calls.slice(0, 8).map((c) => (
            <CallRow key={c.id} call={c} dup={false} />
          ))}
          {/* The question "what feeds THIS island" is the one asked while inspecting one, and
              answering it only at region level makes the reader guess which of four islands fetched
              what. */}
          <HostCallRows tag={info.element} />
        </Group>

        {/* COUPLING — sibling islands sharing a store key: depends-on (their writes feed my reads),
            feeds (my writes feed their reads), and co-reads (a shared input source). */}
        <Group seam="coupling">
          {up.map(({ key, islands }) => (
            <Field key={`u${key}`} label="depends on" trailing={islands.map((i) => i.slot).join(', ')}>
              {key}
            </Field>
          ))}
          {down.map(({ key, islands }) => (
            <Field key={`d${key}`} label="feeds" trailing={islands.map((i) => i.slot).join(', ')}>
              {key}
            </Field>
          ))}
          {co.map(({ key, islands }) => (
            <Field key={`c${key}`} label="shares" trailing={islands.map((i) => i.slot).join(', ')}>
              {key}
            </Field>
          ))}
          {!up.length && !down.length && !co.length && <Empty>No shared store keys.</Empty>}
        </Group>
      </div>
    </>
  );
}

/**
 * Where a prop's value crossed into the region.
 *
 * THE DECLARED SOURCE FIRST, because it is the only one of these that answers the question for an
 * island that fetches nothing. `ext · host` says the value crossed the boundary; it does not say from
 * WHERE, and for an island like `week-actions` — nine keys, no calls — that was the whole answer the
 * lens had.
 */
function originOf(store: Store, key: string): { text: string; title?: string; external: boolean } | null {
  const src = lens.sourceOf(store, key);
  if (src) return { text: `src · ${src.name}`, title: src.module ?? src.name, external: true };
  const o = lens.keyWriters(store, key);
  if (o.channel || o.host) return { text: `ext · ${o.channel ? 'channel' : 'host'}`, external: true };
  if (o.islands.length) return { text: `int · ${o.islands.join(',')}`, external: false };
  return null;
}

/**
 * Per-island fit override: preview a MIXED soft-migration state (one island legacy, another native)
 * that the region toggle can't show. Pins `data-motu-fit-override` so the region fan-out skips it.
 */
function FitControl({ info }: { info: MountedIslandInfo }) {
  const el = info.el as unknown as { fit?: string };
  const overridden = info.el.hasAttribute('data-motu-fit-override');
  const current = el.fit ?? 'native';
  const pick = (mode: 'native' | 'legacy') => (
    <Button
      key={mode}
      shape="pill"
      weight="quiet"
      on={overridden && current === mode}
      tone="warn"
      onClick={() => {
        info.el.setAttribute('data-motu-fit-override', '');
        (info.el as unknown as { fit?: string }).fit = mode;
        lens.changedNow();
      }}
    >
      {mode}
    </Button>
  );
  return (
    <div className="fitctl">
      <span className="fitctl__l">fit</span>
      {pick('native')}
      {pick('legacy')}
      <Button
        shape="pill"
        weight="quiet"
        on={!overridden}
        tone="warn"
        title="Follow the region fit toggle"
        onClick={() => {
          info.el.removeAttribute('data-motu-fit-override');
          const arch = archOf(info.el);
          (info.el as unknown as { fit?: string }).fit = arch?.getAttribute('fit') === 'legacy' ? 'legacy' : 'native';
          lens.changedNow();
        }}
      >
        follow region
      </Button>
    </div>
  );
}

/** The <motu-archipelago> an island lives in — walk up, hopping out of shadow roots. */
function archOf(el: HTMLElement): HTMLElement | null {
  let node: Node | null = el;
  while (node) {
    if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'motu-archipelago') return node;
    const parent: Node | null = node.parentNode;
    node = parent instanceof ShadowRoot ? parent.host : parent;
  }
  return null;
}

// --- Region scope ------------------------------------------------------------------------------

/**
 * The whole region: its state sheet, then input (host channels), requests (what it ASKS the outside
 * for), output (what it pushes out) and coupling (shared store keys). Pick an island on the page to
 * narrow to it.
 */
function RegionScope() {
  return (
    <>
      <div className="scopehint">
        {getMountedIslands().length} island(s) on screen · click ⌖ above, or Alt-click one, to inspect it
      </div>
      <RegionSheet />
      <RegionCoverage />
      <RegionInput />
      <RegionRequests />
      <RegionOutput />
      <RegionCoupling />
    </>
  );
}

/**
 * THE REGION, IN ONE TABLE — one row per key: who owns it, who reads it, what it holds, whether it
 * has moved.
 *
 * Everything else in this panel answers a question about one island. This answers the question a
 * reviewer would otherwise open two files to answer — the archipelago (who declared what) and the
 * page (what actually feeds it) — and it answers it from the RUNNING region, so a declaration that is
 * merely plausible reads differently from one that is true. A key nothing has written since the seed
 * says so; a key an island declares and never moves says so; a key the host answered right after an
 * island emitted is flagged where it happened.
 */
function RegionSheet() {
  const islands = getMountedIslands();
  if (!islands.length) {
    return (
      <Group seam="region">
        <Empty>No region mounted.</Empty>
      </Group>
    );
  }
  const store = islands[0].store;
  const here = islands.filter((i) => i.store === store);

  // DECLARED: who writes each key, who reads it. Both come from the archipelago's own entries, so
  // this table is the declaration — not an approximation of it.
  const owner = new Map<string, string>();
  const readers = new Map<string, string[]>();
  for (const info of here) {
    for (const key of writtenKeys(info.spec)) owner.set(key, info.slot);
    for (const key of bindKeys(info)) readers.set(key, [...(readers.get(key) ?? []), info.slot]);
  }
  const moves = lens.moves.get(store) ?? new Map();
  const suspects = new Map(launderingSuspects().map((s) => [s.key, s]));
  const keys = [...new Set([...readers.keys(), ...owner.keys()])].sort();
  if (!keys.length) {
    return (
      <Group seam="region">
        <Empty>No declared region state.</Empty>
      </Group>
    );
  }
  const owned = keys.filter((k) => owner.has(k)).length;

  return (
    <Group seam="region">
      <Sub>
        {keys.length} key(s) · {owned} island-owned, {keys.length - owned} host-fed
      </Sub>
      {keys.map((key) => {
        const from = owner.get(key);
        const rd = readers.get(key) ?? [];
        const m = moves.get(key);
        const suspect = suspects.get(key);
        return (
          <Table
            key={key}
            className="sheet"
            columns="104px 60px 1.1fr 1fr 72px 12px"
            title={`${key} — ${from ? `written by ${from}` : 'fed by the host'}; read by ${rd.join(', ') || 'nobody'}\n${preview(store.get(key))}`}
          >
            <span className="k">{key}</span>
            <span className={from ? 'own island' : 'own host'}>{from ?? 'host'}</span>
            {/* Value and readers share a cell: what it holds, then who is looking at it. Both
                truncate, and the full text is on the row's title — the scan is the point, the detail
                is one hover away. */}
            <span className="rd">{rd.length ? rd.join(', ') : '∅ nobody'}</span>
            <span className="val">{preview(store.get(key))}</span>
            <span className={m ? 'moved' : 'still'}>{m ? `${m.by} · ${m.n}× · ${ago(m.at)}` : 'seed'}</span>
            {suspect ? (
              <span
                className="flag"
                style={{ color: 'var(--warn)' }}
                title={`laundering? the host wrote this ${suspect.gapMs}ms after ${suspect.after.slot} emitted "${suspect.after.event}"`}
              >
                ⚠
              </span>
            ) : from && !m ? (
              // A declared producer that has never produced: the wire compiles, and nothing has come
              // down it.
              <span className="flag" style={{ color: 'var(--warn)' }} title={`${from} declares this write; nothing has fired it yet`}>
                ○
              </span>
            ) : (
              <span />
            )}
          </Table>
        );
      })}
    </Group>
  );
}

/**
 * Region INPUT: the host channels feeding the shared store (host -> store -> islands). Shows
 * fired / never-fired (the silent-event bug), last payload + age, and which islands read each.
 */
function RegionInput() {
  const active = lens.activeStores();
  const channels = getChannels().filter((c) => active.has(c.store));
  const dead = channels.filter((c) => c.fireCount === 0).length;
  // Never-fired first — that is the signal worth surfacing loudest.
  const ordered = [...channels].sort((a, b) => a.fireCount - b.fireCount);
  return (
    <Group seam="input">
      {!!dead && (
        <Notice>
          ⚠ {dead} channel{dead > 1 ? 's' : ''} never fired — verify embedded
        </Notice>
      )}
      <Sub>channels · host → store ({channels.length})</Sub>
      {!channels.length ? <Empty>No channels installed.</Empty> : ordered.map((c, i) => <ChannelRow key={i} channel={c} />)}
    </Group>
  );
}

function ChannelRow({ channel: c }: { channel: ChannelInfo }) {
  const keys = [...c.keys];
  const boundKeys = lens.storeReaders(c.store);
  const connected = c.fireCount > 0 && keys.some((k) => boundKeys.has(k));
  const state: MotuDotTone = c.fireCount === 0 ? 'broken' : connected ? 'ok' : 'warn';
  const label = c.name || (keys.length ? '→ ' + keys.join(', ') : `channel #${c.index}`);
  const bits: string[] = [];
  if (c.fireCount === 0) bits.push('never fired');
  else {
    bits.push(`×${c.fireCount}`);
    if (c.lastAt) bits.push(ago(c.lastAt));
    if (!connected) bits.push('no reader');
  }
  const readers = lens.channelReaders(c).map((r) => r.slot);
  return (
    <Row mono className="ch">
      <Dot tone={state} />
      <span className="motu-ellipsis">{label}</span>
      <Trail>{bits.join(' · ')}</Trail>
      {c.fireCount > 0 && c.lastKey !== undefined && (
        <span className="pay">
          {c.lastKey}={preview(c.lastValue)}
        </span>
      )}
      <span className={`links${readers.length ? '' : ' warn'}`}>
        {readers.length ? `→ ${readers.join(', ')}` : '→ no island reads this'}
      </span>
    </Row>
  );
}

/**
 * Region REQUESTS: everything the region asked the outside for, by either route.
 *
 * Two routes, one question. A contract call goes through the transport, which is the seam the lagoon
 * swaps for fixtures; a host-module call is an island importing `@/lib/services/…` directly and the
 * lagoon standing that module down. Both are "this screen needs data it does not have", and splitting
 * them across two groups made the second invisible to anyone looking for the first.
 */
function RegionRequests() {
  const tags = lens.activeIslandTags();
  const calls = lens.calls.filter((c) => c.island != null && tags.has(c.island));
  // Scoped the same way, or the pointer below ("they reach host modules directly") would be pointing
  // at another region's rows.
  const traces = hostCalls().filter((c) => c.island && tags.has(c.island));
  const counts = new Map<string, number>();
  for (const c of calls) {
    const key = `${c.service}/${c.method}/${c.argsKey}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    <Group seam="requests">
      <Sub>contract calls · → backend ({calls.length})</Sub>
      {!calls.length ? (
        // WHY it is empty matters, and "No calls yet." answers the wrong question. A region whose
        // islands import host modules directly never touches the transport, so this list is empty by
        // construction rather than because nothing has happened yet.
        <Empty>{traces.length ? 'None — these islands reach host modules directly (below).' : 'No calls yet.'}</Empty>
      ) : (
        calls
          .slice(0, 16)
          .map((c) => <CallRow key={c.id} call={c} dup={(counts.get(`${c.service}/${c.method}/${c.argsKey}`) ?? 0) > 1} />)
      )}
      <HostCallRows />
      <SourceRows />
    </Group>
  );
}

/**
 * WHERE THE DATA CAME FROM — the host modules the islands actually called.
 *
 * This is the lagoon's blind spot, and the reason it is worth a section of its own: a stub replaces
 * the host module so completely that no request leaves the page, the network panel stays empty, and a
 * region can show twenty-four feed rows with nothing anywhere saying that anything fetched them. The
 * reasonable reaction to that screen is "I see no HTTP feeding these islands", and until now the lens
 * had no answer. These rows are the answer, and they are also the closest thing the preview has to an
 * integration statement: what is listed here is precisely what the real page will have to serve.
 *
 * Silence is AMBIGUOUS here in a way it is not for channels, so it is never rendered as one thing. No
 * traced export means nobody opted in — a gap in the stubs, not a finding about the islands. Traced
 * exports with no calls IS a finding: these islands rendered without asking anyone for data, which is
 * what a hard-coded fixture inside a component looks like from here.
 */
function HostCallRows({ tag }: { tag?: string }) {
  const all = hostCalls();
  // SCOPED TO THE REGION ON SCREEN, like every other region-level view here. The call log is global
  // and lives for the whole session, so the switcher moving from club to actions left club's fetches
  // sitting under actions' REQUESTS — rows naming islands that are not on the page.
  const tags = lens.activeIslandTags();
  const calls = tag ? all.filter((c) => c.island === tag) : all.filter((c) => c.island && tags.has(c.island));
  // Calls made outside any island's window (a channel, the frame itself) cannot be attributed to a
  // region at all. Counting them in one line keeps them visible without pretending they belong here.
  const loose = tag ? 0 : all.filter((c) => !c.island).length;
  const wrapped = tracedExports();

  if (!wrapped) {
    // Only worth saying at region level: a per-island panel that repeats "nobody instruments this"
    // for every island is noise, and the region panel already said it once.
    if (tag) return null;
    return (
      <>
        <Sub>host modules</Sub>
        <Empty title="wrap a stub's exports in traced('<module>', '<fn>', impl) to record them">
          No stub records its calls.
        </Empty>
      </>
    );
  }

  const looseRow = loose ? (
    <Empty title="made outside any island attribution window — a channel, or the frame itself">
      +{loose} call(s) with no island — not scoped to this region
    </Empty>
  ) : null;

  if (!calls.length) {
    return (
      <>
        <Sub>host modules · {tag ? 'this island' : 'stub → island'} (0)</Sub>
        {looseRow}
        {tag ? (
          <Empty>None — this island was handed its data.</Empty>
        ) : (
          <Notice>⚠ {wrapped} traced export(s), none called — these islands fetched nothing</Notice>
        )}
      </>
    );
  }

  // One row per module+fn+args, not per call: a feed that paged three times is one row that says ×3,
  // and a duplicate fetch of the SAME arguments is the thing worth seeing rather than scrolling past.
  const groups = new Map<string, { call: HostCall; n: number; last: number }>();
  for (const c of calls) {
    const key = `${c.island ?? ''} ${c.module} ${c.fn} ${JSON.stringify(c.args)}`;
    const g = groups.get(key);
    if (g) {
      g.n++;
      g.last = c.at;
    } else groups.set(key, { call: c, n: 1, last: c.at });
  }

  return (
    <>
      <Sub>
        host modules · {tag ? 'this island' : 'stub → island'} ({calls.length})
      </Sub>
      {[...groups.values()]
        .sort((a, b) => b.last - a.last)
        .slice(0, 12)
        .map(({ call, n, last }, i) => {
          const args = call.args.map((a) => preview(a)).join(', ');
          // WHO ASKED, when the attribution window was open. A call with no island is not an error: a
          // stub called from a channel or from the frame itself has no island to attribute to, and
          // saying "host" is the honest answer.
          const who = tag ? sourceLabel(call.module) : (call.island ?? 'host');
          const bits: string[] = [];
          if (call.returned != null) bits.push(`→ ${call.returned}`);
          if (n > 1) bits.push(`×${n} · dup`);
          bits.push(ago(last));
          return (
            <Row key={i} mono title={`${call.module}.${call.fn}(${args})`}>
              <Dot tone="external" />
              <span className="motu-ellipsis">
                {call.fn}({args})
              </span>
              <span style={{ color: 'var(--w-deep)' }} title={`${call.module}${call.island ? ` · called by ${call.island}` : ''}`}>
                {who}
              </span>
              <Trail>{bits.join(' · ')}</Trail>
            </Row>
          );
        })}
      {looseRow}
    </>
  );
}

/**
 * WHERE THE REST OF IT COMES FROM.
 *
 * The rows above answer "what did this screen fetch". They cannot answer the question an island with
 * no calls raises, which is the more common one: peps' `week-actions` renders nine keys and asks
 * nobody for anything, so the honest reading of REQUESTS was "this island's data appears from
 * nowhere". It does not — the PAGE fetches it, the archipelago says so in `sources`, and that
 * declaration existed in the file, was checked by `sources-live`, and was reachable nowhere at
 * runtime.
 *
 * One row per declared source: the keys it produces, and what actually established them HERE. In the
 * lagoon that is usually the seed, which is the point rather than a failing — the page's fetch is
 * exactly what a preview stands in for, and naming the module says what the ocean will run.
 */
function SourceRows() {
  const islands = getMountedIslands();
  if (!islands.length) return null;
  const store = islands[0].store;
  const sources = lens.sourcesFor(store);
  if (!sources.length) return null;
  const moves = lens.moves.get(store) ?? new Map();
  const channelKeys = new Set(getChannels().filter((c) => c.store === store).flatMap((c) => [...c.keys]));
  const called = new Set(hostCalls().map((c) => c.module));
  // THE NUMBER WORTH WATCHING is not how many sources a region has — the page owning its data is the
  // design, not a debt — but how many of them RAN here. INSTALLED means a channel produced its keys —
  // nothing else. Counting "an island called this module" as installed put `revenue` in the installed
  // column while `sources-live` called it seeded, and the check was right: the island fetching from
  // the same module is a different consumer, and it does not produce the key the page owes the region.
  const installed = sources.filter(([, src]) => [...(src.produces ?? [])].some((k) => channelKeys.has(k))).length;

  return (
    <>
      <Sub>
        declared sources · page → region ({sources.length} · {installed} installed, {sources.length - installed} seeded)
      </Sub>
      {sources.map(([name, source]) => {
        const keys = [...(source.produces ?? [])];
        // WHAT ESTABLISHED THESE KEYS, in the order that answers the question: fetched here beats a
        // channel beats the seed, and a key with no value at all is the finding.
        const viaChannel = keys.some((k) => channelKeys.has(k));
        // An island calling the same module is worth SAYING and is not this source running.
        const alsoCalled = source.module && called.has(source.module);
        const moved = keys.filter((k) => moves.has(k)).length;
        const held = keys.filter((k) => store.has(k)).length;
        // ok: something ran here. warn: the keys hold values but the declared source did not produce
        // them — in the lagoon that is the seed standing in for the page's fetch, which is the normal
        // reading. broken: nothing holds a value, which is the finding.
        const tone: MotuDotTone = viaChannel ? 'ok' : held ? 'warn' : 'broken';
        return (
          <Row
            key={name}
            mono
            className="ch"
            title={`${name}${source.module ? ` — ${source.module}` : ''}\nproduces: ${keys.join(', ')}`}
          >
            <Dot tone={tone} />
            <span className="motu-ellipsis">{name}</span>
            <Trail>
              {viaChannel
                ? 'via channel'
                : held
                  ? `seeded · ${moved} moved${alsoCalled ? ' · module called by an island' : ''}`
                  : 'nothing holds a value'}
            </Trail>
            {source.module && (
              <span className="pay" title={source.module}>
                {sourceLabel(source.module)}
              </span>
            )}
            <span className={`links${held ? '' : ' warn'}`}>
              → {keys.slice(0, 4).join(', ')}
              {keys.length > 4 ? ` +${keys.length - 4}` : ''}
            </span>
          </Row>
        );
      })}
    </>
  );
}

/**
 * Region OUTPUT: what the region PUSHES to the ocean — host intents (navigate, open, toast).
 *
 * The calls used to live here too, under "→ backend", and they do not belong: a request is not an
 * output. It is the region ASKING for something, and what comes back is its input — which is why
 * looking for "the requests feeding this archipelago" under OUTPUT finds nothing and reads as if
 * nothing fetched.
 */
function RegionOutput() {
  const slots = new Set(getMountedIslands().map((i) => i.slot));
  const intents = lens.intents.filter((i) => i.source != null && slots.has(i.source));
  return (
    <Group seam="output">
      <Sub>host intents · → ocean ({intents.length})</Sub>
      {!intents.length && <Empty>No intents pushed.</Empty>}
      {intents.slice(0, 8).map((i, n) => (
        <IntentRow key={n} intent={i} />
      ))}
    </Group>
  );
}

/**
 * Region COUPLING: per shared store key, WHO reads and writes it, flagging demotion candidates (only
 * one island involved) and accreting coupling (touched by many).
 *
 * Naming the islands is the whole point of this view: "1r/1w" is the same string whether one island
 * reads a key nobody else touches or one island writes what ANOTHER one reads — and the second is the
 * only genuine coupling an archipelago has. The counts alone also made that second case read as a
 * demotion candidate, i.e. the view flagged the one real coupling on the page as removable.
 */
function RegionCoupling() {
  const groups = new Map<Store, MountedIslandInfo[]>();
  for (const info of getMountedIslands()) {
    const g = groups.get(info.store);
    if (g) g.push(info);
    else groups.set(info.store, [info]);
  }
  if (!groups.size) {
    return (
      <Group seam="coupling">
        <Sub>shared store keys · Nr / Mw</Sub>
        <Empty>No store activity.</Empty>
      </Group>
    );
  }

  const rows: ReactElement[] = [];
  for (const [store, islands] of groups) {
    const readers = new Map<string, Set<string>>();
    for (const info of islands) {
      for (const key of bindKeys(info)) {
        let set = readers.get(key);
        if (!set) readers.set(key, (set = new Set()));
        set.add(info.slot);
      }
    }
    const writers = lens.writes.get(store) ?? new Map<string, Set<string>>();
    const keys = new Set<string>([...readers.keys(), ...writers.keys()]);
    for (const key of [...keys].sort()) {
      const rd = readers.get(key) ?? new Set<string>();
      const wr = writers.get(key) ?? new Set<string>();
      // Host- and channel-origin writes are the OCEAN feeding the region, not an island: they say the
      // key is externally fed, never that two islands are entangled.
      const islandWriters = [...wr].filter((w) => w !== 'host' && w !== 'channel');
      const external = wr.size > islandWriters.length;
      const touchers = new Set<string>([...rd, ...islandWriters]);
      // An externally-fed key is not a demotion candidate: `bind` IS how the ocean reaches one island,
      // and there is nothing to demote it to. What stays worth flagging is a key that one island reads
      // and NOTHING has been seen to feed.
      const demotion = touchers.size <= 1 && !external;
      const coupling = touchers.size >= 3;
      const from = external ? ['host'] : islandWriters;
      rows.push(
        <Row key={`${key}-${rows.length}`} mono className="cp">
          <span>{key}</span>
          <span style={{ color: 'var(--ink-faint)' }}>
            {rd.size}r/{wr.size}w
          </span>
          <span className="who">
            {!!from.length && (
              <>
                <b>{from.join(',')}</b>{' → '}
              </>
            )}
            {rd.size ? [...rd].join(',') : '∅'}
          </span>
          {coupling ? (
            <Pill size="micro" tone="broken" style={{ marginLeft: 'auto' }}>
              coupled
            </Pill>
          ) : demotion ? (
            <Pill size="micro" tone="warn" style={{ marginLeft: 'auto' }}>
              demote?
            </Pill>
          ) : null}
        </Row>,
      );
    }
  }

  // KEYED BY INDEX AS WELL AS NAME. A store key can appear in more than one of these lists — two
  // laundering suspects can name the same key, and React then silently duplicates or drops a row. The
  // lens found this in its own panel the first time anything drove a region hard enough to produce
  // two, which is the argument for driving one.
  //
  // An observation that has seen NOTHING. Silence from an instrument reads exactly like a clean
  // region, and is the more likely of the two: the adapter derives its keys from the host's store, and
  // a convention it depends on can change without anyone noticing here.
  for (const [i, o] of foreignObservations().entries()) {
    if (o.writesSeen > 0) continue;
    rows.push(
      <Row key={`fo-${i}-${o.regionId}`} mono className="cp">
        <span>{o.regionId}</span>
        <span className="who">watching {o.watching.length} key(s)</span>
        <Pill
          size="micro"
          tone="warn"
          style={{ marginLeft: 'auto' }}
          title="nothing has been observed since this region mounted — is the adapter still finding its keys?"
        >
          {o.instrumented ? 'instrumented, nothing observed' : 'subscribed, nothing observed'}
        </Pill>
      </Row>,
    );
  }

  // A key an island DECLARES it owns, moved in a store motu does not own, with no declared output to
  // account for it. Only ever populated when the host installs a `StoreAdapter`. The culprit is
  // deliberately absent: naming it would mean being in the write path, which is the rewrite the
  // adapter seam exists to avoid.
  for (const [i, w] of unattributedWrites().entries()) {
    rows.push(
      <Row key={`uw-${i}-${w.key}`} mono className="cp">
        <span>{w.key}</span>
        <span className="who">
          <b>{w.declaredOwner}</b> declared owner
        </span>
        <Pill
          size="micro"
          tone="warn"
          style={{ marginLeft: 'auto' }}
          title="this key moved in the host's own store and no declared output accounts for it"
        >
          wrote outside the declaration
        </Pill>
      </Row>,
    );
  }

  // Provenance the declarations cannot prove: the host wrote a key an island reads, moments after
  // another island emitted. Reported here because it is a suspicion, not a violation.
  for (const [i, s] of launderingSuspects().entries()) {
    rows.push(
      <Row key={`ls-${i}-${s.key}`} mono className="cp">
        <span>{s.key}</span>
        <span className="who">
          <b>host</b> → {s.readers.join(',')}
        </span>
        <Pill size="micro" tone="warn" style={{ marginLeft: 'auto' }}>
          after {s.after.slot}
        </Pill>
      </Row>,
    );
  }

  return (
    <Group seam="coupling">
      <Sub>shared store keys · Nr / Mw</Sub>
      {rows.length ? rows : <Empty>No shared store keys.</Empty>}
    </Group>
  );
}

// --- Shared rows --------------------------------------------------------------------------------

/**
 * COVERAGE: has the region ever actually been in the state you are looking at?
 *
 * The one question in this panel that is not about the declaration. Everything else compares the
 * region to what it says about itself — this compares it to what it HAS BEEN, using a corpus of
 * production states baked into the build by `motu region coverage <id> --save`.
 *
 * WHY IT IS HERE AND NOT ONLY IN THE CLI. `motu region coverage` compares a corpus to the region's
 * flows: a file against a file, and the right way to answer "what should we preview next?". It has no
 * running region, so it cannot answer the question a person in front of the lagoon actually has —
 * *does this state happen?* A scenario that renders beautifully in a state production never reaches
 * is the fixture-inventing-a-vocabulary failure, it passes every static check motu has, and CLAUDE.md
 * records it as one of the two things only opening the page has ever caught. Here it is one line.
 *
 * Absent a corpus this renders NOTHING — not an empty state. A panel that shows an empty coverage box
 * to every project that never enabled coverage is teaching people to skip a section.
 */
function RegionCoverage() {
  const islands = getMountedIslands();
  if (!islands.length) return null;
  const store = islands[0].store;
  const regionId = regionIdOfStore(store);
  const corpus = corpusFor(regionId);
  if (!corpus) return null;

  // WHAT THE REGION DECLARES TODAY — the same union the sheet above is built from, so the two cannot
  // disagree about what this region is. The fold itself runs over the CORPUS' keys (a fingerprint is
  // only comparable over the same list); these are here so `drift` has something to compare against.
  const declaredKeys = new Set<string>();
  for (const info of islands.filter((i) => i.store === store)) {
    for (const key of writtenKeys(info.spec)) declaredKeys.add(key);
    for (const key of bindKeys(info)) declaredKeys.add(key);
  }
  // THE REGION'S DECLARED ENUMS, not none.
  //
  // A key the archipelago declares a closed set fingerprints as `= last`, not `set`. Folding the live
  // region without them produces `set` for exactly those keys, so EVERY state would miss its corpus
  // row and the section would read "never recorded" for a region whose coverage is perfect — a
  // wrong answer that looks like a finding, which is the worst kind.
  const enums = archipelagoConfigs().find((c) => c.id === regionId)?.coverage?.enums ?? [];
  const cov = liveCoverage(corpus, [...declaredKeys].sort(), (k) => store.get(k), enums);
  const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

  return (
    <Group seam="coverage">
      <Sub>
        {corpus.entries.length} recorded state(s) · {cov.total} occurrence(s)
      </Sub>

      {cov.drift && (
        // Said rather than silently worked around: a fingerprint over one key set cannot be placed in
        // a corpus recorded over another, so every verdict below would be confidently wrong.
        <Notice tone="warn">
          the corpus was recorded against a different declaration — {cov.drift.onlyRecorded.length} key(s) gone
          ({cov.drift.onlyRecorded.join(', ') || '—'}), {cov.drift.onlyDeclared.length} added
          ({cov.drift.onlyDeclared.join(', ') || '—'}). Re-record before trusting this.
        </Notice>
      )}

      {/* THIS STATE — the line the CLI cannot write. */}
      <Table className="cov" columns="1fr auto">
        <span className="k">on screen now</span>
        {/* THREE VERDICTS, NOT TWO. Under drift the honest answer is neither "recorded" nor "never
            recorded" — a state folded over one key list cannot be looked up in a corpus folded over
            another, so "never recorded" would be a finding manufactured by the mismatch. It read
            exactly that way before the drift notice existed to contradict it. */}
        {cov.drift ? (
          <Pill tone="neutral" mono>
            not comparable
          </Pill>
        ) : cov.entry ? (
          <Pill tone="ok" mono>
            production reaches this · {cov.entry.count}× · {pct(cov.share)}
          </Pill>
        ) : (
          <Pill tone="warn" mono>
            never recorded
          </Pill>
        )}
      </Table>
      {/* The fingerprint on its own wrapped line, because it IS the content of this section — in the
          row above it truncated at the column edge, which hid the very keys a reader is checking. */}
      <div className="cov-fp">{cov.id}</div>
      {!cov.entry && !cov.drift && (
        <Sub>no beacon has reported this combination — either it cannot happen, or nobody has reached it yet</Sub>
      )}

      {/* THE WORKLIST, beside the region it is about: what production does that you are not looking at.
          THE HEADING CARRIES THE SEMANTICS. Each row shows only the keys that DIFFER from the state on
          screen, so a bare "64% busy:true" reads as "64% of production has busy:true" — a different and
          much stronger claim than the true one, which is "the state holding 64% differs from this one
          by busy:true". Naming the comparison in the heading is what stops the misreading. */}
      {cov.ranked.filter((r) => !r.current).length > 0 && <Sub>how the recorded states differ from this one</Sub>}
      {cov.ranked
        .filter((r) => !r.current)
        .slice(0, 6)
        .map((r, n) => (
          <Table
            // INDEX IN THE KEY. The fingerprint looks like a unique id and is not guaranteed to be
            // one: a corpus is only deduped by whatever folded it, and two entries sharing a
            // fingerprint make React drop one row silently — the same duplicate-key bug the coupling
            // view had. Malformed input should render badly and visibly, never quietly short.
            key={`${r.id}#${n}`}
            className="cov"
            columns="52px 1fr"
            title={`${r.id}\nseen ${r.entry.count}\u00d7, last ${ago(r.entry.lastAt)}`}
          >
            <span className="share">{pct(r.share)}</span>
            <span className="val">{r.diff || '\u2014 identical to this one'}</span>
          </Table>
        ))}
    </Group>
  );
}

/** The whole fingerprint, one key per line — for a title attribute, where length is free. *//** The whole fingerprint, one key per line — for a title attribute, where length is free. */
function fingerprintLine(fp: Record<string, string>): string {
  return Object.keys(fp)
    .sort()
    .map((k) => `${k}: ${fp[k]}`)
    .join('\n');
}

function CallRow({ call: c, dup }: { call: CallRecord; dup: boolean }) {
  const bits: string[] = [];
  if (c.status) bits.push(String(c.status));
  if (c.durationMs != null) bits.push(`${Math.round(c.durationMs)}ms`);
  if (dup) bits.push('×dup');
  return (
    <Row mono>
      <Dot tone={PHASE_TONE[c.phase] ?? 'neutral'} title={c.error ?? c.phase} />
      <span className="motu-ellipsis">
        {c.service}/{c.method}
      </span>
      {c.island && <span style={{ color: 'var(--w-deep)' }}>{c.island}</span>}
      <Trail>{bits.join(' · ')}</Trail>
    </Row>
  );
}

function IntentRow({ intent: i }: { intent: HostIntent }) {
  return (
    <Row mono>
      <Dot tone="external" />
      <span className="motu-ellipsis">
        {i.kind}: {i.name}
      </span>
      {i.source && <span style={{ color: 'var(--w-deep)' }}>{i.source}</span>}
      <Trail>{ago(i.at)}</Trail>
    </Row>
  );
}

// --- Acts the panel's own controls perform --------------------------------------------------------

function setPicking(on: boolean): void {
  lens.picking = on;
  // The page's own cursor says what mode you are in; the overlay layer can't (it is inert).
  document.body.style.cursor = on ? 'crosshair' : '';
  lens.changedNow();
}

/**
 * Human fixture capture. Toggles the runtime recorder (read-only — it only observes call()); on stop,
 * serializes the captured calls into the SAME request-keyed fixtures text the CLI produces and both
 * downloads it and copies it to the clipboard (the browser can't write into the workspace).
 */
function toggleRecording(): void {
  if (!lens.recording) {
    startRecording();
    startSeedRecording();
    lens.recording = true;
    lens.recStatus = '';
  } else {
    const calls = stopRecording();
    const seedWrites = stopSeedRecording();
    lens.recording = false;
    lens.recStatus = exportFixtures(calls, seedWrites);
  }
  lens.changedNow();
}

function exportFixtures(calls: RecordedCall[], seedWrites: RecordedSeed[]): string {
  const seen = new Set<string>();
  const unique: RecordedCall[] = [];
  for (const c of calls) {
    const key = `${c.service}.${c.method}(${JSON.stringify(c.args)})`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  // Host-fed writes (channels + provide) reduced to a last-wins seed of REAL host config.
  const seed: Record<string, unknown> = {};
  for (const w of seedWrites) seed[w.key] = w.value;
  const seedKeys = Object.keys(seed);
  if (!unique.length && !seedKeys.length) return 'nothing captured (no calls, no host-fed writes)';

  const text = renderRecordedFixtures(unique, seed);
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fixtures.recorded.ts';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unsupported — clipboard still carries it */
  }
  navigator.clipboard?.writeText(text).catch(() => {});
  const parts: string[] = [];
  if (unique.length) parts.push(`${unique.length} call(s)`);
  if (seedKeys.length) parts.push(`${seedKeys.length} seed key(s)`);
  return `${parts.join(' + ')} → fixtures.recorded.ts (downloaded + copied)`;
}

export { setPicking };
