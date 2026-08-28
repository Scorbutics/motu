// The UI KIT: the shapes motu's own tools are built out of, as one stylesheet.
//
// WHY THIS EXISTS. `./css.mjs` gave the host's server-rendered pages a vocabulary — a bay, a panel, a
// row, a pill. The two INTERACTIVE surfaces motu ships never used it, and each grew the whole thing
// again from scratch:
//
//   the seam lens        `packages/debug-overlay` — its own `--ink: #22302c`, its own glass gradient,
//                        its own `0 14px 40px rgba(11,111,104,.18)`. Character-for-character the
//                        tokens, spelled as literals, inside a shadow root.
//   the review console   installs `motuChromeCss()` into its <head> and then uses NONE of its
//                        classes: `.rv-head` re-draws the bay's exact gradient, `.rp-pill` re-draws
//                        the pill, `.sl-empty` re-draws the empty state.
//
// Three copies of one design language, and `css.mjs`' own header says why that is not survivable:
// "a literal here is the beginning of the second palette this package exists to prevent."
//
// TWO GROUNDS, ONE VOCABULARY. The console paints a document; the lens paints a CLOSED SHADOW ROOT
// over somebody else's page. That is the only real difference between them, and it is a difference
// about ONE SELECTOR — where the custom properties are declared. So `motuKitCss({ scope })` takes it
// as an argument rather than the two surfaces taking a copy each.
//
// PLAIN .mjs, like everything else here: `./css.mjs` composes it for the host, which runs under bare
// node with no bundler, and `./react/` composes the same rules for the two React surfaces.
import {
  MOTU_WATER,
  MOTU_CHROME,
  MOTU_SURFACE,
  MOTU_INK,
  MOTU_SHADOW,
  MOTU_TYPE,
  MOTU_RADIUS,
  MOTU_MOTION,
  MOTU_VERDICT,
} from './tokens.mjs';
import { motuMarkUrl } from './mark.mjs';

/**
 * The kit's own custom properties, on whatever selector the surface declares them.
 *
 * `:root` for a document, `:host` for a shadow root. Everything below reads these and nothing below
 * mentions the scope again — which is what lets one stylesheet serve a page and an overlay.
 *
 * The BRAND half is derived (`var(--motu-primary, …)`), so `applyMotuChrome` pointing motu at a
 * host's colour moves the whole kit. The VERDICT half is not, for the reason MOTU_VERDICT gives.
 */
export function motuKitVars(scope = ':root') {
  return `${scope} {
  --ok: ${MOTU_VERDICT.ok};
  --warn: ${MOTU_VERDICT.warn};
  --broken: ${MOTU_VERDICT.broken};
  --neutral: ${MOTU_VERDICT.neutral};
  --ink-soft: #5c6b63;
  --ink-faint: ${MOTU_INK.faint};
  --mono: ${MOTU_TYPE.mono};
  --sans: ${MOTU_TYPE.family};
  /* The frosted ground every panel in the kit sits on. Mixed from the primary so a re-branded motu
     re-frosts too, with the literal as the fallback for a surface that never sets one. */
  --glass: linear-gradient(180deg, color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 3%, #fff), color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 9%, #fff));
  --hair: color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 14%, transparent);
  --tint: color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 11%, transparent);
}`;
}

/**
 * The reset a SHADOW ROOT needs and a document does not.
 *
 * `all: initial` is what keeps the host page's stylesheet — and any island's — from reaching in. It
 * also throws away the font, so the family is re-stated immediately after. Emitted only for a shadow
 * scope: applying `all: initial` to a document's `:root` would strip the page it is trying to style.
 */
export function motuKitShadowReset(scope = ':host') {
  return `${scope} { all: initial; }
* { box-sizing: border-box; font-family: var(--sans); }`;
}

/**
 * The shapes. Class-based throughout, so the same rules apply under `:root` and under `:host`.
 *
 * Naming follows `./css.mjs`: `motu-` prefixed, one class per shape, state on a `data-` attribute
 * rather than a modifier class — `data-tone="warn"` reads as a value and a modifier class reads as a
 * second shape, and the kit has one shape per concept on purpose.
 */
/**
 * The clear glyph, as a mask.
 *
 * A MASK, NOT AN IMAGE, so it takes `currentColor` and follows the ink token instead of pinning a
 * colour here — which is the rule this package is for. Encoded like every other inlined SVG: a raw hash
 * would truncate the data URI, and this one carries no colour at all for the same reason.
 */
function cross() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<path d="M3 3 L13 13 M13 3 L3 13" stroke="black" stroke-width="2.2" stroke-linecap="round"/></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

export function motuKitCss(scope = ':root') {
  const shadow = scope.startsWith(':host');
  return [
    motuKitVars(scope),
    shadow ? motuKitShadowReset(scope) : '',
    `
/* --- PANEL: the frosted sheet everything else sits on -------------------------------------------
   The lens' floating window and the console's viewer card are the same object at two sizes. */
.motu-sheet-panel {
  background: var(--glass);
  border-radius: ${MOTU_RADIUS.panel};
  box-shadow: ${MOTU_SHADOW.panel};
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
  color: var(--ink);
  overflow: hidden;
}
/* A panel with a defined head and a scrolling body — a window, rather than a card. */
.motu-sheet-panel[data-shape="window"] { display: flex; flex-direction: column; }

/* --- HEAD: a panel's title bar ------------------------------------------------------------------ */
.motu-head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 13px;
  border-bottom: 1px solid var(--hair);
}
.motu-head > b {
  font: 700 11px/1 var(--sans);
  text-transform: uppercase; letter-spacing: .09em;
  color: var(--ink-faint);
}
.motu-head .motu-spacer { flex: 1; }
/* A head that is also a drag handle must not start a text selection instead. */
.motu-head[data-grab] { cursor: grab; user-select: none; -webkit-user-select: none; }
.motu-head[data-grab][data-grabbing] { cursor: grabbing; }

/* --- BODY: the scrolling half of a window ------------------------------------------------------- */
.motu-body { overflow-y: auto; padding: 10px 12px 14px; }
.motu-body::-webkit-scrollbar { width: 6px; }
.motu-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 22%, transparent);
  border-radius: ${MOTU_RADIUS.pill};
}

/* --- CAP / SUB: the two label sizes -------------------------------------------------------------
   'cap' heads a section, 'sub' heads a list inside one. Both are the tide line's warm caption; a
   cool grey here reads as a different family. */
.motu-cap {
  font-size: 10px; text-transform: uppercase; letter-spacing: .09em;
  color: var(--ink-caption); font-weight: 700;
}
.motu-sub {
  margin: 7px 0 3px;
  font: 700 9px/1 var(--sans); text-transform: uppercase; letter-spacing: .08em;
  color: var(--ink-faint);
}

/* --- ROW: one record in a list ------------------------------------------------------------------
   Flat, hairlined, lifting on hover. The lens' call rows, the console's project and shot rows. */
.motu-row {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border-radius: ${MOTU_RADIUS.row};
  background: transparent; border: 1px solid transparent;
  color: var(--ink); text-decoration: none; text-align: left;
  font: inherit; width: 100%;
}
.motu-row[data-surface="card"] { background: var(--surface-row); border-color: var(--line); }
.motu-row[data-interactive] { cursor: pointer; transition: background 160ms, border-color 160ms, transform 160ms; }
.motu-row[data-interactive]:hover { background: var(--tint); transform: translateX(2px); }
/* NO UNDERLINE. motuSurfaceCss gives every <a> one on hover, which is right for a link inside prose
   and wrong for a row that IS a card — it underlined the name, the sub and the trailing count all at
   once. Stated here because the row already sets text-decoration: none and lost to a:hover. */
.motu-row:hover, .motu-row:focus-visible { text-decoration: none; }
.motu-row[data-interactive]:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; }
.motu-row[aria-current="true"], .motu-row[data-selected] {
  background: var(--tint); border-color: var(--tide-accent);
  color: var(--motu-primary-deep, ${MOTU_CHROME.primaryDeep});
}
.motu-row .motu-grow { flex: 1; min-width: 0; }
/* Values being inspected stay MONOSPACE — a different job from the labels around them, and column
   alignment is what makes a wall of them scannable. */
.motu-row[data-mono], .motu-mono { font-family: var(--mono); font-size: 11px; }
.motu-row .motu-trail { margin-left: auto; color: var(--ink-faint); font-size: 10px; }
.motu-row .motu-ellipsis, .motu-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- LIST: rows that assemble rather than appear ------------------------------------------------ */
/* --- TILE STRIP: a short, bounded set read across rather than down ------------------------------
   The shape both reference designs use for a handful of things — the time tiles, the day strip. A
   stack of full-width rows says "this list continues"; a strip says "this is all of them", which is
   the truth for a set of two or three. Wraps rather than scrolls, because a hidden tile in a set this
   small is worse than a second line. */
.motu-tile-strip {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.motu-tile-strip > * { flex: 1 1 190px; width: auto; }

.motu-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.motu-list > * { animation: motu-swim ${MOTU_MOTION.swimIn} both; animation-delay: calc(var(--i, 0) * 45ms); }
@keyframes motu-swim { from { opacity: 0; transform: translateX(-8px); } }

/* --- PILL: a fact, or a state ------------------------------------------------------------------- */
.motu-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px; border: 1px solid transparent; border-radius: ${MOTU_RADIUS.pill};
  font: 600 10.5px/1 var(--sans); font-style: normal;
  background: color-mix(in srgb, var(--motu-primary, ${MOTU_CHROME.primary}) 8%, transparent);
  color: var(--w-deep);
  white-space: nowrap;
}
.motu-pill[data-mono] { font-family: var(--mono); }

/* --- THE DOCK'S OWN THREE ---------------------------------------------------------------------
   The tide line invented these and kept them private behind #tide .grp / .opt / .kbd, so nothing
   else could use them and the kit grew lookalikes instead. They are here now because they are
   components, not dock trim: a segmented control, a rail option and a key cap are what any motu
   surface reaches for next. The dock's own three duplicates — .cap, .lamp, .chip — are NOT moved,
   because .motu-cap, .motu-dot and .motu-pill already ARE them; that half of the job is deletion.

   Their colours were literals in that file (#5c6b63, #22302c, #a39a8a). They read the ink tokens
   here, which is the whole reason a component belongs in the kit rather than beside its one caller. */

/* SEGMENTED: the lit pill SLIDES between options instead of blinking on — the one bit of state on the
   dock that moves, and the reason it reads as water rather than as a toolbar. The thumb is positioned
   by the caller (left/width), because only the caller knows where the active option sits. */
.motu-segmented {
  position: relative;
  display: inline-flex; align-items: center; gap: 2px;
  padding: 3px; border-radius: ${MOTU_RADIUS.pill};
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
.motu-segmented__thumb {
  position: absolute; top: 3px; bottom: 3px;
  border-radius: ${MOTU_RADIUS.pill};
  background: var(--tide-accent);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--tide-accent) 45%, transparent);
  transition: left ${MOTU_MOTION.slide}, width ${MOTU_MOTION.slide}, background 200ms;
  pointer-events: none;
}
/* ONE STEP DARKER THAN A LABEL ON THE PAGE, because this one is not on the page: the track behind it
   is a tinted capsule, so the same ink measures lower here than it does anywhere else --ink-muted is
   used. Darkening the token was still right (it was under AA on white too) and it was not enough. */
.motu-segmented > button {
  position: relative; appearance: none; border: 0; background: transparent;
  color: var(--ink-soft); font: 600 12px/1 var(--sans);
  padding: 6px 12px; border-radius: ${MOTU_RADIUS.pill};
  cursor: pointer; white-space: nowrap;
  transition: color 160ms;
}
.motu-segmented > button:hover { color: var(--ink); }
/* ONE OPT COMPONENT, TWO CONTAINERS. .motu-opt is the palette's rail option — left-aligned, full
   width, nudging right on hover. Dropped into a segmented control it has to become a segment, and
   the alternative was a variant prop, which would make every caller state which container it is
   already inside. Adapting to the container is what CSS is for. */
.motu-segmented > .motu-opt {
  width: auto; text-align: center; gap: 0;
  color: var(--ink-soft);
  padding: 7px 14px; border-radius: ${MOTU_RADIUS.pill};
  background: transparent;
}
.motu-segmented > .motu-opt:hover { background: transparent; transform: none; }
.motu-segmented > .motu-opt[aria-current="true"] { background: transparent; color: ${MOTU_CHROME.onPrimary}; }
.motu-segmented > button[aria-current="true"] { color: ${MOTU_CHROME.onPrimary}; }

/* OPT: one option in a rail. It slides toward the pointer rather than merely tinting, which is what
   makes a list of them feel like something floating. */
.motu-opt {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 10px 7px 15px;
  border: 0; border-radius: 9px; background: transparent;
  color: var(--ink-muted); font: 600 12.5px/1.2 var(--sans);
  text-align: left; cursor: pointer;
  transition: background 160ms, color 160ms, transform 160ms;
}
.motu-opt:hover { background: color-mix(in srgb, var(--tide-accent) 7%, transparent); color: var(--ink); transform: translateX(2px); }
.motu-opt[aria-current="true"] {
  background: color-mix(in srgb, var(--tide-accent) 10%, transparent);
  color: var(--motu-primary-deep, ${MOTU_CHROME.primaryDeep});
  font-weight: 700;
}
.motu-opt[hidden] { display: none; }

/* KBD: a key cap. A shortcut is a thing you press, so it is drawn as one. */
.motu-kbd {
  appearance: none; display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
  background: color-mix(in srgb, #fff 70%, transparent);
  color: var(--ink-muted); font: 500 11px/1 var(--sans);
  padding: 6px 10px; border-radius: 8px; cursor: pointer;
  transition: color 160ms, border-color 160ms;
}
.motu-kbd:hover { color: var(--ink); border-color: color-mix(in srgb, var(--ink) 22%, transparent); }
/* THE TEXT IS A DEEPER SHADE OF ITS OWN VERDICT.
   A tinted pill puts the verdict colour on a 12% wash of itself, which is a low-contrast pairing by
   construction: --ok on its own tint measures about 4.3:1 at 10.5px, and axe is right to call that
   serious. Mixing the tone toward body ink keeps the hue -- an ok pill is still teal, a warn pill is
   still amber, which is the whole job -- and takes all four tones past 5:1. One formula rather than
   four hand-picked hexes, so a re-branded verdict cannot land back under the threshold. */
.motu-pill[data-tone] { color: color-mix(in srgb, var(--ink) var(--tone-mix, 32%), var(--tone, var(--ink))); }
.motu-pill[data-tone="ok"] { --tone: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); border-color: color-mix(in srgb, var(--ok) 24%, transparent); }
.motu-pill[data-tone="warn"] { --tone: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); border-color: color-mix(in srgb, var(--warn) 24%, transparent); }
.motu-pill[data-tone="broken"] { --tone: var(--broken); background: color-mix(in srgb, var(--broken) 12%, transparent); border-color: color-mix(in srgb, var(--broken) 24%, transparent); }
/* NEUTRAL NEEDS MORE INK. The other three start from a saturated verdict colour, which is already
   dark; --neutral is a mid grey, so the same 32% left it at 4.3:1 -- the one tone the formula did not
   carry on its own. The mix ratio is a variable for exactly this. */
.motu-pill[data-tone="neutral"] { --tone: var(--neutral); --tone-mix: 48%; background: color-mix(in srgb, var(--neutral) 16%, transparent); }
/* Filled: a pill that is a CONTROL's state, not a fact about a record. */
.motu-pill[data-fill] { background: ${MOTU_CHROME.primary}; color: ${MOTU_CHROME.onPrimary}; border-color: transparent; }
/* THE SERVER'S THREE STATES, on the same shape. ./html.mjs renders data-state from bare node and
   cannot import a React component, so a rule is the only thing the two can share. They were two
   separate .motu-pill definitions in one package until they were not. */
.motu-pill[data-state] { background: ${MOTU_CHROME.primary}; color: ${MOTU_CHROME.onPrimary}; border-color: transparent; padding: 5px 11px; gap: 7px; }
.motu-pill[data-state="idle"] { background: rgba(255,255,255,.22); }
.motu-pill[data-state="caution"] { background: ${MOTU_CHROME.caution}; }
.motu-pill[data-fill][data-tone="warn"] { background: var(--warn); color: #fff; }
.motu-pill[data-fill][data-tone="broken"] { background: var(--broken); color: #fff; }
/* Uppercase micro-pill: the lens' prop badges and its coupling flags. */
.motu-pill[data-size="micro"] {
  padding: 2px 7px; font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em;
}

/* --- CHIPS: a wrapped run of pills --------------------------------------------------------------- */
.motu-chips { display: flex; flex-wrap: wrap; gap: 5px; }

/* --- DOT: a status, at the head of a row --------------------------------------------------------- */
.motu-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--neutral); }
.motu-dot[data-tone="ok"] { background: var(--ok); box-shadow: 0 0 8px color-mix(in srgb, var(--ok) 70%, transparent); }
.motu-dot[data-tone="warn"] { background: var(--warn); }
.motu-dot[data-tone="broken"] { background: var(--broken); }
.motu-dot[data-tone="neutral"] { background: #cdd6d2; }
.motu-dot[data-tone="pending"] { background: var(--w-mid); }
.motu-dot[data-tone="external"] { background: #7c5cbf; }

/* --- BUTTON: three weights, one shape ------------------------------------------------------------
   ghost   the lens' header controls — no ground until you touch them
   quiet   an outlined control on a light surface: the console's accept buttons, the fit toggle
   strong  the one action a screen is about */
.motu-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; border-radius: ${MOTU_RADIUS.row};
  padding: 6px 10px; font: 600 12px/1 var(--sans); cursor: pointer;
  color: var(--ink-soft); background: transparent;
  transition: background 160ms, color 160ms, border-color 160ms;
}
.motu-btn:hover { color: var(--ink); background: var(--tint); }
.motu-btn:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; }
.motu-btn:disabled { opacity: .45; cursor: not-allowed; }
.motu-btn:disabled:hover { background: transparent; color: var(--ink-soft); }
.motu-btn[data-weight="quiet"] { border-color: var(--line); background: rgba(255, 255, 255, .72); color: var(--ink); }
.motu-btn[data-weight="quiet"]:hover { border-color: var(--tide-accent); background: #fff; }
/* THE ACCENT, not the mid-water. White on --w-mid is 3.06:1, below AA for a 12px label, and axe says
   so now that it can see the button at all. The accent is the brand primary (5.3:1 on white), which
   is also what every other "on" state in this kit already uses: a primary action and an armed toggle
   were two different greens that nobody chose. */
.motu-btn[data-weight="strong"] { background: var(--tide-accent); border-color: var(--tide-accent); color: ${MOTU_CHROME.onPrimary}; }
.motu-btn[data-weight="strong"]:hover { background: var(--w-deep); border-color: var(--w-deep); color: ${MOTU_CHROME.onPrimary}; }
/* ON is a STATE, not a hover — an armed mode has to be readable from across the screen. */
.motu-btn[aria-pressed="true"], .motu-btn[aria-current="true"], .motu-btn[data-on] {
  background: var(--tide-accent); border-color: transparent; color: var(--motu-on-primary, #fff);
}
.motu-btn[aria-pressed="true"]:hover, .motu-btn[aria-current="true"]:hover, .motu-btn[data-on]:hover {
  background: var(--tide-accent); color: var(--motu-on-primary, #fff);
}
.motu-btn[data-on][data-tone="warn"] { background: var(--warn); }
.motu-btn[data-on][data-tone="broken"], .motu-btn[data-tone="broken"][data-on] { background: var(--broken); color: #fff; }
/* The pill-shaped variant: a segmented control, a "back" affordance, a mode toggle. */
.motu-btn[data-shape="pill"] { border-radius: ${MOTU_RADIUS.pill}; padding: 5px 10px; font-size: 11px; }
.motu-btn[data-size="icon"] { padding: 4px 8px; font-size: 12px; }

/* --- EMPTY: the sentence a list shows instead of nothing -----------------------------------------
   Italic and faint on purpose: it is the tool talking, not a record. A blank box reads as broken. */
/* MUTED IS NOT ENOUGH, and faint is far from it. An empty state is a SENTENCE a person has to read
   ("this project has no shots yet"), where a caption is a label they scan past. On the page ground
   --ink-faint measures 2.2:1 and --ink-muted 4.0:1 -- both under AA, the second deceptively close.
   --ink-soft is 5.2:1 and still reads as the tool talking rather than as a record. Found the day the
   audit started seeing this project's styles at all. */
.motu-empty { color: var(--ink-soft); font-style: italic; padding: 5px 0; font-family: var(--sans); }
.motu-empty[data-pad="block"] { padding: 28px 16px; text-align: center; font-style: normal; }

/* --- NOTICE: a finding, inline ------------------------------------------------------------------- */
.motu-notice {
  margin: 3px 0 6px; padding: 5px 9px; border-radius: ${MOTU_RADIUS.row};
  font: 600 10px/1.35 var(--sans);
  color: var(--broken); background: color-mix(in srgb, var(--broken) 10%, transparent);
}
.motu-notice[data-tone="warn"] { color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); }
.motu-notice[data-tone="ok"], .motu-notice[data-tone="info"] {
  color: var(--motu-primary-deep, ${MOTU_CHROME.primaryDeep});
  background: var(--tint);
}
.motu-notice[data-mono] { font-family: var(--mono); }

/* --- GROUP: a section barred in its seam colour ---------------------------------------------------
   The bar is the same hue the coupling graph draws that seam's hubs in, so a blue group in the panel
   and a blue hub on the page are one fact seen twice. */
/* The seam colour arrives as --seam, set by the component. It was 'currentColor' with the colour on
   the group, which meant every child inherited it and the content had to be reset — and that reset
   (.motu-group > *:not(.motu-group__h)) outranked .motu-empty, so an empty state inside a group came
   out body ink instead of faint italic. Colouring only what is coloured has no such trap. */
.motu-group { margin-top: 10px; padding: 2px 0 4px 11px; border-left: 2px solid var(--seam, var(--tide-accent)); }
.motu-group > .motu-group__h {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  font: 700 10px/1 var(--sans); text-transform: uppercase; letter-spacing: .09em;
  color: var(--seam, var(--tide-accent));
}
.motu-group > .motu-group__h::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor;
}

/* --- TABLE: fixed columns, one line per row -------------------------------------------------------
   For a sheet meant to be SCANNED. A wrapping cell turns twenty-four keys into a page nobody reads
   to the end, so every cell truncates and the full text goes on the row's title. */
.motu-table { display: grid; gap: 6px; align-items: baseline; padding: 2px 0; font-size: 10.5px; line-height: 1.5; }
.motu-table > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- GAUGE: depth, as a readout ------------------------------------------------------------------
   Faint for a record sitting still, full and lit for the one in hand. The water is a READOUT here,
   the same rule the lagoon's own chrome follows — never decoration. */
.motu-gauge {
  flex: none; width: 4px; border-radius: ${MOTU_RADIUS.pill}; margin: 2px 0; align-self: stretch;
  background: linear-gradient(180deg, var(--w-shallow), var(--w-deep));
  opacity: .3; transition: opacity 160ms ease, width 160ms cubic-bezier(.2,.9,.3,1);
}
.motu-row[data-interactive]:hover .motu-gauge { opacity: .65; }
/* A GAUGE THAT CARRIES A QUANTITY, not only a state.
   It was depth: three opacities for idle / hover / current. Every reference design shows a ratio as a
   FILLED TRACK, and motu had numbers with no way to draw them — a repo at 24 of 1000 records and one
   at 998 rendered identically. Give it --fill and the track lights from the bottom to that share;
   leave it out and nothing changes, so every existing caller is untouched. */
.motu-gauge[style*="--fill"] {
  opacity: 1;
  background:
    linear-gradient(180deg, transparent 0%, transparent calc(100% - var(--fill, 0%)),
      var(--w-mid) calc(100% - var(--fill, 0%)), var(--w-deep) 100%),
    color-mix(in srgb, var(--ink) 8%, transparent);
}
.motu-row[aria-current="true"] .motu-gauge, .motu-row[data-selected] .motu-gauge { opacity: 1; width: 6px; }

/* --- FIELD: a labelled value ---------------------------------------------------------------------- */
.motu-field { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; font: 11px/1.4 var(--mono); }
.motu-field > .motu-field__l { color: var(--ink-soft); min-width: 92px; flex: none; }
.motu-field > .motu-field__v { color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.motu-field > .motu-field__t { margin-left: auto; color: var(--w-mid); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- BAY, the parts a React caller adds ---------------------------------------------------------
   The server-rendered bay in ./html.mjs makes its title a <strong>, and ./css.mjs styles it as one.
   An application whose bay IS the page's heading needs a real <h1> there, so the readout treatment is
   restated for the heading forms — and their default margins removed, which is the whole reason a
   swapped element does not just work. */
.motu-bay .bay-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.motu-bay .bay-title .bay-name { margin: 0; }
.motu-bay .bay-title h1.bay-name, .motu-bay .bay-title h2.bay-name {
  font: 650 16px/1.2 ${MOTU_TYPE.mono};
  letter-spacing: .02em;
}
.motu-bay.compact .bay-title h1.bay-name, .motu-bay.compact .bay-title h2.bay-name { font-size: 13.5px; }

/* --- METER: a run of counts, read at a glance ------------------------------------------------------
   The number that decides whether to open a screen at all should not require reading a list. */
.motu-meter { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0; }
/* A PAIR NEVER SPLITS. The label and its value are one fact; letting the line break between them —
   or inside 1,000/repo — turned the cap into two lines reading "1,000/" and "repo", which is not a
   number anybody can scan. The meter wraps BETWEEN pairs instead, which is what wrapping is for. */
.motu-meter > div { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; }
.motu-meter dt { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; opacity: .8; }
.motu-meter dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }

/* --- THE PALETTE: everything, one keystroke away -------------------------------------------------
   The one surface in the kit that covers the page. The scrim blurs rather than only darkening,
   because what is behind a palette is context and not content — legible enough to know where you
   are, unreadable enough that you stop reading it. */
.motu-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  padding-top: 14vh;
  background: rgba(20, 32, 28, .30);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.motu-palette {
  width: min(540px, calc(100vw - 32px));
  align-self: flex-start;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: ${MOTU_SURFACE.card};
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(4, 33, 29, .32);
  overflow: hidden;
  animation: motu-pop ${MOTU_MOTION.pop} both;
}
@keyframes motu-pop { from { opacity: 0; transform: translateY(-8px) scale(.98); } }
.motu-palette__field {
  border: 0;
  border-bottom: 1px solid var(--line);
  outline: none;
  padding: 16px 18px;
  font: 500 15px/1.2 var(--sans);
  color: var(--ink);
  background: none;
}
.motu-palette__field::placeholder { color: var(--ink-faint); }
.motu-palette__list { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
.motu-palette__list > li { animation: motu-swim ${MOTU_MOTION.swimIn} both; animation-delay: calc(var(--i, 0) * 22ms); }
.motu-palette__empty { margin: 0; padding: 18px; color: var(--ink-soft); font-size: 13px; }
/* WHAT IS NOT SHOWN. A capped list that says nothing about the cap reads as the whole list, which is
   how the palette came to show less than the page behind it with no sign of it. */
.motu-palette__more {
  margin: 0;
  padding: 8px 18px 12px;
  font: 500 11px/1 var(--mono);
  letter-spacing: .04em;
  color: var(--ink-soft);
}
.motu-palette__foot {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--w-shallow) 5%, ${MOTU_SURFACE.card});
  font: 500 10.5px/1 var(--mono);
  letter-spacing: .04em;
  color: var(--ink-soft);
}
/* THE SELECTION IS THE FOCUS. Every entry is an anchor and ↑↓ moves focus between them, so the lit
   row is :focus — there is no selected index to keep in step with what the keyboard did. */
/* CONTENT CONTRAST, not chrome contrast. .motu-opt is --ink-muted because it was born on the dock,
   where an option is a control beside the thing it acts on; here the options ARE the content, on a
   white card, and axe measures that pairing at 4.4:1 — a serious failure at 12.5px. Worth recording
   as a token-level fact rather than only a local fix: --ink-muted does not clear AA on white for
   small text, and anything that puts it there has to say otherwise, as this does. */
.motu-palette .motu-opt { color: var(--ink); text-decoration: none; }
.motu-palette .motu-kbd { color: var(--ink); }
.motu-palette .motu-opt:focus, .motu-palette .motu-opt:hover {
  outline: none;
  background: color-mix(in srgb, var(--tide-accent) 9%, transparent);
  color: ${MOTU_CHROME.primaryDeep};
  text-decoration: none;
}
/* LIVE, in a palette row. Smaller than a pill and louder than the kind beside it, because it is the
   one thing in this list that is true only right now. */
.motu-opt__live {
  font: 700 9px/1 var(--mono);
  letter-spacing: .14em;
  text-transform: uppercase;
  padding: 4px 7px;
  border-radius: ${MOTU_RADIUS.pill};
  /* THE ACCENT, not the shallows. --w-shallow with deep ink measures 3.9:1, and 9px tracked uppercase
     is the smallest text in the kit — axe called it, correctly. This is also the pairing the composed
     rail's live badge already uses, so the two places that say "live" now say it the same way. */
  background: var(--tide-accent);
  color: ${MOTU_CHROME.onPrimary};
  white-space: nowrap;
}

/* What KIND of thing an entry is, hard right and quiet: it disambiguates two rows with the same
   name, and is never the thing you are reading. */
.motu-opt__kind {
  margin-left: auto;
  font: 600 10px/1 var(--mono);
  letter-spacing: .08em;
  text-transform: uppercase;
  /* --ink-soft, for the same reason the entry beside it is --ink: on the palette's white card
     --ink-faint measures under 3:1, and 10px tracked uppercase is the least legible text motu sets. */
  color: var(--ink-soft);
}

/* --- THE PAGE SCALE ------------------------------------------------------------------------------
   Everything above is CHROME scale: a lens row, a console row, a dock option — dense, because those
   surfaces are read beside the thing they describe. A page a person LANDS on is read on its own, and
   the same 7px row on an empty 1200px viewport reads as a settings list rather than as the product.

   So the shapes get a second scale rather than a second component. data-scale="page" is the masthead's
   argument again at row level: one .motu-row, two ends. A .motu-page-row would drift from the lens'
   row within a month, and the lens' row is where the hover, the focus ring and the tone states live.
*/
.motu-page {
  max-width: 960px;
  width: 100%;
  box-sizing: border-box;
  padding-left: 40px;
  padding-right: 40px;
}
@media (max-width: 720px) { .motu-page { padding-left: 20px; padding-right: 20px; } }
/* Under the waterline: the waves are drawn INSIDE the masthead's bottom padding, so what sits below
   needs almost no gap of its own — the band already left one. */
.motu-page[data-lift] { padding-top: 6px; }
.motu-page[data-stack] {
  display: flex; flex-direction: column; gap: 18px;
  padding-top: 22px; padding-bottom: 30px;
}
/* A <main> that IS the page column. PAGE_SHELL_CSS styles a bare main as a CENTRED 940px column —
   the shell's own column, from before this kit had one — so a .motu-page nested inside it was
   gutter-padded twice and centred once, and the rows sat two hundred pixels right of the filter bar
   directly above them. Same column or no column; two is how they stop lining up. */
main.motu-page { max-width: 960px; margin: 0; padding: 22px 40px 30px; }
@media (max-width: 720px) { main.motu-page { padding-left: 20px; padding-right: 20px; } }

/* THE SEARCH BAR: a card that OVERLAPS the masthead's waterline, which is what ties the two bands
   together. The gradient tab on its left is the water ramp again, vertical and 4px wide — the same
   readout the gauge makes, at the size of a bookmark. */
.motu-search {
  display: flex; align-items: center; gap: 14px;
  background: ${MOTU_SURFACE.card};
  border-radius: ${MOTU_RADIUS.panel};
  padding: 15px 20px;
  box-shadow: 0 6px 22px rgba(11, 111, 104, .10);
}
.motu-search::before {
  content: "";
  width: 4px; height: 24px; flex: none;
  border-radius: ${MOTU_RADIUS.pill};
  background: linear-gradient(180deg, ${MOTU_WATER.mock.foam}, ${MOTU_WATER.mock.deep});
}
.motu-search > input {
  flex: 1; min-width: 0;
  border: 0; outline: none; background: none; padding: 0;
  color: var(--ink);
  font: 400 19px/1.2 var(--sans);
}
.motu-search > input::placeholder { color: var(--ink-faint); }
/* THE CLEAR AFFORDANCE, IN OUR INK. type="search" is the right element — it gets the clear button and
   the right keyboard on a phone — and Chrome paints that button in its own blue, which was the one
   thing on the page that belonged to the browser rather than to motu. Restyled rather than removed:
   a field a person has typed into wants a way out of it. */
.motu-search > input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  width: 14px; height: 14px;
  cursor: pointer;
  opacity: .35;
  background: currentColor;
  -webkit-mask: ${cross()} center / contain no-repeat;
  mask: ${cross()} center / contain no-repeat;
}
.motu-search > input::-webkit-search-cancel-button:hover { opacity: .7; }
/* The hint is the only place a keyboard affordance is stated, so it is mono and it is quiet: a person
   who does not need it should not have to read it twice. */
/* --ink-soft, NOT --ink-faint, and this is a deliberate departure from the mockup. The design gives
   this line #8d9995, which measures about 3:1 on white — axe reports it as a serious contrast failure
   and it is right: 10.5px tracked mono is the smallest text on the page. --ink-soft is the same cool
   family, two steps darker, and clears AA. A hint nobody can read is not a quieter hint. */
.motu-search .motu-hint {
  font: 500 10.5px/1 var(--mono);
  letter-spacing: .06em;
  color: var(--ink-soft);
  white-space: nowrap;
}
@media (max-width: 560px) { .motu-search .motu-hint { display: none; } }

/* THE SHELF: a labelled row of controls under the filter bar. The label is the quietest thing on the
   page — a person who already knows what a segmented control does should never read it twice. */
.motu-shelf { display: flex; align-items: center; gap: 12px; padding: 16px 4px 0; }
.motu-shelf__label {
  font: 600 10px/1 var(--mono);
  letter-spacing: .09em;
  text-transform: uppercase;
  /* --ink-soft. The third place in this design where --ink-faint landed on a light ground and axe
     called it: the search hint, the palette's kind column, and this. The pattern is the token, not
     the rules — --ink-faint is for a tinted panel, and every one of these sits on white or near it. */
  color: var(--ink-soft);
  min-width: 44px;
}

/* THE RAIL: one lit bar that MOVES to the row under the cursor, rather than a border appearing on
   each row in turn. Same reasoning as the segmented thumb — a lit thing that travels reads as one
   pointer, and a border that blinks on reads as five independent hovers. The caller sets top/height,
   because only the caller knows which row is current. */
.motu-railed { position: relative; padding-left: 15px; }
.motu-rail {
  position: absolute;
  left: 0; width: 3px;
  top: var(--rail-top, 0); height: var(--rail-height, 0);
  border-radius: ${MOTU_RADIUS.pill};
  background: var(--w-deep);
  box-shadow: 0 0 10px color-mix(in srgb, var(--w-deep) 60%, transparent);
  transition: top ${MOTU_MOTION.rail}, height ${MOTU_MOTION.rail}, opacity 160ms;
  pointer-events: none;
}
.motu-rail[data-idle] { opacity: 0; }

/* THE ROW, AT PAGE SCALE. Two lines rather than one: what it is, and what it is made of. */
.motu-row[data-scale="page"] {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: stretch;
  gap: 20px;
  padding: 17px 20px;
  border-radius: 13px;
  border-color: transparent;
}
.motu-row[data-scale="page"][data-surface="card"] { background: ${MOTU_SURFACE.card}; }
.motu-row[data-scale="page"][data-interactive]:hover {
  transform: translateX(3px);
  box-shadow: 0 8px 24px rgba(11, 111, 104, .12);
}
.motu-row[data-scale="page"] .motu-grow { display: flex; flex-direction: column; gap: 8px; padding: 2px 0; }
.motu-row[data-scale="page"] .motu-title-line { display: flex; align-items: center; gap: 11px; flex-wrap: wrap; }
.motu-row[data-scale="page"] .motu-name {
  /* SHRINKS AND WRAPS ITS OWN TEXT rather than moving to the next line whole. The title line wraps,
     which is right for the kind tag and the live pill after it — but a long name that cannot fit
     beside a 7px lamp was pushing itself down and leaving the lamp alone on a line above it.
     0 1 and not 1 1: it may shrink and must not GROW, or it takes the whole line and shoves the
     tags that belong beside it out to the far edge of the row. */
  flex: 0 1 auto;
  min-width: 0;
  font: 500 21px/1.15 var(--sans);
  letter-spacing: -.022em;
}
/* The chrome-scale sub is an uppercase LABEL over a value. At page scale it is a sentence about the
   row above it — the lagoons a repo holds, the repos a group spans — and uppercasing a list of
   repository names made them unreadable and, worse, wrong: Scorbutics/motu-demo-app is a name. */
.motu-row[data-scale="page"] .motu-sub {
  margin: 0;
  font: 400 12.5px/1.4 var(--mono);
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-soft);
  display: block;
}
/* THE GAUGE, LAID DOWN. At chrome scale it is a vertical bar in the row's flex line; a page row is a
   two-column GRID, and a third child would have broken the grid rather than sat beside it. So it
   becomes the card's bottom edge — the same fill, the same ratio, read as a waterline under the row
   instead of a bar beside it. The row is already position: relative and clipped. */
.motu-row[data-scale="page"] .motu-gauge {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  width: auto; height: 2px; margin: 0;
  border-radius: 0;
  background: linear-gradient(90deg, var(--w-shallow), var(--w-deep));
}
.motu-row[data-scale="page"] .motu-gauge[style*="--fill"] {
  background:
    linear-gradient(90deg, var(--w-deep) 0%, var(--w-mid) var(--fill, 0%),
      transparent var(--fill, 0%), transparent 100%),
    color-mix(in srgb, var(--ink) 7%, transparent);
}
.motu-row[data-scale="page"] .motu-trail {
  align-self: center;
  display: flex; align-items: center; gap: 14px;
  font: 500 13px/1 var(--mono);
  color: var(--ink);
}

/* --- THE ACCOUNT: who is reading this, and the way out ------------------------------------------
   On the water, at the hard right of a bar, beside the readout. The handle is the label and the disc
   is the CONTROL — the only round thing there, which is what makes it read as a person rather than as
   one more number. */
.motu-account {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: inherit;
  text-decoration: none;
}
.motu-account__name {
  font: 500 12px/1 var(--mono);
  letter-spacing: .02em;
  max-width: 16ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.motu-account:hover { text-decoration: none; }
.motu-account__out {
  appearance: none; border: 0; padding: 0; background: none; cursor: pointer;
  position: relative; display: inline-flex; color: inherit;
  border-radius: ${MOTU_RADIUS.pill};
  transition: transform 160ms, box-shadow 160ms;
}
.motu-account__out:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(4, 33, 29, .35); }
.motu-account__out:focus-visible { outline: 2px solid rgba(255, 255, 255, .8); outline-offset: 2px; }
/* THE WORD, ON HOVER. A disc with a letter in it is not an obvious way to leave — the affordance has
   to say so somewhere a person can find it before they click, and the accessible name (title) is
   only half of that because it does not exist for a pointer that never hovers long enough. */
.motu-account__hint {
  position: absolute; top: calc(100% + 8px); right: 0;
  padding: 5px 9px; border-radius: ${MOTU_RADIUS.pill};
  background: rgba(4, 33, 29, .88); color: ${MOTU_CHROME.onPrimary};
  font: 600 10px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transform: translateY(-3px);
  transition: opacity 160ms, transform 160ms;
}
.motu-account__out:hover .motu-account__hint,
.motu-account__out:focus-visible .motu-account__hint { opacity: 1; transform: translateY(0); }

/* THE MARK, AS THE WAY HOME. On the front page the mark IS the product; anywhere deeper it is also
   the way back to it, which is the habit every application on the web already teaches. One class, so
   that is true on the pages node renders and the ones React does — and a real hit target around a
   30px image, because a logo you have to aim at is not an affordance. */
.motu-home {
  display: inline-flex;
  align-items: center;
  padding: 4px;
  margin: -4px;
  border-radius: 10px;
  transition: background 160ms, transform 160ms;
}
.motu-home:hover, .motu-home:focus-visible {
  background: rgba(255, 255, 255, .16);
  transform: translateY(-1px);
  text-decoration: none;
}
.motu-home:focus-visible { outline: 2px solid rgba(255, 255, 255, .7); outline-offset: 1px; }

/* A WAY BACK, where a masthead's mark would be. Reads as the wordmark's sibling — same row, same
   weight class — because on a page you arrived at, leaving is the primary navigation. */
.motu-back {
  font: 500 12.5px/1 var(--mono);
  letter-spacing: .02em;
  color: rgba(242, 251, 250, .82);
  text-decoration: none;
  white-space: nowrap;
}
.motu-back:hover { color: ${MOTU_CHROME.onPrimary}; text-decoration: none; }

/* The right-hand half of a caption row: what the section holds, beside what it is called. */
.motu-cap-trail { margin-left: auto; font-weight: 500; letter-spacing: .04em; opacity: .8; }
.motu-cap:has(.motu-cap-trail) { display: flex; align-items: baseline; gap: 10px; }

/* THE ACTION at the end of a page-scale row: the one thing on the row that is a verb.
   Filled, unlike .motu-btn's default ghost, because a row is already clickable — this is the
   affordance that says which PART of it is the point. */
.motu-open {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 13px 20px; border-radius: 10px;
  background: var(--w-deep); color: ${MOTU_CHROME.onPrimary};
  font: 600 13px/1 var(--sans);
  white-space: nowrap;
  transition: background 160ms, transform 160ms;
}
a.motu-open:hover, .motu-row[data-interactive]:hover .motu-open {
  background: var(--w-shallow);
  color: ${MOTU_CHROME.primaryDeep};
  text-decoration: none;
}

/* AN UNCARDED PAGE ROW. History is a long tail read by scanning, and a card per entry turns fifty
   rows into fifty objects; without one they are a list, and the card appears under the cursor. */
.motu-row[data-scale="page"]:not([data-surface="card"]) { padding: 11px 20px; }
.motu-row[data-scale="page"]:not([data-surface="card"]) .motu-name { font-size: 15px; }
.motu-row[data-scale="page"][data-interactive]:not([data-surface="card"]):hover {
  background: ${MOTU_SURFACE.card};
  box-shadow: 0 6px 18px rgba(11, 111, 104, .10);
}
/* ON A FLAT ROW THE GAUGE STANDS UP AGAIN. Along the bottom of a card it is that card's waterline;
   along the bottom of an uncarded row it is a rule BETWEEN two rows, which is a divider and reads as
   one — eight of them turned the history into a table. Back to the vertical pill it is at chrome
   scale, on the left edge where it marks the row rather than separating it. */
.motu-row[data-scale="page"]:not([data-surface="card"]) .motu-gauge {
  left: 0; right: auto; top: 6px; bottom: 6px;
  width: 3px; height: auto;
  border-radius: ${MOTU_RADIUS.pill};
  background: linear-gradient(180deg, var(--w-shallow), var(--w-deep));
}
/* THE TAIL FADES. --age is the row's distance from the newest, so the gauge beside an old record is
   quieter than the one beside the current: the list carries its own recency without a date being read. */
.motu-row[data-scale="page"] .motu-gauge[style*="--age"] { opacity: calc(1 - min(var(--age) * .08, .72)); }

/* THE ENTER MARK: the sand. One warm note in a cold ramp, which is what makes it read as an
   affordance rather than as more water. Hidden until the row is current — an arrow on every row is
   decoration, an arrow on ONE row is an instruction. */
.motu-enter {
  font: 600 11px/1 var(--mono);
  color: ${MOTU_CHROME.sand};
  opacity: 0;
  transition: opacity 160ms;
}
.motu-row[data-interactive]:hover .motu-enter,
.motu-row:focus-visible .motu-enter,
.motu-row[aria-current="true"] .motu-enter { opacity: 1; }

/* THE ROW STOPS BEING TWO COLUMNS. At page scale a row is content on the left and a figure hard
   right, which needs width for both; on a phone the figure's column was taking enough that a group's
   member list wrapped to four lines beside three words. Below this the figure goes UNDER the content,
   left-aligned with it, and the row is one column that reads top to bottom. */
@media (max-width: 560px) {
  .motu-row[data-scale="page"] {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .motu-row[data-scale="page"] .motu-trail {
    align-self: start;
    justify-content: flex-start;
    margin-left: 0;
  }
}

/* A KIND, as a tag: uppercase mono, tracked wide. Distinct from .motu-pill, which carries a STATE. */
.motu-kind {
  font: 600 9.5px/1 var(--mono);
  letter-spacing: .14em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: ${MOTU_RADIUS.pill};
  background: color-mix(in srgb, var(--w-deep) 9%, transparent);
  color: var(--w-deep);
  white-space: nowrap;
}
.motu-kind[data-tone="sand"] { background: color-mix(in srgb, ${MOTU_CHROME.sand} 34%, transparent); color: ${MOTU_CHROME.onSand}; }

/* BREATHING: for a badge whose fact is that something is happening RIGHT NOW. The only animation in
   the kit that never stops, and it is spent on the one state where stillness would be a lie.

   A RING, not a fade. The composed view invented this first — its live dot pulsed a box-shadow — and
   defined @keyframes motu-breathe a second time in its own stylesheet, under the same name as this
   one. Two definitions of one keyframe in one document is not a conflict the browser reports: the
   later wins, for every element on the page. So the ring is the kit's now, and the composed view
   spends the class instead of redeclaring it. */
.motu-breathe {
  animation: motu-breathe 2.4s ease-in-out infinite;
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--w-shallow) 55%, transparent);
}
@keyframes motu-breathe {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--w-shallow) 55%, transparent); }
  50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--w-shallow) 0%, transparent); }
}

/* A SHEEN over the row that was just chosen — one sweep, the bay's own gesture at row size. */
.motu-row .motu-sheen {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.6) 50%, transparent 80%);
  transform: translateX(-100%);
  animation: motu-sheen 720ms ease-out 1;
}

/* SAND, as a readout: the one metadata figure that is a LIMIT rather than a measurement. */
.motu-sand { color: ${MOTU_CHROME.sand}; }
/* THE MARK. A background rather than an <img>, so it needs no asset, no alt-text decision at every
   call site, and no second copy for the server-rendered pages. The element that carries it supplies
   the accessible name. */
.motu-mark {
  display: block; flex: none;
  width: 30px; height: 30px;
  border-radius: 7px;
  background: ${motuMarkUrl()} center / contain no-repeat;
  box-shadow: 0 2px 8px rgba(4, 33, 29, .35);
}

/* The avatar: a sand disc. The only round thing on the page, which is what makes it read as a person. */
.motu-avatar {
  width: 30px; height: 30px; flex: none;
  border-radius: ${MOTU_RADIUS.pill};
  background: ${MOTU_CHROME.sand};
  color: ${MOTU_CHROME.onSand};
  display: grid; place-items: center;
  font: 700 12px/1 var(--sans);
}

@media (prefers-reduced-motion: reduce) {
  .motu-list > *, .motu-row, .motu-gauge, .motu-btn { animation: none; transition: none; }
  .motu-row[data-interactive]:hover { transform: none; }
  /* The masthead's three loops and the row sheen. A page whose water never stops moving is exactly
     what this preference is for, and the shapes all read correctly frozen — the waves keep their
     silhouette, the foam its highlight, the live pill its colour. */
  .motu-bay__waves::before, .motu-bay__waves::after,
  .motu-bay[data-shape="masthead"]::after, .motu-bay[data-shape="masthead"] .sheen,
  .motu-breathe, .motu-row .motu-sheen { animation: none; }
  .motu-rail { transition: none; }
}
`,
  ]
    .filter(Boolean)
    .join('\n');
}
