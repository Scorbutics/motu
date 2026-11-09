/**
 * WHAT AN ISLAND RENDERED — its own subtree, plus what its own mount PORTALED out of it.
 *
 * Every check that compares or measures an island's render read the island root's innerHTML. A
 * dialog, sheet, popover or drawer built on a React portal (Radix Dialog, vaul Drawer — every shadcn
 * overlay) renders as a child of `document.body`, not of the island, so an island whose whole visible
 * output is such a dialog was reported as "rendered NOTHING" by `data-flow` — while the region flow
 * asserting that very dialog's text passed, because `expectRender` searches the whole document. Two
 * checks of one framework disagreeing about what is on the screen.
 *
 * The fix is NOT a document-wide snapshot. That would count the lagoon's own chrome (dock, toolbar,
 * call toasts, the debug overlay), anything that existed before the island mounted, and any other
 * mount's output as this island's — and a genuinely empty island would then pass on the strength of
 * the furniture around it. Output is counted only when it is ATTRIBUTABLE to this island:
 *
 *   - a direct child of `document.body` (where portals land by default),
 *   - that is not the island, nor an ancestor of it, nor lagoon chrome (`data-motu-chrome`),
 *   - whose React fiber — or, for a library that creates its own portal container, the first
 *     descendant's fiber — walks UP (`fiber.return`, which crosses a portal back to the component
 *     that opened it) to a fiber that lives INSIDE the island: its wrapper element, a host element
 *     in its subtree, or the root container of a React root mounted inside it.
 *
 * That ancestry is what makes it attributable rather than temporal: a node that existed before the
 * mount, a node the chrome drew in vanilla DOM, and a portal opened by a DIFFERENT island (or a
 * previous mount of this one, whose wrapper element is not this one) all fail the walk. React's
 * internal `__reactFiber$` key is the only coupling to React internals; it has been stable since 17.
 *
 * This function is INSTALLED, not imported: Playwright serialises it into the page with
 * `addInitScript`, and the happy-dom harness and the tests call it on their own window. So it must
 * not close over anything — every helper lives inside it.
 */
export function installIslandRender(win) {
  const w = win || window;
  const doc = w.document;

  // A composed walk: through shadow roots to their hosts, so an island rendered inside a
  // `<motu-archipelago>` shadow (or a React root inside a custom element's shadow) is still "inside".
  const within = (outer, node) => {
    for (let n = node; n; n = n.parentNode || n.host) if (n === outer) return true;
    return false;
  };

  const fiberKey = (node) => {
    for (const k of Object.keys(node)) if (k.startsWith('__reactFiber$')) return k;
    return null;
  };

  const fiberOf = (node) => {
    const k = fiberKey(node);
    if (k) return node[k];
    // A library that creates its own container (`document.createElement('div')` + `createPortal`
    // into it) leaves the container fiber-less; its first rendered descendant carries the fiber.
    const walker = doc.createTreeWalker(node, 1 /* SHOW_ELEMENT */);
    for (let i = 0, n = walker.nextNode(); n && i < 200; i++, n = walker.nextNode()) {
      const nk = fiberKey(n);
      if (nk) return n[nk];
    }
    return null;
  };

  const ownedBy = (node, island) => {
    for (let f = fiberOf(node), hops = 0; f && hops < 5000; f = f.return, hops++) {
      const s = f.stateNode;
      if (!s) continue;
      // A host element (div, span, the island's own `data-motu-island` wrapper) inside the island.
      if (s.nodeType === 1 && within(island, s)) return true;
      // A HostRoot (tag 3): a React root whose container is inside the island — the custom-element
      // path mounts one root per island, in the island's own shadow/light DOM.
      if (f.tag === 3 && s.containerInfo && within(island, s.containerInfo)) return true;
    }
    return false;
  };

  const SKIP = /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT|META)$/;

  /** The body-level nodes this island's own mount portaled out of itself, in document order. */
  const portals = (island) => {
    if (!island || !doc.body) return [];
    const out = [];
    for (const n of doc.body.children) {
      if (SKIP.test(n.tagName)) continue;
      if (n === island || within(n, island)) continue; // the island itself, or what contains it
      // Lagoon chrome marks itself. Its nodes are vanilla DOM and would fail the fiber walk anyway;
      // the mark makes the exclusion a declared rule rather than an accident of how chrome is drawn.
      if (n.hasAttribute('data-motu-chrome') || n.querySelector('[data-motu-chrome]')) continue;
      if (ownedBy(n, island)) out.push(n);
    }
    return out;
  };

  const own = (el) => (el ? (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML) : '');

  /**
   * `{ own, portals }` — the island's own HTML and the outerHTML of each node it portaled. The HTML
   * comparison string (`__motuRendered`) is the two joined, so a check that compares renders compares
   * what a person sees, and an island with no own DOM and no portal still reads as ''.
   */
  w.__motuRenderedParts = (el) => ({ own: own(el), portals: portals(el).map((n) => n.outerHTML) });
  w.__motuRendered = (el) => {
    const p = w.__motuRenderedParts(el);
    return p.own + p.portals.map((h) => '\n<!--motu:portal-->' + h).join('');
  };
  /** The portaled ELEMENTS — for checks that measure (axe context, layout boxes) rather than compare. */
  w.__motuPortals = portals;
}
