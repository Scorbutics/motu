// The lagoon's chrome, as a little BAY of water in one corner of the screen.
//
// The problem it solves: the lagoon used to put a switcher row, a floating chip bar and a badge above
// the archipelago, so the first screenful of a "preview the real region" tool was mostly tool.
//
// This started as a full-width waterline along the top edge, and that was wrong for a reason worth
// recording: an EDGE is something a page claims. This project's own region pins its toolbar to top:0
// under 720px, and its mobile filter sheet puts Done at the bottom edge — so a band across either
// edge is permanently sitting on somebody's controls, no matter how click-through it is. A corner
// patch is small enough that it can only ever collide with one corner, and WHERE it sits is the
// human's choice: EIGHT docks — each of the four corners, along either of that corner's two edges.
// The vertical docks are the same wave rotated 90° and stood against the left or right edge, which
// is what lets the bay get out of the way of a page that has claimed the horizontal edge (or the
// other way round). Drag it there, or pick a dock from the palette. The choice sticks.
//
// The water is not decoration — it IS the readout: MOCK is calm deep-teal lagoon, HTTP is the same
// water lit brighter and flowing ~2x faster (live backend), and the whole bay floods amber while the
// region wears the LEGACY fit. The bay says it in words too, on the pill: `<region> · <state>`.
//
// The bay is a CAPSULE, and the water is its fill. It used to be the other way round — the wave crest
// was the top edge, the inner end dissolved into a mask fade, one corner of four was rounded, and a
// 26x3 white bar sat on it. Three edge treatments, no closed outline, and the loudest mark on it was
// the shape of a slider thumb promising a slide that does not exist. Same water, inside a pill with a
// definite edge; the chrome is one flex row on it; and the eight docks are untouched, because a pill
// is symmetric and the rotation table still serves all of them.
//
// Implementation notes:
//   * The bay hosts the shared @motu/core toolbar (setMotuToolbarHost) rather than duplicating the
//     transport/fit controls — so those packages stay unchanged and keep owning their state.
//   * The debug lens is the exception, and it now draws its OWN trigger: a tab on the edge of its
//     panel, in @motu/debug-overlay. It was a buoy moored here, which put the trigger for a page-wide
//     lens a layer away from the thing it opens (and 17px of it, on moving water). The lens is still
//     INJECTED (`opts.lens`) so this module never imports the dev-only package — what the injection
//     buys now is the palette entry.
//   * The command palette builds its transport/fit/debug entries by READING those hosted chips and
//     clicking them. Any control a future package mounts into the toolbar becomes searchable for
//     free, with no registry to keep in sync.
//   * Everything corner-dependent (anchor, wave orientation, which corner is rounded, where the
//     panel grows) is driven by one `data-corner` attribute in CSS, so moving the bay is one
//     assignment and there is no second source of truth to drift.

import { setMotuToolbarHost } from '@motu/core';

export type TideView = 'region' | 'mountpoints';
/** top-left, top-right, bottom-left, bottom-right. */
export type TideCorner = 'tl' | 'tr' | 'bl' | 'br';
/**
 * Which of the corner's TWO edges the bay hugs: 'h' lies along the horizontal edge (top/bottom),
 * 'v' stands the same wave on its side against the vertical edge (left/right). Same water, rotated
 * 90° — so a page that has claimed the horizontal edge of a corner can still be given the vertical
 * one, and vice versa.
 */
export type TideAxis = 'h' | 'v';

export interface TideStation {
  /** Archipelago id — what gets written to <motu-archipelago name>. */
  id: string;
  /** Human label shown in the panel and in the palette. */
  label: string;
}

/**
 * The debug seam lens, handed in rather than imported. @motu/debug-overlay is a dev-only package that
 * a production root must be able to shake out entirely, so the chrome takes the three calls it needs
 * and stays ignorant of what is behind them. The lens draws its OWN trigger (a tab on its panel); what
 * this buys the bay is the palette entry — the keyboard way in. Omit it and that entry is absent.
 */
export interface TideLens {
  toggle(): void;
  isOpen(): boolean;
  subscribe(fn: (open: boolean) => void): () => void;
}

export interface TideLineOptions {
  stations: TideStation[];
  /** Build-time transport mode; tints the water. (Switching it reloads, so it needs no live wiring.) */
  transport: 'mock' | 'http';
  /** Prose shown by the palette's "About this lagoon" entry — the old footer paragraph. */
  about: string;
  onStation(id: string): void;
  onView(view: TideView): void;
  /** Wire the palette's lens entry to a debug lens. Omit it and the palette has no lens command. */
  lens?: TideLens;
}

export interface TideLine {
  /** Reflect the mounted state back onto the panel (lit segment + sliding thumb). */
  setActive(stationId: string, view: TideView): void;
}

const CORNER_KEY = 'motu:lagoon:tide-corner';
const CORNERS: TideCorner[] = ['tl', 'tr', 'bl', 'br'];
const CORNER_LABEL: Record<TideCorner, string> = {
  tl: 'top left',
  tr: 'top right',
  bl: 'bottom left',
  br: 'bottom right',
};
/** Bottom-left: the least contested corner in this project's layouts (top edge = region toolbar,
 *  bottom-right = the mobile filter sheet's Done). A human can move it anywhere. */
const DEFAULT_CORNER: TideCorner = 'bl';
const DEFAULT_AXIS: TideAxis = 'h';
const AXES: TideAxis[] = ['h', 'v'];
const AXIS_LABEL: Record<TideAxis, string> = { h: 'horizontal', v: 'vertical' };

const AXIS_KEY = 'motu:lagoon:tide-axis';

/** Along the docked edge. Longer than the visible water: the inner ~44% is a fade. */
const PATCH_LONG = 168;
/** Across it — the depth of the shallows. */
const PATCH_SHORT = 34;

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CSS = `
#tide {
  position: fixed;
  z-index: 2147483645;
  /* Only the bay itself and the open panel take the pointer; the container never covers the page. */
  pointer-events: none;
  font: 600 12px/1 "Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  /* Lagoon water, deep → shallow. MOCK is calm still water; HTTP is the same lagoon lit brighter and
     running faster (live backend); LEGACY fit floods the whole bay amber. --tide-accent is the one
     colour the CHROME borrows (the sliding pill, splash droplets) so it always matches the water. */
  /* Tokens, not literals: a project can point motu's chrome at its own primary (see applyMotuChrome),
     and the ramp shifts hue with it while keeping this shape. Unset, the tuned defaults below stand. */
  --w-deep: var(--motu-water-deep, #0b6f68);
  --w-mid: var(--motu-water-mid, #12988f);
  --w-shallow: var(--motu-water-shallow, #35c2b3);
  --tide-accent: var(--motu-primary, #0f766e);
}
#tide[data-transport="http"] {
  --w-deep: #076b7f;
  --w-mid: #0fa4b4;
  --w-shallow: #3fd0d8;
  --tide-accent: #0e8a92;
}
#tide[data-fit="legacy"] {
  --w-deep: #a4530a;
  --w-mid: #d97706;
  --w-shallow: #fbbf24;
  --tide-accent: #b45309;
}
/* A DOCK is a corner plus which of that corner's two edges the water lies along. The wave art is
   identical in all eight; only three numbers change — a rotation (which edge the mass hugs) and two
   mirror factors (which end is deep, which side the mass is on). Keeping them as CSS custom
   properties means the eight docks are a table, not eight code paths. */
/* The capsule FLOATS in its corner rather than sitting flush in it, so its outline is closed on all
   four sides. Padding on the container, not a margin on the pill: the panel and the tooltip are
   positioned against this same padding box, so all three keep their inset with one number. */
#tide { --rot: 0deg; --mx: 1; --my: 1; padding: 12px; }
#tide[data-corner="tl"] { top: 0; left: 0; }
#tide[data-corner="tr"] { top: 0; right: 0; }
#tide[data-corner="bl"] { bottom: 0; left: 0; }
#tide[data-corner="br"] { bottom: 0; right: 0; }

/* Horizontal docks: the water lies along the top or bottom edge. */
#tide[data-axis="h"][data-corner="tl"] { --rot: 0deg; --mx: -1; --my: 1; }
#tide[data-axis="h"][data-corner="tr"] { --rot: 0deg; --mx: 1; --my: 1; }
#tide[data-axis="h"][data-corner="bl"] { --rot: 0deg; --mx: -1; --my: -1; }
#tide[data-axis="h"][data-corner="br"] { --rot: 0deg; --mx: 1; --my: -1; }
/* Vertical docks: the SAME wave stood on its side against the left or right edge. The rotation puts
   the mass against that edge; --mx then decides which end of the long axis is the deep one, so the
   deep end always faces the outer corner. */
#tide[data-axis="v"][data-corner="tl"] { --rot: -90deg; --mx: -1; --my: 1; }
#tide[data-axis="v"][data-corner="bl"] { --rot: -90deg; --mx: 1; --my: 1; }
#tide[data-axis="v"][data-corner="tr"] { --rot: 90deg; --mx: 1; --my: 1; }
#tide[data-axis="v"][data-corner="br"] { --rot: 90deg; --mx: -1; --my: 1; }

/* ── the bay ─────────────────────────────────────────────────────────────────────────────── */
/* A CAPSULE, and the water is its FILL rather than its outline.
 *
 * It used to be the other way round: the wave crest WAS the top edge, the inner end dissolved into a
 * mask fade, and one corner of four was rounded — three unrelated edge treatments and no closed
 * outline, so the eye could not decide where the object ended. Worse, the handle was a 26x3 white
 * capsule centred on a horizontal band, which is the universal mark for a slider THUMB: the loudest
 * signal on the bay pointed at a behaviour (drag me along this track) that does not exist here.
 *
 * So the water moved INSIDE a pill with a definite edge and a shadow, and the chrome became one flex
 * row on a shared baseline — grab dots, then what the bay is reporting. Nothing borrows the shape of
 * a control that does not exist, and the eight docks are untouched: a pill is symmetric, so the same
 * table of rotations and mirrors still serves all of them. */
#tide .patch {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: ${PATCH_LONG}px;
  height: ${PATCH_SHORT}px;
  padding: 0 12px;
  border-radius: 999px;
  overflow: hidden;
  /* The wave only covers what is above its crest; the pill's own body is what makes it a solid
     object. Same token, so transport and fit recolour the whole capsule, not just the swell. */
  background: var(--w-deep);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .22);
  pointer-events: auto;
  cursor: grab;
  -webkit-tap-highlight-color: transparent;
  transition: transform 300ms cubic-bezier(.3,1.3,.4,1), filter 200ms;
}
/* The row rides ABOVE the water; only the wave and the sheen are allowed underneath it. */
#tide .patch > *:not(svg):not(.sheen) { position: relative; z-index: 1; min-width: 0; }
#tide .sheen { z-index: 2; }
#tide .patch:hover { filter: brightness(1.06); }
/* Stood on its side: same pill, same row, turned a quarter turn with the water. */
#tide[data-axis="v"] .patch { width: ${PATCH_SHORT}px; height: ${PATCH_LONG}px; flex-direction: column; padding: 12px 0; }
#tide[data-dragging="true"] .patch { cursor: grabbing; transition: none; }
/* Orient the water: it pools against the edge it is docked to, and the DEEP end of the gradient
   faces the outer corner. The transition makes a re-dock read as the water turning to lie along its
   new edge rather than as a redraw. */
/* The wave is always drawn in its own ${PATCH_LONG}x${PATCH_SHORT} space and then placed: centred in
   the patch, rotated onto the docked edge, mirrored per the table above. Centring is what lets one
   art asset serve both box shapes — rotating a ${PATCH_LONG}x${PATCH_SHORT} box by 90° lands exactly
   on the ${PATCH_SHORT}x${PATCH_LONG} one. */
#tide .patch svg {
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${PATCH_LONG}px;
  height: ${PATCH_SHORT}px;
  transform: translate(-50%, -50%) rotate(var(--rot)) scale(var(--mx), var(--my));
  transition: transform 420ms cubic-bezier(.3,1.25,.4,1);
}
/* The handle: says "grab me", and is the tap target on a touch screen.
   DOTS, not a bar. A bar on a band is a slider thumb — the one thing this must not promise, because
   dragging the bay re-docks it rather than sliding anything along it. A dot field is the drag
   vocabulary that carries no direction at all, and it sits IN the row instead of being placed at a
   percentage across moving art. */
#tide .grip {
  display: grid;
  grid-template-columns: repeat(2, 3px);
  gap: 3px;
  flex: 0 0 auto;
  pointer-events: none;
}
/* Turned with the water: the same six dots, three across instead of two. */
#tide[data-axis="v"] .grip { grid-template-columns: repeat(3, 3px); }
#tide .grip i { width: 3px; height: 3px; border-radius: 50%; background: rgba(255, 255, 255, .72); }

/* What the bay is REPORTING, in words. The water's tint has always carried the transport and the fit,
   but a hue alone has to be learned; with the mask gone there is room to simply say it. */
#tide .label {
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .04em;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .35);
  pointer-events: none;
}
/* A vertical pill is 34px across: no room for words, and sideways text is not a readout. The tint
   still carries the state, and the panel spells it out. */
#tide[data-axis="v"] .label { display: none; }

/* ── the panel ───────────────────────────────────────────────────────────────────────────── */
/* Absolutely positioned, so a closed panel adds nothing to the container's footprint — the bay is
   the whole hit surface at rest. It grows OUT of the bay, away from the screen corner. */
#tide .bar {
  position: absolute;
  width: max-content;
  max-width: calc(100vw - 20px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(247, 253, 252, .94), rgba(232, 248, 246, .92));
  backdrop-filter: blur(14px) saturate(1.35);
  -webkit-backdrop-filter: blur(14px) saturate(1.35);
  box-shadow: 0 14px 40px rgba(11, 111, 104, .18);
  opacity: 0;
  visibility: hidden;
  transform: scale(.94);
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,1.2,.36,1), visibility 0s 220ms;
}
#tide[data-open="true"] .bar {
  opacity: 1;
  visibility: visible;
  transform: none;
  pointer-events: auto;
  transition: opacity 180ms ease, transform 260ms cubic-bezier(.22,1.2,.36,1), visibility 0s;
}
#tide[data-corner="tl"] .bar { transform-origin: top left; }
#tide[data-corner="tr"] .bar { transform-origin: top right; }
#tide[data-corner="bl"] .bar { transform-origin: bottom left; }
#tide[data-corner="br"] .bar { transform-origin: bottom right; }
/* Grow away from the docked edge: past the water's depth on a horizontal dock, past its width on a
   vertical one. */
#tide[data-axis="h"][data-corner="tl"] .bar { top: calc(${PATCH_SHORT}px + 8px); left: 10px; }
#tide[data-axis="h"][data-corner="tr"] .bar { top: calc(${PATCH_SHORT}px + 8px); right: 10px; }
#tide[data-axis="h"][data-corner="bl"] .bar { bottom: calc(${PATCH_SHORT}px + 8px); left: 10px; }
#tide[data-axis="h"][data-corner="br"] .bar { bottom: calc(${PATCH_SHORT}px + 8px); right: 10px; }
#tide[data-axis="v"][data-corner="tl"] .bar { top: 10px; left: calc(${PATCH_SHORT}px + 8px); }
#tide[data-axis="v"][data-corner="tr"] .bar { top: 10px; right: calc(${PATCH_SHORT}px + 8px); }
#tide[data-axis="v"][data-corner="bl"] .bar { bottom: 10px; left: calc(${PATCH_SHORT}px + 8px); }
#tide[data-axis="v"][data-corner="br"] .bar { bottom: 10px; right: calc(${PATCH_SHORT}px + 8px); }

#tide .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#tide .col { display: flex; flex-direction: column; gap: 6px; align-self: stretch; width: 100%; }
#tide .col__head { display: flex; align-items: baseline; gap: 8px; }
#tide .count { font-size: 10px; color: #b3ab9c; font-weight: 600; margin-left: auto; }

/* ── the archipelago list ─────────────────────────────────────────────────────────────────── */
/* A segmented pill row is a control for two or three fixed options; a project can ship ten
   archipelagos, so this is a LIST — it scrolls, it filters once there are enough to warrant it, and
   it costs one row of height per entry instead of one column of width. */
#tide .list {
  position: relative;
  width: 100%;
  max-height: 172px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Fade the ends so a scrollable list looks scrollable without a scrollbar shouting about it. */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%);
}
#tide .list::-webkit-scrollbar { width: 6px; }
#tide .list::-webkit-scrollbar-thumb { background: rgba(15, 118, 110, .22); border-radius: 999px; }
#tide .list__inner { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 6px 0; }
/* The rail is the vertical cousin of the segmented thumb: it SLIDES to the selected row rather than
   blinking on, so a switch has a direction you can follow. It lives inside the scrolled content, so
   it tracks the row it marks without any scroll bookkeeping. */
#tide .rail {
  position: absolute;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: var(--tide-accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--tide-accent) 60%, transparent);
  transition: top 300ms cubic-bezier(.34,1.45,.5,1), height 300ms cubic-bezier(.34,1.45,.5,1), background 220ms;
  pointer-events: none;
}
#tide .opt {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px 7px 15px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #5c6b63;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 160ms, color 160ms, transform 160ms;
}
#tide .opt:hover { background: rgba(15, 118, 110, .07); color: #22302c; transform: translateX(2px); }
#tide .opt[aria-current="true"] {
  background: color-mix(in srgb, var(--tide-accent, #0f766e) 10%, transparent);
  color: var(--motu-primary-deep, #0b5b55);
  font-weight: 700;
}
#tide .opt[hidden] { display: none; }
/* A depth lamp: lit for the mounted archipelago, dark for the rest. */
#tide .lamp {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cdd6d2;
  flex: 0 0 auto;
  transition: background 220ms, box-shadow 220ms;
}
#tide .opt[aria-current="true"] .lamp {
  background: var(--tide-accent);
  box-shadow: 0 0 9px color-mix(in srgb, var(--tide-accent) 85%, transparent);
}
/* Rows swim in from the edge each time the panel opens — staggered, so the list assembles rather
   than appearing. Scoped to the open state so it replays on every reveal. */
#tide[data-open="true"] .opt { animation: tide-swim 260ms cubic-bezier(.2,.9,.3,1) both; }
@keyframes tide-swim { from { opacity: 0; transform: translateX(-8px); } }
#tide .filter {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, .10);
  border-radius: 8px;
  background: rgba(255, 255, 255, .75);
  padding: 6px 9px;
  font: inherit;
  font-size: 12px;
  color: #22302c;
  outline: none;
}
#tide .filter:focus { border-color: var(--tide-accent); }
#tide .empty { color: #a39a8a; font-size: 11.5px; padding: 6px 4px; }

/* The debug lens' trigger is NOT here any more. It used to be a buoy moored in the bay: a 17px ring
   floating on the water, under every touch-target minimum, competing with the foam stroke behind it,
   and belonging to no row. It now lives on the lens itself, as a tab on the edge of its own panel
   (@motu/debug-overlay) — so opening and closing happen in the same place, and the lens stops being
   summoned from another element's body. What stays here is the palette command, which is the
   keyboard way in. */

/* A sheen sweeping the bay: what the water does when something actually changed. */
#tide .sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(var(--sheen-angle, 90deg), transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%);
}
#tide .cap {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: #9a9182;
  min-width: 62px;
}
#tide .grp {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .04);
}
/* The lit pill slides between options instead of blinking on — the one bit of state that moves. */
#tide .thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 999px;
  background: var(--tide-accent);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--tide-accent) 45%, transparent);
  transition: left 260ms cubic-bezier(.34,1.4,.5,1), width 260ms cubic-bezier(.34,1.4,.5,1), background 200ms;
  pointer-events: none;
}
#tide .grp button {
  position: relative;
  appearance: none;
  border: 0;
  background: transparent;
  color: #5c6b63;
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 160ms;
}
#tide .grp button:hover { color: #22302c; }
#tide .grp button[aria-current="true"] { color: #fff; }
#tide .kbd {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(255,255,255,.7);
  color: #6b7280;
  font: inherit;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}
#tide .kbd:hover { color: #22302c; border-color: rgba(0,0,0,.22); }
/* The shared toolbar (transport / fit / debug chips) is adopted into this slot. */
#tide .slot { display: flex; align-items: center; }
#tide .hint { color: #a39a8a; font-size: 10.5px; font-weight: 500; letter-spacing: .02em; }

/* ── drag targets ────────────────────────────────────────────────────────────────────────── */
/* Shown only while dragging: where the bay can land, and which one it will snap to on release. */
#tide-targets {
  position: fixed;
  inset: 0;
  z-index: 2147483644;
  pointer-events: none;
  display: none;
}
#tide-targets[data-on="true"] { display: block; }
#tide-targets i {
  position: absolute;
  width: ${PATCH_LONG}px;
  height: ${PATCH_SHORT}px;
  border: 1.5px dashed rgba(15, 118, 110, .45);
  background: rgba(15, 118, 110, .07);
  transition: background 140ms, border-color 140ms, transform 140ms;
}
#tide-targets i[data-near="true"] {
  background: color-mix(in srgb, var(--tide-accent, #0f766e) 22%, transparent);
  border-color: var(--tide-accent, #0f766e);
  transform: scale(1.06);
}
#tide-targets i[data-axis="v"] { width: ${PATCH_SHORT}px; height: ${PATCH_LONG}px; }
#tide-targets i[data-corner="tl"] { top: 0; left: 0; border-bottom-right-radius: 16px; }
#tide-targets i[data-corner="tr"] { top: 0; right: 0; border-bottom-left-radius: 16px; }
#tide-targets i[data-corner="bl"] { bottom: 0; left: 0; border-top-right-radius: 16px; }
#tide-targets i[data-corner="br"] { bottom: 0; right: 0; border-top-left-radius: 16px; }

/* ── command palette ─────────────────────────────────────────────────────────────────────── */
#tide-palette {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
  background: rgba(20, 32, 28, .30);
  backdrop-filter: blur(3px);
  font: 500 14px/1.4 "Inter", ui-sans-serif, system-ui, sans-serif;
}
#tide-palette[hidden] { display: none; }
#tide-palette .box {
  width: min(540px, calc(100vw - 32px));
  background: #fffefb;
  border-radius: 16px;
  box-shadow: 0 30px 70px rgba(15, 23, 42, .32);
  overflow: hidden;
  animation: tide-pop 200ms cubic-bezier(.2,1.2,.4,1);
}
@keyframes tide-pop { from { transform: translateY(-10px) scale(.97); opacity: 0; } }
#tide-palette input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #eee8dc;
  padding: 16px 18px;
  font: inherit;
  font-size: 15px;
  color: #22302c;
  outline: none;
  background: transparent;
}
#tide-palette ul { list-style: none; margin: 0; padding: 6px; max-height: 46vh; overflow-y: auto; }
#tide-palette li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 9px;
  cursor: pointer;
  color: #3d4a44;
  animation: tide-row 180ms ease both;
}
@keyframes tide-row { from { opacity: 0; transform: translateX(-6px); } }
#tide-palette li[aria-selected="true"] {
  background: color-mix(in srgb, var(--motu-primary, #0f766e) 9%, #fff);
  color: var(--motu-primary, #0f766e);
}
#tide-palette li .kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #a39a8a;
  margin-left: auto;
}
#tide-palette li mark { background: transparent; color: var(--motu-primary, #0f766e); font-weight: 700; }
#tide-palette li[aria-selected="true"] mark { color: var(--motu-primary-deep, #0b5b55); }
#tide-palette .about {
  padding: 14px 18px;
  color: #6b7280;
  font-size: 12.5px;
  border-top: 1px solid #eee8dc;
  background: #faf8f4;
}
#tide-palette .about code { background: #f0ece3; padding: 1px 5px; border-radius: 4px; }
#tide-palette .empty { padding: 18px; color: #a39a8a; font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  /* The wave itself is a WAAPI animation and is skipped in JS (a CSS rule cannot reach it). */
  #tide .bar, #tide .thumb, #tide .patch, #tide .rail, #tide .opt { transition: none; }
  #tide[data-open="true"] .opt { animation: none; }
  #tide-palette .box, #tide-palette li { animation: none; }
}
`;

/**
 * One layer of the water, in CSS pixels (never scaled — see drawWave). The shape is filled, not
 * stroked: an alternating-quadratic crest, then closed up to y=0 so everything above the crest is
 * water. It runs `period` px past the right edge, which is what makes the -1 period shift seamless.
 */
interface WaveLayer {
  /** Where the crest sits across the bay's depth — smaller = closer to the docked edge. */
  baseline: number;
  amplitude: number;
  /** Period as a multiple of the BAY's width, so the swell is scaled to the thing it lives in. */
  periodFactor: number;
  /** Drift in px/s. Deliberately slow: a small element with a fast wave reads as a loading spinner. */
  speed: number;
  /** Start the crest on a trough instead of a peak, offsetting this layer against the others. */
  inverted?: boolean;
  /** Drift the other way, so the layers cross rather than march together. */
  reverse?: boolean;
  fill: string;
  opacity: number;
  /** Foam: draw the crest as an open stroked line instead of a filled mass. */
  stroke?: string;
}

/** Back to front. The last filled one is the opaque body; the others peek out beyond its crest. */
const WAVE_LAYERS: WaveLayer[] = [
  { baseline: 23, amplitude: 5, periodFactor: 1.6, speed: 15, fill: 'var(--w-shallow)', opacity: 0.34 },
  { baseline: 19, amplitude: 4.5, periodFactor: 1.15, speed: 19, inverted: true, reverse: true, fill: 'var(--w-mid)', opacity: 0.5 },
  { baseline: 15, amplitude: 4, periodFactor: 0.85, speed: 17, fill: 'url(#tide-body)', opacity: 1 },
  // Foam: rides exactly the body's crest (same geometry + speed), so it reads as light catching the
  // edge of the water rather than as a fourth wave.
  { baseline: 15, amplitude: 4, periodFactor: 0.85, speed: 17, fill: 'none', stroke: 'rgba(255,255,255,.5)', opacity: 0.9 },
];

function layerPeriod(layer: WaveLayer): number {
  return PATCH_LONG * layer.periodFactor;
}

function wavePath(layer: WaveLayer): string {
  const period = layerPeriod(layer);
  const half = period / 2;
  const amp = layer.inverted ? -layer.amplitude : layer.amplitude;
  const halves = Math.ceil((PATCH_LONG + period) / half);
  let d = `M0 ${layer.baseline} q ${half / 2} ${-amp} ${half} 0`;
  for (let i = 1; i < halves; i++) d += ` t ${half} 0`;
  // Foam stays an open curve; a filled layer closes upward, so everything above the crest is water.
  return layer.stroke ? d : `${d} L ${halves * half} 0 L 0 0 Z`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

/** Little splash of droplets at a click point — the acknowledgement that something switched. */
function splash(x: number, y: number, color: string): void {
  if (REDUCED()) return;
  for (let i = 0; i < 9; i++) {
    const drop = el('span');
    const size = 3 + Math.random() * 3;
    drop.style.cssText =
      `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${color};pointer-events:none;z-index:2147483647;will-change:transform,opacity`;
    document.body.appendChild(drop);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const dist = 26 + Math.random() * 46;
    drop
      .animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 34}px) scale(.4)`,
            opacity: 0,
          },
        ],
        { duration: 540 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.4,1)' },
      )
      .finished.then(() => drop.remove(), () => drop.remove());
  }
}

/** Subsequence match. Returns null when `q` doesn't fit, else the matched indices (for highlighting). */
function fuzzy(text: string, q: string): number[] | null {
  if (!q) return [];
  const hay = text.toLowerCase();
  const hits: number[] = [];
  let at = 0;
  for (const ch of q.toLowerCase()) {
    if (ch === ' ') continue;
    const found = hay.indexOf(ch, at);
    if (found === -1) return null;
    hits.push(found);
    at = found + 1;
  }
  return hits;
}

/** Score a match: earlier + tighter wins, so "mem" puts Members above "Org Lookup · Mountpoints". */
function score(hits: number[]): number {
  if (!hits.length) return 0;
  const spread = hits[hits.length - 1] - hits[0];
  return -(hits[0] * 3 + spread);
}

/**
 * Which of the eight docks a point belongs to. The corner is the quadrant; the AXIS is decided by
 * which edge you are nearer — drift toward the top or bottom of the screen and the water lies down
 * along it, drift toward a side and it stands up against it. That reads as pushing the water against
 * an edge rather than picking from a menu of eight.
 */
function slotAt(x: number, y: number): { corner: TideCorner; axis: TideAxis } {
  const vertical = y < window.innerHeight / 2 ? 't' : 'b';
  const horizontal = x < window.innerWidth / 2 ? 'l' : 'r';
  const toHorizontalEdge = Math.min(y, window.innerHeight - y);
  const toVerticalEdge = Math.min(x, window.innerWidth - x);
  return {
    corner: `${vertical}${horizontal}` as TideCorner,
    axis: toHorizontalEdge <= toVerticalEdge ? 'h' : 'v',
  };
}

function readCorner(): TideCorner {
  const stored = localStorage.getItem(CORNER_KEY);
  return CORNERS.includes(stored as TideCorner) ? (stored as TideCorner) : DEFAULT_CORNER;
}

function readAxis(): TideAxis {
  const stored = localStorage.getItem(AXIS_KEY);
  return AXES.includes(stored as TideAxis) ? (stored as TideAxis) : DEFAULT_AXIS;
}

interface Command {
  label: string;
  kind: string;
  run(): void;
}

export function mountTideLine(opts: TideLineOptions): TideLine {
  document.head.appendChild(el('style', { id: 'tide-css' }, CSS));

  // ── panel ──────────────────────────────────────────────────────────────────────────────────
  const bar = el('div', { class: 'bar', role: 'group', 'aria-label': 'Lagoon controls' });

  /** A segmented pill row — right for a fixed pair like the view toggle, wrong for an open-ended set. */
  function segmented(cap: string): { grp: HTMLElement; thumb: HTMLElement } {
    const thumb = el('span', { class: 'thumb' });
    const grp = el('div', { class: 'grp', role: 'group', 'aria-label': cap }, thumb);
    bar.appendChild(el('div', { class: 'row' }, el('span', { class: 'cap' }, cap), grp));
    return { grp, thumb };
  }

  const accent = () => getComputedStyle(tide).getPropertyValue('--tide-accent').trim() || '#0f766e';

  // ── archipelago list ───────────────────────────────────────────────────────────────────────
  // Above this many, scanning the list is slower than typing at it, so it grows its own filter.
  // (The palette can always search everything; this is for when the panel is already open.)
  const FILTER_FROM = 7;

  const rail = el('span', { class: 'rail' });
  const listInner = el('div', { class: 'list__inner' }, rail);
  const listBox = el('div', { class: 'list', role: 'listbox', 'aria-label': 'Archipelago' }, listInner);
  const emptyNote = el('p', { class: 'empty', hidden: '' }, 'No archipelago matches.');
  const listHead = el(
    'div',
    { class: 'col__head' },
    el('span', { class: 'cap' }, 'Archipelago'),
    el('span', { class: 'count' }, `${opts.stations.length}`),
  );
  const listCol = el('div', { class: 'col' }, listHead);

  const filter =
    opts.stations.length >= FILTER_FROM
      ? (el('input', { class: 'filter', type: 'text', placeholder: 'Filter…', 'aria-label': 'Filter archipelagos' }) as HTMLInputElement)
      : null;
  if (filter) listCol.appendChild(filter);
  listCol.append(listBox, emptyNote);
  bar.appendChild(listCol);

  // A LIST of rows, not a map keyed by id: keying by id silently collapses two entries that share
  // one (a project may well surface the same archipelago under two labels), which would drop rows
  // from the filter and misplace the rail.
  const rows: { station: TideStation; btn: HTMLButtonElement }[] = [];
  for (const station of opts.stations) {
    const btn = el(
      'button',
      { class: 'opt', type: 'button', role: 'option', 'data-id': station.id },
      el('span', { class: 'lamp' }),
      station.label,
    ) as HTMLButtonElement;
    btn.addEventListener('click', (e) => {
      splash(e.clientX, e.clientY, accent());
      opts.onStation(station.id);
    });
    listInner.appendChild(btn);
    rows.push({ station, btn });
  }

  /** Stagger the swim-in across whatever is currently visible, so filtering re-times it correctly. */
  function restagger(): void {
    let i = 0;
    for (const { btn } of rows) {
      if (btn.hidden) continue;
      btn.style.animationDelay = `${Math.min(i, 9) * 26}ms`;
      i++;
    }
  }
  restagger();

  filter?.addEventListener('input', () => {
    const q = filter.value.trim();
    let visible = 0;
    for (const { station, btn } of rows) {
      const hit = !q || fuzzy(station.label, q) !== null;
      btn.hidden = !hit;
      if (hit) visible++;
    }
    emptyNote.hidden = visible > 0;
    restagger();
  });

  // Arrow keys walk the list; Enter/Space is the button's own default.
  listBox.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const visible = rows.map((r) => r.btn).filter((b) => !b.hidden);
    const at = visible.indexOf(document.activeElement as HTMLButtonElement);
    const next = visible[(Math.max(at, 0) + (e.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length];
    next?.focus();
  });

  const viewGroup = segmented('View');
  for (const [view, label] of [
    ['region', 'Region'],
    ['mountpoints', 'Mountpoints'],
  ] as const) {
    const btn = el('button', { type: 'button', 'data-view': view }, label);
    btn.addEventListener('click', (e) => {
      splash(e.clientX, e.clientY, accent());
      opts.onView(view);
    });
    viewGroup.grp.appendChild(btn);
  }

  const slot = el('div', { class: 'slot' });
  // A shortcut hint is noise on a device with no keyboard — there the same button is just "search".
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isMac = /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent);
  const kbd = el(
    'button',
    { class: 'kbd', type: 'button', title: 'Command palette' },
    isTouch ? '⌕ Search' : isMac ? '⌘K' : 'Ctrl K',
  );
  kbd.addEventListener('click', () => openPalette());
  bar.appendChild(el('div', { class: 'row' }, slot, kbd));
  const dragHint = isTouch
    ? 'Drag the wave to any edge'
    : 'Drag the wave to any edge — it lies along the one you push it against';
  bar.appendChild(
    el('span', { class: 'hint' }, opts.lens ? `${dragHint}. The ⌖ tab on the right opens the seam lens.` : `${dragHint}.`),
  );

  // ── the bay ────────────────────────────────────────────────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${PATCH_LONG} ${PATCH_SHORT}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // The body's own depth gradient. Its stops read the same CSS vars as everything else, so
  // transport/fit recolour the water with no JS.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'tide-body');
  grad.setAttribute('x1', '0');
  grad.setAttribute('x2', '1');
  grad.setAttribute('y1', '0');
  grad.setAttribute('y2', '0');
  for (const [offset, color] of [
    ['0', 'var(--w-deep)'],
    ['0.6', 'var(--w-mid)'],
    ['1', 'var(--w-shallow)'],
  ]) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  // HTTP is live data hitting a real backend: the same lagoon, running visibly faster.
  const speedScale = opts.transport === 'http' ? 2.1 : 1;
  for (const layer of WAVE_LAYERS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', wavePath(layer));
    path.setAttribute('fill', layer.fill);
    path.setAttribute('opacity', String(layer.opacity));
    if (layer.stroke) {
      path.setAttribute('stroke', layer.stroke);
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
    }
    const period = layerPeriod(layer);
    // Travel exactly one period per loop (seamless), at a constant px/s. Driven by the Web Animations
    // API rather than CSS because each layer's distance differs — which also means a CSS
    // `animation: none` cannot stop it, so reduced-motion has to be honoured HERE.
    if (!REDUCED()) {
      path.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-period}px)` }], {
        duration: (period / (layer.speed * speedScale)) * 1000,
        iterations: Infinity,
        easing: 'linear',
        direction: layer.reverse ? 'reverse' : 'normal',
      });
    }
    svg.appendChild(path);
  }

  // Six dots, not a bar. See the CSS: a bar here reads as a slider thumb and promises a slide.
  const grip = el('span', { class: 'grip' }, ...Array.from({ length: 6 }, () => el('i')));
  const sheen = el('span', { class: 'sheen' });
  // What the bay is reporting, in words rather than in hue alone. Kept in sync by renderLabel().
  const label = el('span', { class: 'label' });
  const lens = opts.lens;
  const patch = el(
    'div',
    { class: 'patch', role: 'button', tabindex: '0', 'aria-label': 'Lagoon controls — open, or drag to another edge' },
    svg,
    sheen,
    grip,
    label,
  );

  const tide = el(
    'div',
    { id: 'tide', 'data-open': 'false', 'data-transport': opts.transport },
    bar,
    patch,
  );
  tide.dataset.corner = readCorner();
  tide.dataset.axis = readAxis();
  document.body.appendChild(tide);

  const targets = el('div', { id: 'tide-targets' });
  for (const corner of CORNERS) {
    for (const axis of AXES) targets.appendChild(el('i', { 'data-corner': corner, 'data-axis': axis }));
  }
  document.body.appendChild(targets);

  // The chips (transport / fit) come to the panel instead of floating over the content. Debug is not
  // among them: the lens carries its own tab on the edge of its panel.
  setMotuToolbarHost(slot);

  // Keep the lens' panel on the far side from the bay, so the two never sit on top of each other.
  // Custom properties cross the shadow boundary, which is how the overlay reads these.
  const placeDebugPanel = () => {
    const onRight = tide.dataset.corner === 'tr' || tide.dataset.corner === 'br';
    const root = document.documentElement.style;
    root.setProperty('--motu-debug-right', onRight ? 'auto' : '12px');
    root.setProperty('--motu-debug-left', onRight ? '12px' : 'auto');
  };
  placeDebugPanel();

  // The pill's readout. The water's tint has always carried this, but a hue has to be learned and a
  // word does not — and with the mask gone there is a row to put it in. LEGACY wins over the
  // transport because it is the louder fact about what you are looking at.
  let stationLabel = '';
  const renderLabel = () => {
    const state = tide.dataset.fit === 'legacy' ? 'legacy' : opts.transport;
    label.textContent = stationLabel ? `${stationLabel} · ${state}` : state;
  };

  // Fit is flipped live by the toolbar chip, which only ever sets the attribute on the regions —
  // so read it from there rather than mirroring the toggle's state.
  const readFit = () => {
    const legacy = !!document.querySelector('motu-archipelago[fit="legacy"]');
    tide.dataset.fit = legacy ? 'legacy' : 'native';
    renderLabel();
  };
  new MutationObserver(readFit).observe(document.body, { subtree: true, childList: true, attributeFilter: ['fit'] });
  readFit();

  // ── open / close ───────────────────────────────────────────────────────────────────────────
  let closeTimer = 0;
  let dwellTimer = 0;
  const open = () => {
    window.clearTimeout(closeTimer);
    window.clearTimeout(dwellTimer);
    tide.dataset.open = 'true';
  };
  const close = (delay = 240) => {
    window.clearTimeout(closeTimer);
    window.clearTimeout(dwellTimer);
    closeTimer = window.setTimeout(() => {
      // Never close out from under a keyboard user or an open palette.
      if (tide.contains(document.activeElement) || !palette.hidden) return;
      tide.dataset.open = 'false';
    }, delay);
  };

  /**
   * Open on hover only after a DWELL. The bay is small, but it still sits over whatever is in that
   * corner; brushing across it on the way somewhere else is not a request to open it.
   */
  const DWELL_MS = 260;
  patch.addEventListener('pointerenter', () => {
    if (dragging) return;
    dwellTimer = window.setTimeout(open, DWELL_MS);
  });
  patch.addEventListener('pointerleave', () => window.clearTimeout(dwellTimer));
  // HOLD open — never open. pointerenter is delivered to every ancestor of the entered element, so
  // opening here would fire the moment the pointer touched the bay and defeat the dwell above.
  tide.addEventListener('pointerenter', () => {
    if (tide.dataset.open === 'true') open();
  });
  tide.addEventListener('pointerleave', () => close());
  // Focus opens the panel for a keyboard user.
  tide.addEventListener('focusin', () => open());
  tide.addEventListener('focusout', () => close(120));
  patch.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (tide.dataset.open === 'true') return close(0);
    open();
    (bar.querySelector('button') as HTMLElement | null)?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!tide.contains(e.target as Node)) close(0);
  });

  // ── drag the bay to another corner ─────────────────────────────────────────────────────────
  // The one collision a corner element can still have is with whatever occupies THAT corner (this
  // project's mobile filter sheet puts Done in the bottom-right). Rather than guess a safe corner,
  // hand the choice over: drag it, it snaps to the nearest corner, and the choice persists.
  const DRAG_THRESHOLD = 6;
  let dragging = false;
  let pressed: { x: number; y: number } | null = null;

  const moveTo = (corner: TideCorner, axis: TideAxis) => {
    tide.dataset.corner = corner;
    tide.dataset.axis = axis;
    placeDebugPanel();
    try {
      localStorage.setItem(CORNER_KEY, corner);
      localStorage.setItem(AXIS_KEY, axis);
    } catch {
      /* storage disabled — the choice just won't persist */
    }
  };

  patch.addEventListener('pointerdown', (e) => {
    pressed = { x: e.clientX, y: e.clientY };
    patch.setPointerCapture(e.pointerId);
  });

  patch.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < DRAG_THRESHOLD) return;
      dragging = true;
      window.clearTimeout(dwellTimer);
      tide.dataset.open = 'false';
      tide.dataset.dragging = 'true';
      targets.dataset.on = 'true';
    }
    // Follow the pointer as a plain offset from the docked position — no layout involved, so the
    // drag stays cheap and the snap-back is a single transition on the same property.
    patch.style.transform = `translate(${e.clientX - pressed.x}px, ${e.clientY - pressed.y}px)`;
    const near = slotAt(e.clientX, e.clientY);
    for (const t of targets.querySelectorAll<HTMLElement>('i')) {
      t.dataset.near = String(t.dataset.corner === near.corner && t.dataset.axis === near.axis);
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (!pressed) return;
    const wasDragging = dragging;
    pressed = null;
    dragging = false;
    delete tide.dataset.dragging;
    delete targets.dataset.on;
    patch.style.transform = '';
    if (!wasDragging) {
      // A tap, not a drag: toggle. This is the whole touch story — no hover to rely on there.
      tide.dataset.open === 'true' ? close(0) : open();
      return;
    }
    const { corner, axis } = slotAt(e.clientX, e.clientY);
    moveTo(corner, axis);
    splash(e.clientX, e.clientY, accent());
  };
  patch.addEventListener('pointerup', endDrag);
  patch.addEventListener('pointercancel', endDrag);

  // ── command palette ────────────────────────────────────────────────────────────────────────
  const input = el('input', {
    type: 'text',
    placeholder: 'Switch archipelago, view, transport…',
    'aria-label': 'Lagoon command palette',
  }) as HTMLInputElement;
  const list = el('ul', { role: 'listbox' });
  const palette = el('div', { id: 'tide-palette', hidden: '' }, el('div', { class: 'box' }, input, list));
  document.body.appendChild(palette);

  let shown: Command[] = [];
  let cursor = 0;

  /** Static commands + one per chip currently in the toolbar, so new controls need no registration. */
  function commands(): Command[] {
    const out: Command[] = opts.stations.map((s) => ({
      label: s.label,
      kind: 'archipelago',
      run: () => opts.onStation(s.id),
    }));
    out.push(
      { label: 'Region', kind: 'view', run: () => opts.onView('region') },
      { label: 'Mountpoints', kind: 'view', run: () => opts.onView('mountpoints') },
    );
    for (const chip of slot.querySelectorAll<HTMLButtonElement>('button')) {
      const text = (chip.textContent || '').trim();
      if (!text) continue;
      out.push({ label: `${text} — ${chip.title || 'toggle'}`, kind: 'toggle', run: () => chip.click() });
    }
    // The keyboard/pointer-free way to do what dragging does, for anyone who can't drag.
    for (const corner of CORNERS) {
      for (const axis of AXES) {
        out.push({
          label: `Dock lagoon controls ${CORNER_LABEL[corner]} — ${AXIS_LABEL[axis]}`,
          kind: 'dock',
          run: () => moveTo(corner, axis),
        });
      }
    }
    if (lens) out.push({ label: 'Toggle debug seam lens', kind: 'lens', run: () => lens.toggle() });
    out.push({ label: 'About this lagoon', kind: 'help', run: showAbout });
    return out;
  }

  function showAbout(): void {
    const box = palette.querySelector('.box')!;
    box.querySelector('.about')?.remove();
    const about = el('div', { class: 'about' });
    about.innerHTML = opts.about;
    box.appendChild(about);
  }

  function render(): void {
    const q = input.value.trim();
    const all = commands();
    shown = q
      ? all
          .map((c) => ({ c, hits: fuzzy(c.label, q) }))
          .filter((r): r is { c: Command; hits: number[] } => r.hits !== null)
          .sort((a, b) => score(b.hits) - score(a.hits))
          .map((r) => r.c)
      : all;
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    list.replaceChildren();
    if (!shown.length) {
      list.appendChild(el('li', { class: 'empty' }, 'Nothing matches.'));
      return;
    }
    shown.forEach((cmd, i) => {
      const hits = new Set(fuzzy(cmd.label, q) ?? []);
      const label = el('span');
      [...cmd.label].forEach((ch, at) =>
        label.appendChild(hits.has(at) ? el('mark', {}, ch) : document.createTextNode(ch)),
      );
      const row = el(
        'li',
        { role: 'option', 'aria-selected': String(i === cursor) },
        label,
        el('span', { class: 'kind' }, cmd.kind),
      );
      row.style.animationDelay = `${Math.min(i, 8) * 18}ms`;
      row.addEventListener('mouseenter', () => {
        cursor = i;
        for (const [j, node] of [...list.children].entries()) node.setAttribute('aria-selected', String(j === cursor));
      });
      row.addEventListener('click', () => run());
      list.appendChild(row);
    });
  }

  function run(): void {
    const cmd = shown[cursor];
    if (!cmd) return;
    const help = cmd.kind === 'help';
    cmd.run();
    if (!help) closePalette();
  }

  function openPalette(): void {
    palette.hidden = false;
    open();
    input.value = '';
    cursor = 0;
    render();
    input.focus();
  }

  function closePalette(): void {
    palette.hidden = true;
    palette.querySelector('.about')?.remove();
    close(0);
  }

  input.addEventListener('input', render);
  palette.addEventListener('pointerdown', (e) => {
    if (e.target === palette) closePalette();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closePalette();
    if (e.key === 'Enter') return run();
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!shown.length) return;
    cursor = (cursor + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
    for (const [j, node] of [...list.children].entries()) node.setAttribute('aria-selected', String(j === cursor));
    (list.children[cursor] as HTMLElement).scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.hidden ? openPalette() : closePalette();
    }
  });

  // ── active state ───────────────────────────────────────────────────────────────────────────
  function slide(g: { grp: HTMLElement; thumb: HTMLElement }, active: HTMLElement | null): void {
    if (!active) return;
    g.thumb.style.left = `${active.offsetLeft}px`;
    g.thumb.style.width = `${active.offsetWidth}px`;
  }

  /** Sweep a band of light across the bay — the water noticing that something changed. */
  function sheenSweep(): void {
    if (REDUCED()) return;
    const along = tide.dataset.axis === 'v' ? 'Y' : 'X';
    sheen.style.setProperty('--sheen-angle', along === 'Y' ? '180deg' : '90deg');
    sheen.animate(
      [
        { opacity: 0, transform: `translate${along}(-70%)` },
        { opacity: 1, offset: 0.35 },
        { opacity: 0, transform: `translate${along}(170%)` },
      ],
      { duration: 780, easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
  }

  let lastStation = '';
  function setActive(stationId: string, view: TideView): void {
    stationLabel = rows.find((r) => r.station.id === stationId)?.station.label ?? '';
    renderLabel();
    for (const { station, btn } of rows) {
      btn.setAttribute('aria-current', String(station.id === stationId));
    }
    const active = rows.find((r) => r.station.id === stationId)?.btn;
    if (active) {
      rail.style.top = `${active.offsetTop + 6}px`;
      rail.style.height = `${Math.max(active.offsetHeight - 12, 6)}px`;
      // Keep the mounted archipelago in view when the list is long enough to scroll.
      if (listBox.scrollHeight > listBox.clientHeight) active.scrollIntoView({ block: 'nearest' });
    }
    let viewActive: HTMLElement | null = null;
    for (const btn of viewGroup.grp.querySelectorAll<HTMLElement>('button[data-view]')) {
      const on = btn.dataset.view === view;
      btn.setAttribute('aria-current', String(on));
      if (on) viewActive = btn;
    }
    slide(viewGroup, viewActive);
    // Only on a real change — not on the initial mount, and not on a re-render of the same state.
    const key = `${stationId}:${view}`;
    if (lastStation && lastStation !== key) sheenSweep();
    lastStation = key;
  }

  // offsetTop/offsetLeft are only real once fonts have settled — re-measure when they do.
  document.fonts?.ready.then(() => {
    const activeOpt = rows.find(({ btn }) => btn.getAttribute('aria-current') === 'true')?.btn;
    if (activeOpt) {
      rail.style.top = `${activeOpt.offsetTop + 6}px`;
      rail.style.height = `${Math.max(activeOpt.offsetHeight - 12, 6)}px`;
    }
    slide(viewGroup, viewGroup.grp.querySelector<HTMLElement>('button[aria-current="true"]'));
  });

  // First visit: open once so the bay is discoverable, then let it close.
  if (!localStorage.getItem('motu:lagoon:tide-seen')) {
    localStorage.setItem('motu:lagoon:tide-seen', '1');
    window.setTimeout(open, 400);
    window.setTimeout(() => close(0), 3200);
  }

  return { setActive };
}
