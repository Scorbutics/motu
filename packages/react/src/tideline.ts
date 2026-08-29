// The lagoon's chrome, as a little BAY of water in one corner of the screen.
//
// The problem it solves: the lagoon used to put a switcher row, a floating chip bar and a badge above
// the archipelago, so the first screenful of a "preview the real region" tool was mostly tool.
//
// This started as a full-width waterline along the top edge, and that was wrong for a reason worth
// recording: an EDGE is something a page claims. This project's own region pins its toolbar to top:0
// under 720px, and its mobile filter sheet puts Done at the bottom edge — so a band across either
// edge is permanently sitting on somebody's controls, no matter how click-through it is. A corner
// patch is small enough that it can only ever collide with one corner, and WHERE it sits is the
// human's choice: EIGHT docks — each of the four corners, along either of that corner's two edges.
// The vertical docks are the same wave rotated 90° and stood against the left or right edge, which
// is what lets the bay get out of the way of a page that has claimed the horizontal edge (or the
// other way round). Drag it there, or pick a dock from the palette. The choice sticks.
//
// The water is not decoration — it IS the readout: MOCK is calm deep-teal lagoon, HTTP is the same
// water lit brighter and flowing ~2x faster (live backend), and the whole bay floods amber while the
// region wears the LEGACY fit. The bay says it in words too, on the pill: `<region> · <state>`.
//
// The bay is a CAPSULE, and the water is its fill. It used to be the other way round — the wave crest
// was the top edge, the inner end dissolved into a mask fade, one corner of four was rounded, and a
// 26x3 white bar sat on it. Three edge treatments, no closed outline, and the loudest mark on it was
// the shape of a slider thumb promising a slide that does not exist. Same water, inside a pill with a
// definite edge; the chrome is one flex row on it; and the eight docks are untouched, because a pill
// is symmetric and the rotation table still serves all of them.
//
// Implementation notes:
//   * The bay hosts the shared @motu/core toolbar (setMotuToolbarHost) rather than duplicating the
//     transport/fit controls — so those packages stay unchanged and keep owning their state.
//   * The debug lens is the exception, and it now draws its OWN trigger: a tab on the edge of its
//     panel, in @motu/debug-overlay. It was a buoy moored here, which put the trigger for a page-wide
//     lens a layer away from the thing it opens (and 17px of it, on moving water). The lens is still
//     INJECTED (`opts.lens`) so this module never imports the dev-only package — what the injection
//     buys now is the palette entry.
//   * The command palette builds its transport/fit/debug entries by READING those hosted chips and
//     clicking them. Any control a future package mounts into the toolbar becomes searchable for
//     free, with no registry to keep in sync.
//   * Everything corner-dependent (anchor, wave orientation, which corner is rounded, where the
//     panel grows) is driven by one `data-corner` attribute in CSS, so moving the bay is one
//     assignment and there is no second source of truth to drift.

import { setMotuToolbarHost, flood, applyFlood, clearFlood, floodFrames, type FloodFrom } from '@motu/core';
import { motuKitCss } from '@motu/chrome/kit';
import { motuDockCss } from '@motu/chrome/dock';
import { MOTU_MARK_SVG } from '@motu/chrome/mark';

export type TideView = 'region' | 'mountpoints';
/**
 * Which vertical edge the dock stands against.
 *
 * It used to be eight docks — four corners times the two edges each corner has — because the dock
 * was a small capsule that could lie either way. A full-height rail cannot sit in a corner, so the
 * choice is now the only one the shape admits. The REASON for offering a choice is unchanged: the
 * dock claims a strip, the one collision left is with whatever occupies that strip, and rather than
 * guess which side is free, hand it over.
 */
export type TideEdge = 'left' | 'right';

export interface TideStation {
  /** Archipelago id — what gets written to <motu-archipelago name>. */
  id: string;
  /** Human label shown in the panel and in the palette. */
  label: string;
}

/**
 * The debug seam lens, handed in rather than imported. @motu/debug-overlay is a dev-only package that
 * a production root must be able to shake out entirely, so the chrome takes the three calls it needs
 * and stays ignorant of what is behind them. The lens draws its OWN trigger (a tab on its panel); what
 * this buys the bay is the palette entry — the keyboard way in. Omit it and that entry is absent.
 */
export interface TideLens {
  toggle(): void;
  isOpen(): boolean;
  subscribe(fn: (open: boolean) => void): () => void;
  /**
   * Render the lens' FINDINGS into a container the dock owns, and return the teardown.
   *
   * The direction is inverted on purpose, and it is the same inversion `setMotuToolbarHost` already
   * uses for the transport chips: the dock hands over a box, the lens fills it. @motu/debug-overlay
   * is dev-only and a production root has to shake it out entirely, so the dock cannot import it to
   * ask what a finding looks like — and does not need to.
   *
   * Optional, so a lens that predates this still satisfies the interface and simply has no tab.
   */
  mountFindings?(container: HTMLElement): () => void;
  /**
   * The findings as DATA, for a panel drawn in another document.
   *
   * `mountFindings` hands over a container, which only works when the panel and the lagoon share a
   * document. The host draws the chrome outside the artifact, so what has to cross is the result,
   * not the DOM.
   */
  findings?(): unknown;
  /** The region sheet as data — one row per declared key. See `findings` for why it is not DOM. */
  sheet?(): unknown;
  /** Channels, calls and intents — the rest of the lens, as data. See `findings` for why. */
  seams?(): unknown;
  /** One entry per mounted island: what it was given, what it reads, writes and emits. */
  islands?(): unknown;
  /** Per shared key: who reads it, who writes it, and whether that is real coupling. */
  coupling?(): unknown;
  /** What production does that this state is not: the region against the world, not its declaration. */
  coverage?(): unknown;
  /**
   * Fixture capture, which is an ACT rather than a view — the first thing the panel asks the lagoon
   * to DO rather than to report. Start it, stop it, and stopping writes the fixtures out.
   */
  toggleRecording?(): { recording: boolean; status: string };
  recordingState?(): { recording: boolean; status: string };
  /**
   * Called whenever anything the lens reports has moved.
   *
   * Without it a panel in another document paints once and then describes a region that has moved
   * on — a stale answer that looks live, which is worse than showing nothing.
   */
  watch?(fn: () => void): () => void;
}

export interface TideLineOptions {
  stations: TideStation[];
  /** Build-time transport mode; tints the water. (Switching it reloads, so it needs no live wiring.) */
  transport: 'mock' | 'http';
  /** Prose shown by the palette's "About this lagoon" entry — the old footer paragraph. */
  about: string;
  onStation(id: string): void;
  onView(view: TideView): void;
  /**
   * Run one of the region's declared FLOWS, or `null` to go back to the state the page seeds.
   *
   * The panel could switch between regions and not between the STATES a region has been declared to
   * reach, so the flows — the states someone wrote down, the ones the checks assert on — were
   * reachable only by editing a URL. Omit this and the column does not appear.
   */
  onFlow?(name: string | null): void;
  /** Wire the palette's lens entry to a debug lens. Omit it and the palette has no lens command. */
  lens?: TideLens;
}

export interface TideLine {
  /**
   * Reflect the mounted state back onto the panel (lit segment + sliding thumb).
   *
   * `label` is for what is mounted but is NOT a station: an addressed island lights nothing in the
   * list (it is not a region) and would otherwise leave the bar reading as though nothing were open.
   */
  setActive(stationId: string, view: TideView, label?: string): void;
  /**
   * The flows of whichever region is mounted, and which one is showing.
   *
   * Handed in per mount rather than once at construction: they belong to the region, and the panel
   * outlives every region it shows.
   */
  setFlows(flows: TideFlow[], active?: string | null): void;
  /** Say how the last run went, under the list. */
  setFlowOutcome(text: string | null, ok?: boolean): void;
}

/** One declared flow, as the panel lists it. */
export interface TideFlow {
  name: string;
  steps: number;
}

const EDGE_KEY = 'motu:lagoon:tide-edge';
const EDGES: TideEdge[] = ['left', 'right'];
const EDGE_LABEL: Record<TideEdge, string> = { left: 'left edge', right: 'right edge' };
/** The right edge: an application's own furniture (nav, toolbar, mobile action row) crowds the top,
 *  the bottom and the left far more often than it crowds the right. A human can move it. */
const DEFAULT_EDGE: TideEdge = 'right';

/** Along the docked edge. Longer than the visible water: the inner ~44% is a fade. */
const PATCH_LONG = 168;
/** Across it — the depth of the shallows. */
const PATCH_SHORT = 34;

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The dock's own stylesheet now lives in `@motu/chrome/dock`, because the host draws the same dock
// from outside the artifact and two copies of it would drift. What stays here is the palette, which
// is still the artifact's own.
const CSS = `${motuDockCss()}

/* ── command palette ─────────────────────────────────────────────────────────────────────── */
#tide-palette {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
  background: rgba(20, 32, 28, .30);
  backdrop-filter: blur(3px);
  font: 500 14px/1.4 "Inter", ui-sans-serif, system-ui, sans-serif;
}
#tide-palette[hidden] { display: none; }
#tide-palette .box {
  width: min(540px, calc(100vw - 32px));
  background: #fffefb;
  border-radius: 16px;
  box-shadow: 0 30px 70px rgba(15, 23, 42, .32);
  overflow: hidden;
  animation: tide-pop 200ms cubic-bezier(.2,1.2,.4,1);
}
@keyframes tide-pop { from { transform: translateY(-10px) scale(.97); opacity: 0; } }
#tide-palette input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #eee8dc;
  padding: 16px 18px;
  font: inherit;
  font-size: 15px;
  color: var(--ink);
  outline: none;
  background: transparent;
}
#tide-palette ul { list-style: none; margin: 0; padding: 6px; max-height: 46vh; overflow-y: auto; }
#tide-palette li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 9px;
  cursor: pointer;
  color: #3d4a44;
  animation: tide-row 180ms ease both;
}
@keyframes tide-row { from { opacity: 0; transform: translateX(-6px); } }
#tide-palette li[aria-selected="true"] {
  background: color-mix(in srgb, var(--motu-primary, #0f766e) 9%, #fff);
  color: var(--motu-primary, #0f766e);
}
#tide-palette li .kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--ink-faint);
  margin-left: auto;
}
#tide-palette li mark { background: transparent; color: var(--motu-primary, #0f766e); font-weight: 700; }
#tide-palette li[aria-selected="true"] mark { color: var(--motu-primary-deep, #0b5b55); }
#tide-palette .about {
  padding: 14px 18px;
  color: #6b7280;
  font-size: 12.5px;
  border-top: 1px solid #eee8dc;
  background: #faf8f4;
}
#tide-palette .about code { background: #f0ece3; padding: 1px 5px; border-radius: 4px; }
#tide-palette .empty { padding: 18px; color: var(--ink-faint); font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  /* The dock's own rule is up with the dock. The wave itself is a WAAPI animation and is skipped in
   * JS, because a CSS rule cannot reach it. */
  #tide-palette .box, #tide-palette li { animation: none; }
}
`;

/**
 * One layer of the water, in CSS pixels (never scaled — see drawWave). The shape is filled, not
 * stroked: an alternating-quadratic crest, then closed up to y=0 so everything above the crest is
 * water. It runs `period` px past the right edge, which is what makes the -1 period shift seamless.
 */
interface WaveLayer {
  /** Where the crest sits across the bay's depth — smaller = closer to the docked edge. */
  baseline: number;
  amplitude: number;
  /** Period as a multiple of the BAY's width, so the swell is scaled to the thing it lives in. */
  periodFactor: number;
  /** Drift in px/s. Deliberately slow: a small element with a fast wave reads as a loading spinner. */
  speed: number;
  /** Start the crest on a trough instead of a peak, offsetting this layer against the others. */
  inverted?: boolean;
  /** Drift the other way, so the layers cross rather than march together. */
  reverse?: boolean;
  fill: string;
  opacity: number;
  /** Foam: draw the crest as an open stroked line instead of a filled mass. */
  stroke?: string;
}

/** Back to front. The last filled one is the opaque body; the others peek out beyond its crest. */
//
// The crest sits LOW — a shoreline along the docked edge rather than a waterline across the middle.
// It used to sit at half the bay's depth, which was right when the water was the whole element; in a
// capsule the row runs through that same middle, and the foam stroke cut across the label. Lowering
// it leaves the readout on the pill's solid body and keeps the swell where it belongs.
const WAVE_LAYERS: WaveLayer[] = [
  { baseline: 14, amplitude: 3.6, periodFactor: 1.6, speed: 15, fill: 'var(--w-shallow)', opacity: 0.34 },
  { baseline: 11, amplitude: 3.2, periodFactor: 1.15, speed: 19, inverted: true, reverse: true, fill: 'var(--w-mid)', opacity: 0.5 },
  { baseline: 8, amplitude: 2.8, periodFactor: 0.85, speed: 17, fill: 'url(#tide-body)', opacity: 1 },
  // Foam: rides exactly the body's crest (same geometry + speed), so it reads as light catching the
  // edge of the water rather than as a fourth wave.
  { baseline: 8, amplitude: 2.8, periodFactor: 0.85, speed: 17, fill: 'none', stroke: 'rgba(255,255,255,.5)', opacity: 0.9 },
];

function layerPeriod(layer: WaveLayer): number {
  return PATCH_LONG * layer.periodFactor;
}

function wavePath(layer: WaveLayer): string {
  const period = layerPeriod(layer);
  const half = period / 2;
  const amp = layer.inverted ? -layer.amplitude : layer.amplitude;
  const halves = Math.ceil((PATCH_LONG + period) / half);
  let d = `M0 ${layer.baseline} q ${half / 2} ${-amp} ${half} 0`;
  for (let i = 1; i < halves; i++) d += ` t ${half} 0`;
  // Foam stays an open curve; a filled layer closes upward, so everything above the crest is water.
  return layer.stroke ? d : `${d} L ${halves * half} 0 L 0 0 Z`;
}

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

/** Little splash of droplets at a click point — the acknowledgement that something switched. */
function splash(x: number, y: number, color: string): void {
  if (REDUCED()) return;
  for (let i = 0; i < 9; i++) {
    const drop = el('span');
    const size = 3 + Math.random() * 3;
    drop.style.cssText =
      `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${color};pointer-events:none;z-index:2147483647;will-change:transform,opacity`;
    document.body.appendChild(drop);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const dist = 26 + Math.random() * 46;
    drop
      .animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 34}px) scale(.4)`,
            opacity: 0,
          },
        ],
        { duration: 540 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.4,1)' },
      )
      .finished.then(() => drop.remove(), () => drop.remove());
  }
}

/** Subsequence match. Returns null when `q` doesn't fit, else the matched indices (for highlighting). */
function fuzzy(text: string, q: string): number[] | null {
  if (!q) return [];
  const hay = text.toLowerCase();
  const hits: number[] = [];
  let at = 0;
  for (const ch of q.toLowerCase()) {
    if (ch === ' ') continue;
    const found = hay.indexOf(ch, at);
    if (found === -1) return null;
    hits.push(found);
    at = found + 1;
  }
  return hits;
}

/** Score a match: earlier + tighter wins, so "mem" puts Members above "Org Lookup · Mountpoints". */
function score(hits: number[]): number {
  if (!hits.length) return 0;
  // Non-empty: the guard above returns for an empty list.
  const spread = hits[hits.length - 1]! - hits[0]!;
  return -(hits[0]! * 3 + spread);
}

/** Which edge a point is nearer. One axis, because there are only two docks. */
function edgeAt(x: number): TideEdge {
  return x < window.innerWidth / 2 ? 'left' : 'right';
}

function readEdge(): TideEdge {
  try {
    const stored = localStorage.getItem(EDGE_KEY);
    return EDGES.includes(stored as TideEdge) ? (stored as TideEdge) : DEFAULT_EDGE;
  } catch {
    return DEFAULT_EDGE;
  }
}

interface Command {
  label: string;
  kind: string;
  run(): void;
}

/**
 * The kit's shapes, for the dock to use instead of redrawing them.
 *
 * SCOPED TO #tide, and that is the whole reason this is not just `installMotuChrome()`. The dock is
 * injected into somebody ELSE'S application — peps, Twenty, whatever adopted motu — and the chrome
 * sheet sets custom properties on :root and resets the page. Handing a host application our --ink and
 * our body background because it happens to render a dock would be indefensible. `motuKitCss('#tide')`
 * puts the VARIABLES under the dock's own id; the shape rules are class-based and live in motu's own
 * `motu-` namespace, where they collide with nothing.
 *
 * ONCE PER DOCUMENT, by id. A page can mount a dock more than once (the lagoon does, across frames),
 * and a second copy of an identical sheet is only waste — but the host app case matters more: it may
 * already have installed the chrome itself, and this must not fight it.
 */
function installKit(): void {
  if (typeof document === 'undefined' || document.getElementById('motu-kit-css')) return;
  document.head.appendChild(el('style', { id: 'motu-kit-css' }, motuKitCss('#tide')));
}

export function mountTideLine(opts: TideLineOptions): TideLine {
  installKit();
  document.head.appendChild(el('style', { id: 'tide-css' }, CSS));

  // ── panel ──────────────────────────────────────────────────────────────────────────────────
  const bar = el('div', { class: 'panel', role: 'group', 'aria-label': 'Lagoon controls' });
  /** The rig's pill row — where the hosted toolbar chips and the dock's own toggles sit together. */
  const rigPills = el('div', { class: 'rig__pills' });
  /** The two lists, stacked in one scrolling column. */
  const scroll = el('div', { class: 'scroll' });

  /** A segmented pill row — right for a fixed pair like the view toggle, wrong for an open-ended set. */
  function segmented(cap: string): { grp: HTMLElement; thumb: HTMLElement } {
    const thumb = el('span', { class: 'motu-segmented__thumb' });
    const grp = el('div', { class: 'motu-segmented', role: 'group', 'aria-label': cap }, thumb);
    rigPills.appendChild(grp);
    return { grp, thumb };
  }

  const accent = () => getComputedStyle(tide).getPropertyValue('--tide-accent').trim() || '#0f766e';

  // ── archipelago list ───────────────────────────────────────────────────────────────────────
  // Above this many, scanning the list is slower than typing at it, so it grows its own filter.
  // (The palette can always search everything; this is for when the panel is already open.)
  const FILTER_FROM = 7;

  const rail = el('span', { class: 'motu-rail' });
  const listInner = el('div', { class: 'list__inner' }, rail);
  const listBox = el('div', { class: 'list', role: 'listbox', 'aria-label': 'Archipelago' }, listInner);
  const emptyNote = el('p', { class: 'motu-empty', hidden: '' }, 'No archipelago matches.');
  const listHead = el(
    'div',
    { class: 'sect__head' },
    el('span', { class: 'motu-dot' }),
    el('span', { class: 'motu-cap' }, 'Regions'),
    el('span', { class: 'count' }, `${opts.stations.length}`),
  );
  const listCol = el('div', { class: 'sect' }, listHead);

  // ONE FILTER, ABOVE BOTH LISTS. It used to appear inside the region column and only past seven
  // regions, which meant the states — the longer list, and the one whose names are sentences — could
  // never be searched at all. FILTER_FROM still decides whether the regions list is worth filtering;
  // what it no longer decides is whether a filter exists.
  const filter = el('input', {
    class: 'motu-search',
    type: 'search',
    placeholder: 'Filter regions and states…',
    'aria-label': 'Filter regions and states',
  }) as HTMLInputElement;
  listCol.append(listBox, emptyNote);
  scroll.appendChild(listCol);

  // A LIST of rows, not a map keyed by id: keying by id silently collapses two entries that share
  // one (a project may well surface the same archipelago under two labels), which would drop rows
  // from the filter and misplace the rail.
  const rows: { station: TideStation; btn: HTMLButtonElement }[] = [];
  for (const station of opts.stations) {
    const btn = el(
      'button',
      { class: 'motu-opt', type: 'button', role: 'option', 'data-id': station.id },
      el('span', { class: 'lamp' }),
      station.label,
    ) as HTMLButtonElement;
    btn.addEventListener('click', (e) => {
      splash(e.clientX, e.clientY, accent());
      opts.onStation(station.id);
    });
    listInner.appendChild(btn);
    rows.push({ station, btn });
  }

  /** Stagger the swim-in across whatever is currently visible, so filtering re-times it correctly. */
  function restagger(): void {
    let i = 0;
    for (const { btn } of rows) {
      if (btn.hidden) continue;
      btn.style.animationDelay = `${Math.min(i, 9) * 26}ms`;
      i++;
    }
  }
  restagger();

  filter.addEventListener('input', () => {
    const q = filter.value.trim();
    let visible = 0;
    for (const { station, btn } of rows) {
      const hit = !q || fuzzy(station.label, q) !== null;
      btn.hidden = !hit;
      if (hit) visible++;
    }
    emptyNote.hidden = visible > 0;
    // THE STATES ARE FILTERED BY THE SAME BOX. A region's flows are named in sentences -- "a refused
    // password is reported, and the form stays usable" -- so they are the list that most needs
    // searching, and the one that never could be.
    let flowsVisible = 0;
    for (const { label: flowLabel, btn } of flowRows) {
      const hit = !q || fuzzy(flowLabel, q) !== null;
      btn.hidden = !hit;
      if (hit) flowsVisible++;
    }
    flowNote.hidden = flowsVisible > 0 || !flowRows.length;
    restagger();
  });

  // Arrow keys walk the list; Enter/Space is the button's own default.
  listBox.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const visible = rows.map((r) => r.btn).filter((b) => !b.hidden);
    const at = visible.indexOf(document.activeElement as HTMLButtonElement);
    const next = visible[(Math.max(at, 0) + (e.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length];
    next?.focus();
  });

  // ── flows ──────────────────────────────────────────────────────────────────────────────────
  //
  // WHAT THE REGION HAS BEEN DECLARED TO REACH, listed beside where it is mounted. A region's flows
  // are its promises written as data — a seed, an island's declared output, and what must be true
  // afterwards — and until this column existed the only way to LOOK at one was to know the URL. The
  // checks drove them, a human could not.
  //
  // Nothing here scripts anything: a row fires the flow's declared steps through the same seam the
  // check uses. There is no selector, no typing, no click to simulate.
  const flowInner = el('div', { class: 'list__inner' });
  const flowBox = el('div', { class: 'list', role: 'listbox', 'aria-label': 'Flow' }, flowInner);
  const flowCount = el('span', { class: 'count' }, '0');
  const flowHead = el(
    'div',
    { class: 'sect__head' },
    el('span', { class: 'motu-dot' }),
    el('span', { class: 'motu-cap' }, 'States'),
    flowCount,
  );
  const flowNote = el('p', { class: 'motu-empty' }, 'This region declares no flows.');
  const flowStatus = el('p', { class: 'hint', hidden: '' }, '');
  const flowCol = el('div', { class: 'sect' }, flowHead, flowBox, flowNote, flowStatus);
  if (opts.onFlow) scroll.appendChild(flowCol);

  let flowRows: { name: string | null; label: string; btn: HTMLButtonElement }[] = [];

  function paintFlows(active: string | null | undefined): void {
    for (const { name, btn } of flowRows) {
      const on = (name ?? null) === (active ?? null);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function setFlows(flows: TideFlow[], active?: string | null): void {
    if (!opts.onFlow) return;
    flowInner.replaceChildren();
    flowRows = [];
    flowCount.textContent = `${flows.length}`;
    baySub.textContent = `${flows.length} state${flows.length === 1 ? '' : 's'}`;
    flowNote.hidden = flows.length > 0;
    flowStatus.hidden = true;

    // THE SEEDED STATE IS A STATE, and it needs a way back. Running a flow leaves the region wherever
    // its last step put it; without this row the only way to see the page as the host establishes it
    // is to reload, which also throws away the region you had picked.
    type Row = { name: string | null; label: string; sub: string };
    const rowsToBuild: Row[] = flows.length
      ? [
          { name: null, label: 'As seeded', sub: 'the state the page establishes' } as Row,
          ...flows.map<Row>((f) => ({
            name: f.name,
            label: f.name,
            sub: `${f.steps} step${f.steps === 1 ? '' : 's'}`,
          })),
        ]
      : [];

    for (const row of rowsToBuild) {
      const btn = el(
        'button',
        { class: 'motu-opt', type: 'button', role: 'option', title: row.sub },
        el('span', { class: 'lamp' }),
        row.label,
      ) as HTMLButtonElement;
      btn.addEventListener('click', (e) => {
        splash(e.clientX, e.clientY, accent());
        paintFlows(row.name);
        opts.onFlow?.(row.name);
      });
      flowInner.appendChild(btn);
      flowRows.push({ name: row.name, label: row.label, btn });
    }
    paintFlows(active ?? null);
  }

  function setFlowOutcome(text: string | null, ok = true): void {
    flowStatus.hidden = !text;
    flowStatus.textContent = text ?? '';
    flowStatus.style.color = ok ? '' : 'var(--tide-danger, #b91c1c)';
  }

  const viewGroup = segmented('View');
  for (const [view, label] of [
    ['region', 'Region'],
    ['mountpoints', 'Mountpoints'],
  ] as const) {
    const btn = el('button', { type: 'button', 'data-view': view }, label);
    btn.addEventListener('click', (e) => {
      splash(e.clientX, e.clientY, accent());
      opts.onView(view);
    });
    viewGroup.grp.appendChild(btn);
  }

  const slot = el('div', { class: 'slot' });
  // A shortcut hint is noise on a device with no keyboard — there the same button is just "search".
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isMac = /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent);
  const kbd = el(
    'button',
    { class: 'motu-kbd', type: 'button', title: 'Command palette' },
    isTouch ? '⌕ Search' : isMac ? '⌘K' : 'Ctrl K',
  );
  kbd.addEventListener('click', () => openPalette());

  /**
   * BASELINES, FROM INSIDE THE LAGOON.
   *
   * A published page knows which repository it belongs to — the host stamps `meta[name="motu-repo"]`
   * as it serves the bytes, and the lens already reads it to fetch this region's coverage corpus. So
   * the page that a baseline is OF can offer the way to review it, instead of asking somebody to
   * remember the console exists and then find the project again in its picker.
   *
   * ONLY WHEN THE STAMP IS THERE, which means only on a page a host served. Under `lagoon dev` or an
   * opened file there is no repo and no host, so the button would lead nowhere — and a control that
   * is sometimes a dead end is worse than one that is sometimes absent.
   */
  const servedRepo =
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLMetaElement>('meta[name="motu-repo"]')?.content?.trim() || null;
  // THE RIG: the hosted chips, the view toggle, and the two ways out of this page. Everything that
  // is a MODE rather than a place, gathered at the foot of the panel instead of scattered through it.
  rigPills.appendChild(slot);
  if (servedRepo) {
    rigPills.appendChild(
      el(
        'a',
        {
          class: 'motu-btn',
          'data-shape': 'pill',
          // RELATIVE TO THE HOST'S ROOT, not to this page: a lagoon is served at
          // /<repo>/<ref>/<slug> and inside a group at /g/<name>/f/<i>, so only an absolute path
          // reaches the console from both.
          href: `/console?repo=${encodeURIComponent(servedRepo)}`,
          title: `Review baselines for ${servedRepo}`,
        },
        '◎ Baselines',
      ),
    );
  }
  // THE LENS GETS A PILL, not only a palette entry. It draws its own tab on its own panel, which is
  // discoverable once you know it exists and invisible until then; the palette entry had the same
  // problem one layer deeper. The tab still opens it — this is a second door, in the place a person
  // is already looking when they are choosing how the region is rigged.
  if (opts.lens) {
    const theLens = opts.lens;
    const lensPill = el(
      'button',
      { class: 'motu-btn', 'data-shape': 'pill', type: 'button', 'aria-pressed': String(theLens.isOpen()) },
      '⌖ Seam lens',
    ) as HTMLButtonElement;
    lensPill.addEventListener('click', (e) => {
      splash(e.clientX, e.clientY, accent());
      theLens.toggle();
    });
    theLens.subscribe((openNow) => lensPill.setAttribute('aria-pressed', String(openNow)));
    rigPills.appendChild(lensPill);
  }

  // ── the panel, assembled ───────────────────────────────────────────────────────────────────
  const filterRow = el('div', { class: 'find find--filter' }, filter);
  const bayTitle = el('b', {}, '—');
  const baySub = el('small', {}, '');
  const fold = el('button', { class: 'fold', type: 'button', title: 'Close', 'aria-label': 'Close lagoon controls' }, '›');
  const mastMark = el('span', { class: 'mark' });
  mastMark.innerHTML = MOTU_MARK_SVG;
  const masthead = el(
    'div',
    { class: 'motu-bay', 'data-shape': 'masthead' },
    el('div', { class: 'bay-row' }, mastMark, el('span', { class: 'bay-txt' }, bayTitle, baySub), fold),
  );

  const rigStepPrev = el('button', { class: 'rig__step', type: 'button', title: 'Previous region', 'aria-label': 'Previous region' }, '‹');
  const rigStepNext = el('button', { class: 'rig__step', type: 'button', title: 'Next region', 'aria-label': 'Next region' }, '›');
  const rig = el(
    'div',
    { class: 'rig' },
    el('div', { class: 'rig__head' }, el('span', { class: 'motu-cap' }, 'Rig'), rigStepPrev, rigStepNext),
    rigPills,
  );

  // ── two tabs, when there is a lens to fill the second ──────────────────────────────────────
  //
  // STATES is where the region is, SEAMS is what the lens has noticed about it. They are the same
  // region looked at two ways, which is why they are tabs in one panel rather than two panels: the
  // lens used to be a separate surface with its own tab on its own edge, so the thing that tells you
  // something is wrong lived a layer away from the thing you were using.
  const seamsPane = el('div', { class: 'seams' });
  let unmountFindings: (() => void) | null = null;
  const tabs = el('div', { class: 'motu-segmented tabs', role: 'tablist' });
  const tabThumb = el('span', { class: 'motu-segmented__thumb' });
  tabs.appendChild(tabThumb);
  const statesTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'true' }, 'States') as HTMLButtonElement;
  const seamsTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'false' }, 'Seams') as HTMLButtonElement;
  tabs.append(statesTab, seamsTab);

  const showTab = (which: 'states' | 'seams') => {
    bar.dataset.tab = which;
    statesTab.setAttribute('aria-current', String(which === 'states'));
    seamsTab.setAttribute('aria-current', String(which === 'seams'));
    const on = which === 'states' ? statesTab : seamsTab;
    tabThumb.style.left = `${on.offsetLeft}px`;
    tabThumb.style.width = `${on.offsetWidth}px`;
    // MOUNTED ONLY WHEN LOOKED AT. The lens subscribes to every store write to keep its findings
    // current, and a subscription that runs while nobody is reading it is work the page pays for
    // permanently — on a panel that is closed most of the time.
    if (which === 'seams' && !unmountFindings && opts.lens?.mountFindings) {
      unmountFindings = opts.lens.mountFindings(seamsPane);
    } else if (which !== 'seams' && unmountFindings) {
      unmountFindings();
      unmountFindings = null;
    }
  };
  statesTab.addEventListener('click', () => showTab('states'));
  seamsTab.addEventListener('click', () => showTab('seams'));

  const hasSeams = Boolean(opts.lens?.mountFindings);
  if (hasSeams) {
    bar.append(masthead, el('div', { class: 'find' }, tabs, kbd), filterRow, scroll, seamsPane, rig);
  } else {
    bar.append(masthead, el('div', { class: 'find' }, filter, kbd), scroll, rig);
  }
  bar.dataset.tab = 'states';

  // ── the bay ────────────────────────────────────────────────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${PATCH_LONG} ${PATCH_SHORT}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // The body's own depth gradient. Its stops read the same CSS vars as everything else, so
  // transport/fit recolour the water with no JS.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'tide-body');
  grad.setAttribute('x1', '0');
  grad.setAttribute('x2', '1');
  grad.setAttribute('y1', '0');
  grad.setAttribute('y2', '0');
  for (const [offset, color] of [
    ['0', 'var(--w-deep)'],
    ['0.6', 'var(--w-mid)'],
    ['1', 'var(--w-shallow)'],
  ] as const) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  // HTTP is live data hitting a real backend: the same lagoon, running visibly faster.
  const speedScale = opts.transport === 'http' ? 2.1 : 1;
  for (const layer of WAVE_LAYERS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', wavePath(layer));
    path.setAttribute('fill', layer.fill);
    path.setAttribute('opacity', String(layer.opacity));
    if (layer.stroke) {
      path.setAttribute('stroke', layer.stroke);
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
    }
    const period = layerPeriod(layer);
    // Travel exactly one period per loop (seamless), at a constant px/s. Driven by the Web Animations
    // API rather than CSS because each layer's distance differs — which also means a CSS
    // `animation: none` cannot stop it, so reduced-motion has to be honoured HERE.
    if (!REDUCED()) {
      path.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-period}px)` }], {
        duration: (period / (layer.speed * speedScale)) * 1000,
        iterations: Infinity,
        easing: 'linear',
        direction: layer.reverse ? 'reverse' : 'normal',
      });
    }
    svg.appendChild(path);
  }

  const sheen = el('span', { class: 'sheen' });
  // What the bay is reporting, in words rather than in hue alone. Kept in sync by renderLabel().
  const label = el('span', { class: 'label' });
  const lens = opts.lens;
  // THE RAIL IS THE DOCK WHEN IT IS CLOSED, and it is a button rather than a decorated div: its whole
  // job is to be pressed, and a real button is the only version of that a keyboard and a screen
  // reader both get for free.
  //
  // The wave svg goes with it. A 168x34 swell was legible lying along an edge; standing in a 46px
  // rail it would be a smear, and the panel's masthead already carries the same water with room to
  // move. What the rail keeps is the part that was doing work: the lamp, and the region's name.
  const railMark = el('span', { class: 'mark' });
  railMark.innerHTML = MOTU_MARK_SVG;
  const patch = el(
    'button',
    {
      class: 'rail-dock',
      type: 'button',
      'aria-label': 'Lagoon controls — open, or drag to the other edge',
      'aria-expanded': 'false',
    },
    railMark,
    el('span', { class: 'lamp' }),
    label,
    el('span', { class: 'chev' }, '‹'),
  ) as HTMLButtonElement;
  label.className = 'stand';
  const railDock = patch;
  const panel = bar;
  // The bay's own water still exists — it is the masthead's, drawn by the kit — so the swell built
  // above is mounted there rather than thrown away.
  masthead.insertBefore(svg, masthead.firstChild);
  masthead.appendChild(sheen);

  // The harness turns the page-inset off; see `reserve` for why that is the correct behaviour rather
  // than a special case.
  let noDockInset = false;
  try {
    noDockInset = new URLSearchParams(window.location.search).get('dockInset') === 'off';
  } catch {
    /* a page with no parsable search string is a page nobody is driving */
  }

  /**
   * Reserve the strip, or do not.
   *
   * NOT WHILE THE CHECKS ARE DRIVING, and that is correctness rather than a fudge: `responsive`
   * measures the APPLICATION at each declared viewport, and the dock is not part of the application.
   * Insetting the page during that run would measure the app in a viewport 46px narrower than the one
   * declared, and report an overflow the app does not have. `lagoonUrl()` turns it off for the same
   * reason it turns off the inferred colour.
   */
  const reserve = () => {
    const root = document.documentElement;
    if (noDockInset) return root.removeAttribute('data-motu-dock');
    root.dataset.motuDock = window.matchMedia('(max-width: 760px)').matches
      ? 'bottom'
      : (tide.dataset.edge ?? DEFAULT_EDGE);
  };

  const tide = el(
    'div',
    { id: 'tide', 'data-open': 'false', 'data-transport': opts.transport },
    railDock,
    panel,
  );
  tide.dataset.edge = readEdge();
  document.body.appendChild(tide);
  reserve();
  // The reserve flips between an edge and the bottom at the same breakpoint the dock does.
  window.matchMedia('(max-width: 760px)').addEventListener('change', reserve);

  const targets = el('div', { id: 'tide-targets' });
  for (const edge of EDGES) targets.appendChild(el('i', { 'data-edge': edge }));
  document.body.appendChild(targets);

  // The chips (transport / fit) come to the panel instead of floating over the content. Debug is not
  // among them: the lens carries its own tab on the edge of its panel.
  setMotuToolbarHost(slot);

  // Keep the lens' panel on the far side from the bay, so the two never sit on top of each other.
  // Custom properties cross the shadow boundary, which is how the overlay reads these.
  const placeDebugPanel = () => {
    const onRight = tide.dataset.edge !== 'left';
    const root = document.documentElement.style;
    root.setProperty('--motu-debug-right', onRight ? 'auto' : '12px');
    root.setProperty('--motu-debug-left', onRight ? '12px' : 'auto');
  };
  placeDebugPanel();

  // The pill's readout. The water's tint has always carried this, but a hue has to be learned and a
  // word does not — and with the mask gone there is a row to put it in. LEGACY wins over the
  // transport because it is the louder fact about what you are looking at.
  //
  // IDEMPOTENT, and that is load-bearing rather than tidy. readFit below is a MutationObserver
  // callback watching document.body with subtree+childList — and this label lives inside body. An
  // unconditional textContent write replaces a text node, which IS a childList mutation, which
  // re-fires the observer, which writes again: the page pins a core and never finishes loading. Write
  // only on a real change and the cycle cannot start. Anything else this observer ever drives has to
  // hold the same rule.
  let stationLabel = '';
  const renderLabel = () => {
    const state = tide.dataset.fit === 'legacy' ? 'legacy' : opts.transport;
    const next = stationLabel ? `${stationLabel} · ${state}` : state;
    if (label.textContent !== next) label.textContent = next;
    // The masthead says the REGION and nothing else: the rig below it already shows the transport
    // and the fit as chips, so repeating them in the title would be the same fact three times.
    const title = stationLabel || state;
    if (bayTitle.textContent !== title) bayTitle.textContent = title;
  };

  // Fit is flipped live by the toolbar chip, which only ever sets the attribute on the regions —
  // so read it from there rather than mirroring the toggle's state.
  const readFit = () => {
    const legacy = !!document.querySelector('motu-archipelago[fit="legacy"]');
    const fit = legacy ? 'legacy' : 'native';
    if (tide.dataset.fit !== fit) tide.dataset.fit = fit;
    renderLabel();
  };
  new MutationObserver(readFit).observe(document.body, { subtree: true, childList: true, attributeFilter: ['fit'] });
  readFit();

  // ── open / close ───────────────────────────────────────────────────────────────────────────
  /**
   * The panel arrives as WATER COMING IN FROM THE BAY — the same reveal the seam lens uses for its own
   * panel, out of @motu/core so there is one wave in the chrome rather than two that drift.
   *
   * The direction is the dock's: a bay lying along the bottom edge fills its panel from below, like a
   * tide coming in; one standing against the left edge fills it from the left. That is the whole point
   * of doing it this way instead of a fade — the panel is visibly poured out of the thing you touched,
   * so which corner element owns it never has to be guessed.
   */
  let barAnim: Animation | null = null;
  const floodBar = (dir: 'in' | 'out') => {
    if (REDUCED()) return;
    // The panel is poured out of the edge the rail stands on, so which element owns it is never
    // in doubt. On a phone the dock IS the bottom edge, and the sheet has to rise from there.
    const from: FloodFrom = window.matchMedia('(max-width: 760px)').matches
      ? 'bottom'
      : tide.dataset.edge === 'left'
        ? 'left'
        : 'right';
    const f = flood(from);
    applyFlood(bar, f);
    // One at a time: a close arriving mid-open would otherwise leave the first animation to finish and
    // strip the mask out from under the second, snapping the panel fully visible.
    barAnim?.cancel();
    const anim = bar.animate(floodFrames(f, dir), {
      duration: dir === 'in' ? 380 : 190,
      easing: dir === 'in' ? 'cubic-bezier(.22,.9,.3,1)' : 'cubic-bezier(.5,0,.75,.4)',
      fill: 'both',
    });
    barAnim = anim;
    anim.finished
      .then(() => {
        clearFlood(bar);
        anim.cancel();
      })
      .catch(() => {
        /* superseded by a flood in the other direction, which owns the mask now */
      });
  };

  let closeTimer = 0;
  let dwellTimer = 0;
  const open = () => {
    window.clearTimeout(closeTimer);
    window.clearTimeout(dwellTimer);
    // Only on a real change: hovering an already-open bay calls this on every pointerenter, and
    // replaying the flood there would make the panel flicker under the cursor.
    if (tide.dataset.open === 'true') return;
    tide.dataset.open = 'true';
    patch.setAttribute('aria-expanded', 'true');
    floodBar('in');
  };
  const close = (delay = 240) => {
    window.clearTimeout(closeTimer);
    window.clearTimeout(dwellTimer);
    closeTimer = window.setTimeout(() => {
      // Never close out from under a keyboard user or an open palette.
      if (tide.contains(document.activeElement) || !palette.hidden) return;
      if (tide.dataset.open !== 'true') return;
      tide.dataset.open = 'false';
      patch.setAttribute('aria-expanded', 'false');
      floodBar('out');
    }, delay);
  };

  /**
   * Open on hover only after a DWELL. The bay is small, but it still sits over whatever is in that
   * corner; brushing across it on the way somewhere else is not a request to open it.
   */
  fold.addEventListener('click', (e) => {
    e.stopPropagation();
    close(0);
  });

  // THE STEPPER IS FOR THE REGIONS, which is the one list a person moves through rather than searches.
  // It wraps: with two or three archipelagos, next/next/next is faster than reaching for the filter,
  // and stopping dead at the end would just be a dead control most of the time.
  const stepStation = (by: 1 | -1) => {
    if (opts.stations.length < 2) return;
    const at = opts.stations.findIndex((x) => x.label === stationLabel);
    const next = opts.stations[(Math.max(at, 0) + (by === 1 ? 1 : opts.stations.length - 1)) % opts.stations.length];
    if (next) opts.onStation(next.id);
  };
  rigStepPrev.addEventListener('click', () => stepStation(-1));
  rigStepNext.addEventListener('click', () => stepStation(1));
  // With one region there is nowhere to step, and a control that cannot do anything is worse than
  // one that is not there.
  if (opts.stations.length < 2) {
    rigStepPrev.hidden = true;
    rigStepNext.hidden = true;
  }

  const DWELL_MS = 260;
  patch.addEventListener('pointerenter', () => {
    if (dragging) return;
    dwellTimer = window.setTimeout(open, DWELL_MS);
  });
  patch.addEventListener('pointerleave', () => window.clearTimeout(dwellTimer));
  // HOLD open — never open. pointerenter is delivered to every ancestor of the entered element, so
  // opening here would fire the moment the pointer touched the bay and defeat the dwell above.
  tide.addEventListener('pointerenter', () => {
    if (tide.dataset.open === 'true') open();
  });
  tide.addEventListener('pointerleave', () => close());
  // Focus opens the panel for a keyboard user.
  tide.addEventListener('focusin', () => open());
  tide.addEventListener('focusout', () => close(120));
  patch.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (tide.dataset.open === 'true') return close(0);
    open();
    (bar.querySelector('button') as HTMLElement | null)?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!tide.contains(e.target as Node)) close(0);
  });

  // ── drag the bay to another corner ─────────────────────────────────────────────────────────
  // The one collision a corner element can still have is with whatever occupies THAT corner (this
  // project's mobile filter sheet puts Done in the bottom-right). Rather than guess a safe corner,
  // hand the choice over: drag it, it snaps to the nearest corner, and the choice persists.
  const DRAG_THRESHOLD = 6;
  let dragging = false;
  let pressed: { x: number; y: number } | null = null;

  const moveTo = (edge: TideEdge) => {
    tide.dataset.edge = edge;
    reserve();
    placeDebugPanel();
    try {
      localStorage.setItem(EDGE_KEY, edge);
    } catch {
      /* storage disabled — the choice just won't persist */
    }
  };

  patch.addEventListener('pointerdown', (e) => {
    pressed = { x: e.clientX, y: e.clientY };
    patch.setPointerCapture(e.pointerId);
  });

  patch.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < DRAG_THRESHOLD) return;
      dragging = true;
      window.clearTimeout(dwellTimer);
      tide.dataset.open = 'false';
      tide.dataset.dragging = 'true';
      targets.dataset.on = 'true';
    }
    // Follow the pointer as a plain offset from the docked position — no layout involved, so the
    // drag stays cheap and the snap-back is a single transition on the same property.
    patch.style.transform = `translate(${e.clientX - pressed.x}px, ${e.clientY - pressed.y}px)`;
    const near = edgeAt(e.clientX);
    for (const t of targets.querySelectorAll<HTMLElement>('i')) {
      t.dataset.near = String(t.dataset.edge === near);
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (!pressed) return;
    const wasDragging = dragging;
    pressed = null;
    dragging = false;
    delete tide.dataset.dragging;
    delete targets.dataset.on;
    patch.style.transform = '';
    if (!wasDragging) {
      // A tap, not a drag: toggle. This is the whole touch story — no hover to rely on there.
      tide.dataset.open === 'true' ? close(0) : open();
      return;
    }
    moveTo(edgeAt(e.clientX));
    splash(e.clientX, e.clientY, accent());
  };
  patch.addEventListener('pointerup', endDrag);
  patch.addEventListener('pointercancel', endDrag);

  // ── command palette ────────────────────────────────────────────────────────────────────────
  const input = el('input', {
    type: 'text',
    placeholder: 'Switch archipelago, view, transport…',
    'aria-label': 'Lagoon command palette',
  }) as HTMLInputElement;
  const list = el('ul', { role: 'listbox' });
  const palette = el('div', { id: 'tide-palette', hidden: '' }, el('div', { class: 'box' }, input, list));
  document.body.appendChild(palette);

  let shown: Command[] = [];
  let cursor = 0;

  /** Static commands + one per chip currently in the toolbar, so new controls need no registration. */
  function commands(): Command[] {
    const out: Command[] = opts.stations.map((s) => ({
      label: s.label,
      kind: 'archipelago',
      run: () => opts.onStation(s.id),
    }));
    out.push(
      { label: 'Region', kind: 'view', run: () => opts.onView('region') },
      { label: 'Mountpoints', kind: 'view', run: () => opts.onView('mountpoints') },
    );
    for (const chip of slot.querySelectorAll<HTMLButtonElement>('button')) {
      const text = (chip.textContent || '').trim();
      if (!text) continue;
      out.push({ label: `${text} — ${chip.title || 'toggle'}`, kind: 'toggle', run: () => chip.click() });
    }
    // The keyboard/pointer-free way to do what dragging does, for anyone who can't drag.
    for (const edge of EDGES) {
      out.push({ label: `Dock lagoon controls on the ${EDGE_LABEL[edge]}`, kind: 'dock', run: () => moveTo(edge) });
    }
    if (lens) out.push({ label: 'Toggle debug seam lens', kind: 'lens', run: () => lens.toggle() });
    out.push({ label: 'About this lagoon', kind: 'help', run: showAbout });
    return out;
  }

  function showAbout(): void {
    const box = palette.querySelector('.box')!;
    box.querySelector('.about')?.remove();
    const about = el('div', { class: 'about' });
    about.innerHTML = opts.about;
    box.appendChild(about);
  }

  function render(): void {
    const q = input.value.trim();
    const all = commands();
    shown = q
      ? all
          .map((c) => ({ c, hits: fuzzy(c.label, q) }))
          .filter((r): r is { c: Command; hits: number[] } => r.hits !== null)
          .sort((a, b) => score(b.hits) - score(a.hits))
          .map((r) => r.c)
      : all;
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    list.replaceChildren();
    if (!shown.length) {
      list.appendChild(el('li', { class: 'motu-empty' }, 'Nothing matches.'));
      return;
    }
    shown.forEach((cmd, i) => {
      const hits = new Set(fuzzy(cmd.label, q) ?? []);
      const label = el('span');
      [...cmd.label].forEach((ch, at) =>
        label.appendChild(hits.has(at) ? el('mark', {}, ch) : document.createTextNode(ch)),
      );
      const row = el(
        'li',
        { role: 'option', 'aria-selected': String(i === cursor) },
        label,
        el('span', { class: 'kind' }, cmd.kind),
      );
      row.style.animationDelay = `${Math.min(i, 8) * 18}ms`;
      row.addEventListener('mouseenter', () => {
        cursor = i;
        for (const [j, node] of [...list.children].entries()) node.setAttribute('aria-selected', String(j === cursor));
      });
      row.addEventListener('click', () => run());
      list.appendChild(row);
    });
  }

  function run(): void {
    const cmd = shown[cursor];
    if (!cmd) return;
    const help = cmd.kind === 'help';
    cmd.run();
    if (!help) closePalette();
  }

  function openPalette(): void {
    palette.hidden = false;
    open();
    input.value = '';
    cursor = 0;
    render();
    input.focus();
  }

  function closePalette(): void {
    palette.hidden = true;
    palette.querySelector('.about')?.remove();
    close(0);
  }

  input.addEventListener('input', render);
  palette.addEventListener('pointerdown', (e) => {
    if (e.target === palette) closePalette();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closePalette();
    if (e.key === 'Enter') return run();
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!shown.length) return;
    cursor = (cursor + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
    for (const [j, node] of [...list.children].entries()) node.setAttribute('aria-selected', String(j === cursor));
    (list.children[cursor] as HTMLElement).scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.hidden ? openPalette() : closePalette();
    }
  });

  // ── active state ───────────────────────────────────────────────────────────────────────────
  function slide(g: { grp: HTMLElement; thumb: HTMLElement }, active: HTMLElement | null): void {
    if (!active) return;
    g.thumb.style.left = `${active.offsetLeft}px`;
    g.thumb.style.width = `${active.offsetWidth}px`;
  }

  /** Sweep a band of light across the bay — the water noticing that something changed. */
  function sheenSweep(): void {
    if (REDUCED()) return;
    const along = window.matchMedia('(max-width: 760px)').matches ? 'X' : 'Y';
    sheen.style.setProperty('--sheen-angle', along === 'Y' ? '180deg' : '90deg');
    sheen.animate(
      [
        { opacity: 0, transform: `translate${along}(-70%)` },
        { opacity: 1, offset: 0.35 },
        { opacity: 0, transform: `translate${along}(170%)` },
      ],
      { duration: 780, easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
  }

  let lastStation = '';
  function setActive(stationId: string, view: TideView, label?: string): void {
    stationLabel = label ?? rows.find((r) => r.station.id === stationId)?.station.label ?? '';
    renderLabel();
    for (const { station, btn } of rows) {
      btn.setAttribute('aria-current', String(station.id === stationId));
    }
    const active = rows.find((r) => r.station.id === stationId)?.btn;
    if (active) {
      rail.style.setProperty('--rail-top', `${active.offsetTop + 6}px`);
      rail.style.setProperty('--rail-height', `${Math.max(active.offsetHeight - 12, 6)}px`);
      // Keep the mounted archipelago in view when the list is long enough to scroll.
      if (listBox.scrollHeight > listBox.clientHeight) active.scrollIntoView({ block: 'nearest' });
    }
    let viewActive: HTMLElement | null = null;
    for (const btn of viewGroup.grp.querySelectorAll<HTMLElement>('button[data-view]')) {
      const on = btn.dataset.view === view;
      btn.setAttribute('aria-current', String(on));
      if (on) viewActive = btn;
    }
    slide(viewGroup, viewActive);
    // Only on a real change — not on the initial mount, and not on a re-render of the same state.
    const key = `${stationId}:${view}`;
    if (lastStation && lastStation !== key) sheenSweep();
    lastStation = key;
  }

  // offsetTop/offsetLeft are only real once fonts have settled — re-measure when they do.
  document.fonts?.ready.then(() => {
    const activeOpt = rows.find(({ btn }) => btn.getAttribute('aria-current') === 'true')?.btn;
    if (activeOpt) {
      rail.style.setProperty('--rail-top', `${activeOpt.offsetTop + 6}px`);
      rail.style.setProperty('--rail-height', `${Math.max(activeOpt.offsetHeight - 12, 6)}px`);
    }
    slide(viewGroup, viewGroup.grp.querySelector<HTMLElement>('button[aria-current="true"]'));
  });

  // First visit: open once so the bay is discoverable, then let it close.
  if (!localStorage.getItem('motu:lagoon:tide-seen')) {
    localStorage.setItem('motu:lagoon:tide-seen', '1');
    window.setTimeout(open, 400);
    window.setTimeout(() => close(0), 3200);
  }

  return { setActive, setFlows, setFlowOutcome };
}
