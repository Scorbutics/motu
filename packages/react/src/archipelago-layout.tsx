// Rendering an archipelago's declared `layout` in the REACT mount path.
//
// `layout` is an HTML template naming where each slot sits. It was built for the custom-element path,
// where the host is a legacy page that cannot hand React anything — and so, until now, a project on
// `mount: "react"` had the field declared and NOTHING read it. Its lagoon rendered every island in a
// flat column regardless of how the real page arranges them, which is a preview of a page the project
// does not ship.
//
// The meaning that makes it work in both paths, and matches Model B:
//
//   `layout` is the region's arrangement, used when no host page supplies one.
//
// An ocean never supplies one, so it always applies. A React page supplies its own children, so there
// it is the fallback — which is exactly the lagoon's situation, since the lagoon has no page.
import { createElement, type ReactNode } from 'react';

/** HTML attribute -> React prop for the small set a layout template legitimately carries. */
const ATTR: Record<string, string> = { class: 'className', for: 'htmlFor' };

function toProps(el: Element, key: number): Record<string, unknown> {
  const props: Record<string, unknown> = { key };
  for (const { name, value } of Array.from(el.attributes)) {
    if (name === 'style') continue; // a layout template declares structure; styling is the host's sheet
    props[ATTR[name] ?? name] = value;
  }
  return props;
}

function walk(node: Node, renderSlot: (slot: string) => ReactNode, key: number): ReactNode {
  if (node.nodeType === 3 /* text */) {
    const text = node.textContent ?? '';
    return text.trim() ? text : null;
  }
  if (node.nodeType !== 1 /* element */) return null;
  const el = node as Element;
  if (el.tagName.toLowerCase() === 'motu-island') {
    const slot = el.getAttribute('slot');
    return slot ? renderSlot(slot) : null;
  }
  const children = Array.from(el.childNodes).map((c, i) => walk(c, renderSlot, i));
  return createElement(el.tagName.toLowerCase(), toProps(el, key), ...children);
}

/**
 * Render `layout`, substituting each `<motu-island slot="…">` with `renderSlot(slot)`.
 *
 * Returns null when the layout cannot be rendered — no layout, or no DOM to parse with (a server
 * render). The caller falls back to placing slots in declared order, which is what it did before.
 */
export function renderArchipelagoLayout(
  layout: string | undefined,
  renderSlot: (slot: string) => ReactNode,
): ReactNode | null {
  if (!layout) return null;
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(`<body>${layout}</body>`, 'text/html');
  const nodes = Array.from(doc.body.childNodes).map((n, i) => walk(n, renderSlot, i));
  const rendered = nodes.filter((n) => n !== null);
  return rendered.length ? createElement('div', { style: { display: 'contents' } }, ...rendered) : null;
}
