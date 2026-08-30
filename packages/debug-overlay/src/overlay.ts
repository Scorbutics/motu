// The lens' SHELL: everything about it that is not a function of state.
//
// The panel's content is React (`panel.tsx`) over motu's kit. What is left here is the half that
// measures, positions and animates: a closed shadow root over the host page, the outline boxes and
// their labels, the wire canvas for the coupling and requests graphs, the panel's position (drag,
// clamp, persist), the edge tab, the flood, and the element picker.
//
// That division is not arbitrary. Everything below reads the HOST's live DOM at animation-frame rate
// — `getBoundingClientRect` per island per frame, `elementFromPoint` through shadow roots, absolutely
// positioned SVG over somebody else's layout. React earns its place where markup is a function of
// state; here the state IS the page's geometry and the function is a measurement.
//
// READ-ONLY throughout: it observes the mount registry, the shared stores, the island definitions and
// the transport call log, and never writes a store, fires a channel or forces a render.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import {
  getMountedIslands,
  getIslandDefinition,
  motuToolbar,
  MOTU_TOOLBAR_CHIP_CSS,
  MOTU_CHROME,
  hostCalls,
  flood,
  applyFlood,
  clearFlood,
  floodFrames,
  type MountedIslandInfo,
} from '@motu/core';
// The verdict palette comes from the design tokens, not from @motu/core's re-export: these four
// are the kit's semantics and the lens is one of three places that used to spell them out.
import { MOTU_VERDICT } from '@motu/chrome/tokens';
import { STYLES, TAB_H } from './styles';
import { FLAG, lens, readFlag, writeFlag } from './store';
// THE PANEL IS GONE, and this is what it left behind. `setPicking` flips a mode and sets the page's
// own cursor — it was in the panel only because the panel had the button. It belongs here, with the
// layer it actually affects.
/** Crosshair mode: the page's own cursor says what mode you are in; the overlay layer cannot (it is inert). */
export function setPicking(on: boolean): void {
  lens.picking = on;
  document.body.style.cursor = on ? 'crosshair' : '';
  lens.changedNow();
}
/**
 * The coupling graph: wires between islands that share a region key, and their outlines lit.
 *
 * Persisted, like it was on the old header — it is a way of LOOKING at the page you keep while you
 * work on it, not a per-open preference. `showCoupling` is read back from the same flag at mount.
 */
export function setCoupling(on: boolean): void {
  lens.showCoupling = on;
  writeFlag(FLAG.coupling, on);
  lens.changedNow();
}

/** What the rig's toggle mirrors — the graph survives a reload, so the switch has to read it back. */
export function couplingOn(): boolean {
  return lens.showCoupling;
}
import { computeProps, verdictOf, isolationOf, avg, sourceLabel, type Verdict } from './model';
import { crosshair, islandAnchor, islandRect, svgDot, svgLabel, wire, type Point } from './geometry';

export interface DebugOverlayOptions {
  /** Keyboard shortcut, matched against KeyboardEvent.code (default 'KeyG' with Cmd/Ctrl+Shift). */
  shortcutCode?: string;
  /**
   * Mount the built-in toggle chip into the shared toolbar (default true). Pass FALSE when the host
   * root has chrome of its own and wants to own the trigger. Drive it with `toggleDebugOverlay()` and
   * mirror its state with `subscribeDebugOverlay()`.
   */
  chip?: boolean;
  /**
   * The lens' own trigger: a tab on the edge of its panel (default: on whenever `chip` is false, so a
   * root that took the chip away is never left without a way in).
   *
   * It replaces the buoy the lagoon used to moor in its bay. A page-wide lens summoned from someone
   * else's chrome put its trigger a layer away from the thing it opens; a tab rides ON the panel, so
   * opening and closing happen in the same place — and when the panel is closed the tab is still
   * there, at the screen edge, which is the only part of the lens that has to be discoverable.
   *
   * Pass FALSE if the host renders a trigger of its own and does not want a second one.
   */
  tab?: boolean;
}

const POS_KEY = 'motu:debug:pos';

/** The lens' own reduced-motion answer. Every animation below asks first. */
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLOOD_MS = 460;
const RECEDE_MS = 300;

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

// --- The overlay controller ----------------------------------------------------------------------

class Overlay {
  #root: ShadowRoot;
  #layer: HTMLElement;
  #panel: HTMLElement | null = null;
  /** The React root rendering into `#panel`. Torn down with it. */
  #react: Root | null = null;
  /** Null when the host root owns the trigger (`chip: false`). */
  #chip: HTMLButtonElement | null = null;
  /** The lens' own trigger — a tab at the panel's edge. Null when the host asked for none. */
  #tab: HTMLButtonElement | null = null;
  /** The panel's in-flight flood, so a reversal can take the element over cleanly. */
  #panelAnim: Animation | null = null;
  #boxes = new Map<MountedIslandInfo, { box: HTMLElement; tag: HTMLElement }>();
  #wires: SVGSVGElement;
  #open = false;
  #dragOffset: { x: number; y: number } | null = null;

  constructor(opts: DebugOverlayOptions) {
    const shortcut = opts.shortcutCode ?? 'KeyG';

    // The flags that outlive a session. They live on the store because the panel renders from them.
    lens.showCoupling = readFlag(FLAG.coupling);
    lens.minimized = readFlag(FLAG.minimized);
    lens.start();

    const hostEl = document.createElement('div');
    // A closed shadow keeps the page's stylesheet (and any island's) from reaching in, and ours out.
    this.#root = hostEl.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.#root.append(style);
    this.#layer = document.createElement('div');
    this.#layer.className = 'layer';
    // A dedicated SVG layer for connector wires from a hovered channel to the islands it feeds.
    this.#wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.#wires.setAttribute('class', 'wires');
    this.#layer.append(this.#wires);
    this.#root.append(this.#layer);
    document.body.append(hostEl);

    // The outlines follow the mount registry, and the panel follows the store — two different
    // subscriptions to the same event, because only one of them needs a React render.
    lens.subscribe(() => {
      if (this.#open) this.#rebuildBoxes();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === shortcut) {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && lens.picking) setPicking(false);
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
        if (!lens.picking && !e.altKey) return;
        const info = this.#islandAt(e.clientX, e.clientY);
        if (!info && !lens.picking) return;
        e.preventDefault();
        e.stopPropagation();
        this.#swallowNextClick();
        if (lens.picking) setPicking(false);
        lens.selected = info;
        lens.changedNow();
      },
      true,
    );
    // Hit-test the real page (the overlay layer is pointer-events:none, so elementFromPoint returns the
    // page element under the cursor) to reveal only the hovered island's label — no always-on badges.
    window.addEventListener('pointermove', (e) => {
      if (this.#open) lens.hovered = this.#islandAt(e.clientX, e.clientY);
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

    // The lens' own trigger. Default: on whenever the toolbar chip is off, so a root that took the
    // chip away (the lagoon does) is never left without a way in.
    if (opts.tab ?? opts.chip === false) {
      const tab = document.createElement('button');
      tab.className = 'tab';
      tab.type = 'button';
      tab.title = 'motu seam lens (Cmd/Ctrl+Shift+G)';
      tab.setAttribute('aria-label', 'Toggle the motu seam lens');
      tab.setAttribute('aria-pressed', 'false');
      tab.append(crosshair());
      tab.addEventListener('click', () => {
        this.#tabRipple();
        this.toggle();
      });
      this.#root.append(tab);
      this.#tab = tab;
      // The host can move the panel's side under us (the lagoon does, whenever its bay is dragged to
      // another corner) — and it says so by rewriting --motu-debug-left/right on <html>. Follow it,
      // or a closed tab ends up at the edge the panel no longer opens from.
      new MutationObserver(() => this.#syncTab()).observe(document.documentElement, {
        attributeFilter: ['style'],
      });
    }

    // A window pinned to a corner will eventually be in the way of the thing it is describing, so it
    // is draggable — and a dragged window must survive the viewport shrinking under it. Bound once
    // per overlay, not per panel: the panel is destroyed and rebuilt on every open.
    window.addEventListener('resize', () => this.#clampPosition());

    this.#open = readFlag(FLAG.open);
    this.#sync();
  }

  isOpen(): boolean {
    return this.#open;
  }

  toggle() {
    this.#open = !this.#open;
    writeFlag(FLAG.open, this.#open);
    this.#sync();
    for (const fn of openListeners) fn(this.#open);
  }

  // --- Opening and closing -----------------------------------------------------------------------

  #sync() {
    this.#renderChip();
    // The tab goes home the moment the lens is closed, even though the panel is still draining. It
    // was pinned to the receding panel at first, and that left the screen edge dead for the length of
    // the drain — a click where the trigger lives did nothing. A trigger is never allowed to be
    // somewhere unexpected to serve an animation, and the water receding TOWARD the edge the tab just
    // returned to is the more honest reading anyway.
    this.#syncTab();
    this.#layer.style.display = this.#open ? '' : 'none';
    if (this.#open) {
      this.#rebuildBoxes();
      this.#ensurePanel();
      this.#loop();
    } else {
      if (lens.picking) setPicking(false);
      this.#clearBoxes();
      this.#wires.replaceChildren();
      lens.hovered = null;
      const draining = this.#panel;
      const react = this.#react;
      this.#panel = null;
      this.#react = null;
      if (!draining) return;
      // Let the water go back out the way it came, THEN destroy it. #panel is already null, so a
      // reopen mid-drain builds a fresh panel and this one is only cleaning itself up.
      // A panel on its way out is scenery: it must not intercept a click meant for what is behind it
      // (the tab is right there, and re-opening during the drain is a normal thing to do).
      draining.style.pointerEvents = 'none';
      const done = () => {
        // Unmount BEFORE removing the container: React needs the nodes it is about to detach, and an
        // unmount after the element is gone leaves the root's listeners attached to nothing.
        react?.unmount();
        draining.remove();
      };
      const anim = this.#flood(draining, 'out');
      if (!anim) return void done();
      anim.finished.then(done).catch(done);
    }
  }

  /**
   * NOTHING TO ENSURE ANY MORE.
   *
   * The lens' panel moved into the lagoon's own sidebar — the sheet, the feeds, the calls, the
   * coupling, coverage, the island scope and the recorder are all tabs there now, drawn by whoever
   * hosts the lagoon rather than bundled into it. What could NOT move is below: the page layer, which
   * measures the host's live DOM sixty times a second and only means anything over the running page.
   *
   * So the lens keeps its outlines, its wires, its hit-testing and its crosshair, and stops carrying
   * a second copy of the panel that now lives somewhere better.
   */
  /**
   * NOTHING TO ENSURE ANY MORE.
   *
   * The lens' panel moved into the lagoon's own sidebar — the region sheet, the feeds, the calls,
   * the coupling, coverage, the island scope and the recorder are all tabs there now, drawn by
   * whoever hosts the lagoon instead of bundled into it.
   *
   * What could NOT move is everything else in this file: the page layer measures the host's live DOM
   * sixty times a second and only means anything over the running page. So the lens keeps its
   * outlines, its wires, its hit-testing and its crosshair, and stops carrying a second copy of a
   * panel that now lives somewhere better.
   */
  #ensurePanel() {}

  /**
   * The minimized class, which React does not own.
   *
   * The panel ELEMENT is the overlay's — it is what gets dragged, floated and measured — so the one
   * piece of the panel's own state that shows up on that element has to be mirrored here. Read on
   * every frame of the open loop rather than pushed, because the button that changes it is inside
   * React and pushing would mean the panel calling back out to its container.
   */
  #applyMinimized() {
    const panel = this.#panel;
    if (!panel) return;
    panel.classList.toggle('panel--min', lens.minimized);
  }

  // --- The rAF loop ------------------------------------------------------------------------------

  // Only while open: cheaper and more robust than polling, and it follows scroll, layout shifts and
  // ng animations without per-element observers that could pin an element from GC.
  #loop = () => {
    if (!this.#open) return;
    this.#positionBoxes();
    this.#drawWires();
    this.#applyMinimized();
    this.#placeTab();
    requestAnimationFrame(this.#loop);
  };

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
      const box = document.createElement('div');
      box.className = 'box';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.addEventListener('click', () => {
        lens.selected = info;
        lens.changedNow();
      });
      box.append(tag);
      this.#layer.append(box);
      this.#boxes.set(info, { box, tag });
    }
  }

  #clearBoxes() {
    for (const { box } of this.#boxes.values()) box.remove();
    this.#boxes.clear();
  }

  #positionBoxes() {
    const coupled = lens.showCoupling ? lens.coupledIslands() : null;
    for (const [info, { box, tag }] of this.#boxes) {
      const rect = islandRect(info.el);
      if (!rect) {
        box.style.display = 'none';
        continue;
      }
      const v = verdictOf(computeProps(info, getIslandDefinition(info.element)));
      box.style.display = '';
      box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.color = boxColor(v);
      const hover = lens.hovered === info ? ' hover' : '';
      const link = coupled?.has(info) ? ' link' : '';
      box.className = `box ${v}${lens.selected === info ? ' sel' : ''}${hover}${link}`;
      tag.className = `tag ${v}`;
      tag.replaceChildren();
      const name = document.createElement('span');
      name.textContent = info.element;
      const iso = document.createElement('span');
      iso.className = 'iso';
      iso.textContent = `${info.slot} · ${isolationOf(info.el)}`;
      tag.append(name, iso);
    }
  }

  // --- The graphs --------------------------------------------------------------------------------

  // Wires for the inter-island coupling graph (when toggled on) — islands couple THROUGH a shared
  // store key, so the graph is a hub per key with a spoke to each island that touches it.
  #drawWires() {
    this.#wires.replaceChildren();
    if (lens.showCoupling) {
      this.#drawCoupling();
      this.#drawRequests();
    }
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
    // TWO PASSES, because a hub's honest position collides with its neighbours'.
    //
    // A hub sits at the centroid of the islands that touch its key. On a screen whose islands are a
    // ROW — a drill-down, a toolbar, three columns — every key's centroid lands within a few pixels
    // of every other, so the rings stack and the labels overprint: the graph draws four couplings and
    // a reader can make out two. Collect them first, spread them second, and the picture says what
    // the region actually declares.
    const hubs: Array<{
      key: string;
      color: string;
      anchors: Point[];
      boxless: MountedIslandInfo[];
      x: number;
      y: number;
    }> = [];

    for (const [, byKey] of lens.couplingByStore()) {
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
        const seat =
          anchors.length > 1
            ? { x: avg(anchors.map((a) => a.x)), y: avg(anchors.map((a) => a.y)) }
            : { x: anchors[0].x, y: Math.max(16, anchors[0].y - 52) };
        hubs.push({
          key,
          color: islands.size >= 3 ? '#b91c1c' : '#b45309',
          anchors,
          boxless,
          x: seat.x,
          y: seat.y,
        });
      }
    }

    // SPREAD. Deterministic — sorted, then each hub takes the nearest free seat above or below its
    // own — so the same screen draws the same graph twice and a screenshot can be compared.
    const GAP = 30;
    const NEAR_X = 120;
    const placed: Array<{ x: number; y: number }> = [];
    const taken = (x: number, y: number) =>
      placed.some((p) => Math.abs(p.x - x) < NEAR_X && Math.abs(p.y - y) < GAP);
    hubs.sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
    for (const h of hubs) {
      if (taken(h.x, h.y)) {
        for (let n = 1; n <= 12; n++) {
          // Up first: above a row of islands is usually empty page, below it is the next island.
          const up = h.y - n * GAP;
          const down = h.y + n * GAP;
          if (up > 16 && !taken(h.x, up)) { h.y = up; break; }
          if (!taken(h.x, down)) { h.y = down; break; }
        }
      }
      placed.push({ x: h.x, y: h.y });
    }

    for (const h of hubs) {
      for (const a of h.anchors) this.#wires.append(wire(h.x, h.y, a.x, a.y, h.color));
      h.boxless.forEach((info, n) => {
        const ghost = { x: h.x, y: Math.max(12, h.y - 34 - n * 30) };
        const spoke = wire(h.x, h.y, ghost.x, ghost.y, h.color);
        spoke.setAttribute('stroke-opacity', '.4');
        this.#wires.append(spoke);
        this.#wires.append(svgLabel(ghost.x, ghost.y, `${info.slot} · not rendered`, h.color));
      });
      const ring = svgDot(h.x, h.y, h.color, 5);
      ring.setAttribute('stroke', '#fffefb');
      ring.setAttribute('stroke-width', '2');
      this.#wires.append(ring);
      this.#wires.append(svgLabel(h.x, h.y - 9, h.key, h.color));
    }
  }

  /**
   * The OTHER coupling — two islands asking the same source.
   *
   * The store graph draws what islands share through the region. It cannot see the sharing that
   * happens outside it: peps' counters banner and its feed both call `@/lib/services/club-feed`, and
   * on the store graph they are two unrelated islands. They are not. They fetch from one place, they
   * go stale together, and the page that replaces that module has to satisfy both — which is exactly
   * the kind of fact this graph exists to make visible without reading four files.
   *
   * Same shape as a key hub, in the requests colour: a node per SOURCE (a host module, or a contract
   * service), a spoke to every island that called it, and the call count on the label. A source only
   * one island calls is still drawn — thin, because "this island fetches for itself" is worth seeing
   * next to a shared one, and it is the difference between an island that owns its data and one that
   * borrows it.
   */
  #drawRequests() {
    const byTag = new Map(getMountedIslands().map((i) => [i.element, i]));
    // source -> island -> the calls it made there. Both routes land in the same map: from the graph's
    // point of view a transport call and a stubbed host module are the same act.
    const sources = new Map<string, Map<MountedIslandInfo, { n: number; fns: Set<string> }>>();
    const touch = (source: string, fn: string, tag: string | null | undefined) => {
      const info = tag ? byTag.get(tag) : undefined;
      if (!info) return; // a call from outside any island has no box to draw a spoke to
      let m = sources.get(source);
      if (!m) sources.set(source, (m = new Map()));
      let e = m.get(info);
      if (!e) m.set(info, (e = { n: 0, fns: new Set() }));
      e.n++;
      e.fns.add(fn);
    };
    for (const c of hostCalls()) touch(sourceLabel(c.module), c.fn, c.island);
    for (const c of lens.calls) touch(c.service, c.method, c.island);

    for (const [source, callers] of sources) {
      const spokes: { at: Point; fns: Set<string> }[] = [];
      for (const [info, e] of callers) {
        const at = islandAnchor(info.el);
        if (at) spokes.push({ at, fns: e.fns });
      }
      if (!spokes.length) continue;
      const anchors = spokes.map((s0) => s0.at);
      const shared = callers.size >= 2;
      // BELOW the islands, where a key hub sits above them: the two graphs overlay the same page and
      // a shared midpoint would stack a source node on top of a key node.
      const hub = shared
        ? { x: avg(anchors.map((a) => a.x)), y: avg(anchors.map((a) => a.y)) }
        : { x: anchors[0].x, y: anchors[0].y + 52 };
      const color = '#0369a1';
      for (const { at, fns } of spokes) {
        const spoke = wire(hub.x, hub.y, at.x, at.y, color);
        if (!shared) spoke.setAttribute('stroke-opacity', '.45');
        this.#wires.append(spoke);
        // WHAT THIS ISLAND CALLED, on the spoke rather than on the hub. The hub is the module, and a
        // module label alone answers the wrong question the moment two islands call different things
        // in it: peps' banner and feed share `@/lib/services/club-feed`, and one hub reading
        // "club-feed" said neither which function each called nor that the word was a module at all —
        // next to an island literally named `x-club-feed` it read as the island's own name.
        if (spokes.length <= 4) {
          const label = [...fns].slice(0, 2).join(', ') + (fns.size > 2 ? ` +${fns.size - 2}` : '');
          this.#wires.append(svgLabel((hub.x + at.x) / 2, (hub.y + at.y) / 2 - 4, label, color));
        }
      }
      const dot = svgDot(hub.x, hub.y, color, shared ? 5 : 3.5);
      dot.setAttribute('stroke', '#fffefb');
      dot.setAttribute('stroke-width', '2');
      this.#wires.append(dot);
      const n = [...callers.values()].reduce((a, b) => a + b.n, 0);
      this.#wires.append(svgLabel(hub.x, hub.y + 16, `${source} · ${n}×`, color));
    }
  }

  // --- The tab -----------------------------------------------------------------------------------

  /**
   * Which screen edge the tab hugs while the lens is closed: the same one the panel opens from. The
   * host says where that is with --motu-debug-left/right (the lagoon flips them when its bay moves),
   * and the CSS default is the right, so an unset var means right.
   */
  #panelSide(): 'left' | 'right' {
    const left = getComputedStyle(document.documentElement).getPropertyValue('--motu-debug-left').trim();
    return left && left !== 'auto' ? 'left' : 'right';
  }

  #syncTab() {
    const tab = this.#tab;
    if (!tab) return;
    tab.setAttribute('aria-pressed', String(this.#open));
    tab.dataset.side = this.#panelSide();
    // Closed: back to the edge, under the CSS defaults. Whatever the loop pinned is released here, so
    // a panel that was dragged somewhere odd does not strand its tab there.
    if (!this.#open) {
      tab.style.removeProperty('left');
      tab.style.removeProperty('top');
      tab.style.removeProperty('right');
      tab.style.removeProperty('height');
    }
  }

  /**
   * Glue the tab to the panel's INNER edge while the lens is open, from the panel's own rect. Done in
   * the open loop rather than in CSS because the panel is draggable, minimizable and clamped on
   * resize: reading the rect covers all three without a second copy of any of that bookkeeping.
   */
  #placeTab() {
    const tab = this.#tab;
    const panel = this.#panel;
    if (!tab || !panel) return;
    const r = panel.getBoundingClientRect();
    const w = tab.offsetWidth || 26;
    // Overlap by a pixel so it reads as attached to the panel rather than parked beside it — and
    // clamp, because on a narrow viewport the panel spans nearly the whole width and the tab would
    // hang off the edge it is meant to be grabbed from.
    const x = this.#panelSide() === 'right' ? r.left - w + 1 : r.right - 1;
    tab.style.left = `${Math.round(Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - w)))}px`;
    tab.style.right = 'auto';
    // The tab is a pull ON the panel, so it can never be taller than what it is attached to. Minimized,
    // the panel IS its title bar (~36px) and a fixed 54px tab hung off both ends of it, reading as a
    // bigger thing with a small panel stuck to its side. Short panel: shrink and centre on it. Full
    // panel: the fixed height, near the top, where the title bar is.
    const full = r.height >= 96;
    const h = full ? TAB_H : Math.max(24, Math.round(r.height) - 8);
    tab.style.height = `${h}px`;
    tab.style.top = `${Math.round(full ? r.top + 18 : r.top + (r.height - h) / 2)}px`;
  }

  #renderChip() {
    if (!this.#chip) return;
    this.#chip.style.cssText =
      MOTU_TOOLBAR_CHIP_CSS + ';background:' + (this.#open ? MOTU_CHROME.primary : MOTU_CHROME.idle);
  }

  // --- Motion ------------------------------------------------------------------------------------

  /**
   * Pour the panel in from the tab's side, or drain it back out the same way. Returns the animation
   * so the close path can wait for it — the panel is destroyed on close, and destroying it mid-drain
   * is what would make the water vanish instead of receding.
   *
   * The mask is dropped on finish: a live mask on a scrolling, live-updating panel is compositing
   * work for a shape nobody can see once it has fully arrived.
   */
  #flood(panel: HTMLElement, dir: 'in' | 'out'): Animation | null {
    if (REDUCED()) return null;
    // Water always moves through the side the TAB is on, so the motion points at the trigger in both
    // directions. Open: the tab is on the panel's inner edge, so the water comes in from there.
    // Close: the tab has already gone home to the screen edge, so the water leaves that way — draining
    // back out the inner edge would send it to a place the tab has just left.
    const tabSide = this.#panelSide() === 'right' ? 'left' : 'right';
    const from = dir === 'in' ? tabSide : tabSide === 'left' ? 'right' : 'left';
    const f = flood(from);
    applyFlood(panel, f);
    // The swell carries the panel a little with it, so the water is moving the surface rather than
    // being painted over a surface that is already there.
    const away = from === 'left' ? -14 : 14;
    const [a, b] = floodFrames(f, dir);
    const arrived = { opacity: 1, transform: 'none' };
    const offshore = { opacity: 0, transform: `translateX(${away}px)` };
    const frames =
      dir === 'in' ? [{ ...a, ...offshore }, { ...b, ...arrived }] : [{ ...a, ...arrived }, { ...b, ...offshore }];
    // One flood at a time per panel: a close arriving mid-open would otherwise leave the first
    // animation to finish and strip the mask out from under the second.
    this.#panelAnim?.cancel();
    const anim = panel.animate(frames, {
      duration: dir === 'in' ? FLOOD_MS : RECEDE_MS,
      easing: dir === 'in' ? 'cubic-bezier(.22,.9,.3,1)' : 'cubic-bezier(.5,0,.75,.4)',
      fill: 'both',
    });
    this.#panelAnim = anim;
    if (dir === 'in') {
      anim.finished
        .then(() => {
          clearFlood(panel);
          anim.cancel();
        })
        .catch(() => {
          /* cancelled by a close that arrived mid-flood — that animation owns the element now */
        });
    }
    return anim;
  }

  /**
   * A drop hitting the water where you clicked. Two rings, staggered, spreading from the tab — the
   * acknowledgement that the click landed, and the visual link between the tab and the panel now
   * pouring out of it.
   */
  #tabRipple() {
    const tab = this.#tab;
    if (!tab || REDUCED()) return;
    const r = tab.getBoundingClientRect();
    for (const delay of [0, 130]) {
      const ring = document.createElement('div');
      ring.style.cssText =
        `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:14px;height:14px;` +
        `margin:-7px 0 0 -7px;border-radius:50%;border:2px solid var(--tide-accent);pointer-events:none;` +
        `z-index:2147483000`;
      this.#root.append(ring);
      const anim = ring.animate(
        [
          { transform: 'scale(1)', opacity: 0.55 },
          { transform: 'scale(6.5)', opacity: 0 },
        ],
        { duration: 720, delay, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'both' },
      );
      anim.finished.then(() => ring.remove()).catch(() => ring.remove());
    }
  }

  // --- Position ----------------------------------------------------------------------------------

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

  /**
   * Drag by the header, the way a window is dragged by its title bar.
   *
   * DELEGATED FROM THE PANEL, not bound to the header element. The header is React's now and is
   * replaced whenever its content changes; a listener attached to the node that existed at open time
   * would stop firing the first time a store key moved. The panel element is the overlay's own and
   * outlives every render, so the handle is found per event instead.
   */
  #makeDraggable(panel: HTMLElement) {
    const handleFor = (e: Event): HTMLElement | null => {
      const target = e.target as HTMLElement | null;
      // Buttons in the header are controls, not a grab area.
      if (!target || target.closest('button')) return null;
      return target.closest('.motu-head');
    };
    panel.addEventListener('pointerdown', (e) => {
      const handle = handleFor(e);
      if (!handle) return;
      const r = panel.getBoundingClientRect();
      this.#dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
      panel.setPointerCapture(e.pointerId);
      lens.dragging = true;
      lens.changedNow();
      e.preventDefault();
    });
    panel.addEventListener('pointermove', (e) => {
      if (!this.#dragOffset) return;
      this.#placePanel(e.clientX - this.#dragOffset.x, e.clientY - this.#dragOffset.y);
    });
    const end = () => {
      if (!this.#dragOffset) return;
      this.#dragOffset = null;
      lens.dragging = false;
      lens.changedNow();
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
    // Double-click the title bar to send it back to its default corner.
    panel.addEventListener('dblclick', (e) => {
      if (!handleFor(e)) return;
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
      panel.style.removeProperty('right');
      try {
        localStorage.removeItem(POS_KEY);
      } catch {
        /* ignore */
      }
    });
  }

  // --- The picker --------------------------------------------------------------------------------

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
}

/**
 * An outline's colour. Straight from MOTU_VERDICT, because these are the SAME four meanings the
 * panel's pills and the review console's shot statuses carry — they were four literals here, four
 * more in the panel's stylesheet, and two more in the console, all equal by coincidence rather than
 * by construction.
 */
function boxColor(v: Verdict): string {
  return MOTU_VERDICT[v];
}
