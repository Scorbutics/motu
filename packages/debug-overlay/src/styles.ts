// The lens' stylesheet: motu's kit, plus the handful of shapes only an overlay has.
//
// WHAT USED TO BE HERE. Two hundred and seventy lines that re-declared motu's whole design language
// from literals — `--ink: #22302c`, `0 14px 40px rgba(11,111,104,.18)`, its own glass gradient, its
// own pill, its own caption, its own empty state. All of it already existed in `@motu/chrome`, whose
// own header says a literal there "is the beginning of the second palette this package exists to
// prevent". The lens was that second palette; the review console was a third.
//
// It is `@motu/chrome/kit` now, emitted at `:host` scope because this draws inside a CLOSED SHADOW
// ROOT. That is the entire difference between painting a page and painting an overlay, and it is one
// argument rather than a copy of the stylesheet.
//
// WHAT IS STILL HERE is what only an overlay needs: a fixed layer over somebody else's page, the
// outline boxes and their labels, the wire canvas, the panel's POSITION (its surface is the kit's),
// the edge tab, and the region sheet's column widths.
import { motuShadowCss } from '@motu/chrome/css';

/** The tab's resting height. Shared with the CSS below so the two cannot drift. */
export const TAB_H = 54;

export const STYLES = `
${motuShadowCss('mock')}

/* --- THE LAYER OVER THE PAGE ------------------------------------------------------------------- */
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147482000; }
.wires { position: fixed; inset: 0; pointer-events: none; overflow: visible; }

/* No resting outline — the page stays clean. The box border (and label) appear only for the island
   under the cursor, the selected one, or the islands a hovered channel links to. */
.box { position: absolute; border: 1.5px dashed transparent; border-radius: 10px; }
.box.broken { border-style: solid; }
.box.hover, .box.sel, .box.link { border-color: currentColor; }
.box.hover { background: color-mix(in srgb, var(--ok) 5%, transparent); }
.box.link { background: color-mix(in srgb, var(--w-mid) 8%, transparent); }
.box.sel { box-shadow: 0 0 0 2px rgba(255,255,255,.7), 0 0 0 4px currentColor; }

/* pointer-events:none, deliberately. The label overlaps the top-left corner of every island, and with
   it clickable that corner stopped belonging to the page — a control there (peps' view toggle sits
   exactly at the top-left of its island) could not be clicked while the lens was open. Selecting an
   island already has two ways in that do not steal a pixel from the page: the picker, and Alt-click. */
.tag {
  position: absolute; top: -10px; left: 8px; pointer-events: none;
  display: none; align-items: center; gap: 5px; height: 19px; padding: 0 9px;
  border-radius: 999px; font: 700 10px/1 var(--mono); color: #fff; white-space: nowrap;
  background: var(--tide-accent); box-shadow: 0 3px 10px color-mix(in srgb, var(--tide-accent) 34%, transparent);
}
/* Low-noise by default: the label only appears for the island under the cursor (or the selected one). */
.box.hover .tag, .box.sel .tag, .box.link .tag { display: inline-flex; }
.tag.ok { background: var(--ok); } .tag.warn { background: var(--warn); }
.tag.broken { background: var(--broken); } .tag.neutral { background: var(--neutral); }
.tag .iso { opacity: .8; font-weight: 500; }

/* --- THE PANEL'S POSITION ----------------------------------------------------------------------
   Its SURFACE is the kit's .motu-sheet-panel. What is here is only where it sits: opposite the
   lagoon's bay when the host says where that is (--motu-debug-left/right), so the two never overlap. */
.panel {
  position: fixed;
  top: var(--motu-debug-top, 56px);
  right: var(--motu-debug-right, 12px);
  left: var(--motu-debug-left, auto);
  z-index: 2147483000; pointer-events: auto;
  width: 460px; max-width: calc(100vw - 24px); max-height: 82vh;
  font-size: 12px;
}
/* Collapsed: the title bar alone, shrunk to its controls — the graph stays on the page behind it. */
.panel--min { width: auto; }
.panel--min .motu-head { border-bottom: none; }

/* --- THE TAB ------------------------------------------------------------------------------------
   The lens' trigger. Closed, it is the only part of the lens on screen: a small pull at the edge the
   panel opens from. Open, it rides on the panel's inner edge, so what you click to close is where
   what you clicked to open was. It cannot live INSIDE .panel (overflow:hidden would clip it), so it
   is a sibling and the open loop keeps it glued to the panel — including through a drag. */
.tab {
  position: fixed;
  top: var(--motu-debug-top, 56px);
  /* ONE above the panel. They overlap while the panel is docked at the same edge, and equal z-index
     hands it to whichever is later in the DOM — the panel, which then swallowed clicks on the tab. A
     trigger is never behind the thing it triggers. */
  z-index: 2147483001;
  pointer-events: auto;
  display: grid;
  place-items: center;
  width: 26px; height: ${TAB_H}px;
  padding: 0;
  border: 1px solid var(--hair);
  background: var(--glass);
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
  color: var(--ink-soft);
  cursor: pointer;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--w-deep) 16%, transparent);
  transition: background 180ms, color 180ms, border-color 180ms;
}
/* Rounded on the side that faces the page, square on the side that is flush — the shape of a pull. */
.tab[data-side="right"] { right: 0; border-radius: 10px 0 0 10px; border-right: 0; }
.tab[data-side="left"] { left: 0; border-radius: 0 10px 10px 0; border-left: 0; }
.tab:hover { color: var(--ink); background: color-mix(in srgb, var(--tide-accent) 12%, #fff); }
.tab:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; }
/* ON is unmistakable from across the screen: an open lens changes what the whole page renders, so
   "is it live?" has to be answerable at a glance. */
.tab[aria-pressed="true"] { background: var(--tide-accent); color: var(--motu-on-primary, #fff); border-color: transparent; }
.tab svg { width: 14px; height: 14px; display: block; }

/* --- THE REGION SHEET'S COLUMNS -----------------------------------------------------------------
   The shape is the kit's .motu-table (fixed tracks, every cell on one line, the full text on the
   row's title). The WIDTHS are this table's, and the cell tones are the sheet's own vocabulary. */
.sheet .k { font-weight: 600; }
.sheet .own { font-size: 9.5px; padding: 0 4px; border-radius: 4px; text-align: center; }
.sheet .own.island { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.sheet .own.host { background: rgba(100, 116, 139, .14); color: #475569; }
.sheet .val { color: #0f172a; }
.sheet .rd { color: #64748b; }
.sheet .moved { color: var(--ok); text-align: right; }
.sheet .still { color: #cbd5e1; text-align: right; }
.sheet .flag { font-size: 9px; }

/* --- WHAT AN ISLAND IS, at the head of its detail ------------------------------------------------ */
.detail__title { display: flex; align-items: baseline; gap: 8px; padding-bottom: 2px; font: 700 12px/1.3 var(--mono); color: var(--ink); }
.detail__slot { font-weight: 500; font-size: 10px; color: var(--ink-faint); font-family: var(--sans); }

/* Where the island list used to be: how to narrow the scope, said once. */
.scopehint { padding: 2px 0 6px; color: var(--ink-faint); font-size: 11px; font-style: italic; }

/* The fit override's label. The buttons themselves are the kit's. */
.fitctl { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; font: 600 10px/1 var(--sans); }
.fitctl__l { color: var(--ink-faint); text-transform: uppercase; letter-spacing: .09em; }

/* --- A CHANNEL ROW's two extra lines -------------------------------------------------------------
   A channel carries more than fits on one line: its last payload, and the islands it reaches. Both
   wrap to their own full-width line under the row rather than truncating beside it, because "which
   islands read this" is the answer the row exists to give. */
.ch { flex-wrap: wrap; }
.ch .pay { flex-basis: 100%; color: var(--ink-faint); padding-left: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links { flex-basis: 100%; padding-left: 16px; color: var(--w-mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch .links.warn { color: var(--warn); }

/* --- A COUPLING ROW ------------------------------------------------------------------------------ */
.cp .who { color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp .who b { color: var(--ink); font-weight: 600; }
`;
