// Where things are on the page.
//
// THIS IS THE PART THAT STAYS IMPERATIVE, and it is worth saying why. Everything here measures the
// HOST's live DOM — `getBoundingClientRect` per island per frame, hit-testing through shadow roots,
// absolutely positioned SVG over somebody else's layout. Wrapping it in React would mean refs and a
// `useLayoutEffect` around exactly this code, running at exactly this rate, with a component tree in
// between that renders nothing anyone can see. React earns its place where markup is a function of
// state; here the state IS the page's geometry, re-read sixty times a second, and the function is a
// measurement.
//
// So the lens is two programs sharing one store: a React panel (`panel.tsx`) and this.

/** A point on the page, in viewport coordinates. */
export interface Point {
  x: number;
  y: number;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The island's box on screen.
 *
 * A React-mounted island's wrapper is `display: contents` — deliberately, so placing an island changes
 * nothing about the page's layout — which means it has NO box: `getBoundingClientRect()` is 0x0. Every
 * geometry the lens draws was reading that rect, so under `mount: 'react'` the outlines hid themselves
 * and the coupling graph found no anchors and drew nothing at all. The island IS on screen; only its
 * wrapper is boxless, so fall back to the union of what it rendered.
 */
export function islandRect(el: HTMLElement): DOMRect | null {
  const own = el.getBoundingClientRect();
  if (own.width !== 0 || own.height !== 0) return own;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
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
export function islandAnchor(el: HTMLElement): Point | null {
  const r = islandRect(el);
  if (!r) return null;
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 28) };
}

export function wire(x1: number, y1: number, x2: number, y2: number, color: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  const midY = (y1 + y2) / 2;
  p.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-dasharray', '4 3');
  return p;
}

export function svgDot(x: number, y: number, color: string, r = 3): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(x));
  c.setAttribute('cy', String(y));
  c.setAttribute('r', String(r));
  c.setAttribute('fill', color);
  return c;
}

export function svgLabel(x: number, y: number, text: string, color: string): SVGTextElement {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('text-anchor', 'middle');
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

/** The lens' mark: a crosshair, which is what every inspector in every browser uses for "look here". */
export function crosshair(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '8');
  ring.setAttribute('cy', '8');
  ring.setAttribute('r', '3.4');
  svg.appendChild(ring);
  for (const [x1, y1, x2, y2] of [
    [8, 0.8, 8, 3],
    [8, 13, 8, 15.2],
    [0.8, 8, 3, 8],
    [13, 8, 15.2, 8],
  ]) {
    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', String(x1));
    tick.setAttribute('y1', String(y1));
    tick.setAttribute('x2', String(x2));
    tick.setAttribute('y2', String(y2));
    svg.appendChild(tick);
  }
  return svg;
}
