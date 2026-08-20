// The overlay UI. Everything here is READ-ONLY: it observes the mount registry, the shared stores,
// the island definitions and the transport call log, and never writes a store, fires a channel, or
// forces a render. It isolates itself in its own shadow root with its own stylesheet (never the island
// token system) and draws a fixed layer over the page, so it cannot perturb the layout it observes.

import {
  getMountedIslands,
  subscribeMounts,
  getIslandDefinition,
  getChannels,
  subscribeChannels,
  observeStoreWrites,
  observeHostIntents,
  getArchipelagoStore,
  startSeedRecording,
  stopSeedRecording,
  motuToolbar,
  MOTU_TOOLBAR_CHIP_CSS,
  MOTU_CHROME,
  type MountedIslandInfo,
  type IslandDefinition,
  type ChannelInfo,
  type HostIntent,
  type RecordedSeed,
  type Store,
} from '@motu/core';
import { observeCalls, startRecording, stopRecording, type CallEvent, type RecordedCall } from '@motu/runtime';

export interface DebugOverlayOptions {
  /** Keyboard shortcut, matched against KeyboardEvent.code (default 'KeyG' with Cmd/Ctrl+Shift). */
  shortcutCode?: string;
  /**
   * Mount the built-in toggle chip into the shared toolbar (default true). Pass FALSE when the host
   * root has chrome of its own and wants to own the trigger — the lagoon puts it on its corner bay,
   * so that the page-wide lens is not summoned from inside a popup that then closes. Drive it with
   * `toggleDebugOverlay()` and mirror its state with `subscribeDebugOverlay()`.
   */
  chip?: boolean;
}

const OPEN_KEY = 'motu:debug';
const POS_KEY = 'motu:debug:pos';
const MIN_KEY = 'motu:debug:min';
const COUPLING_KEY = 'motu:debug:coupling';
const CALL_BUFFER = 200;

type PropState = 'bound' | 'bound-empty' | 'static' | 'default';
type Verdict = 'ok' | 'warn' | 'broken' | 'neutral';

interface PropRow {
  name: string;
  state: PropState;
  storeKey?: string;
  value: unknown;
}

interface CallRecord {
  id: number;
  service: string;
  method: string;
  argsKey: string;
  island: string | null;
  phase: CallEvent['phase'];
  status?: number;
  durationMs?: number;
  error?: string;
}

let mounted = false;
/** The live instance, so the host-owned trigger below can reach it. */
let instance: Overlay | null = null;
const openListeners = new Set<(open: boolean) => void>();

/**
 * Mounts the overlay once. Idempotent, so both composition roots (bridge + lagoon) can call it behind
 * their own __MOTU_DEBUG__ guard. Off by default — a small affordance and a keyboard shortcut reveal it.
 */
export function mountDebugOverlay(opts: DebugOverlayOptions = {}): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  instance = new Overlay(opts);
}

/** Flip the lens. For a root that mounted with `chip: false` and hosts the trigger in its own chrome. */
export function toggleDebugOverlay(): void {
  instance?.toggle();
}

/** Whether the lens is currently showing — for a host trigger that renders its own on/off state. */
export function isDebugOverlayOpen(): boolean {
  return instance?.isOpen() ?? false;
}

/**
 * Observe the lens' open state. Fires on every change (including the keyboard shortcut and the
 * panel's own close button), so a host trigger stays in sync with whatever flipped it.
 * Returns an unsubscribe.
 */
export function subscribeDebugOverlay(fn: (open: boolean) => void): () => void {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}

// --- Read-only computations over framework data --------------------------------------------------

/** The store keys an island reads. `bind` values are optional in the type (see IslandSpec), so a
 *  declaration that leaves one out must not become an `undefined` key in the graph. */
function bindKeys(info: MountedIslandInfo): string[] {
  return Object.values(info.spec.bind ?? {}).filter((k): k is string => typeof k === 'string');
}

function computeProps(info: MountedIslandInfo, def: IslandDefinition | undefined): PropRow[] {
  if (!def) return [];
  const bind = info.spec.bind ?? {};
  const staticProps = info.spec.props ?? {};
  return def.props.map((name): PropRow => {
    const storeKey = bind[name];
    if (storeKey) {
      const value = info.store.get(storeKey);
      return { name, state: value === undefined ? 'bound-empty' : 'bound', storeKey, value };
    }
    if (name in staticProps) {
      return { name, state: 'static', value: staticProps[name] };
    }
    return { name, state: 'default', value: undefined };
  });
}

// The single most valuable signal: an island whose declared props are ALL sitting at their defaults
// inside a real page usually means broken wiring. 'broken' = every declared prop defaulted; 'warn' =
// some prop is bound to a store key that is empty; 'neutral' = no declared props to reason about.
function verdictOf(rows: PropRow[]): Verdict {
  if (!rows.length) return 'neutral';
  if (rows.every((r) => r.state === 'default')) return 'broken';
  if (rows.some((r) => r.state === 'bound-empty' || r.state === 'default')) return 'warn';
  return 'ok';
}

function isolationOf(el: HTMLElement): 'shadow' | 'light' {
  return el.shadowRoot ? 'shadow' : 'light';
}

function preview(v: unknown): string {
  if (v === undefined) return '\u2205';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > 60 ? JSON.stringify(v.slice(0, 57)) + '\u2026' : JSON.stringify(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '\u2026' : s;
  } catch {
    return String(v);
  }
}

// Serialize captured calls into the SAME request-keyed fixtures module the `motu fixtures record` CLI
// emits, so a human capture drops straight into fixtures.mock.ts.
function renderRecordedFixtures(calls: RecordedCall[], seed: Record<string, unknown>): string {
  const rows = calls.map((c) => {
    const match = JSON.stringify(c.args);
    if (c.status) {
      return `  // ${c.status} for ${match}:\n  // { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, response: null },`;
    }
    const response = JSON.stringify(c.response, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : '    ' + l))
      .join('\n');
    return `  { service: ${JSON.stringify(c.service)}, method: ${JSON.stringify(c.method)}, match: ${match}, response: ${response} },`;
  });
  const seedBlock =
    Object.keys(seed).length > 0
      ? `\n// Host-fed store values (channels + provide) captured this session — pass as the lagoon seed so\n// the island receives REAL host config offline, not a hand-written stub.\nexport const seed: Record<string, unknown> = ${JSON.stringify(seed, null, 2)};\n`
      : '';
  return `// RECORDED in the debug overlay \u2014 request-keyed fixtures. Merge the ones you want into fixtures.mock.ts.
import type { Fixture } from '@motu/runtime/mock';

export const fixtures: Fixture[] = [
${rows.join('\n')}
];
${seedBlock}`;
}

// --- DOM helpers ---------------------------------------------------------------------------------

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) el.append(c);
  return el;
}

/**
 * The overlay wears the SAME visual language as the rest of the motu chrome (the lagoon's corner bay
 * and control panel): frosted light glass, teal water accents, Inter for prose and labels, 14px radii,
 * soft teal-tinted shadows. It used to be dark slate + indigo, which read as a different product
 * bolted onto the page.
 *
 * The one deliberate exception is DATA: island names, store keys, payloads and call rows stay in a
 * monospace face. They are values being inspected, and column alignment is what makes a wall of them
 * scannable — that is a different job from the labels around them.
 *
 * Colour carries meaning here and must survive the restyle: ok / warn / broken / neutral keep their
 * green-amber-red-grey semantics, re-tuned for a light ground instead of being dropped.
 */
const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: "Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; }

/* The lagoon palette, so the lens and the chrome agree — including when a project points motu's
   chrome at its own primary (applyMotuChrome). Everything BRAND is derived from --motu-primary here;
   the group colours below (input/output/coupling) and ok/warn/broken are SEMANTIC and stay put, or a
   yellow-branded app would end up with a yellow "ok" sitting next to an amber "warn". */
:host {
  --_p: var(--motu-primary, #0f766e);
  --w-deep: var(--motu-water-deep, #0b6f68);
  --w-mid: var(--motu-water-mid, #12988f);
  --accent: var(--_p);
  --ink: #22302c;
  --ink-soft: #5c6b63;
  --ink-faint: #9a9182;
  --glass: linear-gradient(180deg, color-mix(in srgb, var(--_p) 3%, #fff), color-mix(in srgb, var(--_p) 9%, #fff));
  --hair: color-mix(in srgb, var(--_p) 14%, transparent);
  --ok: #0f766e;
  --warn: #b45309;
  --broken: #b91c1c;
  --neutral: #8d8578;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147482000; }
.wires { position: fixed; inset: 0; pointer-events: none; overflow: visible; }
/* No resting outline — the page stays clean. The box border (and label) appear only for the island
   under the cursor, the selected one, or the islands a hovered channel links to. */
.box { position: absolute; border: 1.5px dashed transparent; border-radius: 10px; }
.box.broken { border-style: solid; }
.box.hover, .box.sel, .box.link { border-color: currentColor; }
.box.hover { background: rgba(15, 118, 110, .05); }
.box.link { background: rgba(18, 152, 143, .08); }
.box.sel { box-shadow: 0 0 0 2px rgba(255,255,255,.7), 0 0 0 4px currentColor; }
.tag {
  position: absolute; top: -10px; left: 8px; pointer-events: auto; cursor: pointer;
  display: none; align-items: center; gap: 5px; height: 19px; padding: 0 9px;
  border-radius: 999px; font: 700 10px/1 var(--mono); color: #fff; white-space: nowrap;
  background: var(--accent); box-shadow: 0 3px 10px color-mix(in srgb, var(--_p) 34%, transparent);
}
/* Low-noise by default: the label only appears for the island under the cursor (or the selected one). */
.box.hover .tag, .box.sel .tag, .box.link .tag { display: inline-flex; }
.tag.ok { background: var(--ok); } .tag.warn { background: var(--warn); }
.tag.broken { background: var(--broken); } .tag.neutral { background: var(--neutral); }
.tag .iso { opacity: .8; font-weight: 500; }

/* The panel is the control panel's twin: same glass, same radius, same shadow. It sits opposite the
   lagoon's bay when the host says where that is (--motu-debug-left/right), so the two never overlap. */
.panel {
  position: fixed;
  top: var(--motu-debug-top, 56px);
  right: var(--motu-debug-right, 12px);
  left: var(--motu-debug-left, auto);
  z-index: 2147483000; pointer-events: auto;
  width: 372px; max-width: calc(100vw - 24px); max-height: 82vh;
  display: flex; flex-direction: column;
  background: var(--glass);
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
  color: var(--ink);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 14px 40px rgba(11, 111, 104, .18);
  font-size: 12px;
}
.panel__head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 13px; border-bottom: 1px solid var(--hair);
  /* The title bar is the drag handle, so it must not start a text selection instead. */
  cursor: grab; user-select: none; -webkit-user-select: none;
}
/* Collapsed: the title bar alone, shrunk to its controls — the graph stays on the page behind it. */
.panel--min { width: auto; }
.panel--min .panel__head { border-bottom: none; }
.panel__head.grabbing { cursor: grabbing; }
.panel__head b { font: 700 11px/1 inherit; text-transform: uppercase; letter-spacing: .09em; color: var(--ink-faint); }
.panel__head .spacer { flex: 1; }
.panel__head button {
  background: transparent; border: 1px solid transparent; color: var(--ink-soft); cursor: pointer;
  font-size: 12px; padding: 4px 8px; border-radius: 8px; transition: background 160ms, color 160ms;
}
.panel__head button:hover { color: var(--ink); background: rgba(15, 118, 110, .09); }
.panel__head button.on { color: var(--motu-on-primary, #fff); background: var(--accent); }
.panel__head button.rec { color: #fff; background: var(--broken); }
.recbar {
  margin: 8px 12px 0; padding: 6px 9px; border-radius: 8px;
  font: 600 10px/1.4 var(--mono); background: rgba(185, 28, 28, .10); color: var(--broken);
}
/* Picker mode is a MODE, and a mode that isn't visible is a trap — say so while it is armed. */
.pickbar {
  margin: 8px 12px 0; padding: 6px 9px; border-radius: 8px;
  font: 600 10px/1.4 inherit; background: color-mix(in srgb, var(--_p) 12%, transparent); color: var(--motu-primary-deep, #0b5b55);
}
/* Where the island list used to be: how to narrow the scope, said once. */
.scopehint {
  padding: 2px 0 6px; color: var(--ink-faint); font-size: 11px; font-style: italic;
}
/* The way back out of an island, now that no list holds the selection. */
.back {
  display: inline-flex; align-items: center; gap: 6px;
  margin-bottom: 4px; padding: 5px 10px; border: 1px solid var(--hair); border-radius: 999px;
  background: rgba(255,255,255,.6); color: var(--ink-soft);
  font: 600 11px/1 inherit; cursor: pointer; transition: all 160ms;
}
.back:hover { color: var(--ink); border-color: rgba(11, 111, 104, .35); background: rgba(15, 118, 110, .07); }
.fitctl { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; font: 600 10px/1 inherit; }
.fitctl__l { color: var(--ink-faint); text-transform: uppercase; letter-spacing: .09em; }
.fitctl button {
  cursor: pointer; border: 1px solid var(--hair); background: rgba(255,255,255,.6);
  color: var(--ink-soft); padding: 4px 9px; border-radius: 999px; font: inherit; transition: all 160ms;
}
.fitctl button:hover { color: var(--ink); border-color: rgba(11, 111, 104, .35); }
.fitctl button.on { color: #fff; background: var(--warn); border-color: transparent; }
.panel__body { overflow-y: auto; padding: 10px 12px 14px; }
.panel__body::-webkit-scrollbar { width: 6px; }
.panel__body::-webkit-scrollbar-thumb { background: rgba(15, 118, 110, .22); border-radius: 999px; }
.section { margin-top: 12px; }
.section h4 {
  margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .09em;
  color: var(--ink-faint); font-weight: 700;
}

.row {
  display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 9px; cursor: pointer;
  transition: background 160ms, color 160ms, transform 160ms;
}
.row:hover { background: rgba(15, 118, 110, .07); transform: translateX(2px); }
.row.sel { background: color-mix(in srgb, var(--_p) 11%, transparent); color: var(--motu-primary-deep, #0b5b55); }
.row .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dot.ok { background: var(--ok); box-shadow: 0 0 8px color-mix(in srgb, var(--ok) 70%, transparent); }
.dot.warn { background: var(--warn); }
.dot.broken { background: var(--broken); } .dot.neutral { background: #cdd6d2; }
.row .name { font: 700 11px/1.3 var(--mono); }
.row .meta { margin-left: auto; color: var(--ink-faint); font-size: 10px; }

.prop { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font: 11px/1.4 var(--mono); }
.prop .pn { color: var(--ink-soft); min-width: 92px; }
.prop .badge {
  font-size: 9px; padding: 2px 7px; border-radius: 999px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; font-family: inherit;
}
.badge.bound { background: color-mix(in srgb, var(--_p) 14%, transparent); color: var(--motu-primary-deep, #0b5b55); }
.badge.bound-empty { background: rgba(180, 83, 9, .14); color: var(--warn); }
.badge.static { background: rgba(141, 133, 120, .16); color: #6f675c; }
.badge.default { background: rgba(185, 28, 28, .12); color: var(--broken); }
.prop .val { color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.detail { margin-top: 12px; }
.detail__title { display: flex; align-items: baseline; gap: 8px; padding-bottom: 2px; font: 700 12px/1.3 var(--mono); color: var(--ink); }
.detail__slot { font-weight: 500; font-size: 10px; color: var(--ink-faint); font-family: inherit; }
.grp { margin-top: 10px; padding: 2px 0 4px 11px; border-left: 2px solid rgba(11, 111, 104, .2); }
.grp__h { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font: 700 10px/1 inherit; text-transform: uppercase; letter-spacing: .09em; }
.grp__bar { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.sub { margin: 7px 0 3px; font: 700 9px/1 inherit; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
.lr { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font: 11px/1.3 var(--mono); }
.lr__k { color: var(--ink-soft); min-width: 74px; flex: none; }
.lr__k.warn { color: var(--warn); }
.lr__k.ext { color: #7c5cbf; }
.lr__key { color: var(--ink); }
.lr__t { margin-left: auto; color: var(--w-mid); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.origin {
  margin-left: 6px; font: 700 9px/1 inherit; padding: 2px 6px; border-radius: 999px;
  background: rgba(141, 133, 120, .16); color: #6f675c;
}
.origin.ext { background: rgba(124, 92, 191, .16); color: #7c5cbf; }
.risk { margin: 3px 0 6px; padding: 5px 9px; border-radius: 8px; font: 600 10px/1.35 inherit; color: var(--broken); background: rgba(185, 28, 28, .10); }
.st.ext { background: #7c5cbf; }

.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { font: 600 10px/1 var(--mono); padding: 4px 8px; border-radius: 999px; background: rgba(11, 111, 104, .08); color: var(--ink-soft); }

.call { display: flex; align-items: center; gap: 8px; padding: 4px 0; font: 11px/1.3 var(--mono); }
.call .st { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.st.start { background: var(--w-mid); } .st.success { background: var(--ok); } .st.error { background: var(--broken); }
.call .ep { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.call .n { margin-left: auto; color: var(--ink-faint); }
.call .isl { color: var(--w-deep); }
.empty { color: var(--ink-faint); font-style: italic; padding: 5px 0; font-family: inherit; }

.ch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 0; font: 11px/1.3 var(--mono); }
.st.ch-live { background: var(--ok); } .st.ch-orphan { background: var(--warn); } .st.ch-never { background: var(--broken); }
.ch .pay { flex-basis: 100%; color: var(--ink-faint); padding-left: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links { flex-basis: 100%; padding-left: 16px; color: var(--w-mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links.warn { color: var(--warn); }
.cp { display: flex; align-items: center; gap: 8px; padding: 3px 0; font: 11px/1.3 var(--mono); }
.cp .k { color: var(--ink); } .cp .rw { color: var(--ink-faint); }
.cp .who { color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp .who b { color: var(--ink); font-weight: 600; }
.cp .flag {
  margin-left: auto; font: 700 9px/1 inherit; padding: 2px 7px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: .05em;
}
.flag.coupling { background: rgba(185, 28, 28, .12); color: var(--broken); }
.flag.demote { background: rgba(180, 83, 9, .14); color: var(--warn); }
`;

// --- The overlay controller ----------------------------------------------------------------------

class Overlay {
  #root: ShadowRoot;
  #layer: HTMLElement;
  #panel: HTMLElement | null = null;
  /** Null when the host root owns the trigger (`chip: false`). */
  #chip: HTMLButtonElement | null = null;
  #boxes = new Map<MountedIslandInfo, { box: HTMLElement; tag: HTMLElement }>();
  #wires: SVGSVGElement;
  #open = false;
  #selected: MountedIslandInfo | null = null;
  #hovered: MountedIslandInfo | null = null;
  #showCoupling = readFlag(COUPLING_KEY);
  /**
   * Collapsed to its title bar. The panel is the heavy part (three sections, a live call log); the
   * page-wide lenses on the header — the coupling graph, the picker, the recorder — are not. Minimize
   * keeps those running with the outlines and wires, so the graph survives losing the reading pane.
   */
  #minimized = readFlag(MIN_KEY);
  /** Element-picker mode: the next click on the page selects an island instead of reaching the app. */
  #picking = false;
  #dragOffset: { x: number; y: number } | null = null;
  #recording = false;
  #recStatus = '';
  #calls: CallRecord[] = [];
  #intents: HostIntent[] = [];
  #writes = new Map<Store, Map<string, Set<string>>>();
  #rafPending = false;
  #panelDirty = false;

  constructor(opts: DebugOverlayOptions) {
    const shortcut = opts.shortcutCode ?? 'KeyG';
    const hostEl = h('div');
    // A closed shadow keeps the page's stylesheet (and any island's) from reaching in, and ours out.
    this.#root = hostEl.attachShadow({ mode: 'closed' });
    this.#root.append(h('style', {}, STYLES));
    this.#layer = h('div', { class: 'layer' });
    // A dedicated SVG layer for connector wires from a hovered channel to the islands it feeds.
    this.#wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.#wires.setAttribute('class', 'wires');
    this.#layer.append(this.#wires);
    this.#root.append(this.#layer);
    document.body.append(hostEl);

    subscribeMounts(() => this.#onMountsChanged());
    observeCalls((e) => this.#onCall(e));
    observeHostIntents((i) => {
      this.#intents.unshift(i);
      if (this.#intents.length > CALL_BUFFER) this.#intents.length = CALL_BUFFER;
      if (this.#open) this.#panelDirty = true;
    });
    subscribeChannels(() => {
      if (this.#open) this.#panelDirty = true;
    });
    observeStoreWrites((w) => {
      let byKey = this.#writes.get(w.store);
      if (!byKey) this.#writes.set(w.store, (byKey = new Map()));
      let writers = byKey.get(w.key);
      if (!writers) byKey.set(w.key, (writers = new Set()));
      if (w.source) writers.add(w.source);
      if (this.#open) this.#panelDirty = true;
    });
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === shortcut) {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && this.#picking) this.#setPicking(false);
    });

    // Selecting an island happens ON THE PAGE, where the island is — not from a list of names in the
    // panel. Two ways in, both capture-phase so the app never sees the click:
    //   * the picker (a mode, like a browser inspector's element picker), and
    //   * Alt-click, always live while the lens is open, for anyone who knows it.
    // Everything else passes straight through: the lens stays a read-only observer of a usable page.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.#open) return;
        if (!this.#picking && !e.altKey) return;
        const info = this.#islandAt(e.clientX, e.clientY);
        if (!info && !this.#picking) return;
        e.preventDefault();
        e.stopPropagation();
        this.#swallowNextClick();
        if (this.#picking) this.#setPicking(false);
        this.#select(info);
      },
      true,
    );
    // Hit-test the real page (the overlay layer is pointer-events:none, so elementFromPoint returns the
    // page element under the cursor) to reveal only the hovered island's label — no always-on badges.
    window.addEventListener('pointermove', (e) => {
      if (this.#open) this.#hovered = this.#islandAt(e.clientX, e.clientY);
    });

    // Unless the host root owns the trigger, the overlay's toggle lives in the shared toolbar
    // (alongside the transport/fit chips).
    if (opts.chip !== false) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.title = 'motu debug — seam lens (Cmd/Ctrl+Shift+G)';
      const chipDot = document.createElement('span');
      chipDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.85';
      const chipLabel = document.createElement('span');
      chipLabel.textContent = 'debug';
      chip.append(chipDot, chipLabel);
      chip.addEventListener('click', () => this.toggle());
      motuToolbar().appendChild(chip);
      this.#chip = chip;
    }

    // A window pinned to a corner will eventually be in the way of the thing it is describing, so it
    // is draggable — and a dragged window must survive the viewport shrinking under it. Bound once
    // per overlay, not per panel: the panel is destroyed and rebuilt on every open.
    window.addEventListener('resize', () => this.#clampPosition());

    this.#open = readOpen();
    this.#sync();
  }

  isOpen(): boolean {
    return this.#open;
  }

  #renderChip() {
    if (!this.#chip) return;
    this.#chip.style.cssText = MOTU_TOOLBAR_CHIP_CSS + ';background:' + (this.#open ? MOTU_CHROME.primary : MOTU_CHROME.idle);
  }

  toggle() {
    this.#open = !this.#open;
    writeOpen(this.#open);
    this.#sync();
    for (const fn of openListeners) fn(this.#open);
  }

  #sync() {
    this.#renderChip();
    this.#layer.style.display = this.#open ? '' : 'none';
    if (this.#open) {
      this.#rebuildBoxes();
      this.#ensurePanel();
      this.#renderPanel();
      this.#loop();
    } else {
      if (this.#picking) this.#setPicking(false);
      this.#clearBoxes();
      this.#wires.replaceChildren();
      this.#hovered = null;
      this.#panel?.remove();
      this.#panel = null;
    }
  }

  // --- Outlines (geometry) -----------------------------------------------------------------------

  // The island under a page point, or null. elementFromPoint skips our pointer-events:none layer and
  // stops at a shadow host, so we pierce open shadow roots (the archipelago region owns one) to reach
  // the real island element before matching it.
  #islandAt(x: number, y: number): MountedIslandInfo | null {
    let target = document.elementFromPoint(x, y);
    while (target?.shadowRoot) {
      const inner = target.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === target) break;
      target = inner;
    }
    if (!target) return null;
    for (const info of getMountedIslands()) {
      if (info.el === target || info.el.contains(target)) return info;
    }
    return null;
  }

  #rebuildBoxes() {
    const live = new Set(getMountedIslands());
    for (const [info, els] of this.#boxes) {
      if (!live.has(info)) {
        els.box.remove();
        this.#boxes.delete(info);
      }
    }
    for (const info of live) {
      if (this.#boxes.has(info)) continue;
      const box = h('div', { class: 'box' });
      const tag = h('span', { class: 'tag' });
      tag.addEventListener('click', () => this.#select(info));
      box.append(tag);
      this.#layer.append(box);
      this.#boxes.set(info, { box, tag });
    }
  }

  #clearBoxes() {
    for (const { box } of this.#boxes.values()) box.remove();
    this.#boxes.clear();
  }

  // A rAF loop, only while open: cheaper and more robust than polling, and it follows scroll, layout
  // shifts and ng animations without per-element observers that could pin an element from GC.
  #loop = () => {
    if (!this.#open) return;
    this.#positionBoxes();
    this.#drawWires();
    if (this.#panelDirty) {
      this.#panelDirty = false;
      this.#renderPanel();
    }
    requestAnimationFrame(this.#loop);
  };

  #positionBoxes() {
    const coupled = this.#showCoupling ? this.#coupledIslands() : null;
    for (const [info, { box, tag }] of this.#boxes) {
      const rect = islandRect(info.el);
      if (!rect) {
        box.style.display = 'none';
        continue;
      }
      const def = getIslandDefinition(info.element);
      const v = verdictOf(computeProps(info, def));
      box.style.display = '';
      box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.color = boxColor(v);
      const hover = this.#hovered === info ? ' hover' : '';
      const link = coupled?.has(info) ? ' link' : '';
      box.className = `box ${v}${this.#selected === info ? ' sel' : ''}${hover}${link}`;
      tag.className = `tag ${v}`;
      tag.textContent = '';
      tag.append(
        h('span', {}, info.element),
        h('span', { class: 'iso' }, `${info.slot} \u00b7 ${isolationOf(info.el)}`),
      );
    }
  }

  // The mounted islands that read a key this channel writes — what it "links to". Same store only.
  #channelReaders(ch: ChannelInfo): MountedIslandInfo[] {
    const keys = ch.keys;
    return getMountedIslands().filter(
      (info) => info.store === ch.store && bindKeys(info).some((k) => keys.has(k)),
    );
  }

  // Wires for the inter-island coupling graph (when toggled on) — islands couple THROUGH a shared
  // store key, so the graph is a hub per key with a spoke to each island that touches it.
  #drawWires() {
    this.#wires.replaceChildren();
    if (this.#showCoupling) this.#drawCoupling();
  }

  // Islands don't talk directly — they couple THROUGH a shared store key. So the coupling graph is a
  // hub per key (touched by >=2 islands) with a spoke to each island that reads or writes it. Red hub
  // = 3+ islands (coupling accreting), amber = a plain producer/consumer pair.
  //
  // An island with NO BOX still gets its spoke, drawn faint to a named ghost. It is the common case on
  // a responsive page — the other end of the coupling is real, mounted and bound, but the page does not
  // render it at this width (`lg:hidden`) — and requiring both ends on screen was hiding the graph
  // exactly when it explains the most: the surviving end lit up as "coupled" with nothing to couple to.
  #drawCoupling() {
    for (const [, byKey] of this.#couplingByStore()) {
      for (const [key, islands] of byKey) {
        if (islands.size < 2) continue;
        const anchors: Point[] = [];
        const boxless: MountedIslandInfo[] = [];
        for (const i of islands) {
          const a = islandAnchor(i.el);
          if (a) anchors.push(a);
          else boxless.push(i);
        }
        if (!anchors.length) continue;
        // With one end on screen there is no midpoint to sit on, so the hub parks just above it.
        const hub =
          anchors.length > 1
            ? { x: avg(anchors.map((a) => a.x)), y: avg(anchors.map((a) => a.y)) }
            : { x: anchors[0].x, y: Math.max(16, anchors[0].y - 52) };
        const color = islands.size >= 3 ? '#b91c1c' : '#b45309';
        for (const a of anchors) this.#wires.append(wire(hub.x, hub.y, a.x, a.y, color));
        boxless.forEach((info, n) => {
          const ghost = { x: hub.x, y: Math.max(12, hub.y - 34 - n * 30) };
          const spoke = wire(hub.x, hub.y, ghost.x, ghost.y, color);
          spoke.setAttribute('stroke-opacity', '.4');
          this.#wires.append(spoke);
          this.#wires.append(svgLabel(ghost.x, ghost.y, `${info.slot} \u00b7 not rendered`, color));
        });
        const ring = svgDot(hub.x, hub.y, color, 5);
        ring.setAttribute('stroke', '#fffefb');
        ring.setAttribute('stroke-width', '2');
        this.#wires.append(ring);
        this.#wires.append(svgLabel(hub.x, hub.y - 9, key, color));
      }
    }
  }

  // store -> (store key -> islands that read or write it). Reads come from spec.bind (declarative),
  // writes from the attributed write-log; together they are the keys' "touchers".
  #couplingByStore(): Map<Store, Map<string, Set<MountedIslandInfo>>> {
    const islands = getMountedIslands();
    const bySlot = new Map<string, MountedIslandInfo>();
    for (const i of islands) bySlot.set(i.slot, i);
    const result = new Map<Store, Map<string, Set<MountedIslandInfo>>>();
    const keyMapFor = (store: Store) => {
      let m = result.get(store);
      if (!m) result.set(store, (m = new Map()));
      return m;
    };
    const add = (store: Store, key: string, info: MountedIslandInfo) => {
      const m = keyMapFor(store);
      let s = m.get(key);
      if (!s) m.set(key, (s = new Set()));
      s.add(info);
    };
    for (const info of islands) {
      for (const key of bindKeys(info)) add(info.store, key, info);
    }
    for (const [store, byKey] of this.#writes) {
      for (const [key, slots] of byKey) {
        for (const slot of slots) {
          const info = bySlot.get(slot);
          if (info) add(store, key, info);
        }
      }
    }
    return result;
  }

  // Islands participating in any shared-key coupling (their outlines light up while the graph is on).
  #coupledIslands(): Set<MountedIslandInfo> {
    const out = new Set<MountedIslandInfo>();
    for (const [, byKey] of this.#couplingByStore()) {
      for (const islands of byKey.values()) {
        if (islands.size >= 2) for (const i of islands) out.add(i);
      }
    }
    return out;
  }

  // Channels have no DOM node; they're surfaced in the panel's INPUT section (host -> store), not as
  // floating chips on the page (they don't connect anything on screen).

  // The stores of the archipelago region(s) currently in the DOM. All archipelagos are defined up
  // front (their channels/stores live for the whole session), but a switcher shows one region at a
  // time — so the archipelago-level views scope to these to reset when the on-screen region changes.
  #activeStores(): Set<Store> {
    const stores = new Set<Store>();
    for (const region of document.querySelectorAll('motu-archipelago')) {
      const store = getArchipelagoStore(region.getAttribute('name') ?? '');
      if (store) stores.add(store);
    }
    return stores;
  }

  // The element tags of the islands currently mounted — used to scope the observed contract-call log
  // to the region on screen.
  #activeIslandTags(): Set<string> {
    return new Set(getMountedIslands().map((i) => i.element));
  }

  #onMountsChanged() {
    if (!this.#open) return;
    if (this.#selected && !getMountedIslands().includes(this.#selected)) this.#selected = null;
    this.#rebuildBoxes();
    this.#panelDirty = true;
  }

  #select(info: MountedIslandInfo | null) {
    this.#selected = info;
    this.#renderPanel();
  }

  /** A prevented pointerdown still lets the click through in some browsers; eat exactly one. */
  #swallowNextClick() {
    const eat = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', eat, { capture: true, once: true });
    // If no click follows (drag, cancel), don't leave the trap armed for a later, legitimate click.
    window.setTimeout(() => window.removeEventListener('click', eat, true), 400);
  }

  #setPicking(on: boolean) {
    this.#picking = on;
    // The page's own cursor says what mode you are in; the overlay layer can't (it is inert).
    document.body.style.cursor = on ? 'crosshair' : '';
    this.#renderPanel();
  }

  // --- Call log --------------------------------------------------------------------------------

  #onCall(e: CallEvent) {
    const existing = this.#calls.find((c) => c.id === e.id);
    if (existing) {
      existing.phase = e.phase;
      existing.status = e.status ?? existing.status;
      existing.durationMs = e.durationMs ?? existing.durationMs;
      existing.error = e.error ?? existing.error;
    } else {
      this.#calls.unshift({
        id: e.id,
        service: e.service,
        method: e.method,
        argsKey: safeKey(e.args),
        island: e.island,
        phase: e.phase,
        status: e.status,
        durationMs: e.durationMs,
        error: e.error,
      });
      if (this.#calls.length > CALL_BUFFER) this.#calls.length = CALL_BUFFER;
    }
    this.#panelDirty = true;
  }

  // --- Panel -----------------------------------------------------------------------------------

  #ensurePanel() {
    if (this.#panel) return;
    this.#panel = h('div', { class: 'panel' });
    this.#root.append(this.#panel);
    this.#renderPanel();
    this.#restorePosition();
  }

  /** Move the panel to (x, y), clamped so it can never be dragged off where it can't be grabbed back. */
  #placePanel(x: number, y: number) {
    const panel = this.#panel;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - r.width);
    const maxY = Math.max(0, window.innerHeight - r.height);
    const left = Math.min(Math.max(x, 0), maxX);
    const top = Math.min(Math.max(y, 0), maxY);
    // Inline left/top win over the corner-aware CSS defaults; right must be released or it fights.
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ x: left, y: top }));
    } catch {
      /* storage disabled — the position just won't persist */
    }
  }

  #clampPosition() {
    const panel = this.#panel;
    if (!panel || panel.style.left === '') return;
    this.#placePanel(parseFloat(panel.style.left), parseFloat(panel.style.top));
  }

  /** Reopen where it was last left. Absent (or unparseable) => the corner-aware CSS default stands. */
  #restorePosition() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(POS_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const { x, y } = JSON.parse(raw) as { x: number; y: number };
      if (Number.isFinite(x) && Number.isFinite(y)) this.#placePanel(x, y);
    } catch {
      /* ignore a corrupt value and keep the default placement */
    }
  }

  /** Drag by the header, the way a window is dragged by its title bar. */
  #makeDraggable(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      // Buttons in the header are controls, not a grab area.
      if ((e.target as HTMLElement).closest('button')) return;
      const panel = this.#panel;
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      this.#dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('grabbing');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!this.#dragOffset) return;
      this.#placePanel(e.clientX - this.#dragOffset.x, e.clientY - this.#dragOffset.y);
    });
    const end = () => {
      this.#dragOffset = null;
      handle.classList.remove('grabbing');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // Double-click the title bar to send it back to its default corner.
    handle.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.#panel?.style.removeProperty('left');
      this.#panel?.style.removeProperty('top');
      this.#panel?.style.removeProperty('right');
      try {
        localStorage.removeItem(POS_KEY);
      } catch {
        /* ignore */
      }
    });
  }

  #setMinimized(on: boolean) {
    this.#minimized = on;
    writeFlag(MIN_KEY, on);
    this.#renderPanel();
    // Collapsing changes the panel's height, so a bottom-anchored position can end up off-screen.
    this.#clampPosition();
  }

  // Human fixture capture. Toggles the runtime recorder (read-only — it only observes call()); on
  // stop, serializes the captured calls into the SAME request-keyed fixtures text the CLI produces and
  // both downloads it and copies it to the clipboard (the browser can't write into the workspace).
  #toggleRecording() {
    if (!this.#recording) {
      startRecording();
      startSeedRecording();
      this.#recording = true;
      this.#recStatus = '';
    } else {
      const calls = stopRecording();
      const seedWrites = stopSeedRecording();
      this.#recording = false;
      this.#exportFixtures(calls, seedWrites);
    }
    this.#renderPanel();
  }

  #exportFixtures(calls: RecordedCall[], seedWrites: RecordedSeed[]) {
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
    if (!unique.length && !seedKeys.length) {
      this.#recStatus = 'nothing captured (no calls, no host-fed writes)';
      return;
    }
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
    const parts = [];
    if (unique.length) parts.push(`${unique.length} call(s)`);
    if (seedKeys.length) parts.push(`${seedKeys.length} seed key(s)`);
    this.#recStatus = `${parts.join(' + ')} \u2192 fixtures.recorded.ts (downloaded + copied)`;
  }

  #renderPanel() {
    if (!this.#panel) return;
    this.#panel.textContent = '';
    this.#panel.className = this.#minimized ? 'panel panel--min' : 'panel';

    const head = h('div', { class: 'panel__head' });
    head.append(h('b', {}, 'motu debug'));
    head.append(h('span', { class: 'spacer' }));
    const recBtn = h('button', { title: 'Record contract calls \u2192 request-keyed fixtures' }, this.#recording ? '\u25a0' : '\u25cf');
    if (this.#recording) recBtn.classList.add('rec');
    recBtn.addEventListener('click', () => this.#toggleRecording());
    const couplingBtn = h('button', { title: 'Show inter-island couplings (shared store keys)' }, '\u21c4');
    if (this.#showCoupling) couplingBtn.classList.add('on');
    couplingBtn.addEventListener('click', () => {
      this.#showCoupling = !this.#showCoupling;
      writeFlag(COUPLING_KEY, this.#showCoupling);
      this.#renderPanel();
    });
    const pickBtn = h('button', { title: 'Pick an island on the page (Esc to cancel \u00b7 or Alt-click any island)' }, '\u2316');
    if (this.#picking) pickBtn.classList.add('on');
    pickBtn.addEventListener('click', () => this.#setPicking(!this.#picking));
    const minBtn = h(
      'button',
      { title: this.#minimized ? 'Expand the panel' : 'Minimize to the title bar (lenses keep running)' },
      this.#minimized ? '\u25a1' : '\u2013',
    );
    minBtn.addEventListener('click', () => this.#setMinimized(!this.#minimized));
    const closeBtn = h('button', { title: 'Close (Cmd/Ctrl+Shift+G)' }, '\u2715');
    closeBtn.addEventListener('click', () => this.toggle());
    head.append(pickBtn, recBtn, couplingBtn, minBtn, closeBtn);
    this.#panel.append(head);
    this.#makeDraggable(head);

    // Minimized: the header IS the panel. Everything below it is the reading pane the user collapsed.
    if (this.#minimized) return;

    if (this.#picking) {
      this.#panel.append(h('div', { class: 'pickbar' }, '\u2316 click an island on the page \u2014 Esc to cancel'));
    }

    // Recording status (human fixture capture): read-only — it only observes the call() seam.
    if (this.#recording || this.#recStatus) {
      const msg = this.#recording
        ? '\u25cf recording \u2014 interact with the app, then click \u25a0 to export fixtures'
        : this.#recStatus;
      this.#panel.append(h('div', { class: 'recbar' }, msg));
    }

    const body = h('div', { class: 'panel__body' });
    if (this.#selected) {
      // Island scope: its own input / output / coupling. The way back is here, not in a list.
      const back = h('button', { class: 'back', title: 'Back to the whole region' }, '\u25c2 All islands');
      back.addEventListener('click', () => this.#select(null));
      body.append(back);
      body.append(this.#detail(this.#selected));
    } else {
      // Archipelago scope: the same three axes for the whole region — input (host channels), output
      // (contract calls), coupling (shared store keys). Pick an island on the page to narrow to it.
      body.append(
        h(
          'div',
          { class: 'scopehint' },
          `${getMountedIslands().length} island(s) on screen \u00b7 click \u2316 above, or Alt-click one, to inspect it`,
        ),
      );
      body.append(this.#archInput());
      body.append(this.#archOutput());
      body.append(this.#archCoupling());
    }
    this.#panel.append(body);
  }

  // Per-island fit override: preview a MIXED soft-migration state (one island legacy, another native)
  // that the region toggle can't show. Pins `data-motu-fit-override` so the region fan-out skips it.
  #fitControl(info: MountedIslandInfo): HTMLElement {
    const el = info.el as unknown as { fit?: string };
    const overridden = info.el.hasAttribute('data-motu-fit-override');
    const current = el.fit ?? 'native';
    const row = h('div', { class: 'fitctl' });
    row.append(h('span', { class: 'fitctl__l' }, 'fit'));
    const pick = (mode: 'native' | 'legacy') => {
      const b = h('button', {}, mode);
      if (overridden && current === mode) b.classList.add('on');
      b.addEventListener('click', () => {
        info.el.setAttribute('data-motu-fit-override', '');
        (info.el as unknown as { fit?: string }).fit = mode;
        this.#renderPanel();
      });
      return b;
    };
    const follow = h('button', { title: 'Follow the region fit toggle' }, 'follow region');
    if (!overridden) follow.classList.add('on');
    follow.addEventListener('click', () => {
      info.el.removeAttribute('data-motu-fit-override');
      const arch = this.#archOf(info.el);
      (info.el as unknown as { fit?: string }).fit = arch?.getAttribute('fit') === 'legacy' ? 'legacy' : 'native';
      this.#renderPanel();
    });
    row.append(pick('native'), pick('legacy'), follow);
    return row;
  }

  // The <motu-archipelago> an island lives in — walk up, hopping out of shadow roots.
  #archOf(el: HTMLElement): HTMLElement | null {
    let node: Node | null = el;
    while (node) {
      if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'motu-archipelago') return node;
      const parent: Node | null = node.parentNode;
      node = parent instanceof ShadowRoot ? parent.host : parent;
    }
    return null;
  }

  // The island detail, framed as BEHAVIOUR to de-risk its actual state: what flows in (props + the
  // channels feeding them), what goes out (events, store writes, contract calls — all observed), and
  // what it is coupled to (sibling islands through shared store keys).
  #detail(info: MountedIslandInfo): HTMLElement {
    const def = getIslandDefinition(info.element);
    const rows = computeProps(info, def);
    const wrap = h('div', { class: 'detail' });
    const title = h('div', { class: 'detail__title' });
    title.append(h('span', {}, info.element), h('span', { class: 'detail__slot' }, `${info.slot} \u00b7 ${isolationOf(info.el)}`));
    wrap.append(title);
    wrap.append(this.#fitControl(info));

    // INPUT — declared props (bound / default + live value), their ORIGIN (does the value cross the
    // motu boundary from the ocean, or come from a sibling island?), and the channels feeding them.
    const input = this.#group('input', '#12988f');
    const risk = this.#externalRisk(info);
    if (risk) input.append(h('div', { class: 'risk' }, `\u26a0 ${risk} \u2014 verify embedded`));
    if (!rows.length) input.append(h('div', { class: 'empty' }, 'No declared props.'));
    for (const r of rows) {
      const p = h('div', { class: 'prop' });
      p.append(h('span', { class: 'pn' }, r.name));
      p.append(h('span', { class: `badge ${r.state}` }, r.state));
      p.append(h('span', { class: 'val' }, r.storeKey ? `${r.storeKey} = ${preview(r.value)}` : preview(r.value)));
      if (r.storeKey) {
        const o = this.#keyWriters(info.store, r.storeKey);
        if (o.channel || o.host) p.append(h('span', { class: 'origin ext' }, `ext \u00b7 ${o.channel ? 'channel' : 'host'}`));
        else if (o.islands.length) p.append(h('span', { class: 'origin' }, `int \u00b7 ${o.islands.join(',')}`));
      }
      input.append(p);
    }
    const readKeys = this.#readKeys(info);
    for (const c of this.#inboundChannels(info)) {
      const keys = [...c.keys].filter((k) => readKeys.includes(k)).join(', ');
      input.append(this.#lineRow('via channel', keys, c.fireCount === 0 ? 'never fired' : ago(c.lastAt ?? Date.now()), c.fireCount === 0 ? 'warn' : ''));
    }
    // Declared host-scope reach (AngularJS adapter coupling) — an EXTERNAL dependency the lagoon stubs
    // and core can't observe at runtime; only visible because the island declares it in its contract.
    const hostScope = def?.coupling?.hostScope;
    if (hostScope?.length) {
      input.append(this.#lineRow('via host scope', hostScope.join(', '), 'ext \u00b7 ocean', 'ext'));
    }
    wrap.append(input);

    // OUTPUT — events it emits, store keys it has written (observed), host intents it pushed OUT to
    // the ocean, and contract calls it made to the backend (both cross the motu boundary).
    const output = this.#group('output', '#b45309');
    const emits = Object.entries(info.spec.on ?? {}).filter(([, h]) => h).map(([e]) => e);
    if (emits.length) {
      output.append(this.#subLabel('emits events'));
      const chips = h('div', { class: 'chips' });
      for (const k of emits) chips.append(h('span', { class: 'chip' }, k));
      output.append(chips);
    }
    const writes = this.#islandWrites(info);
    if (writes.length) {
      output.append(this.#subLabel('writes store'));
      const chips = h('div', { class: 'chips' });
      for (const k of writes) chips.append(h('span', { class: 'chip' }, k));
      output.append(chips);
    }
    const intents = this.#intents.filter((i) => i.source === info.slot);
    if (intents.length) {
      output.append(this.#subLabel('host intents \u00b7 \u2192 ocean'));
      for (const i of intents.slice(0, 6)) output.append(this.#intentRow(i));
    }
    const calls = this.#islandCalls(info);
    output.append(this.#subLabel(`contract calls \u00b7 \u2192 backend (${calls.length})`));
    if (!calls.length) output.append(h('div', { class: 'empty' }, 'None observed.'));
    for (const c of calls.slice(0, 8)) output.append(this.#callRow(c, false));
    wrap.append(output);

    // COUPLING — sibling islands sharing a store key: depends-on (their writes feed my reads), feeds
    // (my writes feed their reads), and co-reads (a shared input source), all store-mediated.
    const coupling = this.#group('coupling', '#b91c1c');
    const up = this.#upstream(info);
    const down = this.#downstream(info);
    const co = this.#coReaders(info);
    for (const { key, islands } of up) coupling.append(this.#lineRow('depends on', key, islands.map((i) => i.slot).join(', ')));
    for (const { key, islands } of down) coupling.append(this.#lineRow('feeds', key, islands.map((i) => i.slot).join(', ')));
    for (const { key, islands } of co) coupling.append(this.#lineRow('shares', key, islands.map((i) => i.slot).join(', ')));
    if (!up.length && !down.length && !co.length) coupling.append(h('div', { class: 'empty' }, 'No shared store keys.'));
    wrap.append(coupling);

    return wrap;
  }

  #group(title: string, color: string): HTMLElement {
    const g = h('div', { class: 'grp' });
    g.style.borderLeftColor = color;
    const head = h('div', { class: 'grp__h' });
    head.style.color = color;
    head.append(h('span', { class: 'grp__bar' }), h('span', {}, title));
    g.append(head);
    return g;
  }

  #subLabel(text: string): HTMLElement {
    return h('div', { class: 'sub' }, text);
  }

  #lineRow(kind: string, key: string, targets: string, cls = ''): HTMLElement {
    const row = h('div', { class: 'lr' });
    row.append(h('span', { class: `lr__k ${cls}` }, kind));
    row.append(h('span', { class: 'lr__key' }, key));
    row.append(h('span', { class: 'lr__t' }, targets));
    return row;
  }

  #readKeys(info: MountedIslandInfo): string[] {
    return bindKeys(info);
  }

  #islandWrites(info: MountedIslandInfo): string[] {
    const byKey = this.#writes.get(info.store);
    if (!byKey) return [];
    const out: string[] = [];
    for (const [key, slots] of byKey) if (slots.has(info.slot)) out.push(key);
    return out;
  }

  #islandCalls(info: MountedIslandInfo): CallRecord[] {
    return this.#calls.filter((c) => c.island === info.element);
  }

  #inboundChannels(info: MountedIslandInfo): ChannelInfo[] {
    const reads = new Set(this.#readKeys(info));
    return getChannels().filter((c) => c.store === info.store && [...c.keys].some((k) => reads.has(k)));
  }

  // Islands whose observed writes feed a key this island reads (this island depends on them).
  #upstream(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const byKey = this.#writes.get(info.store);
    if (!byKey) return [];
    const bySlot = this.#slotIndex();
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of this.#readKeys(info)) {
      const slots = byKey.get(key);
      if (!slots) continue;
      const islands = [...slots].filter((s) => s !== info.slot).map((s) => bySlot.get(s)).filter((x): x is MountedIslandInfo => !!x);
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  // Islands that read a key this island has written (they depend on this island).
  #downstream(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of this.#islandWrites(info)) {
      const islands = getMountedIslands().filter((i) => i.store === info.store && i !== info && this.#readKeys(i).includes(key));
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  // Other islands reading a key this island also reads — a shared input source, visible even before
  // any write is observed. Keys already shown as a dependency are omitted to avoid repetition.
  #coReaders(info: MountedIslandInfo): { key: string; islands: MountedIslandInfo[] }[] {
    const upKeys = new Set(this.#upstream(info).map((u) => u.key));
    const res: { key: string; islands: MountedIslandInfo[] }[] = [];
    for (const key of this.#readKeys(info)) {
      if (upKeys.has(key)) continue;
      const islands = getMountedIslands().filter((i) => i.store === info.store && i !== info && this.#readKeys(i).includes(key));
      if (islands.length) res.push({ key, islands });
    }
    return res;
  }

  #slotIndex(): Map<string, MountedIslandInfo> {
    const m = new Map<string, MountedIslandInfo>();
    for (const i of getMountedIslands()) m.set(i.slot, i);
    return m;
  }

  // Where a store key's value comes from — the motu BOUNDARY question. `channel`/`host` mean it is
  // fed from OUTSIDE the archipelago (the ocean, via a channel or the provide() seam); `islands` are
  // sibling islands inside. External origins are the ones the lagoon stubs, so they are the integration
  // risk: if they don't arrive embedded, the island silently runs on defaults.
  #keyWriters(store: Store, key: string): { channel: boolean; host: boolean; islands: string[] } {
    let channel = false;
    let host = false;
    for (const c of getChannels()) {
      if (c.store === store && c.keys.has(key)) {
        channel = true;
        break;
      }
    }
    const islands: string[] = [];
    const writers = this.#writes.get(store)?.get(key);
    if (writers) for (const s of writers) (s === 'host' ? (host = true) : islands.push(s));
    return { channel, host, islands };
  }

  // A short integration-risk phrase for an island: inputs that haven't arrived and channels feeding
  // it that have never fired — exactly what works in the lagoon but silently breaks in the ocean.
  #externalRisk(info: MountedIslandInfo): string | null {
    const rows = computeProps(info, getIslandDefinition(info.element));
    const awaiting = rows.filter((r) => r.state === 'bound-empty').length;
    const dead = this.#inboundChannels(info).filter((c) => c.fireCount === 0).length;
    const hostScope = getIslandDefinition(info.element)?.coupling?.hostScope?.length ?? 0;
    const parts: string[] = [];
    if (awaiting) parts.push(`${awaiting} input${awaiting > 1 ? 's' : ''} awaiting`);
    if (dead) parts.push(`${dead} channel${dead > 1 ? 's' : ''} never fired`);
    if (hostScope) parts.push(`${hostScope} host-scope dep${hostScope > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' \u00b7 ') : null;
  }

  #intentRow(i: HostIntent): HTMLElement {
    const row = h('div', { class: 'call' });
    row.append(h('span', { class: 'st ext' }));
    row.append(h('span', { class: 'ep' }, `${i.kind}: ${i.name}`));
    if (i.source) row.append(h('span', { class: 'isl' }, i.source));
    row.append(h('span', { class: 'n' }, ago(i.at)));
    return row;
  }

  // Archipelago INPUT: the host channels feeding the shared store (host -> store -> islands). Shows
  // fired / never-fired (the silent-event bug), last payload + age, and which islands read each.
  #archInput(): HTMLElement {
    const g = this.#group('input', '#12988f');
    const active = this.#activeStores();
    const channels = getChannels().filter((c) => active.has(c.store));
    const dead = channels.filter((c) => c.fireCount === 0).length;
    if (dead) g.append(h('div', { class: 'risk' }, `\u26a0 ${dead} channel${dead > 1 ? 's' : ''} never fired \u2014 verify embedded`));
    g.append(this.#subLabel(`channels \u00b7 host \u2192 store (${channels.length})`));
    if (!channels.length) {
      g.append(h('div', { class: 'empty' }, 'No channels installed.'));
      return g;
    }
    // Never-fired first — that is the signal worth surfacing loudest.
    const ordered = [...channels].sort((a, b) => a.fireCount - b.fireCount);
    for (const c of ordered) g.append(this.#channelRow(c));
    return g;
  }

  #channelRow(c: ChannelInfo): HTMLElement {
    const keys = [...c.keys];
    const boundKeys = this.#storeReaders(c.store);
    const connected = c.fireCount > 0 && keys.some((k) => boundKeys.has(k));
    const state = c.fireCount === 0 ? 'never' : connected ? 'live' : 'orphan';
    const row = h('div', { class: 'ch' });
    row.append(h('span', { class: `st ch-${state}` }));
    const label = c.name || (keys.length ? '\u2192 ' + keys.join(', ') : `channel #${c.index}`);
    row.append(h('span', { class: 'ep' }, label));
    const bits: string[] = [];
    if (c.fireCount === 0) bits.push('never fired');
    else {
      bits.push(`\u00d7${c.fireCount}`);
      if (c.lastAt) bits.push(ago(c.lastAt));
      if (!connected) bits.push('no reader');
    }
    row.append(h('span', { class: 'n' }, bits.join(' \u00b7 ')));
    if (c.fireCount > 0 && c.lastKey !== undefined) {
      row.append(h('span', { class: 'pay' }, `${c.lastKey}=${preview(c.lastValue)}`));
    }
    const readers = this.#channelReaders(c).map((r) => r.slot);
    row.append(
      h('span', { class: `links${readers.length ? '' : ' warn'}` }, readers.length ? `\u2192 ${readers.join(', ')}` : '\u2192 no island reads this'),
    );
    return row;
  }

  // The store keys any mounted island binds (reads), per store — the "sink side" a channel connects to.
  #storeReaders(store: Store): Set<string> {
    const keys = new Set<string>();
    for (const info of getMountedIslands()) {
      if (info.store !== store) continue;
      for (const k of bindKeys(info)) keys.add(k);
    }
    return keys;
  }

  // Archipelago COUPLING: per shared store key, WHO reads and writes it, flagging demotion candidates
  // (only one island involved) and accreting coupling (touched by many).
  //
  // Naming the islands is the whole point of this view: "1r/1w" is the same string whether one island
  // reads a key nobody else touches or one island writes what ANOTHER one reads — and the second is the
  // only genuine coupling an archipelago has. The counts alone also made that second case read as a
  // demotion candidate, i.e. the view flagged the one real coupling on the page as removable.
  #archCoupling(): HTMLElement {
    const g = this.#group('coupling', '#b91c1c');
    g.append(this.#subLabel('shared store keys \u00b7 Nr / Mw'));
    const groups = new Map<Store, MountedIslandInfo[]>();
    for (const info of getMountedIslands()) {
      const gr = groups.get(info.store);
      if (gr) gr.push(info);
      else groups.set(info.store, [info]);
    }
    if (!groups.size) {
      g.append(h('div', { class: 'empty' }, 'No store activity.'));
      return g;
    }
    let any = false;
    for (const [store, islands] of groups) {
      const readers = new Map<string, Set<string>>();
      for (const info of islands) {
        for (const key of bindKeys(info)) {
          let set = readers.get(key);
          if (!set) readers.set(key, (set = new Set()));
          set.add(info.slot);
        }
      }
      const writers = this.#writes.get(store) ?? new Map<string, Set<string>>();
      const keys = new Set<string>([...readers.keys(), ...writers.keys()]);
      for (const key of [...keys].sort()) {
        const rd = readers.get(key) ?? new Set<string>();
        const wr = writers.get(key) ?? new Set<string>();
        // Host- and channel-origin writes are the OCEAN feeding the region, not an island: they say
        // the key is externally fed, never that two islands are entangled.
        const islandWriters = [...wr].filter((w) => w !== 'host' && w !== 'channel');
        const external = wr.size > islandWriters.length;
        const touchers = new Set<string>([...rd, ...islandWriters]);
        // An externally-fed key is not a demotion candidate: `bind` IS how the ocean reaches one
        // island, and there is nothing to demote it to. What stays worth flagging is a key that one
        // island reads and NOTHING has been seen to feed.
        const demotion = touchers.size <= 1 && !external;
        const coupling = touchers.size >= 3;
        const row = h('div', { class: 'cp' });
        row.append(h('span', { class: 'k' }, key));
        row.append(h('span', { class: 'rw' }, `${rd.size}r/${wr.size}w`));
        const from = external ? ['host'] : islandWriters;
        const who = h('span', { class: 'who' });
        if (from.length) {
          who.append(h('b', {}, from.join(',')), document.createTextNode(' \u2192 '));
        }
        who.append(document.createTextNode(rd.size ? [...rd].join(',') : '\u2205'));
        row.append(who);
        if (coupling) row.append(h('span', { class: 'flag coupling' }, 'coupled'));
        else if (demotion) row.append(h('span', { class: 'flag demote' }, 'demote?'));
        g.append(row);
        any = true;
      }
    }
    if (!any) g.append(h('div', { class: 'empty' }, 'No shared store keys.'));
    return g;
  }

  // Archipelago OUTPUT: host intents pushed OUT to the ocean, and every contract call the region made
  // to the backend (with duplicate detection — the same endpoint+args fetched twice).
  #archOutput(): HTMLElement {
    const g = this.#group('output', '#b45309');
    // Scope to the region on screen: intents from its mounted islands, calls attributed to its tags.
    const slots = new Set(getMountedIslands().map((i) => i.slot));
    const tags = this.#activeIslandTags();
    const intents = this.#intents.filter((i) => i.source != null && slots.has(i.source));
    const calls = this.#calls.filter((c) => c.island != null && tags.has(c.island));
    if (intents.length) {
      g.append(this.#subLabel(`host intents \u00b7 \u2192 ocean (${intents.length})`));
      for (const i of intents.slice(0, 8)) g.append(this.#intentRow(i));
    }
    g.append(this.#subLabel(`contract calls \u00b7 \u2192 backend (${calls.length})`));
    if (!calls.length) {
      g.append(h('div', { class: 'empty' }, 'No calls yet.'));
      return g;
    }
    const counts = new Map<string, number>();
    for (const c of calls) {
      const key = `${c.service}/${c.method}/${c.argsKey}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const c of calls.slice(0, 16)) {
      const dupKey = `${c.service}/${c.method}/${c.argsKey}`;
      g.append(this.#callRow(c, (counts.get(dupKey) ?? 0) > 1));
    }
    return g;
  }

  #callRow(c: CallRecord, dup: boolean): HTMLElement {
    const row = h('div', { class: 'call' });
    row.append(h('span', { class: `st ${c.phase}`, title: c.error ?? c.phase }));
    row.append(h('span', { class: 'ep' }, `${c.service}/${c.method}`));
    if (c.island) row.append(h('span', { class: 'isl' }, c.island));
    const bits: string[] = [];
    if (c.status) bits.push(String(c.status));
    if (c.durationMs != null) bits.push(`${Math.round(c.durationMs)}ms`);
    if (dup) bits.push('\u00d7dup');
    row.append(h('span', { class: 'n' }, bits.join(' \u00b7 ')));
    return row;
  }
}

function boxColor(v: Verdict): string {
  // Same four meanings, re-tuned for a light ground: ok reads as lagoon teal rather than a neon green.
  return v === 'ok' ? '#0f766e' : v === 'warn' ? '#b45309' : v === 'broken' ? '#b91c1c' : '#8d8578';
}

interface Point {
  x: number;
  y: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The island's box on screen.
 *
 * A React-mounted island's wrapper is `display: contents` — deliberately, so placing an island changes
 * nothing about the page's layout — which means it has NO box: `getBoundingClientRect()` is 0x0. Every
 * geometry the lens draws was reading that rect, so under `mount: 'react'` the outlines hid themselves
 * and the coupling graph found no anchors and drew nothing at all. The island IS on screen; only its
 * wrapper is boxless, so fall back to the union of what it rendered.
 */
function islandRect(el: HTMLElement): DOMRect | null {
  const own = el.getBoundingClientRect();
  if (own.width !== 0 || own.height !== 0) return own;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const child of el.children) {
    // A contents-only child (an island wrapping another wrapper) has no box either — recurse.
    const r = child instanceof HTMLElement ? islandRect(child) : child.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (left === Infinity) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

// Where a wire meets an island: horizontal centre, near the top (capped) so tall islands (a results
// list) don't drag the anchor far down the page.
function islandAnchor(el: HTMLElement): Point | null {
  const r = islandRect(el);
  if (!r) return null;
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 28) };
}

function wire(x1: number, y1: number, x2: number, y2: number, color: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  const midY = (y1 + y2) / 2;
  p.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-dasharray', '4 3');
  return p;
}

function svgDot(x: number, y: number, color: string, r = 3): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(x));
  c.setAttribute('cy', String(y));
  c.setAttribute('r', String(r));
  c.setAttribute('fill', color);
  return c;
}

function svgLabel(x: number, y: number, text: string, color: string): SVGTextElement {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font', '600 10px ui-monospace, monospace');
  t.setAttribute('font-family', 'ui-monospace, monospace');
  t.setAttribute('font-size', '10');
  t.setAttribute('font-weight', '700');
  t.setAttribute('fill', color);
  t.setAttribute('stroke', '#fffefb');
  t.setAttribute('stroke-width', '3');
  t.setAttribute('paint-order', 'stroke');
  t.textContent = text;
  return t;
}

function avg(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

function safeKey(args: unknown): string {
  try {
    return JSON.stringify(args);
  } catch {
    return '?';
  }
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

function readOpen(): boolean {
  return readFlag(OPEN_KEY);
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable; the flag just won't outlive the session.
  }
}

function writeOpen(on: boolean): void {
  writeFlag(OPEN_KEY, on);
}
