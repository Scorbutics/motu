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
export function motuBay({
  title,
  subtitle = '',
  meta = '',
  compact = false,
  lead = '',
  shape = '',
  leading = '',
  headline = '',
  blurb = '',
  titleRaw = false,
}) {
  // THE SAME THREE ENDS THE REACT BAY HAS, and the same class names, because a page rendered by node
  // and a screen rendered by React showing the same product must not be two headers. `masthead` adds
  // the deeper gradient, the looping sheen, the drifting waterline and room for a heading; the CSS
  // for all of it is in ./css.mjs, shared.
  const masthead = shape === 'masthead';
  // A COMPACT MASTHEAD HAS NO WATERLINE. 78px of waves under a 16px band is not a shorter version of
  // the same thing, it is a different one; the gradient and the light carry the identity at that size.
  const waves = masthead && !compact;
  return `<header class="motu-bay${compact ? ' compact' : ''}"${masthead ? ' data-shape="masthead"' : ''}>
  <div class="sheen"></div>
  ${lead}
  <div class="bay-inner">
    <div class="bay-title">
      ${leading}
      <strong class="bay-name">${titleRaw ? title : escapeHtml(title)}</strong>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}
    </div>
    ${meta ? `<div class="bay-meta motu-cap">${meta}</div>` : ''}
  </div>
  ${
    masthead && (headline || blurb)
      ? `<div class="motu-bay__headline">${headline ? `<h1>${escapeHtml(headline)}</h1>` : ''}${blurb ? `<p>${escapeHtml(blurb)}</p>` : ''}</div>`
      : ''
  }
  ${waves ? '<span class="motu-bay__waves" aria-hidden="true"></span>' : ''}
</header>`;
}

/** motu's mark. A background image in the stylesheet, so there is no asset to serve or to 404. */
export function motuMark() {
  return '<span class="motu-mark" role="img" aria-label="motu"></span>';
}

/** The page's column: bounded width, the masthead's own gutters. `stack` spaces its sections. */
export function motuColumn({ body, as = 'div', stack = false, lift = false }) {
  return `<${as} class="motu-page"${stack ? ' data-stack' : ''}${lift ? ' data-lift' : ''}>${body}</${as}>`;
}

/** A titled panel of rows. `rows` is already-escaped markup — build them with motuRow. */
export function motuPanel({ caption, rows, empty = '' }) {
  return `<section class="motu-panel">
  ${caption ? `<div class="motu-cap panel-cap">${escapeHtml(caption)}</div>` : ''}
  ${rows.length ? `<ul class="motu-list">${rows.join('')}</ul>` : `<p class="motu-empty">${escapeHtml(empty)}</p>`}
</section>`;
}

/** One row. `href` makes the whole row the target, which is what a list of links wants. */
export function motuRow({
  href,
  label,
  sub = '',
  trailing = '',
  scale = '',
  kind = '',
  kindTone = '',
  tone = '',
  fill = null,
  index = null,
  /**
   * `card` (the default, and what every caller before page scale got) or `flat`.
   *
   * A long tail read by scanning wants a list, not fifty objects — history is `flat`, and the card
   * appears under the cursor instead.
   */
  surface = 'card',
  /** Distance from the newest, which is what fades this row's gauge. */
  age = null,
  /** Page scale only: raw markup in the title line, after the kind. Compose it with `motuPill`. */
  badge = '',
}) {
  // THE KIT'S ATTRIBUTES, because the kit owns .motu-row now. A server row is a CARD -- it sits on
  // its own ground with a hairline -- and motu-grow is what the kit calls the cell that takes the
  // remaining width. Emitted here rather than given a second .motu-row rule in the stylesheet, which
  // is what these two had before and what let the kit silently restyle the host's own pages.
  //
  // PAGE SCALE EMITS EXACTLY WHAT THE REACT ROW EMITS -- motu-title-line, motu-name, motu-kind,
  // motu-sub, motu-trail, motu-enter -- so one set of rules dresses both. The chrome-scale form below
  // is unchanged, and every existing caller keeps it by saying nothing.
  const page = scale === 'page';
  const inner = page
    ? `${
        fill === null && age === null
          ? ''
          : `<span class="motu-gauge" style="${fill === null ? '' : `--fill:${Math.max(0, Math.min(100, fill)).toFixed(1)}%;`}${age === null ? '' : `--age:${Number(age)}`}"></span>`
      }` +
      `<span class="motu-grow">` +
      `<span class="motu-title-line">` +
      `${tone ? `<span class="motu-dot" data-tone="${escapeHtml(tone)}"></span>` : ''}` +
      `<span class="motu-name">${escapeHtml(label)}</span>` +
      `${kind ? `<span class="motu-kind"${kindTone ? ` data-tone="${escapeHtml(kindTone)}"` : ''}>${escapeHtml(kind)}</span>` : ''}` +
      // A STATE, beside the kind, exactly where the React row puts its <Pill> — raw, because it is
      // markup the caller composed with `motuPill`. `live` is the only one so far and it is the reason
      // this slot exists: a kind says what a row IS, and no amount of kinds says what it is DOING.
      `${badge}` +
      `</span>` +
      `${sub ? `<span class="motu-sub">${sub}</span>` : ''}` +
      `</span>` +
      `<span class="motu-trail">${trailing}<span class="motu-enter" aria-hidden="true">↵</span></span>`
    : `<span class="motu-grow motu-ellipsis"><b>${escapeHtml(label)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${trailing}`;
  const attrs = `class="motu-row"${page ? ' data-scale="page"' : ''}${surface === 'card' ? ' data-surface="card"' : ''}`;
  // `--i` is what staggers the swim-in. The React list sets it from the child's index; a server has
  // the index right here and nothing else to derive it from.
  const li = index === null ? '<li>' : `<li style="--i:${Number(index)}">`;
  return `${li}${href ? `<a ${attrs} href="${escapeHtml(href)}">${inner}</a>` : `<div ${attrs}>${inner}</div>`}</li>`;
}

/** A bare list, for a page that is one column of rows rather than a panel of them. */
export function motuRailedList(rows) {
  return `<div class="motu-railed"><ul class="motu-list">${rows.join('')}</ul></div>`;
}

/**
 * A state, as a chip.
 *
 * THE REACT PILL'S ATTRIBUTES — `data-tone`, `data-fill`, `data-mono` — because the kit's CSS is
 * written against those and a server-rendered pill that used its own would be a second pill in one
 * package, which is what `kit.mjs:306` already had to say out loud once. The legacy `data-state` form
 * is kept for a string second argument; nothing in the repo passed one, which is why widening this
 * was safe.
 */
export function motuPill(text, opts = 'on') {
  if (typeof opts === 'string') return `<span class="motu-pill" data-state="${escapeHtml(opts)}">${escapeHtml(text)}</span>`;
  const { tone = '', fill = false, mono = false, className = '', title = '' } = opts ?? {};
  return (
    `<span class="motu-pill${className ? ` ${escapeHtml(className)}` : ''}"` +
    `${tone ? ` data-tone="${escapeHtml(tone)}"` : ''}` +
    `${fill ? ' data-fill' : ''}` +
    `${mono ? ' data-mono' : ''}` +
    `${title ? ` title="${escapeHtml(title)}"` : ''}` +
    `>${escapeHtml(text)}</span>`
  );
}

/**
 * Labelled numbers, side by side — the string half of the kit's `Meter`.
 *
 * A METER, NOT A SENTENCE, and the argument is the React component's: `2 objects · 3.1 MB · cap
 * 1000/repo` is three facts run together in prose, which is the shape of a footnote. Same dl/dt/dd,
 * same class, so the same rules dress both.
 */
export function motuMeter(items) {
  const cells = items
    .filter(Boolean)
    .map(
      (it) =>
        `<div${it.tone ? ` data-tone="${escapeHtml(it.tone)}"` : ''}>` +
        `<dt>${escapeHtml(it.label)}</dt><dd>${escapeHtml(String(it.value))}</dd></div>`,
    )
    .join('');
  return `<dl class="motu-meter">${cells}</dl>`;
}

/**
 * The centred column, and NOTHING about the shape of what sits in it.
 *
 * Split out of `PAGE_CSS` because the rest of that block overrides the KIT's defaults to suit the
 * server's HTML — a server row stacks a label over a sub, the kit's rows do not — and handing those
 * overrides to the React kit makes it fight itself. It rendered with the panel captions clipped off
 * the left edge, which is what you get for reusing "the page's CSS" without reading which half of the
 * page it is about.
 *
 * A React consumer wants this and `motuChromeCss()`. `motuPage` wants both, which is why PAGE_CSS
 * still exists below and still contains this.
 */
export const PAGE_SHELL_CSS = `
main { max-width: 940px; margin: 0 auto; padding: 26px 20px 48px; display: flex; flex-direction: column; gap: 18px; }
`;

/** The shell PLUS the server-row overrides — what `motuPage` renders, and only it. */
export const PAGE_CSS = `${PAGE_SHELL_CSS}
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
/**
 * A whole document.
 *
 * `column` decides what wraps the body. The default is the shell's own centred block, which every
 * page here used before the kit had a column of its own; `page` is `.motu-page` on the <main>, the
 * left-aligned 960px gutter a masthead opens onto. Mixing them puts a column inside a column — the
 * rows end up two hundred pixels right of whatever sits above them, which is exactly what happened
 * on the front page before it was one or the other.
 */
export function motuPage({ title, bay, body, extraCss = '', column = 'shell' }) {
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
${column === 'page' ? motuColumn({ body, as: 'main', stack: true }) : `<main>${body}</main>`}
</body>
</html>
`;
}
