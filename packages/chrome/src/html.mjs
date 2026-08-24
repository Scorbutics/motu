// The markup side of motu's chrome: the few shapes a server-rendered page needs, built from the same
// tokens the lagoon's own chrome uses.
//
// Deliberately NOT a component framework. These are functions returning strings, because the consumer
// is a node http server with no bundler — and because the shapes worth sharing are few. Anything
// interactive belongs in `@motu/react`'s tide line, where it already is.
import { motuChromeCss } from './css.mjs';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * The water header: motu's one piece of identity. `title` is what this page IS; `meta` is the readout
 * beside it (counts, sizes, a manifest id) — the same relationship the bay has with its label.
 */
export function motuBay({ title, subtitle = '', meta = '', compact = false, lead = '' }) {
  return `<header class="motu-bay${compact ? ' compact' : ''}">
  <div class="sheen"></div>
  ${lead}
  <div class="bay-inner">
    <div class="bay-title">
      <strong>${escapeHtml(title)}</strong>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}
    </div>
    ${meta ? `<div class="bay-meta motu-cap">${meta}</div>` : ''}
  </div>
</header>`;
}

/** A titled panel of rows. `rows` is already-escaped markup — build them with motuRow. */
export function motuPanel({ caption, rows, empty = '' }) {
  return `<section class="motu-panel">
  ${caption ? `<div class="motu-cap panel-cap">${escapeHtml(caption)}</div>` : ''}
  ${rows.length ? `<ul class="motu-list">${rows.join('')}</ul>` : `<p class="motu-empty">${escapeHtml(empty)}</p>`}
</section>`;
}

/** One row. `href` makes the whole row the target, which is what a list of links wants. */
export function motuRow({ href, label, sub = '', trailing = '' }) {
  // THE KIT'S ATTRIBUTES, because the kit owns .motu-row now. A server row is a CARD -- it sits on
  // its own ground with a hairline -- and motu-grow is what the kit calls the cell that takes the
  // remaining width. Emitted here rather than given a second .motu-row rule in the stylesheet, which
  // is what these two had before and what let the kit silently restyle the host's own pages.
  const inner = `<span class="motu-grow motu-ellipsis"><b>${escapeHtml(label)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${trailing}`;
  const attrs = 'class="motu-row" data-surface="card"';
  return `<li>${href ? `<a ${attrs} href="${escapeHtml(href)}">${inner}</a>` : `<div ${attrs}>${inner}</div>`}</li>`;
}

export function motuPill(text, state = 'on') {
  return `<span class="motu-pill" data-state="${escapeHtml(state)}">${escapeHtml(text)}</span>`;
}

const PAGE_CSS = `
main { max-width: 940px; margin: 0 auto; padding: 26px 20px 48px; display: flex; flex-direction: column; gap: 18px; }
.motu-panel { padding: 14px 16px; }
.panel-cap { margin: 0 0 10px 2px; }
.motu-empty { color: var(--ink-muted); margin: 4px 2px; font-size: 12.5px; }
/* A server row stacks a label over a sub, so it aligns on the first baseline rather than centring.
   The kit's default is center, which is right for the single-line rows an application builds. */
.motu-row { align-items: baseline; }
.motu-row:hover { border-color: var(--tide-accent); }
.motu-row b { font-weight: 600; }
.motu-row small { display: block; margin-top: 2px; color: var(--ink-muted); font-size: 11.5px; font-weight: 500; }
`;

/** A whole document. The host wraps stored FRAGMENTS elsewhere; this is for pages motu itself draws. */
export function motuPage({ title, bay, body, extraCss = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>${motuChromeCss()}${PAGE_CSS}${extraCss}</style>
</head>
<body>
${bay}
<main>${body}</main>
</body>
</html>
`;
}
