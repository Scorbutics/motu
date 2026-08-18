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
}

const OPEN_KEY = 'motu:debug';
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

/**
 * Mounts the overlay once. Idempotent, so both composition roots (bridge + lagoon) can call it behind
 * their own __MOTU_DEBUG__ guard. Off by default — a small affordance and a keyboard shortcut reveal it.
 */
export function mountDebugOverlay(opts: DebugOverlayOptions = {}): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  new Overlay(opts);
}

// --- Read-only computations over framework data --------------------------------------------------

function computeProps(info: MountedIslandInfo, def: IslandDefinition | undefined): PropRow[] {
  if (!def) return [];
  const bind = info.spec.bind ?? {};
  const staticProps = info.spec.props ?? {};
  return def.props.map((name): PropRow => {
    if (name in bind) {
      const storeKey = bind[name];
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

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147482000; }
.wires { position: fixed; inset: 0; pointer-events: none; overflow: visible; }
/* No resting outline — the page stays clean. The box border (and label) appear only for the island
   under the cursor, the selected one, or the islands a hovered channel links to. */
.box { position: absolute; border: 1.5px dashed transparent; border-radius: 4px; }
.box.broken { border-style: solid; }
.box.hover, .box.sel, .box.link { border-color: currentColor; }
.box.hover { background: rgba(90,103,242,.05); }
.box.link { background: rgba(56,189,248,.08); }
.box.sel { box-shadow: 0 0 0 2px rgba(255,255,255,.6), 0 0 0 4px currentColor; }
.tag {
  position: absolute; top: -9px; left: 6px; pointer-events: auto; cursor: pointer;
  display: none; align-items: center; gap: 5px; height: 18px; padding: 0 7px;
  border-radius: 9px; font: 600 10px/1 ui-monospace, monospace; color: #fff; white-space: nowrap;
  background: #5a67f2;
}
/* Low-noise by default: the label only appears for the island under the cursor (or the selected one). */
.box.hover .tag, .box.sel .tag, .box.link .tag { display: inline-flex; }
.tag.ok { background: #16a34a; } .tag.warn { background: #d97706; }
.tag.broken { background: #dc2626; } .tag.neutral { background: #64748b; }
.tag .iso { opacity: .8; font-weight: 500; }

.panel {
  position: fixed; right: 12px; top: 56px; z-index: 2147483000; pointer-events: auto;
  width: 360px; max-height: 82vh; display: flex; flex-direction: column;
  background: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 18px 48px rgba(2,6,23,.55); font-size: 12px;
}
.panel__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #1e293b; }
.panel__head b { font-size: 12px; letter-spacing: .3px; }
.panel__head .spacer { flex: 1; }
.panel__head button { background: transparent; border: 0; color: #94a3b8; cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 6px; }
.panel__head button:hover { color: #fff; background: rgba(255,255,255,.08); }
.panel__head button.on { color: #fff; background: rgba(90,103,242,.45); }
.panel__head button.rec { color: #fff; background: rgba(239,68,68,.6); }
.recbar { margin: 0 10px 4px; padding: 5px 8px; border-radius: 6px; font: 500 10px/1.4 ui-monospace, monospace; background: rgba(239,68,68,.14); color: #fca5a5; }
.fitctl { display: flex; align-items: center; gap: 6px; margin: 2px 0 6px; font: 500 10px/1 ui-monospace, monospace; }
.fitctl__l { color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; }
.fitctl button { cursor: pointer; border: 1px solid rgba(148,163,184,.3); background: transparent; color: #94a3b8; padding: 3px 8px; border-radius: 6px; font: inherit; }
.fitctl button:hover { color: #fff; border-color: rgba(148,163,184,.6); }
.fitctl button.on { color: #fff; background: rgba(245,158,11,.35); border-color: transparent; }
.panel__body { overflow-y: auto; padding: 8px 10px 12px; }
.section { margin-top: 10px; }
.section h4 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #94a3b8; font-weight: 700; }

.row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px; cursor: pointer; }
.row:hover { background: rgba(255,255,255,.05); }
.row.sel { background: rgba(90,103,242,.22); }
.row .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.ok { background: #22c55e; } .dot.warn { background: #f59e0b; }
.dot.broken { background: #ef4444; } .dot.neutral { background: #64748b; }
.row .name { font: 600 11px/1.3 ui-monospace, monospace; }
.row .meta { margin-left: auto; color: #64748b; font-size: 10px; }

.prop { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font: 11px/1.4 ui-monospace, monospace; }
.prop .pn { color: #cbd5e1; min-width: 92px; }
.prop .badge { font-size: 9px; padding: 1px 6px; border-radius: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
.badge.bound { background: rgba(34,197,94,.2); color: #4ade80; }
.badge.bound-empty { background: rgba(245,158,11,.2); color: #fbbf24; }
.badge.static { background: rgba(148,163,184,.2); color: #cbd5e1; }
.badge.default { background: rgba(239,68,68,.2); color: #f87171; }
.prop .val { color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.detail { margin-top: 10px; }
.detail__title { display: flex; align-items: baseline; gap: 8px; padding-bottom: 2px; font: 700 12px/1.3 ui-monospace, monospace; color: #e2e8f0; }
.detail__slot { font-weight: 500; font-size: 10px; color: #64748b; }
.grp { margin-top: 9px; padding: 2px 0 4px 10px; border-left: 2px solid #64748b; }
.grp__h { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; font: 700 10px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 1px; }
.grp__bar { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.sub { margin: 6px 0 3px; font: 700 9px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .6px; color: #64748b; }
.lr { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font: 11px/1.3 ui-monospace, monospace; }
.lr__k { color: #94a3b8; min-width: 74px; flex: none; }
.lr__k.warn { color: #fbbf24; }
.lr__k.ext { color: #c4b5fd; }
.lr__key { color: #cbd5e1; }
.lr__t { margin-left: auto; color: #7dd3fc; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.origin { margin-left: 6px; font: 600 9px/1 ui-monospace, monospace; padding: 1px 5px; border-radius: 5px; background: rgba(148,163,184,.16); color: #94a3b8; }
.origin.ext { background: rgba(167,139,250,.22); color: #c4b5fd; }
.risk { margin: 2px 0 6px; padding: 4px 8px; border-radius: 6px; font: 600 10px/1.3 ui-monospace, monospace; color: #fca5a5; background: rgba(239,68,68,.12); }
.st.ext { background: #a78bfa; }

.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { font: 500 10px/1 ui-monospace, monospace; padding: 3px 7px; border-radius: 6px; background: rgba(255,255,255,.06); color: #cbd5e1; }

.call { display: flex; align-items: center; gap: 8px; padding: 4px 0; font: 11px/1.3 ui-monospace, monospace; }
.call .st { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.st.start { background: #38bdf8; } .st.success { background: #22c55e; } .st.error { background: #ef4444; }
.call .ep { color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.call .n { margin-left: auto; color: #64748b; }
.call .isl { color: #818cf8; }
.empty { color: #64748b; font-style: italic; padding: 4px 0; }

.ch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 0; font: 11px/1.3 ui-monospace, monospace; }
.st.ch-live { background: #22c55e; } .st.ch-orphan { background: #f59e0b; } .st.ch-never { background: #ef4444; }
.ch .pay { flex-basis: 100%; color: #64748b; padding-left: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links { flex-basis: 100%; padding-left: 16px; color: #7dd3fc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links.warn { color: #fbbf24; }
.cp { display: flex; align-items: center; gap: 8px; padding: 3px 0; font: 11px/1.3 ui-monospace, monospace; }
.cp .k { color: #cbd5e1; } .cp .rw { color: #64748b; }
.cp .flag { margin-left: auto; font-size: 9px; padding: 1px 6px; border-radius: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
.flag.coupling { background: rgba(239,68,68,.2); color: #f87171; }
.flag.demote { background: rgba(245,158,11,.2); color: #fbbf24; }
`;

// --- The overlay controller ----------------------------------------------------------------------

class Overlay {
  #root: ShadowRoot;
  #layer: HTMLElement;
  #panel: HTMLElement | null = null;
  #chip: HTMLButtonElement;
  #boxes = new Map<MountedIslandInfo, { box: HTMLElement; tag: HTMLElement }>();
  #wires: SVGSVGElement;
  #open = false;
  #selected: MountedIslandInfo | null = null;
  #hovered: MountedIslandInfo | null = null;
  #showCoupling = false;
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
        this.#toggle();
      }
    });
    // Hit-test the real page (the overlay layer is pointer-events:none, so elementFromPoint returns the
    // page element under the cursor) to reveal only the hovered island's label — no always-on badges.
    window.addEventListener('pointermove', (e) => {
      if (this.#open) this.#hovered = this.#islandAt(e.clientX, e.clientY);
    });

    // The overlay's toggle lives in the shared top-right toolbar (alongside the transport/fit chips).
    this.#chip = document.createElement('button');
    this.#chip.type = 'button';
    this.#chip.title = 'motu debug — seam lens (Cmd/Ctrl+Shift+G)';
    const chipDot = document.createElement('span');
    chipDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#fff;opacity:.85';
    const chipLabel = document.createElement('span');
    chipLabel.textContent = 'debug';
    this.#chip.append(chipDot, chipLabel);
    this.#chip.addEventListener('click', () => this.#toggle());
    motuToolbar().appendChild(this.#chip);

    this.#open = readOpen();
    this.#sync();
  }

  #renderChip() {
    this.#chip.style.cssText = MOTU_TOOLBAR_CHIP_CSS + ';background:' + (this.#open ? '#5a67f2' : '#1e293b');
  }

  #toggle() {
    this.#open = !this.#open;
    writeOpen(this.#open);
    this.#sync();
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
      const rect = info.el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
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
      (info) => info.store === ch.store && Object.values(info.spec.bind ?? {}).some((k) => keys.has(k)),
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
  #drawCoupling() {
    for (const [, byKey] of this.#couplingByStore()) {
      for (const [key, islands] of byKey) {
        if (islands.size < 2) continue;
        const anchors = [...islands].map((i) => islandAnchor(i.el)).filter((a): a is Point => !!a);
        if (anchors.length < 2) continue;
        const hub = { x: avg(anchors.map((a) => a.x)), y: avg(anchors.map((a) => a.y)) };
        const color = islands.size >= 3 ? '#f87171' : '#fbbf24';
        for (const a of anchors) this.#wires.append(wire(hub.x, hub.y, a.x, a.y, color));
        const ring = svgDot(hub.x, hub.y, color, 5);
        ring.setAttribute('stroke', '#0f172a');
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
      for (const key of Object.values(info.spec.bind ?? {})) add(info.store, key, info);
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
    this.#panel.className = 'panel';

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
      this.#renderPanel();
    });
    const closeBtn = h('button', { title: 'Close (Cmd/Ctrl+Shift+G)' }, '\u2715');
    closeBtn.addEventListener('click', () => this.#toggle());
    head.append(recBtn, couplingBtn, closeBtn);
    this.#panel.append(head);

    // Recording status (human fixture capture): read-only — it only observes the call() seam.
    if (this.#recording || this.#recStatus) {
      const msg = this.#recording
        ? '\u25cf recording \u2014 interact with the app, then click \u25a0 to export fixtures'
        : this.#recStatus;
      this.#panel.append(h('div', { class: 'recbar' }, msg));
    }

    const body = h('div', { class: 'panel__body' });
    body.append(this.#islandList());
    if (this.#selected) {
      // Island scope: its own input / output / coupling.
      body.append(this.#detail(this.#selected));
    } else {
      // Archipelago scope: the same three axes for the whole region — input (host channels), output
      // (contract calls), coupling (shared store keys). Select an island to narrow to it.
      body.append(this.#archInput());
      body.append(this.#archOutput());
      body.append(this.#archCoupling());
    }
    this.#panel.append(body);
  }

  #islandList(): HTMLElement {
    const sec = h('div', { class: 'section' });
    const islands = getMountedIslands();
    const scope = this.#selected ? this.#selected.element : 'all islands';
    sec.append(h('h4', {}, `Islands (${islands.length}) \u00b7 ${scope}`));
    if (!islands.length) {
      sec.append(h('div', { class: 'empty' }, 'No islands mounted.'));
      return sec;
    }
    for (const info of islands) {
      const def = getIslandDefinition(info.element);
      const v = verdictOf(computeProps(info, def));
      const row = h('div', { class: `row${this.#selected === info ? ' sel' : ''}` });
      row.append(h('span', { class: `dot ${v}` }));
      row.append(h('span', { class: 'name' }, info.element));
      row.append(h('span', { class: 'meta' }, `${info.slot} \u00b7 ${isolationOf(info.el)}`));
      // Clicking the selected island again clears the selection, back to the archipelago view.
      row.addEventListener('click', () => this.#select(this.#selected === info ? null : info));
      sec.append(row);
    }
    return sec;
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
    const input = this.#group('input', '#38bdf8');
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
    const output = this.#group('output', '#f59e0b');
    const emits = Object.keys(info.spec.on ?? {});
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
    const coupling = this.#group('coupling', '#f87171');
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
    return Object.values(info.spec.bind ?? {});
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
    const g = this.#group('input', '#38bdf8');
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
      for (const k of Object.values(info.spec.bind ?? {})) keys.add(k);
    }
    return keys;
  }

  // Archipelago COUPLING: per shared store key, how many islands read/write it, flagging demotion
  // candidates (single reader) and accreting coupling (touched by many).
  #archCoupling(): HTMLElement {
    const g = this.#group('coupling', '#f87171');
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
        for (const key of Object.values(info.spec.bind ?? {})) {
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
        const touchers = new Set<string>([...rd, ...wr]);
        const demotion = rd.size === 1 && wr.size <= 1;
        const coupling = touchers.size >= 3;
        const row = h('div', { class: 'cp' });
        row.append(h('span', { class: 'k' }, key));
        row.append(h('span', { class: 'rw' }, `${rd.size}r/${wr.size}w`));
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
    const g = this.#group('output', '#f59e0b');
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
  return v === 'ok' ? '#22c55e' : v === 'warn' ? '#f59e0b' : v === 'broken' ? '#ef4444' : '#64748b';
}

interface Point {
  x: number;
  y: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Where a wire meets an island: horizontal centre, near the top (capped) so tall islands (a results
// list) don't drag the anchor far down the page.
function islandAnchor(el: HTMLElement): Point | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
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
  t.setAttribute('stroke', '#0f172a');
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
  try {
    return localStorage.getItem(OPEN_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeOpen(on: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable; the overlay still works for the session.
  }
}
