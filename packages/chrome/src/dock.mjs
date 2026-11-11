// THE LAGOON'S DOCK, in one place, for the two surfaces that draw it.
//
// The dock is bundled INTO every published artifact today, and that has two costs. Changing it means
// republishing every lagoon that exists — which happened repeatedly while it was being designed — and
// it overlays the application it is only supposed to be looking at, because it has no choice: it is
// inside the same document.
//
// So it moves out, to be drawn by whoever is HOSTING the lagoon. That is two different programs: the
// host app frames a published artifact, and `motu lagoon serve` serves one directly for the dev loop
// and every runtime check. Both are node generating HTML, so both can inline what is exported here —
// and neither has its own copy, which is the whole reason this file exists rather than a second
// stylesheet in the host. Two chromes that drift is the failure this codebase keeps naming.
//
// EVERY COLOUR IS A TOKEN. The kit derives its ramp from --motu-primary and the host detects that
// from the artifact's pixels, so a greyscale application gets a greyscale dock without this file
// knowing anything about it. A literal here would be a colour that refuses to follow.
//
// The artifact keeps drawing its own dock for now, from this same string, so nothing loses its
// controls while the host side is built.

/** The dock's stylesheet. Scoped to `#tide`, so it cannot reach the page it is mounted over. */
export function motuDockCss() {
  return DOCK_CSS;
}

const DOCK_CSS = `

/* THE DOCK, as a full-height rail standing against a vertical edge.
 *
 * It was a small capsule of water that could sit in any of eight docks. That shape had one job --
 * stay out of the way -- and it did it by being small, which cost it everything else: the states a
 * region can reach had to share a corner with the region list, the rig and a hint line, so each got
 * a few square centimetres and none of them could be read at a glance.
 *
 * A rail along one vertical edge is the same promise kept differently. It claims a strip rather than
 * a corner, so the page keeps both horizontal edges -- which is where a real application puts its
 * toolbar and its mobile action row -- and in exchange the panel gets a full column: the region, the
 * states under it, and the rig at the foot, each with room to be a list rather than a chip.
 *
 * TWO DOCKS, NOT EIGHT. A full-height rail cannot sit in a corner, so the drag that used to choose
 * between eight now chooses between left and right. The reason for dragging at all is unchanged: the
 * one collision left is with whatever occupies THAT edge, and rather than guess, hand it over.
 *
 * EVERY COLOUR COMES FROM A TOKEN, and that is what makes the dock wear the app's own colour. The
 * kit derives its ramp from --motu-primary, the host detects that from the artifact's pixels, and so
 * a greyscale application gets a greyscale dock without this file knowing anything about it. A
 * literal anywhere in here is a colour that would refuse to follow.
 */
#tide {
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 2147483000;
  display: flex;
  align-items: stretch;
  font: 500 13px/1.5 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  --dock-w: min(340px, 92vw);
  --rail-w: 46px;
}
#tide[data-edge="right"] { right: 0; }
#tide[data-edge="left"] { left: 0; }

/* THE WATER IS STILL THE READOUT. HTTP is the same lagoon lit brighter and moving faster; the legacy
 * fit floods it amber. Both are inherited by every surface below, because all of them paint from
 * these same three stops. */
#tide[data-transport="http"] {
  --w-deep: color-mix(in srgb, var(--motu-water-deep, #0b6f68) 82%, #fff);
  --w-mid: color-mix(in srgb, var(--motu-water-mid, #12988f) 84%, #fff);
  --w-shallow: color-mix(in srgb, var(--motu-water-shallow, #35c2b3) 86%, #fff);
}
#tide[data-fit="legacy"] {
  --w-deep: #8a5a08;
  --w-mid: #c2870f;
  --w-shallow: #e8b53c;
  --tide-accent: #a86f0b;
}

/* ── the page keeps the strip the dock stands on ──────────────────────────────────────────── */
/*
 * THE RAIL USED TO SIT ON TOP OF THE PAGE, and a full-height rail that overlays is worse than the
 * capsule it replaced: the capsule could only ever cover one corner, this covers the whole edge, on
 * every screen, permanently. On a real region that is a clipped "Edit my page" button and a filter
 * control you cannot reach.
 *
 * So the page is inset instead, which is what a docked devtool does: reserve, do not cover.
 *
 * THE RESERVE IS THE RAIL'S WIDTH, NEVER THE PANEL'S. Insetting by the open panel would reflow the
 * whole application every time the dock is opened and closed — a layout thrash on a tool whose job is
 * to let you look at a layout. The panel is a deliberate, temporary act and is allowed to overlay;
 * the rail is permanent and is not.
 */
/* PINNED: reserve the PANEL too, so the region and the panel are both usable at once.
 *
 * The paragraph above is still right about the default — insetting on every open would reflow the
 * application each time the dock is touched. What it did not anticipate is a panel you WATCH while
 * you work: the Network log is read by doing something on the page and seeing the call appear, and
 * an overlay makes that literally impossible on the half of the region it covers. So the reserve
 * became a choice rather than a rule. Unpinned is unchanged; pinned costs one reflow, when you ask
 * for it. */
html[data-motu-dock="right"] { padding-right: var(--motu-dock-rail, 46px); }
html[data-motu-dock="right"][data-motu-dock-pin="1"] {
  padding-right: calc(var(--motu-dock-rail, 46px) + var(--motu-dock-panel, 340px));
}
html[data-motu-dock="left"][data-motu-dock-pin="1"] {
  padding-left: calc(var(--motu-dock-rail, 46px) + var(--motu-dock-panel, 340px));
}
html[data-motu-dock="left"] { padding-left: var(--motu-dock-rail, 46px); }
html[data-motu-dock="bottom"] { padding-bottom: var(--motu-dock-handle, 44px); }
/* AN APPLICATION'S OWN FIXED FURNITURE is positioned against the VIEWPORT, which no padding here can
 * move — a dialog pinned to all four viewport edges covers the reserve as happily as the page. That
 * used to be stated as a limit ("resizing the viewport is the host's job"), and it is right for the
 * RAIL,
 * which is 46px nobody is trying to interact around.
 *
 * PINNED it stops being acceptable: the whole point is to work in the region while watching the
 * panel, and every modal the application opens landed under the dock. So while pinned, BODY becomes
 * the containing block for fixed descendants — a transform is what does that — and a viewport-fixed
 * dialog resolves against the page's own box instead. Portals included: they render into the body
 * element, so they are inside it.
 *
 * The dock would be caught by the same rule, so it ESCAPES the subtree instead: while pinned its host
 * is reparented onto the document element, outside the transform entirely. Compensating with an
 * offset was the first attempt and it was wrong in the way that matters — the dock has several
 * separately-positioned fixed parts (the panel, the scrim, the scope chip), each would have needed
 * its own counter-offset, and the next one added would silently not.
 *
 * Only while pinned: this changes how the application's own layout resolves, so it happens when
 * someone asks for it and not one moment before. */
html[data-motu-dock-pin="1"] body { transform: translateZ(0); }

/* The phone-only states strip. Declared OFF here, ABOVE the media queries, because a bare display
 * rule written after them wins on every width — which is how this stylesheet has twice shipped a
 * phone rule that also applied to desktop. The max-width block turns it on. */
#tide .rail-states { display: none; }

/* ── the rail, which is the dock when it is closed ────────────────────────────────────────── */
#tide .rail-dock {
  position: relative;
  width: var(--rail-w);
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border: 0;
  color: var(--motu-on-primary, #fff);
  background: linear-gradient(180deg, var(--w-deep), var(--w-mid) 46%, var(--w-shallow));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--w-deep) 22%, transparent),
    0 10px 30px color-mix(in srgb, var(--w-deep) 26%, transparent);
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,.9,.3,1);
}
/* THE OPENING HALF fills the rail and carries what the whole thing used to: the press target, the
 * hover, the focus ring. The picker sits under it as a peer rather than inside it. */
#tide .rail-open {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
}
#tide .rail-open:hover { filter: brightness(1.06); }
#tide .rail-open:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: -4px; }
/* An ACT on the rail, not a link into the panel — square, quiet until it is on, and legible against
 * the water at any primary the lagoon happens to wear. */
#tide .rail-act {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 0;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: var(--motu-on-primary, #fff);
  background: color-mix(in srgb, var(--motu-on-primary, #fff) 16%, transparent);
}
#tide .rail-act:hover { background: color-mix(in srgb, var(--motu-on-primary, #fff) 28%, transparent); }
#tide .rail-act:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: 2px; }
#tide .rail-act[aria-pressed="true"] {
  background: var(--motu-on-primary, #fff);
  color: var(--w-deep);
}
#tide .rail-act[hidden] { display: none; }
#tide .rail-dock .mark { width: 20px; height: 20px; flex: 0 0 auto; }
/* THE ATOLL MARK — the icon's three sand islets on deep water, drawn in CSS so it wears the lagoon's
 * own water rather than a fixed blue. It is the dock's face on the rail and on the phone's mini player,
 * and the same picture the States tab draws at size. */
#tide .atoll-mark {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background:
    radial-gradient(circle at 34% 60%, var(--motu-sand, #e3c893) 0 24%, transparent 25%),
    radial-gradient(circle at 70% 30%, var(--motu-sand, #e3c893) 0 17%, transparent 18%),
    radial-gradient(circle at 72% 74%, var(--motu-sand, #e3c893) 0 11%, transparent 12%),
    var(--w-deep);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--motu-on-primary, #fff) 35%, transparent);
}
/* The mini player's two lines are the phone's; the desktop rail keeps its standing label. Declared
 * off ABOVE the media queries for the same reason as the strip below. */
#tide .rail-txt { display: none; }
#tide .rail-progress { display: none; }
#tide .kbd--word { display: none; }
#tide .motu-kbd { white-space: nowrap; }
/* The region's name, standing up along the rail. This is the one place the dock says what it is
 * showing while closed, so it takes the whole middle and truncates rather than wraps. */
#tide .rail-dock .stand {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: lowercase;
  opacity: .92;
}
#tide[data-edge="left"] .rail-dock .stand { rotate: 180deg; }
#tide .rail-dock .chev { font-size: 12px; opacity: .8; flex: 0 0 auto; }
#tide[data-open="true"] .rail-dock { display: none; }

/* THE HANDLE RIDES ON THE WATER — the switcher's rule, and the reason it moved into the masthead:
 * above it, a white bar sat on the panel's pale surface, invisible, so the sheet read as having no
 * handle at all.
 *
 * DECLARED HERE, ABOVE THE MEDIA QUERIES, and only its appearance. Whether it SHOWS is the phone's
 * business and is decided in the phone block below. Written after that block instead — which is
 * where it started — a bare display:none beats the media query at equal specificity on source
 * order, and switches the handle off in the one place it exists for. That has now happened twice in
 * this file; a base rule that only styles cannot do it a third time.
 */
#tide .grab { padding: 8px 0 2px; cursor: grab; touch-action: none; position: relative; z-index: 3; }

/* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
/* IT SLIDES, and that is why it is not a display toggle.
 *
 * A panel toggled between none and flex cannot transition — there is no interpolation between "not in
 * the layout" and "in it" — so the dock appeared and vanished while the shell's own lagoon switcher,
 * two centimetres away, slid. Two sheets on one screen behaving differently is worse than either.
 * This is the switcher's own treatment: translated out of view, transform transitioned, with
 * visibility delayed to the end of the slide so a closed panel cannot be tabbed into.
 */
#tide .panel {
  /* OUT OF FLOW, or the closed panel is 340px of the application.
   *
   * It used to be display:none when shut, which took no space; making it SLIDE meant keeping it in
   * the layout, and a flex sibling of the rail is 340px wide whether you can see it or not. The
   * container measured 386px against a 46px reserve, so a third of the page was covered by an
   * invisible panel — invisible being the reason it survived several screenshots.
   *
   * Anchored to the dock's edge instead: the rail is the only thing in flow, the container is the
   * width of the rail, and what the page reserves is what the dock occupies. */
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--dock-w);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-page);
  box-shadow: 0 0 0 1px var(--line), 0 18px 50px color-mix(in srgb, var(--w-deep) 22%, transparent);
  transform: translateX(100%);
  visibility: hidden;
  transition: transform 240ms cubic-bezier(.2,.9,.3,1), visibility 0s linear 240ms;
}
#tide[data-edge="left"] .panel { transform: translateX(-100%); right: auto; left: 0; }
#tide[data-open="true"] .panel {
  transform: none;
  visibility: visible;
  transition: transform 240ms cubic-bezier(.2,.9,.3,1), visibility 0s;
}
/* Following a finger has to be immediate; a transition here fights the drag. */
#tide[data-dragging="true"] .panel { transition: none; }

/* The masthead is the kit's, waves and all — the same header the host's own pages wear, so the dock
 * and the pages around it cannot drift apart. */
#tide .panel > .motu-bay {
  flex: 0 0 auto;
  /* The bottom padding is the shoreline's room. The swell is 40px of absolutely-positioned water
   * along the foot of the header, so anything less than that here puts the title in the sea. */
  padding: 18px 16px 30px;
  border-radius: 0;
}
/* THE SWELL IS A LAYER, NOT A ROW. Moved in from the old pill, the wave svg arrived as a flex child
 * and took a strip of height at the top of the masthead, pushing the title down and leaving a seam.
 * It is decoration: absolute, across the foot of the header where a shoreline belongs, behind
 * everything that has to be read. */
#tide .panel > .motu-bay { position: relative; overflow: hidden; }
#tide .panel > .motu-bay > svg {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  width: 100%;
  height: 40px;
  z-index: 0;
  pointer-events: none;
}
#tide .panel > .motu-bay > .sheen {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(var(--sheen-angle, 90deg), transparent, color-mix(in srgb, #fff 38%, transparent), transparent);
  opacity: 0;
}
#tide .bay-row { display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
#tide .bay-row .mark { width: 22px; height: 22px; flex: 0 0 auto; }
#tide .bay-txt { min-width: 0; flex: 1 1 auto; }
#tide .bay-txt b {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: .01em;
  color: var(--motu-on-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#tide .bay-txt small {
  display: block;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--motu-on-primary, #fff) 78%, transparent);
}
#tide .fold {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border: 0;
  cursor: pointer;
  color: var(--motu-on-primary, #fff);
  background: color-mix(in srgb, var(--motu-on-primary, #fff) 18%, transparent);
}
#tide .fold:hover { background: color-mix(in srgb, var(--motu-on-primary, #fff) 28%, transparent); }
#tide .fold:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: 2px; }
#tide .bay-share svg { display: block; margin: auto; }
/* WHAT SHARE DID. Beside the dock's own edge, never over the middle of the page you are sharing. */
#tide .share-note {
  position: fixed;
  top: 12px;
  right: calc(var(--rail-w) + 12px);
  z-index: 3;
  width: min(360px, 80vw);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--w-deep) 30%, transparent);
  font-size: 12.5px;
}
#tide[data-edge="left"] .share-note { right: auto; left: calc(var(--rail-w) + 12px); }
#tide .share-note[hidden] { display: none; }
#tide .share-note__url {
  font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  opacity: .85;
  overflow-wrap: anywhere;
  user-select: all;
  -webkit-user-select: all;
}

/* ── the searchable body ───────────────────────────────────────────────────────────────────── */
#tide .find { display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px; flex: 0 0 auto; }
#tide .find .motu-search { flex: 1 1 auto; min-width: 0; }
#tide .scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
#tide .sect { display: flex; flex-direction: column; gap: 6px; }
#tide .sect__head { display: flex; align-items: center; gap: 7px; padding: 0 2px 2px; }
#tide .sect__head .motu-cap { flex: 1 1 auto; }
#tide .sect__head .count {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}
#tide .list { position: relative; display: flex; flex-direction: column; gap: 6px; }
/* ── the States tab: one region, as a place ─────────────────────────────────────────────── */
/* Which region of the view, when there is a choice. A row of pills, never a list: a screen holds two
 * or three regions, and the choice is a switch, not a destination. */
#tide .aim { display: flex; flex-wrap: wrap; gap: 6px; }
#tide .aim[hidden] { display: none; }
#tide .aim .motu-btn { gap: 6px; }
#tide .aim__n { font-size: 10.5px; font-weight: 700; opacity: .7; font-variant-numeric: tabular-nums; }

/* THE ATOLL: the region's islands around its lagoon. Sand dots, the icon's own, on the region's water.
 * A fixed height whatever the region declares — the picture never grows; the shelves below carry the
 * names an over-full ring has to drop. */
#tide .atoll {
  position: relative;
  flex: 0 0 auto;
  height: 168px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--w-shallow) 12%, var(--surface-row, #fff));
  border: 1px solid var(--line);
  overflow: hidden;
}
#tide .atoll[hidden] { display: none; }
#tide .atoll__ring {
  position: absolute;
  left: 14%;
  right: 14%;
  top: 20%;
  bottom: 20%;
  border-radius: 50%;
  border: 2px dashed color-mix(in srgb, var(--w-mid) 45%, transparent);
  background: color-mix(in srgb, var(--w-shallow) 16%, transparent);
}
#tide .atoll__lagoon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 92px;
  min-height: 44px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
#tide .atoll__lagoon small { font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--tide-accent); }
#tide .atoll__lagoon b { font-size: 13px; }
#tide .atoll__lagoon[aria-pressed="true"] { border-color: color-mix(in srgb, var(--tide-accent) 55%, transparent); background: color-mix(in srgb, var(--surface-row, #fff) 70%, transparent); }
#tide .atoll__isle {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 44px;
  min-height: 44px;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
#tide .atoll__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--motu-sand, #e3c893);
  color: var(--motu-on-sand, #0b3d5c);
  font-size: 10.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--w-deep) 25%, transparent);
  transition: box-shadow 140ms ease;
}
#tide .atoll__name {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink-muted);
  background: color-mix(in srgb, var(--surface-row, #fff) 80%, transparent);
  border-radius: 4px;
  padding: 0 3px;
}
#tide .atoll__isle[aria-pressed="true"] .atoll__dot { box-shadow: 0 0 0 4px color-mix(in srgb, var(--motu-sand, #e3c893) 45%, transparent); }
#tide .atoll__isle[aria-pressed="true"] .atoll__name { color: var(--ink); }
/* The island whose what-if the region is IN: ringed in the water's colour, so it reads as "playing". */
#tide .atoll__isle[data-lit="true"] .atoll__dot { box-shadow: 0 0 0 3px var(--tide-accent); }
#tide .atoll__isle:focus-visible, #tide .atoll__lagoon:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; border-radius: 10px; }

/* NOW PLAYING — the front panel of a player. Deep water, the atoll as cover art, the state as the
 * title, its steps as the progress bar and the transport under it. The one dark surface in the tab,
 * so the eye lands on what is playing before it reads anything else. */
#tide .now {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  color: #fff;
  background:
    radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--w-shallow) 38%, transparent), transparent 60%),
    linear-gradient(160deg, var(--w-deep), color-mix(in srgb, var(--w-deep) 70%, #071c24));
  box-shadow: 0 10px 26px color-mix(in srgb, var(--w-deep) 30%, transparent);
}
#tide .now__head { display: flex; align-items: center; gap: 12px; min-width: 0; }
#tide .now__cover { width: 56px; height: 56px; border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.18); }
#tide .now__txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#tide .now__kicker { font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: color-mix(in srgb, var(--w-shallow) 70%, #fff); }
#tide .now__title { font-size: 15.5px; font-weight: 800; line-height: 1.3; color: #fff; }
#tide .now__segs { display: flex; gap: 4px; }
#tide .now__seg {
  flex: 1 1 0;
  height: 22px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  position: relative;
}
/* A thin bar in a tall target: the segment a thumb can hit is 22px, the one the eye reads is 6. */
#tide .now__seg::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 8px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .22);
}
#tide .now__seg--whole { cursor: default; }
#tide .now__seg[data-done="true"]::before { background: var(--w-shallow); }
#tide .now__seg[aria-current="true"]::after {
  content: "";
  position: absolute;
  right: -3px;
  top: 5px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--motu-sand, #e3c893);
  box-shadow: 0 0 0 2px var(--w-deep);
}
#tide .now__seg:focus-visible { outline: 2px solid #fff; outline-offset: 1px; border-radius: 6px; }
#tide .now__transport { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
#tide .now__step { font-size: 11px; color: rgba(255, 255, 255, .78); font-variant-numeric: tabular-nums; white-space: nowrap; }
#tide .now__step--end { text-align: right; }
#tide .now__btns { display: flex; align-items: center; gap: 10px; }
#tide .now__btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  cursor: pointer;
}
#tide .now__btn:hover:not(:disabled) { background: rgba(255, 255, 255, .14); }
#tide .now__btn:disabled { opacity: .35; cursor: default; }
#tide .now__btn--main { width: 48px; height: 48px; background: var(--motu-sand, #e3c893); color: var(--motu-on-sand, #0b3d5c); }
#tide .now__btn--main:hover:not(:disabled) { background: color-mix(in srgb, var(--motu-sand, #e3c893) 85%, #fff); }
#tide .now__btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#tide .now .state-forged { color: rgba(255, 255, 255, .8); padding: 0; }

/* THE EQUALIZER on whatever is playing. Stills under prefers-reduced-motion with every other animation. */
#tide .eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
#tide .eq i { display: block; width: 3px; height: 100%; border-radius: 1px; background: currentColor; transform-origin: bottom; animation: tide-eq 900ms ease-in-out infinite; }
#tide .eq i:nth-child(2) { animation-delay: -300ms; }
#tide .eq i:nth-child(3) { animation-delay: -600ms; }
@keyframes tide-eq {
  0%, 100% { transform: scaleY(.35); }
  50% { transform: scaleY(1); }
}

/* THE FLOWS AS A TRACKLIST — numbered, the playing one with an equalizer where its number was. */
#tide .track {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px 6px 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font: 500 13px/1.35 ui-sans-serif, system-ui, sans-serif;
  text-align: left;
  cursor: pointer;
}
#tide .track + .track { box-shadow: 0 -1px 0 var(--line); }
#tide .track:hover { background: var(--surface-row, #fff); }
#tide .track__no { display: flex; justify-content: center; font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink-faint, var(--ink-muted)); font-variant-numeric: tabular-nums; }
#tide .track__name { min-width: 0; }
#tide .track__meta { font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
#tide .track[aria-current="true"] { background: color-mix(in srgb, var(--tide-accent) 10%, #fff); box-shadow: none; font-weight: 700; color: var(--tide-accent); }
#tide .track[aria-current="true"] + .track { box-shadow: none; }
#tide .track[aria-current="true"] .track__no { color: var(--tide-accent); }
#tide .track:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 1px; }

/* THE WHAT-IFS: one album per island. Under a finger (the default here) an album is a shelf of cards
 * you swipe sideways — one row of height whatever it holds. Under a mouse (the block after this) it is
 * a row that opens into its tracklist, because sideways scrolling with a wheel is the worst gesture
 * there is. */
#tide .shelves { display: flex; flex-direction: column; gap: 12px; }
#tide .shelf { display: flex; flex-direction: column; gap: 6px; scroll-margin-top: 8px; }
#tide .shelf__head { display: flex; align-items: center; gap: 8px; }
#tide .shelf__title {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
#tide .shelf__cover {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--motu-sand, #e3c893);
  color: var(--motu-on-sand, #0b3d5c);
  font: 800 12px/1 ui-sans-serif, system-ui, sans-serif;
}
#tide .shelf__slot { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
#tide .shelf[data-aimed="true"] .shelf__slot { color: var(--tide-accent); }
#tide .shelf__count { flex: 0 0 auto; font-size: 11px; color: var(--ink-muted); }
#tide .shelf__alone {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  background: var(--surface-row, #fff);
  border-radius: 999px;
  padding: 2px 9px;
  min-height: 26px;
  font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
  color: var(--ink-muted);
  cursor: pointer;
}
#tide .shelf__track {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scroll-padding-inline: 2px;
  padding: 2px 2px 6px;
  scrollbar-width: none;
}
#tide .shelf__track::-webkit-scrollbar { display: none; }
#tide .shelf__card {
  flex: 0 0 auto;
  width: 136px;
  min-height: 64px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-row, #fff);
  color: var(--ink);
  font: 500 12.5px/1.3 ui-sans-serif, system-ui, sans-serif;
  text-align: left;
  white-space: normal;
  cursor: pointer;
}
#tide .shelf__no { display: flex; font: 600 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: color-mix(in srgb, var(--motu-sand, #e3c893) 55%, var(--ink-muted)); }
#tide .shelf__card:hover { border-color: var(--tide-accent); }
#tide .shelf__card[aria-current="true"] {
  background: color-mix(in srgb, var(--tide-accent) 12%, #fff);
  border-color: var(--tide-accent);
  font-weight: 700;
}
#tide .shelf__card[aria-current="true"] .shelf__no { color: var(--tide-accent); }
#tide .shelf__card:focus-visible, #tide .shelf__title:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; }

/* UNDER A MOUSE: albums that open into tracklists, one at a time. */
@media (hover: hover) and (pointer: fine) {
  #tide .shelves { gap: 2px; }
  #tide .shelf { gap: 0; border-radius: 12px; }
  #tide .shelf[data-open="true"] { background: var(--surface-row, #fff); box-shadow: 0 0 0 1px var(--line); padding-bottom: 4px; }
  #tide .shelf__head { padding: 6px 8px 6px 6px; border-radius: 12px; }
  #tide .shelf__head:hover { background: var(--surface-row, #fff); }
  #tide .shelf__title::after { content: "\\25B8"; font-size: 10px; color: var(--ink-muted); transition: transform 150ms ease; }
  #tide .shelf__title[aria-expanded="true"]::after { transform: rotate(90deg); }
  #tide .shelf__track { display: none; flex-direction: column; gap: 0; overflow: visible; padding: 0 6px; scroll-snap-type: none; }
  #tide .shelf[data-open="true"] .shelf__track { display: flex; }
  #tide .shelf__card {
    width: auto;
    min-height: 36px;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
  }
  #tide .shelf__card + .shelf__card { box-shadow: 0 -1px 0 var(--line); }
  #tide .shelf__card:hover { background: color-mix(in srgb, var(--tide-accent) 6%, #fff); }
  #tide .shelf__card[aria-current="true"] { box-shadow: none; }
  #tide .shelf__no { width: 20px; justify-content: center; }
}
#tide .state-forged { margin: 0; padding: 0 4px; font-size: 11px; line-height: 1.4; color: var(--ink-muted); }
/* A CARD PER ROW, not a dense line. These are the states somebody wrote down; a flow's name is a
 * sentence and needs to wrap rather than be clipped to a chip. */
#tide .motu-opt {
  align-items: flex-start;
  gap: 9px;
  padding: 10px 11px;
  border-radius: 12px;
  background: var(--surface-row);
  border: 1px solid var(--line);
  white-space: normal;
  text-align: left;
  line-height: 1.35;
}
#tide .motu-opt:hover { border-color: var(--tide-accent); }
#tide .motu-opt[aria-current="true"], #tide .motu-opt.on {
  background: color-mix(in srgb, var(--tide-accent) 10%, #fff);
  border-color: color-mix(in srgb, var(--tide-accent) 42%, transparent);
}
/* The lit edge marking the row that is showing. */
#tide .motu-opt[aria-current="true"]::before, #tide .motu-opt.on::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 9999px;
  background: var(--tide-accent);
}
#tide .motu-opt { position: relative; }
#tide .motu-opt .lamp {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--ink-faint) 55%, transparent);
}
#tide .motu-opt[aria-current="true"] .lamp, #tide .motu-opt.on .lamp { background: var(--tide-accent); }
#tide .motu-opt .sub { display: block; font-size: 10.5px; color: var(--ink-muted); font-weight: 500; }
#tide[data-open="true"] .motu-opt { animation: tide-swim 260ms cubic-bezier(.2,.9,.3,1) both; }

/* ── the command palette ──────────────────────────────────────────────────────────────────── */
.dock-palette {
  position: fixed; inset: 0; z-index: 2147483647; display: flex;
  justify-content: center; align-items: flex-start; padding-top: 14vh;
  background: color-mix(in srgb, var(--w-deep) 34%, transparent);
}
.dock-palette[hidden] { display: none; }
.dock-palette .box {
  width: min(560px, 92vw); max-height: 62vh; display: flex; flex-direction: column;
  border-radius: 16px; overflow: hidden; background: #fff;
  box-shadow: 0 0 0 1px var(--line), 0 24px 60px color-mix(in srgb, var(--w-deep) 26%, transparent);
  font: 500 13px/1.5 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
}
.dock-palette input {
  border: 0; border-bottom: 1px solid var(--line); padding: 14px 16px;
  font: 500 14px/1.4 inherit; color: var(--ink); outline: none;
}
.dock-palette ul { margin: 0; padding: 6px; list-style: none; overflow: auto; }
.dock-palette li {
  display: flex; align-items: center; gap: 10px; padding: 9px 11px;
  border-radius: 10px; cursor: pointer; color: var(--ink);
}
.dock-palette li[aria-selected="true"] { background: color-mix(in srgb, var(--tide-accent) 10%, #fff); }
.dock-palette li .kind {
  margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: var(--ink-faint);
}

/* ── the two tabs, and the seams pane ─────────────────────────────────────────────────────── */
#tide .find--filter { padding-top: 2px; }
#tide .tabs { flex: 1 1 auto; }
#tide .seams { display: none; }
/* WIDER FOR THE SHEET. States is a list of names and reads fine in a column; the region sheet is a
 * five-column table, and at 340px every cell truncates to an ellipsis. The panel widens only while
 * that tab is showing, so the dock is not permanently large for the view that does not need it. */
@media (min-width: 761px) {
  #tide .panel[data-tab="seams"] { width: min(560px, 46vw); }
}
#tide .panel[data-tab="seams"] .seams {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px 14px 12px;
}
#tide .panel[data-tab="seams"] .scroll, #tide .panel[data-tab="seams"] .find--filter { display: none; }

/* THE TALLY IS COUNTS AND NOTHING ELSE. There is no headline above it: a sentence summarising the
 * region could not be contradicted by the region, and a verdict that cannot be wrong cannot be
 * trusted either. The counts and the findings under them each name something checkable. */
/* THE SHEET: dense on purpose. It is a table to SCAN — the eye goes down the key column looking for
 * the one that is wrong — so every cell truncates to one line and the whole row carries the full text
 * in its title. Making the cells wrap would turn twenty-four keys into a page nobody reads. */
#tide .sheet { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
#tide .sheet__row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) 66px minmax(0, 1fr) minmax(0, 1.1fr) 70px;
  align-items: center;
  gap: 6px;
  padding: 5px 16px 5px 7px;
  border-radius: 7px;
  font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--surface-row);
}
#tide .sheet__row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
#tide .sheet__k { font-weight: 700; color: var(--ink); }
#tide .sheet__own {
  text-align: center;
  border-radius: 9999px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
}
#tide .sheet__own[data-kind="island"] {
  background: color-mix(in srgb, var(--tide-accent) 16%, #fff);
  color: var(--w-deep);
}
#tide .sheet__own[data-kind="host"] { background: color-mix(in srgb, var(--ink-faint) 14%, #fff); color: var(--ink-muted); }
#tide .sheet__rd, #tide .sheet__val { color: var(--ink-muted); }
#tide .sheet__moved { text-align: right; font-size: 10px; color: var(--ink-faint); }
#tide .sheet__moved[data-moved="true"] { color: var(--tide-accent); }
/* The flag sits OUTSIDE the grid so a row without one keeps the same column widths as a row with. */
#tide .sheet__flag {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--motu-caution, #b45309);
}

#tide .coverage { display: none; }
#tide .panel[data-tab="coverage"] .coverage {
  display: flex; flex-direction: column; gap: 7px;
  flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px 14px 12px;
}
#tide .panel[data-tab="coverage"] .scroll,
#tide .panel[data-tab="coverage"] .seams,
#tide .panel[data-tab="coverage"] .islands,
#tide .panel[data-tab="coverage"] .find--filter { display: none; }
#tide .coverage > * { flex: 0 0 auto; }
#tide .cov-verdict {
  padding: 7px 10px; border-radius: 9px; font: 600 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: color-mix(in srgb, var(--ink-faint) 12%, #fff); color: var(--ink-muted);
}
#tide .cov-verdict[data-verdict="reached"] { background: color-mix(in srgb, var(--tide-accent) 13%, #fff); color: var(--w-deep); }
#tide .cov-verdict[data-verdict="never-recorded"] { background: color-mix(in srgb, var(--motu-caution, #b45309) 14%, #fff); color: var(--motu-caution, #b45309); }
/* The fingerprint wraps, because it is the content of this tab rather than a label on it. */
#tide .cov-fp {
  font: 500 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink-faint); word-break: break-all;
  padding: 6px 9px; border-radius: 8px; background: var(--surface-row);
}
#tide .cov-row {
  display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: baseline;
  padding: 5px 7px; border-radius: 7px; background: var(--surface-row);
  font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#tide .cov-row__s { font-weight: 700; color: var(--tide-accent); text-align: right; }
#tide .cov-row__d { color: var(--ink-muted); overflow-wrap: anywhere; }

#tide .islands { display: none; }
#tide .isl__head { width: 100%; background: none; border: 0; font: inherit; color: inherit;
  text-align: left; cursor: pointer; }
#tide .isl__head:hover { background: var(--tide-hover, rgba(127,127,127,.12)); }
#tide .panel[data-tab="islands"] .islands {
  display: flex; flex-direction: column; gap: 8px;
  flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px 14px 12px;
}
#tide .panel[data-tab="islands"] .scroll,
#tide .panel[data-tab="islands"] .seams,
#tide .panel[data-tab="islands"] .find--filter { display: none; }
/* A CARD KEEPS ITS OWN HEIGHT. These panes are flex columns that scroll, and a flex child shrinks by
 * default when the column runs out of room — so the cards were squeezed and then clipped by their own
 * overflow, losing the last prop row and the summary line under it. Measured: 112px tall around 152px
 * of content. The pane scrolls; the cards do not compress. */
#tide .islands > *, #tide .seams > * { flex: 0 0 auto; }
#tide .isl { border: 1px solid var(--line); border-radius: 11px; background: var(--surface-row); overflow: hidden; }
#tide .isl__head {
  display: grid; grid-template-columns: 8px minmax(0, 1fr) minmax(0, 1.1fr) auto;
  align-items: center; gap: 7px; padding: 8px 10px;
  background: color-mix(in srgb, var(--tide-accent) 6%, #fff);
  font: 600 11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#tide .isl__head > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#tide .isl__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
#tide .isl__dot[data-tone="broken"] { background: var(--motu-danger, #b91c1c); }
#tide .isl__dot[data-tone="warn"] { background: var(--motu-caution, #b45309); }
#tide .isl__dot[data-tone="ok"] { background: var(--tide-accent); }
#tide .isl__slot { font-weight: 700; color: var(--ink); }
#tide .isl__tag, #tide .isl__meta { color: var(--ink-muted); font-weight: 500; }
#tide .isl__meta { font-size: 10px; }
#tide .isl__scn { margin-left: auto; flex: 0 0 auto; min-width: 18px; padding: 1px 6px; border-radius: 999px;
  font-size: 10px; font-weight: 700; text-align: center;
  background: var(--tide-accent, #0f766e); color: var(--motu-on-primary, #fff); }
#tide .isl__scn--none { background: none; color: var(--ink-muted); font-weight: 500; }
#tide .isl__body { padding: 7px 10px 9px; display: flex; flex-direction: column; gap: 3px; }
#tide .isl__prop {
  display: grid; grid-template-columns: minmax(0, 0.9fr) 64px minmax(0, 1.4fr);
  gap: 7px; align-items: center;
  font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#tide .isl__prop > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
#tide .isl__pn { font-weight: 700; color: var(--ink); }
#tide .isl__pv { color: var(--ink-muted); }
#tide .isl__ps {
  text-align: center; border-radius: 9999px; padding: 1px 6px; font-size: 9.5px; font-weight: 700;
  background: color-mix(in srgb, var(--ink-faint) 14%, #fff); color: var(--ink-muted);
}
/* THE TWO THAT MEAN SOMETHING IS WRONG: default is an island rendering on nothing, and
 * bound-empty is a wire that exists with nothing on it. The rest are ordinary. */
#tide .isl__ps[data-state="default"] { background: color-mix(in srgb, var(--motu-danger, #b91c1c) 14%, #fff); color: var(--motu-danger, #b91c1c); }
#tide .isl__ps[data-state="bound-empty"] { background: color-mix(in srgb, var(--motu-caution, #b45309) 16%, #fff); color: var(--motu-caution, #b45309); }
#tide .isl__ps[data-state="bound"] { background: color-mix(in srgb, var(--tide-accent) 14%, #fff); color: var(--w-deep); }
#tide .isl__did { margin: 4px 0 0; font-size: 10.5px; color: var(--ink-faint); font-weight: 500; }

#tide .seam-notice {
  margin: 0; padding: 6px 9px; border-radius: 8px; font-size: 11px; font-weight: 600;
  background: color-mix(in srgb, var(--motu-caution, #b45309) 12%, #fff);
  color: var(--motu-caution, #b45309);
}
#tide .seam-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border-radius: 7px;
  background: var(--surface-row);
  font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#tide .seam-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
/* A NETWORK ROW IS A BUTTON, so the payload under it can be opened from the keyboard as well as the
   mouse. Everything here is undoing a button's own defaults so it still lays out as a row. */
#tide .seam-row--btn {
  width: 100%;
  /* A FIFTH COLUMN for the chevron. The seam-row rule declares four, so the ::after became a fifth
     grid ITEM and wrapped onto a line of its own under every row. (No backticks in this sheet: it is
     a JS template literal and one ends it. That is three times in one session.) */
  grid-template-columns: 8px minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 1fr) 10px;
  border: 0;
  text-align: left;
  color: inherit;
  cursor: pointer;
  font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#tide .seam-row--btn:hover { background: var(--surface-row-hover, var(--surface-row)); }
#tide .seam-row--btn:focus-visible { outline: 2px solid var(--motu-primary, #0f766e); outline-offset: 1px; }
/* The chevron is the affordance; rotating it is how an accordion says which way it goes. */
#tide .seam-row--btn::after {
  /* The literal character, not a CSS unicode escape. This whole sheet is a JS template literal, where
     a backslash followed by a digit opens an OCTAL escape and the module refuses to parse — and the
     comment explaining that originally contained one, so it failed twice for the same reason. The
     stylesheet guard caught both, which is what it is for. */
  content: "›";
  justify-self: end;
  opacity: .55;
  transition: transform .12s ease;
}
#tide .seam-row--btn[aria-expanded="true"]::after { transform: rotate(90deg); }
#tide .wire-call { display: grid; gap: 3px; }
/* The gesture that caused the run below it. Quiet: it is a label on the log, not a row in it. */
#tide .wire-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 6px 2px 1px;
  font: 600 10px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
#tide .wire-head__t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tide .wire-head__n { margin-left: auto; flex: 0 0 auto; opacity: .75; }
/* SELECTABLE AND WRAPPED, which is the whole reason this is not a title attribute: a payload you
   cannot copy is a payload you end up retyping. Capped so one large body cannot own the panel. */
#tide .wire-detail {
  margin: 0 0 4px;
  padding: 7px 9px;
  max-height: 260px;
  overflow: auto;
  border-radius: 7px;
  background: var(--surface-sunken, rgba(0,0,0,.05));
  font: 400 10.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
#tide .wire-detail[hidden] { display: none; }
#tide .seam-row__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
#tide .seam-row[data-tone="broken"] .seam-row__dot { background: var(--motu-danger, #b91c1c); }
#tide .seam-row[data-tone="warn"] .seam-row__dot { background: var(--motu-caution, #b45309); }
#tide .seam-row[data-tone="ok"] .seam-row__dot { background: var(--tide-accent); }
#tide .seam-row__l { font-weight: 700; color: var(--ink); }
/* WHICH DOOR an ask left by, as a chip in front of the name — the three seams read as one list only
   if each row says which one it belongs to. Muted on purpose: the name is what is being read. */
#tide .seam-door {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--ink-muted);
  border: 1px solid var(--line);
  background: #fff;
}
#tide .seam-row__d, #tide .seam-row__r { color: var(--ink-muted); }

#tide .seam-tally { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 4px; }
#tide .seam-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 9999px;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-muted);
}
#tide .seam-count i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
#tide .seam-count[data-tone="broken"] i { background: var(--motu-danger, #b91c1c); }
#tide .seam-count[data-tone="warn"] i { background: var(--motu-caution, #b45309); }
#tide .seam-count[data-tone="ok"] i { background: var(--tide-accent); }

#tide .seam-find {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding: 10px 11px 11px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-row);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
}
#tide .seam-find:hover { border-color: var(--tide-accent); }
#tide .seam-find::before {
  content: "";
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 9999px;
  background: var(--ink-faint);
}
#tide .seam-find[data-tone="broken"]::before { background: var(--motu-danger, #b91c1c); }
#tide .seam-find[data-tone="warn"]::before { background: var(--motu-caution, #b45309); }
#tide .seam-find__t { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 12.5px; }
#tide .seam-find__t i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: currentColor; opacity: .5; }
#tide .seam-find__d { color: var(--ink-muted); font-size: 11.5px; line-height: 1.45; font-weight: 500; }

/* ── the two tabs, and the seams pane ─────────────────────────────────────────────────────── */
#tide .tabs { flex: 1 1 auto; }
#tide .find--filter { padding-top: 2px; }
#tide .seams { display: none; }
#tide .panel[data-tab="seams"] .seams {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px 14px 12px;
}
#tide .panel[data-tab="seams"] .scroll, #tide .panel[data-tab="seams"] .find--filter { display: none; }
#tide .seam-tally { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 4px; }
#tide .seam-count {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px;
  border-radius: 9999px; border: 1px solid var(--line); background: #fff;
  font-size: 11px; font-weight: 600; color: var(--ink-muted);
}
#tide .seam-count i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
#tide .seam-count[data-tone="broken"] i { background: var(--motu-danger, #b91c1c); }
#tide .seam-count[data-tone="warn"] i { background: var(--motu-caution, #b45309); }
#tide .seam-count[data-tone="ok"] i { background: var(--tide-accent); }
#tide .seam-find {
  position: relative; display: flex; flex-direction: column; gap: 5px;
  padding: 10px 11px 11px 14px; border-radius: 12px;
  border: 1px solid var(--line); background: var(--surface-row); color: var(--ink);
}
#tide .seam-find::before {
  content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px;
  border-radius: 9999px; background: var(--ink-faint);
}
#tide .seam-find[data-tone="broken"]::before { background: var(--motu-danger, #b91c1c); }
#tide .seam-find[data-tone="warn"]::before { background: var(--motu-caution, #b45309); }
#tide .seam-find__t { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 12.5px; }
#tide .seam-find__t i { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: currentColor; opacity: .5; }
#tide .seam-find__d { color: var(--ink-muted); font-size: 11.5px; line-height: 1.45; font-weight: 500; }

/* ── the rig ───────────────────────────────────────────────────────────────────────────────── */
#tide .rig {
  flex: 0 0 auto;
  border-top: 1px solid var(--line);
  padding: 10px 14px 12px;
  background: var(--surface-panel);
}
#tide .rig__head { display: flex; align-items: center; gap: 6px; padding-bottom: 8px; }
#tide .rig__head .motu-cap { flex: 1 1 auto; }
#tide .rig__step {
  width: 24px;
  height: 22px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
#tide .rig__step:hover { border-color: var(--tide-accent); color: var(--tide-accent); }
#tide .rig__step:focus-visible { outline: 2px solid var(--tide-accent); outline-offset: 2px; }
/* The chips the toolbar mounts land in here beside the dock's own, so a control added by another
 * package is styled and reachable with no registration. */
#tide .rig__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
#tide .rig__pills .slot { display: contents; }
/* ONE FAMILY OF PILLS, whoever mounted them. The transport and fit chips come from @motu/core's
 * toolbar and the Baselines link and the lens are the dock's own, so without this the rig is three
 * different button designs in one row. Styled by POSITION rather than by class for the same reason
 * the palette reads the chips rather than registering them: a control another package adds later
 * should look right without this file being told about it. */
#tide .rig__pills > button,
#tide .rig__pills > a,
#tide .rig__pills .slot > button,
#tide .rig__pills .slot > a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: 9999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font: 600 11.5px/1 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  letter-spacing: .01em;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
#tide .rig__pills > button:hover,
#tide .rig__pills > a:hover,
#tide .rig__pills .slot > button:hover,
#tide .rig__pills .slot > a:hover { border-color: var(--tide-accent); color: var(--tide-accent); }
#tide .rig__pills [aria-pressed="true"],
#tide .rig__pills [aria-current="true"] {
  background: var(--tide-accent);
  border-color: var(--tide-accent);
  color: var(--motu-on-primary, #fff);
}
/* The view toggle keeps its sliding thumb — it is a fixed pair, which is what a segmented control is
 * for — but it has to read at the same weight as the pills beside it. */
#tide .rig__pills .motu-segmented { background: #fff; border: 1px solid var(--line); }
#tide .rig__pills .motu-segmented button { color: var(--ink-muted); font-weight: 600; }
#tide .rig__pills .motu-segmented button[aria-current="true"] { color: var(--motu-on-primary, #fff); }
#tide .hint { color: var(--ink-faint); font-size: 10.5px; font-weight: 500; letter-spacing: .02em; }
#tide .rig__status:empty { display: none; }
#tide .rig__status {
  margin: 7px 0 0; font: 500 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink-muted); overflow-wrap: anywhere;
}

/* ── mobile: a sheet from the bottom, and a handle to pull it ─────────────────────────────── */
/*
 * A full-height rail is a desktop shape. On a phone it would eat a tenth of the width permanently,
 * and the panel at 92vw is a page rather than a panel — so below this width the dock becomes what a
 * phone expects: a handle on the bottom edge, and a sheet that comes up from it.
 *
 * IT MUST NOT FIGHT THE LAGOON SWITCHER. The host's shell puts its own sheet on this same edge, and
 * that one belongs to the page around this frame rather than to the region inside it. Two sheets
 * arriving from the same edge is one too many, so the shell stamps the frame while its own is open
 * and the dock stands down -- see the rule at the end.
 */
/* BESIDE THE DOCK, NOT INSIDE IT. In the masthead this vanished with the panel — and a scope you
   cannot see is one you cannot tell you are in, which was the original complaint. Fixed to the page
   at the bottom of the rail's edge, so it is on screen whether the panel is open, shut or sliding,
   and it is the one control that is always reachable on a phone. Clear of the rail by its width. */
#tide .scope { position: fixed; bottom: 12px; right: calc(var(--rail-w) + 10px); z-index: 4;
  display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 10px;
  border-radius: 999px; background: var(--motu-primary, #0f766e); color: var(--motu-on-primary, #fff);
  font-size: 12px; font-weight: 600; max-width: min(60vw, 320px);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--w-deep, #000) 30%, transparent); }
/* Docked left: mirror it, or it sits under the rail. */
#tide[data-edge="left"] .scope { right: auto; left: calc(var(--rail-w) + 10px); }
#tide .scope[hidden] { display: none; }
#tide .scope__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: 0 0 auto; opacity: .8; }
#tide .scope__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tide .scope__x { margin-left: auto; flex: 0 0 auto; width: 18px; height: 18px; line-height: 1;
  border: 0; border-radius: 50%; cursor: pointer; font-size: 14px;
  background: rgba(255,255,255,.22); color: inherit; }
#tide .scope__x:hover { background: rgba(255,255,255,.38); }
#tide .scope__x:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: 2px; }
/* The pin, beside the fold. Same shape as the fold so the two read as one pair of controls. */
#tide .bay-pin {
  flex: 0 0 auto;
  width: 24px; height: 24px;
  border: 0; border-radius: 7px;
  cursor: pointer;
  background: rgba(255,255,255,.18);
  color: inherit;
  font-size: 13px; line-height: 1;
}
#tide .bay-pin:hover { background: rgba(255,255,255,.32); }
#tide .bay-pin[aria-pressed="true"] { background: var(--motu-on-primary, #fff); color: var(--motu-primary-deep, #0b5b55); }
#tide .bay-pin:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: 2px; }

/* The decision count on the Seams tab — OUTSIDE the phone media query, which is where it first
   landed and where it silently did nothing on a desktop viewport. Sized to two digits and no wider:
   a badge that grows changes the tab's width, which moves the segmented thumb under the cursor. */
#tide .tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25em;
  height: 1.25em;
  margin-left: 0.4em;
  padding: 0 0.3em;
  border-radius: 999px;
  background: #b45309;
  color: #fff;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
/* The display rule above beats the bare hidden attribute, so say it explicitly — otherwise a region
   with nothing to decide shows an empty pill, which reads as a badge whose number failed to load.
   (No backticks in this string: it is a JS template literal, and one would end it. There is a test
   named for that hazard in @motu/host, which is how well known it is.) */
#tide .tab-badge[hidden] { display: none; }

@media (max-width: 760px) {
  #tide {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    display: block;
    --dock-w: auto;
  }
  /* ON A PHONE THE DOCK IS A BOTTOM BAR, so "beside the rail" is above it, not left of it. Anchored
     to the bar rather than a guessed height: the rail is the bar, so sit on its top edge. */
  #tide .scope { right: 10px; left: auto; bottom: calc(100% + 10px); position: absolute; }

  #tide .rail-dock {
    /* FULL WIDTH, because a handle is something a thumb aims at. Left as auto it shrank to its
     * content and sat in the bottom-left corner, which reads as a stray chip rather than the edge of
     * a sheet you can pull. */
    width: 100%;
    /* ONE ROW: the mini player. What is playing (the opening half, which takes the width), the two acts
     * you take while watching it — step, share — and the picker. A grid rather than flex so the
     * opening half can shrink to its ellipsis while the buttons keep their size. */
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas: 'open states pick';
    align-items: center;
    column-gap: 4px;
    /* A DETERMINISTIC BAR, AND NO SAFE-AREA INSET AT ALL.
     *
     * On Firefox for Android this arrived about twice as tall as anywhere else, because its height
     * was whatever content plus padding came to and the safe-area inset was folded into the same
     * shorthand.
     *
     * acme hit exactly this and fixed it by DELETING every env(safe-area-inset-bottom) rather than
     * working around it (acme e0eeea7, "fix: firefox mobile bottom bar padding", which also
     * dropped viewportFit: 'cover'). Nothing motu serves sets viewport-fit=cover, so these insets are
     * specified to be zero here and buy nothing — while an engine that reports one anyway silently
     * doubles a bar whose height was never stated. So: state the height, and do not ask.
     */
    height: 60px;
    min-height: 60px;
    padding: 0 8px 0 12px;
    border-radius: 16px 16px 0 0;
    background: linear-gradient(90deg, var(--w-deep), var(--w-mid) 62%, var(--w-shallow));
  }
  #tide .rail-open { flex-direction: row; gap: 10px; width: auto; min-width: 0; height: 60px; grid-area: open; text-align: left; }
  #tide .rail-act { grid-area: pick; width: 40px; height: 40px; border-radius: 12px; font-size: 16px; }
  /* The pin is a desktop control: there is no width to reserve beside a bottom sheet. */
  #tide .bay-pin:not(.bay-share) { display: none; }
  /* The bar carries Share already; the masthead's copy would be the same act twice on one screen. */
  #tide .bay-share { display: none; }

  #tide .atoll-mark { width: 36px; height: 36px; border-radius: 10px; }
  #tide .rail-dock .stand { display: none; }
  #tide .rail-txt { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; line-height: 1.25; }
  #tide .rail-txt__title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #tide .rail-txt__line { display: flex; align-items: center; gap: 6px; min-width: 0; }
  #tide .rail-txt__sub { font-size: 11.5px; font-weight: 500; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  #tide .rail-txt__flag {
    flex: 0 0 auto;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--motu-sand, #e3c893);
    color: var(--motu-on-sand, #0b3d5c);
    font-size: 10.5px;
    font-weight: 800;
    line-height: 16px;
  }
  #tide .rail-txt__flag[hidden] { display: none; }

  #tide .rail-states {
    grid-area: states;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  /* After the display rule, so hiding actually hides: a bare [hidden] loses to #tide .rail-states. */
  #tide .rail-states[hidden] { display: none; }
  #tide .rail-chip {
    flex: 0 0 auto;
    width: 40px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 600 20px/1 ui-sans-serif, system-ui, sans-serif;
    color: var(--motu-on-primary, #fff);
    background: transparent;
    cursor: pointer;
  }
  #tide .rail-chip:hover { background: color-mix(in srgb, var(--motu-on-primary, #fff) 16%, transparent); }
  #tide .rail-chip[hidden] { display: none; }
  #tide .rail-chip:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: -2px; }
  #tide .rail-chip--step:disabled { opacity: .4; cursor: default; }
  #tide .rail-dock .chev { display: none; }
  /* THE MINI PLAYER'S PROGRESS, along its top edge: the playing flow's steps, or one bar for a state
   * that simply is. Inside the rounded corners, so it reads as part of the bar and not a border. */
  #tide .rail-dock { position: relative; }
  #tide .rail-progress {
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 3px;
    display: flex;
    gap: 3px;
  }
  #tide .rail-progress i { flex: 1 1 0; border-radius: 0 0 2px 2px; background: color-mix(in srgb, var(--motu-on-primary, #fff) 22%, transparent); }
  #tide .rail-progress i[data-done="true"] { background: var(--motu-sand, #e3c893); }
  #tide .rail-chip svg { display: block; }

  /* The note rises above the bar, full width, where the thumb that pressed Share already is. */
  #tide .share-note { top: auto; left: 10px; right: 10px; width: auto; bottom: calc(var(--motu-dock-handle, 60px) + 10px); }
  #tide[data-edge="left"] .share-note { left: 10px; }
  #tide[data-open="true"] .share-note { bottom: calc(76vh + 10px); }

  /* FIND, BY NAME. There is no Ctrl/Cmd-K on a phone, so the button says what it does. */
  #tide .kbd--keys { display: none; }
  #tide .kbd--word { display: inline; }
  .dock-palette { padding-top: 6vh; }
  .dock-palette .box { max-height: 70vh; }
  .dock-palette li { min-height: 44px; }
  /* A shelf is swiped, not dragged by a bar: no scrollbar under each one on a touch screen. */
  #tide .shelf__track { scrollbar-width: none; }
  #tide .shelf__track::-webkit-scrollbar { display: none; }
  #tide .panel {
    position: fixed;
    /* RESET THE TOP the edge-docked rule sets. It anchors the panel top 0 / bottom 0 so the desktop
     * panel spans its edge without being in flow — inherited here that over-constrains the box, which
     * resolves by honouring the top and dropping the bottom, so the sheet grew from the TOP of the
     * screen with 24vh of empty gradient under it. A sheet is measured from the bottom edge up. */
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 76vh;
    border-radius: 16px 16px 0 0;
    overflow: hidden;
    /* THE LENS'S OWN TREATMENT, which the switcher already wears: this surface, this shadow, a
     * backdrop blur. A flat page background reads as a different material to everything else motu
     * puts over a lagoon. */
    background: var(--surface-panel);
    backdrop-filter: blur(14px) saturate(1.35);
    -webkit-backdrop-filter: blur(14px) saturate(1.35);
    box-shadow: 0 -14px 40px color-mix(in srgb, var(--w-deep) 22%, transparent);
    transform: translateY(100%);
  }
  #tide[data-edge="left"] .panel { transform: translateY(100%); }
  #tide[data-open="true"] .panel { transform: none; }
  #tide .panel > .motu-bay { border-radius: 16px 16px 0 0; }
  /* A SHEET, NOT A PANEL THAT HAPPENS TO BE AT THE BOTTOM. The shell's lagoon switcher comes up the
   * same edge with a backdrop and a grab bar, and two things that behave differently while looking
   * the same is worse than either. */
  #tide .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: -1;
    background: color-mix(in srgb, var(--w-deep) 38%, transparent);
    opacity: 0;
    pointer-events: none;
    transition: opacity 200ms ease;
  }
  #tide[data-open="true"] .scrim { opacity: 1; pointer-events: auto; }
  #tide .grab { display: block; }
}
/* The grab bar and the backdrop are the phone's story only; on a desktop rail they would be furniture
 * with nothing to do.
 *
 * SCOPED TO THE DESKTOP RATHER THAN LEFT UNCONDITIONAL, because this sits after the phone block and
 * source order beats a media query at equal specificity: as a bare rule it switched them off on the
 * phone too, which is where they are the entire point. */
@media (min-width: 761px) {
  #tide .grab, #tide .scrim { display: none; }
}
#tide .grab i { display: block; width: 40px; height: 4px; margin: 0 auto; border-radius: 999px; background: rgba(255, 255, 255, .5); }

/* THE SHELL'S SHEET WINS. Same origin, so the host sets this on the frame's own root when it opens
 * the lagoon switcher; the dock steps aside rather than stacking a second sheet on the same edge. */
:root[data-motu-shell-sheet="open"] #tide,
:root[data-motu-shell-sheet="open"] #tide-calls,
#tide[data-shell-sheet="open"] { opacity: 0; pointer-events: none; }

@keyframes tide-swim {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  #tide *, #tide *::before { animation: none !important; transition: none !important; }
}

/* ── THE CALL TOASTER: a call, the moment it lands ─────────────────────────────────────────── */
/*
 * WHY IT EXISTS AT ALL. The lagoon answers requests without touching the network, so the browser's
 * own Network panel is empty by construction -- a screen can fire nine calls and look, to every
 * instrument a person has, like a screen that did nothing. The Network list under Seams says what
 * happened, and says it only to somebody who already suspected something and went looking. This is
 * the same fact delivered unprompted: you pressed save, a card slid in saying POST /rest/v1/rpc/save
 * -> 200, and the question never had to be asked.
 *
 * SMALL, AND ON THE DOCK'S OWN EDGE. It is chrome over an application it is only looking at, so it
 * claims the strip the dock already claimed and nothing else. It never takes the pointer except on
 * the cards themselves, and a card is a button: pressing it opens the panel on Seams, where the
 * whole run is, with its payload.
 */
#tide-calls {
  position: fixed;
  bottom: 14px;
  z-index: 2147483001;
  display: flex;
  /* NEWEST NEAREST THE DOCK. The stack is anchored to the bottom edge and grows upward, so appending
   * puts the card that just landed where the eye already is and pushes the older ones away. */
  flex-direction: column;
  gap: 6px;
  width: min(320px, 76vw);
  /* THE STRIP IS THE RAIL'S, so the cards stand beside it rather than on it. */
  margin-inline: 8px;
  pointer-events: none;
  font: 500 11px/1.4 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
}
#tide-calls[data-edge="right"] { right: 46px; }
#tide-calls[data-edge="left"] { left: 46px; }
/* On a phone the dock IS the bottom edge, so the cards rise above the bar instead of beside it. */
@media (max-width: 760px) {
  #tide-calls { left: 8px; right: 8px; width: auto; bottom: 74px; }
}
/* NOTHING TO SAY, NO SURFACE. An empty stack with padding is a permanent smudge on the page. */
#tide-calls:empty { display: none; }
/* ABOVE THE SCOPE CHIP when there is one. The chip is fixed to the same corner, so a card landing on
 * an island-scoped lagoon sat on top of "x-member-results ×" -- the one control that says how to get
 * back to the whole region. */
#tide-calls[data-scoped="true"] { bottom: 54px; }
/* AND NOTHING WHILE THE PANEL IS OPEN, which stands in the same strip and says all of this at
 * length. See the open() handler for why that is a rule rather than an offset. */
#tide-calls[data-open="true"] { display: none; }

#tide-calls .call {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 3px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0 9px;
  width: 100%;
  padding: 7px 9px 7px 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-page);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--w-deep, #0b6f68) 18%, transparent);
  color: var(--ink);
  text-align: left;
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  animation: tide-call-in 200ms cubic-bezier(.22,.9,.3,1) both;
}
#tide-calls .call:hover { background: var(--surface-row, var(--surface-page)); }
#tide-calls .call:focus-visible { outline: 2px solid var(--motu-primary, #0f766e); outline-offset: 2px; }
/* THE TONE IS A BAND DOWN THE EDGE, not a tinted card: the URL has to stay as readable at 500 as it
 * is at 200, and a red wash behind monospace text is the first thing to go. */
#tide-calls .call__tone {
  grid-row: 1 / span 2;
  align-self: stretch;
  background: var(--motu-neutral, #8d8578);
}
#tide-calls .call[data-tone="ok"] .call__tone { background: var(--motu-ok, #0f766e); }
#tide-calls .call[data-tone="warn"] .call__tone { background: var(--motu-caution, #b45309); }
#tide-calls .call[data-tone="broken"] .call__tone { background: var(--motu-danger, #b91c1c); }
/* THE ADDRESS, WHOLE OR NOT AT ALL UP TO TWO LINES. A query string is where the answer usually is
 * ("it asked for the wrong club"), so this wraps rather than truncating at the query string. */
#tide-calls .call__url {
  grid-column: 2;
  min-width: 0;
  font: 600 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
#tide-calls .call__verb {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  color: var(--ink-muted);
}
/* THE STATUS, in the tone's own colour and in the corner the eye lands on. */
#tide-calls .call__status {
  grid-column: 3;
  grid-row: 1;
  align-self: center;
  font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--motu-neutral, #8d8578);
}
#tide-calls .call[data-tone="ok"] .call__status { color: var(--motu-ok, #0f766e); }
#tide-calls .call[data-tone="warn"] .call__status { color: var(--motu-caution, #b45309); }
#tide-calls .call[data-tone="broken"] .call__status { color: var(--motu-danger, #b91c1c); }
#tide-calls .call__meta {
  grid-column: 2 / span 2;
  color: var(--ink-faint);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* REPEATS COUNT RATHER THAN STACK. A save fans out into a write and its refetches; nine cards for
 * one press is a wall, and the ninth pushes the first off before it can be read. */
#tide-calls .call__n {
  grid-column: 3;
  grid-row: 2;
  justify-self: end;
  color: var(--ink-muted);
  font-size: 10px;
  font-weight: 700;
}
@keyframes tide-call-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  #tide-calls .call { animation: none; }
}

/* ── drag targets: two bands, one per edge ────────────────────────────────────────────────── */
#tide-targets {
  position: fixed;
  inset: 0;
  z-index: 2147482999;
  display: none;
  pointer-events: none;
}
#tide-targets[data-on="true"] { display: block; }
#tide-targets i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--rail-w, 46px);
  border-radius: 0;
  background: color-mix(in srgb, var(--tide-accent) 12%, transparent);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tide-accent) 32%, transparent);
  opacity: .5;
  transition: opacity 140ms ease, background 140ms ease;
}
#tide-targets i[data-near="true"] {
  opacity: 1;
  background: color-mix(in srgb, var(--tide-accent) 22%, transparent);
}
#tide-targets i[data-edge="left"] { left: 0; }
#tide-targets i[data-edge="right"] { right: 0; }
`;

/**
 * Mount the dock over a lagoon, from OUTSIDE it.
 *
 * Written as a real function so node parses it and there is one definition; serialised for the page
 * by `motuDockJs()` below, because the two consumers are node programs writing HTML and neither has
 * a bundler in that path.
 *
 * ONE IMPLEMENTATION, TWO PLACEMENTS. The host app frames a published artifact and mounts this in its
 * own document; `motu lagoon serve` has no frame and mounts it in the lagoon's own. The only thing
 * that differs is which window holds the lagoon, so that is the only thing the caller passes.
 *
 * It drives `__motuLagoonControl` and reads `__motuLagoonStates` — the artifact's catalogue and its
 * control surface. Neither needs the artifact to be republished when anything here changes, which is
 * the entire point.
 */
function motuMountDock(opts) {
  var mountEl = opts.mount;
  var lagoonWindow = opts.lagoonWindow;
  var el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { n.append(c); });
    return n;
  };
  /** A chain link, drawn: the one glyph the Share buttons need, in currentColor so it follows the water. */
  function shareIcon() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1');
    svg.appendChild(p);
    return svg;
  }

  // `data-motu-chrome`: lagoon furniture, never an island's output (see cli lib/island-render.mjs).
  var tide = el('div', { id: 'tide', 'data-open': 'false', 'data-motu-chrome': '' });
  // A STRIP, NOT A BUTTON. It used to be one button that opened the panel; it now holds more than one
  // act, and a button inside a button is not a thing. The opening half is still a button, so keyboard
  // and screen readers get it for free.
  var railLabel = el('span', { class: 'stand' }, ['lagoon']);
  /**
   * THE MINI PLAYER'S TWO LINES — phone only. What the region is playing, and where: the state's own
   * name on top (that is what you are watching), the region and the step under it. The desktop rail
   * keeps its standing label; the phone bar is wide enough to say a sentence, so it says one.
   */
  var railTitle = el('b', { class: 'rail-txt__title' }, ['']);
  var railSub = el('small', { class: 'rail-txt__sub' }, ['']);
  var railFlag = el('span', { class: 'rail-txt__flag', hidden: '' }, ['']);
  var railTxt = el('span', { class: 'rail-txt' }, [railTitle, el('span', { class: 'rail-txt__line' }, [railSub, railFlag])]);
  var railOpen = el('button', {
    class: 'rail-open', type: 'button', 'aria-label': 'Lagoon controls', 'aria-expanded': 'false',
  }, [el('span', { class: 'atoll-mark', 'aria-hidden': 'true' }), railLabel, railTxt, el('span', { class: 'chev' }, ['‹'])]);
  /**
   * THE PICKER, ON THE RAIL, reachable without opening anything.
   *
   * Every other control is a mode or a report and belongs in the panel. This one is "point at a thing
   * on the page" — and the panel is 560px of the page, sitting between you and whatever you meant to
   * point at. The rail is the state where the page is unobstructed, so the picker lives there.
   */
  var pick = el('button', {
    class: 'rail-act', type: 'button', 'aria-pressed': 'false',
    title: 'Point at an island on the page to inspect it (Esc to stop)',
    'aria-label': 'Pick an island on the page',
  }, ['⌖']);
  /**
   * THE PHONE BAR IS A MINI PLAYER — the state you are watching, and the two acts you take while
   * watching it.
   *
   * It used to carry every state of the aimed region as a row of chips. That is a list, and a list
   * on a bar grows with the region: a scrolling strip of sentences truncated to 46vw, read one chip
   * at a time. What a person does WHILE looking at the page is smaller than that — step the flow that
   * is playing, and hand the address to someone — so that is all the bar carries. Choosing another
   * state is choosing from a list, and the list is the sheet's.
   *
   * Hidden outright on desktop, where the panel sits beside the page and carries the same acts.
   */
  var stepPrev = el('button', { class: 'rail-chip rail-chip--step', type: 'button', 'aria-label': 'Previous' });
  var stepNext = el('button', { class: 'rail-chip rail-chip--step', type: 'button', 'aria-label': 'Next' });
  /** The playing flow's progress, along the bar's top edge — the line every mini player has. */
  var railProgress = el('div', { class: 'rail-progress', 'aria-hidden': 'true' });
  var railShare = el('button', {
    class: 'rail-chip rail-chip--share', type: 'button', 'aria-label': 'Copy a link to this state', title: 'Copy a link to this state',
  }, [shareIcon()]);
  var railStates = el('div', { class: 'rail-states', role: 'group', 'aria-label': 'Step and share' }, [stepPrev, stepNext, railShare]);
  var rail = el('div', { class: 'rail-dock' }, [railProgress, railOpen, railStates, pick]);

  var bayTitle = el('b', {}, ['—']);
  var baySub = el('small', {}, ['']);
  var fold = el('button', { class: 'fold', type: 'button', 'aria-label': 'Close lagoon controls' }, ['›']);
  // INSIDE the bay, not above it. The handle is white, so on the panel's pale surface it was
  // invisible and the sheet read as having none; on the water it reads exactly as the switcher's does.
  var grab = el('span', { class: 'grab' }, [el('i')]);
  // THE SCOPE, AS A THING YOU CAN CLOSE. Prose in the subtitle ("press it again in Islands to leave")
  // told you the rule and still made you go find the row. A chip states what the view is narrowed to
  // and carries its own way out, which is what a person reaches for — and on a phone it is the only
  // way out that is on screen, since the islands list is a scroll away inside the panel.
  var scopeName = el('span', { class: 'scope__name' }, ['']);
  var scopeClose = el('button', { class: 'scope__x', type: 'button', title: 'Leave this island', 'aria-label': 'Leave this island and show the whole region' }, ['\u00d7']);
  var scopeChip = el('div', { class: 'scope', hidden: '' }, [el('span', { class: 'scope__dot' }), scopeName, scopeClose]);

  // PIN: reserve the page for the panel instead of covering it.
  //
  // Remembered across reloads, deliberately: the person who wants this is watching a log while they
  // act, and acting includes reloading. A preference that resets every time is one you set every
  // time, which is how a mode becomes an annoyance.
  var PIN_KEY = 'motu:dock:pin';
  var pinned = false;
  try { pinned = localStorage.getItem(PIN_KEY) === '1'; } catch (e) { pinned = false; }
  var pin = el('button', {
    // Hidden in the phone layout by the stylesheet — a control that cannot do anything should not be
    // there to press.
    class: 'bay-pin', type: 'button',
    title: 'Reserve space for the panel instead of covering the page',
    'aria-label': 'Pin the panel beside the page',
    'aria-pressed': pinned ? 'true' : 'false',
  }, ['\u25e8']);
  /** The phone layout, where the dock is a bottom SHEET rather than a side panel. */
  var isPhone = function () {
    try {
      return window.matchMedia('(max-width: 760px)').matches;
    } catch (e) {
      return false;
    }
  };

  var applyPin = function () {
    var root = document.documentElement;
    // Only meaningful while the panel is OPEN: a closed panel covers nothing, and reserving for it
    // would leave a hole beside a dock that is not there.
    // NEVER ON A PHONE. Pinning reserves horizontal space and makes the body a containing block, and
    // neither means anything for a bottom sheet: there is no width to give up, and the transform
    // reflowed the whole region around a panel that does not sit beside it. The preference is kept —
    // rotating back to a wide viewport restores it — but it does not apply here.
    var on = pinned && tide.dataset.open === 'true' && !isPhone();
    if (on) root.setAttribute('data-motu-dock-pin', '1');
    else root.removeAttribute('data-motu-dock-pin');
    pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    // MEASURED, NEVER ASSUMED. The reserve was a hardcoded 340px and the SEAMS tab is
    // `width: min(560px, 46vw)` — it widens for a five-column table — so pinning covered 220px of the
    // region on exactly the tab the pin exists for. Reading the rendered width also means a future
    // per-tab width needs no second edit here.
    if (on) root.style.setProperty('--motu-dock-panel', Math.round(panel.getBoundingClientRect().width) + 'px');
    else root.style.removeProperty('--motu-dock-panel');
    // OUT OF THE TRANSFORMED SUBTREE while pinned, back where it was otherwise. A live subtree keeps
    // its listeners and its state across a move, so this costs nothing but the reparent.
    //
    // THE DOCK ITSELF, NOT ITS PARENT. This used to move `tide.parentElement`, which is right only
    // where the dock is mounted in a wrapper — `lagoon serve`'s. The host mounts it on the body
    // directly, so the "parent" was the very element being transformed, its parent was already the
    // root, and nothing moved: pinned on a hosted lagoon, the panel was laid out inside the shrunken
    // body and covered the page it had just reserved room beside.
    if (!tide.parentElement) return;
    if (on && tide.parentElement !== root) root.appendChild(tide);
    else if (!on && tide.parentElement === root && mountEl && mountEl !== root) mountEl.appendChild(tide);
  };
  pin.addEventListener('click', function () {
    pinned = !pinned;
    try { localStorage.setItem(PIN_KEY, pinned ? '1' : '0'); } catch (e) { /* private mode: this session only */ }
    applyPin();
  });

  // SHARE, beside the pin: the panel's copy of the bar's act, for the width where there is no bar.
  var bayShare = el('button', {
    class: 'bay-pin bay-share', type: 'button', title: 'Copy a link to this state', 'aria-label': 'Copy a link to this state',
  }, [shareIcon()]);
  var masthead = el('div', { class: 'motu-bay', 'data-shape': 'masthead' }, [
    grab,
    el('div', { class: 'bay-row' }, [el('span', { class: 'bay-txt' }, [bayTitle, baySub]), bayShare, pin, fold]),
  ]);
  /** What Share just did — the address it copied, or the address to copy by hand when it could not. */
  var shareNote = el('div', { class: 'share-note', role: 'status', hidden: '' });

  var scroll = el('div', { class: 'scroll' });
  // THE RIG: what is a MODE rather than a place. The view toggle is the dock's own; the transport and
  // fit chips belong to whoever mounted them and are read rather than reimplemented, so a control a
  // future package appends shows up here with nothing to keep in sync.
  var rigPills = el('div', { class: 'rig__pills' });
  var recStatus = el('p', { class: 'rig__status' });
  var rig = el('div', { class: 'rig' }, [
    el('div', { class: 'rig__head' }, [el('span', { class: 'motu-cap' }, ['Rig'])]),
    rigPills,
    recStatus,
  ]);
  // STATES is where the region is; SEAMS is what the lens has noticed about it. The same region
  // looked at two ways, which is why they are tabs in one panel rather than two surfaces.
  var tabs = el('div', { class: 'motu-segmented tabs', role: 'tablist' });
  var tabThumb = el('span', { class: 'motu-segmented__thumb' });
  var statesTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'true' }, ['States']);
  // THE COUNT BELONGS ON THE TAB, not only inside it. The findings were the last section of the
  // second tab, so a region could be reporting something a person had to answer while every visible
  // surface said nothing — you had to already suspect it to go and look. This is the one number that
  // makes the tab worth opening, so it lives where the tab is.
  var seamsBadge = el('span', { class: 'tab-badge', hidden: 'hidden' });
  var seamsTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'false' }, ['Seams', seamsBadge]);
  // ISLANDS IS A DIFFERENT QUESTION, which is why it is a tab and not more rows under Seams. Seams
  // asks how the region is WIRED; this asks what each island was actually given. The same key answers
  // both from opposite ends — Seams says who reads `shots`, this says whether shot-list got it.
  var islandsTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'false' }, ['Islands']);
  // COVERAGE IS THE ONLY ONE THAT LOOKS OUTWARD. Seams and Islands both compare the region against
  // its own declaration; this compares it against what production has actually been recorded doing.
  // Same region, a different world to measure it against, so it earns its own place rather than
  // another block of rows under a heading that promises something else.
  var coverageTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'false' }, ['Coverage']);
  tabs.append(tabThumb, statesTab, seamsTab, islandsTab, coverageTab);
  var seams = el('div', { class: 'seams' });
  var islandsPane = el('div', { class: 'islands' });
  var coveragePane = el('div', { class: 'coverage' });
  // FIND IS THE ONE PLACE EVERYTHING IS LISTED \u2014 screens, regions, every state of every region in
  // view. The States tab used to stack all of that above the states themselves, and a list that holds
  // everything grows with the project; a search does not. On a keyboard it is still Ctrl/Cmd-K; on a
  // phone, where there is no such key, the button says what it does.
  var kbd = el('button', { class: 'motu-kbd', type: 'button', title: 'Find a screen, region or state', 'aria-label': 'Find a screen, region or state' }, [
    el('span', { class: 'kbd--keys' }, [/Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent) ? '\u2318K' : 'Ctrl K']),
    el('span', { class: 'kbd--word' }, ['Find']),
  ]);

  var panel = el('div', { class: 'panel', role: 'group', 'aria-label': 'Lagoon controls' }, [
    masthead,
    el('div', { class: 'find' }, [tabs, kbd]),
    scroll,
    seams,
    islandsPane,
    coveragePane,
    rig,
  ]);
  var scrim = el('div', { class: 'scrim' });
  // AFTER the panel, so the chip stacks above the sliding surface rather than under it. A sibling of
  // the panel, not a child: it must survive the panel being shut.
  tide.append(scrim, rail, panel, scopeChip, shareNote);
  mountEl.appendChild(tide);
  tide.dataset.edge = 'right';

  /**
   * WHAT THE PERSON JUST DID, so the calls that follow can be grouped under it.
   *
   * `by` — the island or source a request is charged to — is what a CHECK needs, and it is
   * `unattributed` for most real calls, because a source fetches outside any island's window. So on
   * the screen where you just pressed Enregistrer every row says the same nothing, and none says WHY.
   * A person reads the log the other way round: this is the nine requests that button produced.
   *
   * THE ACCESSIBLE NAME, not a selector — the same vocabulary `expectRender` reads from, so the label
   * in the log is the one a person would use to describe what they pressed.
   */
  var nameOfTarget = function (node) {
    var el2 = node && node.nodeType === 1 ? node : node && node.parentElement;
    // The nearest thing that is actually a CONTROL: a click lands on the span inside the button.
    var ctl = el2 && el2.closest ? el2.closest('button, a[href], [role="button"], summary, input, select, textarea, label') : null;
    if (!ctl) return null;
    var name = ctl.getAttribute('aria-label')
      || (ctl.getAttribute('title') || '')
      || (ctl.textContent || '').trim()
      || ctl.getAttribute('placeholder')
      || ctl.getAttribute('name')
      || ctl.tagName.toLowerCase();
    name = String(name).replace(/\s+/g, ' ').trim();
    return name ? name.slice(0, 48) : null;
  };
  /**
   * WHERE the control lives, because its name is not enough.
   *
   * Every save button on a real screen is called "Enregistrer" — the agenda, the commitment banner,
   * the settings dialog — so the label alone named four different actions the same way.
   *
   * THE ISLAND SLOT FIRST, which is motu's own vocabulary and the most useful answer: the run reads
   * "session-tab · Enregistrer" and you know which region piece did it. A DIALOG is the case that
   * cannot work — it portals to the body element, outside every island's subtree — so its accessible
   * name stands in, which is what a person calls it anyway.
   */
  var scopeOfTarget = function (node) {
    var el2 = node && node.nodeType === 1 ? node : node && node.parentElement;
    if (!el2 || !el2.closest) return null;
    var slot = el2.closest('[data-motu-slot]');
    if (slot) return slot.getAttribute('data-motu-slot');
    var dialog = el2.closest('[role="dialog"], [role="alertdialog"], dialog');
    if (!dialog) return null;
    var named = dialog.getAttribute('aria-label');
    if (!named) {
      var by = dialog.getAttribute('aria-labelledby');
      var head = (by && document.getElementById(by)) || dialog.querySelector('h1, h2, h3, [data-slot="dialog-title"]');
      named = head && head.textContent;
    }
    named = String(named || '').replace(/\s+/g, ' ').trim();
    return named ? named.slice(0, 32) : 'dialog';
  };
  var noteGesture = function (ev) {
    // The dock's own controls are not the region's story: pressing a tab or the pin must not adopt
    // whatever the page happens to fetch next.
    if (ev.target && ev.target.closest && ev.target.closest('#tide')) return;
    var label = nameOfTarget(ev.target);
    if (!label) return;
    var scope = scopeOfTarget(ev.target);
    try {
      globalThis.__motuGesture = {
        label: scope ? scope + ' \u00b7 ' + label : label,
        at: Date.now(),
        // A NEW ID PER PRESS. Grouping by the label merged two separate saves into one run, and the
        // second one's calls were reported as part of the first.
        id: (globalThis.__motuGestureSeq = (globalThis.__motuGestureSeq || 0) + 1),
      };
    } catch (e) { /* nothing reads it, which is the same as no grouping */ }
  };
  // CAPTURE, so the label is written before the application's own handler runs and fires the request.
  document.addEventListener('pointerdown', noteGesture, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') noteGesture(ev);
  }, true);

  var open = function (on) {
    tide.dataset.open = on ? 'true' : 'false';
    // THE PANEL SUPERSEDES THE CARDS. It is 560px of the right-hand side on Seams, which is exactly
    // where they stand: a card pressed to open the Network list then sits on top of the list it
    // opened. The cards are the notice for when nothing is open; the panel is the whole log.
    toasts.dataset.open = on ? 'true' : 'false';
    railOpen.setAttribute('aria-expanded', on ? 'true' : 'false');
    // The reserve follows the panel: a closed panel covers nothing, so holding 340px for it would
    // leave a gap beside a dock that is not there.
    applyPin();
  };
  railOpen.addEventListener('click', function () { open(true); });
  pick.addEventListener('click', function () {
    var ctl = control();
    if (!ctl || !ctl.togglePicking) return;
    pick.setAttribute('aria-pressed', ctl.togglePicking() ? 'true' : 'false');
  });
  fold.addEventListener('click', function () { open(false); });
  // Tapping the backdrop closes it, which is the gesture the switcher already teaches.
  scrim.addEventListener('click', function () { open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });

  // DRAG TO DISMISS, for the reason the switcher gives for having it: a sheet a thumb can only close
  // by reaching for a backdrop feels stuck, and following the finger is what makes it read as a panel
  // rather than a popup. Past a third of its height it goes; short of that it springs back.
  var startY = null;
  var dy = 0;
  grab.addEventListener('pointerdown', function (e) {
    startY = e.clientY;
    dy = 0;
    tide.dataset.dragging = 'true';
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', function (e) {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = 'translateY(' + dy + 'px)';
  });
  var endDrag = function () {
    if (startY === null) return;
    startY = null;
    delete tide.dataset.dragging;
    panel.style.transform = '';
    if (dy > panel.getBoundingClientRect().height / 3) open(false);
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  /** The lagoon's own two globals — absent until it has booted, so everything here re-reads them. */
  /** The lagoon's SCREENS — `regions()` entries with a `screen:` id — labelled without the gallery's glyph. */
  var screenEntries = function (ctl) {
    var all = [];
    try { all = (ctl && ctl.regions && ctl.regions()) || []; } catch (e) { all = []; }
    return all
      .filter(function (r) { return typeof r.id === 'string' && r.id.indexOf('screen:') === 0; })
      .map(function (r) { return { id: r.id, label: String(r.label || r.id).replace(/^\u25A3\s*/, '') }; });
  };
  var catalogue = function () { try { return lagoonWindow().__motuLagoonStates || null; } catch (e) { return null; } };
  var control = function () { try { return lagoonWindow().__motuLagoonControl || null; } catch (e) { return null; } };
  /**
   * RESOLVE THE CONTROL WHEN THE CLICK HAPPENS, never when the row was drawn.
   *
   * Every row, chip and palette entry used to close over the `ctl` that `paint()` had resolved. The
   * artifact reloads on its own — choosing "As seeded" is a reload by design, and so is a live-push —
   * and after one, that captured object belongs to a destroyed document: calling `show()` on it does
   * nothing, silently. The symptom is precise and baffling to report: pick a state, then the NEXT
   * region click is swallowed and the one after it works, because the failed click's repaint is what
   * rebinds the reference.
   */
  var drive = function (fn) {
    return function () {
      var live = control();
      if (live) fn(live);
    };
  };

  /**
   * SHARE: THE ADDRESS OF WHAT YOU ARE LOOKING AT, ON THE CLIPBOARD.
   *
   * The loop motu is built for ends with a person handing a state back — to the agent that built the
   * region, or to whoever should look next — and "the URL is the handover" was true everywhere except
   * on the surface people actually look from. The lagoon already writes every state into its own
   * address (`&state=…@n`, `?region=…&flow=…`); this copies it.
   *
   * THE PAGE'S ADDRESS, NOT THE FRAME'S. Hosted, the lagoon runs at `…/__motu_frame?…` inside a shell
   * that forwards its own query to the frame, so the address worth sending is the frame's with that
   * tail removed — the shell, with the state. Under `lagoon serve` there is no frame and nothing to
   * remove.
   */
  var shareUrl = function () {
    try {
      return String(lagoonWindow().location.href).split('/__motu_frame').join('');
    } catch (e) {
      return String(location.href);
    }
  };
  var shareTimer = null;
  var share = function () {
    var url = shareUrl();
    var say = function (copied) {
      shareNote.replaceChildren(
        el('b', {}, [copied ? 'Link to this state copied' : 'Copy this link']),
        el('span', { class: 'share-note__url' }, [url]),
      );
      shareNote.hidden = false;
      clearTimeout(shareTimer);
      // A link that could not be copied stays up long enough to be selected by hand.
      shareTimer = setTimeout(function () { shareNote.hidden = true; }, copied ? 2600 : 9000);
    };
    try {
      navigator.clipboard.writeText(url).then(function () { say(true); }, function () { say(false); });
    } catch (e) {
      say(false);
    }
  };
  railShare.addEventListener('click', share);
  bayShare.addEventListener('click', share);

  /**
   * The decision count, refreshed whatever tab is showing.
   *
   * DECISIONS ONLY. A badge that counted every finding would sit permanently at "3" on a healthy
   * region — an optimisation note is not news — and a number that is always on is a number nobody
   * reads. This one is absent until something is actually waiting on a person.
   */
  var paintSeamsBadge = function () {
    var ctl = control();
    var report = ctl && ctl.findings ? ctl.findings() : null;
    var n = report && report.tally ? report.tally.decisions : 0;
    if (n > 0) {
      seamsBadge.textContent = String(n);
      seamsBadge.removeAttribute('hidden');
      seamsTab.setAttribute('title', n + (n === 1 ? ' finding needs' : ' findings need') + ' a decision');
    } else {
      seamsBadge.setAttribute('hidden', 'hidden');
      seamsTab.removeAttribute('title');
    }
  };

  /**
   * THE THUMB UNDER THE TAB THAT IS UP. Placed on every paint, not only when a tab is pressed: it was
   * positioned in `showTab` alone, so a dock nobody had clicked a tab in drew the States tab's white
   * label on no thumb at all. Measured, so a tab whose label changes width moves it.
   */
  var placeThumb = function (on) {
    if (!on) {
      var t = panel.dataset.tab || 'states';
      on = t === 'seams' ? seamsTab : t === 'islands' ? islandsTab : t === 'coverage' ? coverageTab : statesTab;
    }
    if (!on.offsetWidth) return; // not laid out yet; the next paint places it
    tabThumb.style.left = on.offsetLeft + 'px';
    tabThumb.style.width = on.offsetWidth + 'px';
  };
  var showTab = function (which) {
    panel.dataset.tab = which;
    statesTab.setAttribute('aria-current', String(which === 'states'));
    seamsTab.setAttribute('aria-current', String(which === 'seams'));
    islandsTab.setAttribute('aria-current', String(which === 'islands'));
    coverageTab.setAttribute('aria-current', String(which === 'coverage'));
    var on = which === 'states' ? statesTab
      : which === 'seams' ? seamsTab
      : which === 'islands' ? islandsTab
      : coverageTab;
    placeThumb(on);
    // The panel is a different width on Seams; the reserve follows the tab.
    applyPin();
    watchWhileLooking(which);
    paint();
  };
  // LIVE WHILE A LENS TAB IS SHOWING, and not otherwise. Everything Seams and Islands report is a
  // snapshot of a moving thing, so without this the panel paints once and then describes a region
  // that has moved on. Subscribed only while one of those tabs is up, because the lens fires on every
  // store write and a subscription nobody is reading is work the page pays for permanently.
  var unwatch = null;
  var watchWhileLooking = function (which) {
    var live = which === 'seams' || which === 'islands' || which === 'coverage';
    var ctl = control();
    if (live && !unwatch && ctl && ctl.watch) unwatch = ctl.watch(paint);
    else if (!live && unwatch) { unwatch(); unwatch = null; }
  };

  statesTab.addEventListener('click', function () { showTab('states'); });
  seamsTab.addEventListener('click', function () { showTab('seams'); });
  islandsTab.addEventListener('click', function () { showTab('islands'); });
  coverageTab.addEventListener('click', function () { showTab('coverage'); });

  var section = function (cap, host) {
    var count = el('span', { class: 'count' }, ['0']);
    var capEl = el('span', { class: 'motu-cap' }, [cap]);
    var list = el('div', { class: 'list', role: 'listbox', 'aria-label': cap });
    var box = el('div', { class: 'sect' }, [
      el('div', { class: 'sect__head' }, [el('span', { class: 'motu-dot' }), capEl, count]),
      list,
    ]);
    (host || scroll).appendChild(box);
    return { list: list, count: count, box: box, cap: capEl };
  };

  // ── THE STATES TAB: ONE REGION, AS A PLACE ──────────────────────────────────────────────────
  //
  // IT USED TO BE EVERYTHING. Screens, regions, the islands picker, then every state of every region in
  // view, stacked in one column — on the demo's Events screen, 2,600px of list in a 366px sheet, with
  // the first state below thirteen navigation rows. That is a catalogue, and the README is explicit
  // that a catalogue is the thing motu is not: the unit is a REGION, so the tab shows one.
  //
  // Four pieces, top to bottom, each a fixed size whatever the region declares:
  //  - which region of the view (only when there is a choice),
  //  - the ATOLL: the region drawn as a place — its islands around the lagoon, each dot sized by how
  //    many what-ifs it carries. Tapping one aims the tab at its shelf.
  //  - NOW PLAYING: the state the region is in, and its steps as segments you can press.
  //  - the flows, as a list (a region has few, and each is a sentence that needs to wrap), and the
  //    what-ifs as ONE SHELF PER ISLAND that scrolls sideways. That last choice is what stops the
  //    growth: eight scenarios or eighty, an island costs one row of height.
  // Navigation — screens, regions, a state by name — is Find's job. Search scales; a column does not.
  var aimRow = el('div', { class: 'aim', role: 'group', 'aria-label': 'Region on screen' });
  var atoll = el('div', { class: 'atoll' });
  var nowBox = el('div', { class: 'now' });
  // NOW PLAYING FIRST: it is what you are watching. The atoll is how you browse, so it follows.
  scroll.append(aimRow, nowBox, atoll);
  var flowsSect = section('Flows');
  var shelves = el('div', { class: 'shelves' });
  scroll.appendChild(shelves);

  /**
   * WHAT THE PAGE RESERVES HAS TO BE WHAT THE BAR OCCUPIES.
   *
   * `html[data-motu-dock="bottom"]` reserves `--motu-dock-handle`, which nothing ever set — it lived
   * on its 44px default, correct only while the bar was exactly one row. Measured rather than stated,
   * because the bar's height is the thing that has to be true. Only in phone layout: at any other
   * width this variable addresses a dock that is not at the bottom.
   */
  var syncBottomReserve = function () {
    var root = document.documentElement;
    if (!isPhone()) {
      root.style.removeProperty('--motu-dock-handle');
      return;
    }
    var h = Math.round(rail.getBoundingClientRect().height);
    if (h > 0) root.style.setProperty('--motu-dock-handle', h + 'px');
  };
  window.addEventListener('resize', function () { syncBottomReserve(); applyPin(); });

  var row = function (label, on, run) {
    var b = el('button', { class: 'motu-opt', type: 'button', role: 'option', 'aria-current': on ? 'true' : 'false' }, [
      el('span', { class: 'lamp' }),
      label,
    ]);
    b.addEventListener('click', function () {
      // LIT ON PRESS, not only once the lagoon answers. Running a flow takes as long as its steps
      // take, and a list that stays unchanged for a second reads as a click that missed.
      var siblings = b.parentNode ? b.parentNode.children : [];
      for (var i = 0; i < siblings.length; i++) siblings[i].setAttribute('aria-current', 'false');
      b.setAttribute('aria-current', 'true');
      run();
    });
    return b;
  };

  /** What the page last pointed at (a region chip, or the crosshair on a screen). */
  var lastFocus = null;
  /** The region the dock is aimed at, when the reader picked one. */
  var railPick = null;
  /** The island whose shelf the reader aimed at (the atoll, or the page's crosshair). */
  var aimIsland = null;
  /** Set when something asked for a shelf to be brought into view on the next paint. */
  var revealShelf = null;

  /**
   * THE REGION THE DOCK IS AIMED AT — one, chosen the way a person would: the one you picked, else
   * the station's own region, else a region already in a state, else the MAIN one (the region with
   * the most states, which is the page body rather than the sidebar). The bar and the tab aim at the
   * same one, so what the bar steps is what the tab shows.
   */
  var aimAt = function (info, now) {
    var regs = info.regions || [];
    if (!regs.length) return null;
    var active = info.active || [];
    var size = function (r) { return (r.flows || []).length * 1000 + (r.islands || []).reduce(function (n, i) { return n + i.scenarios.length; }, 0); };
    var onRegionStation = !!now.region && now.region.indexOf('screen:') !== 0;
    var ids = regs.map(function (r) { return r.region; });
    var regId =
      (railPick && ids.indexOf(railPick) !== -1 && railPick) ||
      (onRegionStation && ids.indexOf(now.region) !== -1 && now.region) ||
      (active[0] && ids.indexOf(active[0].region) !== -1 && active[0].region) ||
      regs.slice().sort(function (a, b) { return size(b) - size(a); })[0].region;
    var reg = regs.filter(function (r) { return r.region === regId; })[0];
    var act = active.filter(function (a) { return a.region === regId; })[0] || null;
    // The region view's OWN flows run through `runFlow`, which remounts so a root prop derived from
    // the flow's seed lands; its state then shows as `now.flow` rather than in the player's list.
    var own = onRegionStation && regId === now.region;
    var activeFlow = own
      ? now.flow || (act && act.kind === 'flow' ? act.name : null)
      : act && act.kind === 'flow' ? act.name : null;
    var activeScenario = act && act.kind === 'scenario' ? act : null;
    // THE STEPS, only where the player can replay to one. A flow the region view runs itself has no
    // step control (it remounts whole), so it is shown as playing and not as scrubbable.
    var steps = !own && act && act.kind === 'flow' && act.of > 0
      ? { at: act.applied == null ? act.of : act.applied, of: act.of }
      : null;
    return { regs: regs, reg: reg, regId: regId, act: act, own: own, activeFlow: activeFlow, activeScenario: activeScenario, steps: steps };
  };

  /** Play a flow (or the seed, for `null`) in the aimed region — resolved at click time, like every act. */
  var playIn = function (aim, name, step) {
    var regId = aim.regId;
    var own = aim.own;
    return drive(function (c) {
      if (own && step == null) c.runFlow(name);
      else if (name === null) c.clearState(regId);
      else c.playState({ region: regId, kind: 'flow', name: name, step: step == null ? null : step });
    });
  };

  var slotOf = function (reg, tag) {
    var i = (reg.islands || []).filter(function (x) { return x.tag === tag; })[0];
    return i ? i.slot || i.tag : tag;
  };

  /**
   * THE ATOLL. The region's islands around its lagoon — the one picture in the dock that shows the
   * region's SHAPE rather than a list of its parts. Dots are sand, the icon's own, and sized by the
   * island's what-if count, so the island with the most states to look at is the biggest thing to tap.
   * Names stand under the dots up to eight islands; past that they would collide, and the shelves
   * below name every island anyway.
   */
  var drawAtoll = function (aim) {
    var isl = aim.reg.islands || [];
    var nFlows = (aim.reg.flows || []).length;
    var nodes = [el('span', { class: 'atoll__ring', 'aria-hidden': 'true' })];
    var lagoon = el('button', {
      class: 'atoll__lagoon', type: 'button', 'aria-pressed': String(!aimIsland),
      title: "The region's flows",
    }, [el('small', {}, ['lagoon']), el('b', {}, [nFlows + (nFlows === 1 ? ' flow' : ' flows')])]);
    lagoon.addEventListener('click', function () { aimIsland = null; revealShelf = 'flows'; paint(); });
    nodes.push(lagoon);
    var named = isl.length <= 8;
    isl.forEach(function (i, k) {
      var angle = -Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / isl.length;
      var n = i.scenarios.length;
      var size = 14 + Math.min(n, 10) * 2;
      var lit = !!aim.activeScenario && aim.activeScenario.island === i.tag;
      var dot = el('span', { class: 'atoll__dot' }, [n ? String(n) : '']);
      dot.style.width = size + 'px';
      dot.style.height = size + 'px';
      var b = el('button', {
        class: 'atoll__isle', type: 'button',
        title: (i.slot || i.tag) + ' — ' + n + ' what-if' + (n === 1 ? '' : 's'),
        'aria-label': (i.slot || i.tag) + ', ' + n + ' what-if' + (n === 1 ? '' : 's'),
        'aria-pressed': String(aimIsland === i.tag),
        'data-lit': lit ? 'true' : 'false',
      }, named ? [dot, el('span', { class: 'atoll__name' }, [i.slot || i.tag])] : [dot]);
      b.style.left = (50 + 36 * Math.cos(angle)).toFixed(2) + '%';
      b.style.top = (50 + 30 * Math.sin(angle)).toFixed(2) + '%';
      b.addEventListener('click', function () {
        aimIsland = aimIsland === i.tag ? null : i.tag;
        closedAll = false;
        revealShelf = aimIsland;
        paint();
      });
      nodes.push(b);
    });
    atoll.replaceChildren.apply(atoll, nodes);
  };

  /** A small icon from paths — `fill` for the transport's triangles, a stroke for everything else. */
  var icon = function (paths, size) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 18));
    svg.setAttribute('height', String(size || 18));
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (p) {
      var n = document.createElementNS(NS, 'path');
      n.setAttribute('d', p.d);
      n.setAttribute('fill', p.fill ? 'currentColor' : 'none');
      n.setAttribute('stroke', 'currentColor');
      n.setAttribute('stroke-width', p.fill ? '1' : '2.2');
      n.setAttribute('stroke-linecap', 'round');
      n.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(n);
    });
    return svg;
  };
  var ICON_PREV = [{ d: 'M6 5v14' }, { d: 'M19 5.5L9 12l10 6.5z', fill: true }];
  var ICON_NEXT = [{ d: 'M18 5v14' }, { d: 'M5 5.5L15 12 5 18.5z', fill: true }];
  var ICON_REPLAY = [{ d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }, { d: 'M4 4.5V9h4.5' }];
  // The bar's transport was built before these existed; it wears the same glyphs as the panel's.
  stepPrev.appendChild(icon(ICON_PREV, 20));
  stepNext.appendChild(icon(ICON_NEXT, 20));

  /** The playing track's equalizer — three bars, still under reduced motion (the global rule). */
  var equalizer = function () {
    return el('span', { class: 'eq', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]);
  };

  /**
   * THE TRANSPORT, as a music player does it: ⏮ and ⏭ step through the flow that is playing, and at
   * either end they move to the previous or next track — "As seeded", then the region's flows in
   * declared order. So the two buttons are never dead, and pressing ⏭ over and over walks every state
   * the region declares, one after another, which is the tour a person giving a review actually wants.
   * ↻ plays the current track again from its seed.
   */
  var transport = function (aim) {
    var tracks = [null].concat(aim.reg.flows || []);
    var cur = aim.activeScenario ? -1 : tracks.indexOf(aim.activeFlow || null);
    var st = aim.steps;
    var name = function (t) { return t === null ? 'As seeded' : t; };
    var prev = null;
    var next = null;
    if (st && st.at > 1) prev = { label: 'Step ' + (st.at - 1) + ' of ' + st.of, run: playIn(aim, aim.activeFlow, st.at - 1) };
    else if (cur > 0) prev = { label: 'Previous: ' + name(tracks[cur - 1]), run: playIn(aim, tracks[cur - 1]) };
    else if (cur === -1) prev = { label: 'Back to As seeded', run: playIn(aim, null) };
    if (st && st.at < st.of) next = { label: 'Step ' + (st.at + 1) + ' of ' + st.of, run: playIn(aim, aim.activeFlow, st.at + 1) };
    else if (cur === -1 && tracks.length > 1) next = { label: 'Next: ' + name(tracks[1]), run: playIn(aim, tracks[1]) };
    else if (cur >= 0 && cur + 1 < tracks.length) next = { label: 'Next: ' + name(tracks[cur + 1]), run: playIn(aim, tracks[cur + 1]) };
    var replay = aim.activeScenario
      ? { label: 'Play this what-if again', run: drive(function (c) { c.playState({ region: aim.regId, kind: 'scenario', island: aim.activeScenario.island, name: aim.activeScenario.name }); }) }
      : { label: aim.activeFlow ? 'Play this flow again from its seed' : 'Back to the seed', run: playIn(aim, aim.activeFlow || null) };
    return { prev: prev, next: next, replay: replay };
  };

  /** Point a transport button at what it does now — or disable it, with the reason in its name. */
  var aimButton = function (b, act, idle) {
    b.disabled = !act;
    b.onclick = act ? act.run : null;
    b.setAttribute('aria-label', act ? act.label : idle);
    b.title = act ? act.label : idle;
  };

  /**
   * NOW PLAYING — the region's state as a player's front panel: the atoll as cover art, what is
   * playing and where, its progress (a flow's steps as segments you can press), and the transport.
   */
  var drawNow = function (aim, labelOf) {
    var kind = 'as seeded';
    var name = 'As seeded';
    if (aim.activeScenario) {
      kind = 'what-if · ' + slotOf(aim.reg, aim.activeScenario.island);
      name = aim.activeScenario.name;
    } else if (aim.activeFlow) {
      kind = 'flow';
      name = aim.activeFlow;
    }
    var playing = !!(aim.activeFlow || aim.activeScenario);
    var kids = [
      el('div', { class: 'now__head' }, [
        el('span', { class: 'atoll-mark now__cover', 'aria-hidden': 'true' }),
        el('span', { class: 'now__txt' }, [
          el('small', { class: 'now__kicker' }, [(playing ? 'now playing · ' : '') + labelOf(aim.regId) + ' · ' + kind]),
          el('b', { class: 'now__title' }, [name]),
        ]),
      ]),
    ];
    // THE PROGRESS. A flow's steps as segments; anything else is one bar, full — a state that simply
    // IS has nothing left to play, and an empty bar would read as "not started".
    var segs = el('div', { class: 'now__segs', role: 'group', 'aria-label': aim.steps ? 'Steps of this flow' : 'Progress' });
    if (aim.steps) {
      for (var k = 1; k <= aim.steps.of; k++) {
        var seg = el('button', {
          class: 'now__seg', type: 'button', 'aria-label': 'Step ' + k + ' of ' + aim.steps.of,
          'aria-current': String(k === aim.steps.at), 'data-done': String(k <= aim.steps.at),
        });
        seg.addEventListener('click', playIn(aim, aim.activeFlow, k));
        segs.appendChild(seg);
      }
    } else {
      segs.appendChild(el('span', { class: 'now__seg now__seg--whole', 'data-done': 'true' }));
    }
    kids.push(segs);
    var tp = transport(aim);
    var prevB = el('button', { class: 'now__btn', type: 'button' }, [icon(ICON_PREV, 18)]);
    var replayB = el('button', { class: 'now__btn now__btn--main', type: 'button' }, [icon(ICON_REPLAY, 20)]);
    var nextB = el('button', { class: 'now__btn', type: 'button' }, [icon(ICON_NEXT, 18)]);
    aimButton(prevB, tp.prev, 'Nothing before this');
    aimButton(replayB, tp.replay, '');
    aimButton(nextB, tp.next, 'Nothing after this');
    kids.push(el('div', { class: 'now__transport' }, [
      el('small', { class: 'now__step' }, [aim.steps ? 'step ' + aim.steps.at + ' of ' + aim.steps.of : playing ? 'complete' : 'seed']),
      el('span', { class: 'now__btns' }, [prevB, replayB, nextB]),
      el('small', { class: 'now__step now__step--end' }, [(aim.reg.flows || []).length + ' flows']),
    ]));
    if (aim.act && aim.act.forged && aim.act.forged.length) {
      kids.push(el('p', { class: 'state-forged' }, [
        'forged: ' + aim.act.forged.map(function (f) { return f.key + ' (owned by ' + f.owner + ')'; }).join(', '),
      ]));
    }
    nowBox.replaceChildren.apply(nowBox, kids);
  };

  /** One track of the flows list: its number (an equalizer while it plays), its name, its progress. */
  var track = function (no, name, on, meta, run) {
    var b = el('button', { class: 'track', type: 'button', role: 'option', 'aria-current': on ? 'true' : 'false' }, [
      el('span', { class: 'track__no' }, on ? [equalizer()] : [no]),
      el('span', { class: 'track__name' }, [name]),
      meta ? el('span', { class: 'track__meta' }, [meta]) : null,
    ].filter(Boolean));
    b.addEventListener('click', function () {
      // LIT ON PRESS — a flow takes as long as its steps take.
      var all = b.parentNode ? b.parentNode.children : [];
      for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-current', 'false');
      b.setAttribute('aria-current', 'true');
      run();
    });
    return b;
  };

  /**
   * THE WHAT-IFS, one ALBUM per island — the island is the album, its scenarios the tracks.
   *
   * Two shapes from one tree, chosen by the pointer rather than the width. Under a finger an album is
   * a shelf of cards you swipe sideways, which costs one row of height whatever it holds. Under a
   * mouse sideways scrolling is the worst gesture there is, so an album is a row that opens into its
   * tracklist — one open at a time (the one aimed at, else the one playing), so the tab is still as
   * tall as its islands plus one list, never the sum of every list.
   *
   * An island scenario played inside its region sets that island's inputs directly — a what-if, not a
   * state the app is known to reach — which is why the albums sit under the flows rather than among them.
   */
  var drawShelves = function (aim, now) {
    var nodes = [];
    var total = 0;
    var litIsland = aim.activeScenario ? aim.activeScenario.island : null;
    var openTag = aimIsland || litIsland;
    (aim.reg.islands || []).forEach(function (i) {
      if (!i.scenarios.length) return;
      total += i.scenarios.length;
      var lit = litIsland === i.tag ? aim.activeScenario.name : null;
      var track2 = el('div', { class: 'shelf__track', role: 'listbox', 'aria-label': (i.slot || i.tag) + ' what-ifs' });
      i.scenarios.forEach(function (name, n) {
        var card = el('button', { class: 'shelf__card', type: 'button', role: 'option', 'aria-current': String(lit === name) }, [
          el('span', { class: 'shelf__no' }, lit === name ? [equalizer()] : [String(n + 1).padStart(2, '0')]),
          el('span', { class: 'shelf__name' }, [name]),
        ]);
        card.addEventListener('click', function () {
          var all = shelves.querySelectorAll('.shelf__card');
          for (var m = 0; m < all.length; m++) all[m].setAttribute('aria-current', 'false');
          card.setAttribute('aria-current', 'true');
          drive(function (c) { c.playState({ region: aim.regId, kind: 'scenario', island: i.tag, name: name }); })();
        });
        track2.appendChild(card);
      });
      var open = openTag === i.tag && !closedAll;
      var title = el('button', { class: 'shelf__title', type: 'button', 'aria-expanded': String(open) }, [
        el('span', { class: 'shelf__cover', 'aria-hidden': 'true' }, [lit ? equalizer() : String(i.scenarios.length)]),
        el('span', { class: 'shelf__slot' }, [i.slot || i.tag]),
        el('span', { class: 'shelf__count' }, [i.scenarios.length + ' what-if' + (i.scenarios.length === 1 ? '' : 's')]),
      ]);
      title.addEventListener('click', function () {
        // Closing the open album shows none, rather than falling back to the one that is playing.
        closedAll = open;
        aimIsland = open ? null : i.tag;
        paint();
      });
      var head = [title];
      // ALONE only where the view can do it: opening an island scopes the REGION STATION, so on a
      // screen (several regions, none of them the station) the act has nowhere to land.
      if (aim.own && !now.island) {
        var alone = el('button', { class: 'shelf__alone', type: 'button', title: 'Open ' + i.tag + ' on its own' }, ['alone ↗']);
        alone.addEventListener('click', drive(function (c) { c.openIsland(i.tag); }));
        head.push(alone);
      }
      nodes.push(el('section', {
        class: 'shelf', 'data-tag': i.tag, 'data-aimed': String(aimIsland === i.tag),
        'data-open': String(open),
      }, [el('div', { class: 'shelf__head' }, head), track2]));
    });
    if (total) {
      nodes.unshift(el('div', { class: 'sect__head' }, [
        el('span', { class: 'motu-dot' }), el('span', { class: 'motu-cap' }, ['What-ifs']), el('span', { class: 'count' }, [String(total)]),
      ]));
    }
    shelves.replaceChildren.apply(shelves, nodes);
    // The lit card, in view on a shelf — once per change, so a reader swiping is not dragged back.
    var litCard = shelves.querySelector('.shelf__card[aria-current="true"]');
    var litKey = litCard ? litCard.textContent : null;
    if (litKey !== lastLitCard) {
      lastLitCard = litKey;
      if (litCard && litCard.parentNode) {
        var t = litCard.parentNode;
        if (t.scrollWidth > t.clientWidth) t.scrollLeft = Math.max(0, litCard.offsetLeft - t.offsetLeft - 16);
      }
    }
    return total;
  };
  var lastLitCard = null;
  /** The reader closed the open album; stays closed until they open one (or aim at an island). */
  var closedAll = false;

  var paint = function () {
    var cat = catalogue();
    var ctl = control();
    // Whatever tab is up. The badge's whole job is to be right on the tab a person is NOT looking at.
    paintSeamsBadge();
    placeThumb();
    if (!cat || !ctl) {
      // The lagoon has not booted yet, or this build predates the control surface. Say so rather than
      // drawing an empty panel that looks like a region with nothing in it.
      aimRow.hidden = true;
      atoll.hidden = true;
      flowsSect.box.hidden = true;
      bayTitle.textContent = 'waiting for the lagoon…';
      baySub.textContent = '';
      railTitle.textContent = 'waiting for the lagoon…';
      railSub.textContent = '';
      return;
    }
    flowsSect.box.hidden = false;
    var now = ctl.current();
    var labelOf = function (id) {
      var r = (cat.archipelagos || []).filter(function (x) { return x.id === id; })[0];
      return r ? r.label : id;
    };
    var onScreen = screenEntries(ctl).filter(function (r) { return r.id === now.region; })[0];
    var scopedTag = now.island && now.island.tag;
    var decisions = 0;
    try {
      var rep = ctl.findings ? ctl.findings() : null;
      decisions = rep && rep.tally ? rep.tally.decisions : 0;
    } catch (e) { decisions = 0; }

    // AN ISLAND OPENED ALONE has no region around it to aim at: its states are its own scenarios,
    // played by remounting it, and there is no atoll to draw. One list, and the bar names the island.
    var onIsland = !!now.island;
    var info = !onIsland && ctl.states ? ctl.states() : null;
    var aim = info ? aimAt(info, now) : null;
    var nStates = 0;
    var showingName;
    var where;

    if (aim) {
      aimRow.hidden = aim.regs.length < 2;
      aimRow.replaceChildren.apply(aimRow, aim.regs.map(function (r) {
        var n = (r.flows || []).length + (r.islands || []).reduce(function (s, i) { return s + i.scenarios.length; }, 0);
        var b = el('button', {
          class: 'motu-btn', 'data-shape': 'pill', type: 'button', 'aria-current': String(r.region === aim.regId),
        }, [labelOf(r.region), el('span', { class: 'aim__n' }, [String(n)])]);
        b.addEventListener('click', function () { railPick = r.region; aimIsland = null; lastLitCard = null; paint(); });
        return b;
      }));
      atoll.hidden = !(aim.reg.islands || []).length;
      drawAtoll(aim);
      drawNow(aim, labelOf);
      flowsSect.cap.textContent = 'Flows';
      var flowRows = [track('00', 'As seeded', !aim.activeFlow && !aim.activeScenario, null, playIn(aim, null))];
      (aim.reg.flows || []).forEach(function (name, k) {
        var on = aim.activeFlow === name;
        flowRows.push(track(String(k + 1).padStart(2, '0'), name, on, on && aim.steps ? aim.steps.at + '/' + aim.steps.of : null, playIn(aim, name)));
      });
      flowsSect.count.textContent = String((aim.reg.flows || []).length);
      flowsSect.list.replaceChildren.apply(flowsSect.list, flowRows);
      drawShelves(aim, now);
      (info.regions || []).forEach(function (r) {
        nStates += (r.flows || []).length + (r.islands || []).reduce(function (s, i) { return s + i.scenarios.length; }, 0);
      });
      showingName = aim.activeScenario ? '◇ ' + aim.activeScenario.name : aim.activeFlow || 'As seeded';
      // The screen, then the region — once, when a screen is named after the region it is built on.
      where = onScreen && onScreen.label !== labelOf(aim.regId) ? onScreen.label + ' \u203a ' + labelOf(aim.regId) : labelOf(aim.regId);

      // THE BAR'S TRANSPORT is the panel's: the same ⏮ / ⏭, the same progress.
      var st = aim.steps;
      if (st) where += ' \u00b7 step ' + st.at + '/' + st.of;
      var tp = transport(aim);
      stepPrev.hidden = false;
      stepNext.hidden = false;
      aimButton(stepPrev, tp.prev, 'Nothing before this');
      aimButton(stepNext, tp.next, 'Nothing after this');
      railProgress.replaceChildren.apply(railProgress, st
        ? Array.from({ length: st.of }, function (_, k) { return el('i', { 'data-done': String(k < st.at) }); })
        : [el('i', { 'data-done': String(!!(aim.activeFlow || aim.activeScenario)) })]);

      // THE PAGE POINTED AT SOMETHING: aim at it and open on it. Once per pointing — `n` changes each
      // time — so the panel does not keep yanking itself back to a region the reader has left.
      if (now.focus && now.focus.n !== lastFocus) {
        lastFocus = now.focus.n;
        railPick = now.focus.region;
        aimIsland = now.focus.island && now.focus.island !== '*' ? now.focus.island : null;
        revealShelf = now.focus.island === '*' ? 'shelves' : aimIsland || 'top';
        open(true);
        showTab('states'); // repaints, aimed
        return;
      }
    } else {
      // An island alone, or a lagoon too old to say what its view can play: one plain list.
      aimRow.hidden = true;
      atoll.hidden = true;
      shelves.replaceChildren();
      var scenarios = onIsland && ctl.scenarios ? ctl.scenarios() : [];
      var flows = onIsland ? [] : (cat.flows && cat.flows[now.region]) || [];
      var entries = onIsland
        ? scenarios.map(function (sc) { return sc.name; })
        : flows.map(function (f) { return f.name; });
      var baseLabel = onIsland ? 'Default mount' : 'As seeded';
      var showing = onIsland ? now.scenario || null : now.flow || null;
      var go = function (name) {
        return drive(function (c) { onIsland ? c.openScenario(name) : c.runFlow(name); });
      };
      nowBox.replaceChildren(
        el('small', { class: 'now__kicker' }, [onIsland ? scopedTag + ' · alone' : now.region || '']),
        el('b', { class: 'now__title' }, [showing || baseLabel]),
      );
      flowsSect.cap.textContent = onIsland ? 'Scenarios' : 'Flows';
      flowsSect.count.textContent = String(entries.length);
      flowsSect.list.replaceChildren.apply(flowsSect.list, [row(baseLabel, showing === null, go(null))].concat(entries.map(function (n) {
        return row(n, showing === n, go(n));
      })));
      nStates = entries.length;
      showingName = showing || baseLabel;
      where = onIsland ? scopedTag + ' · alone' : (onScreen ? onScreen.label : now.region || 'lagoon');
      stepPrev.hidden = true;
      stepNext.hidden = true;
      railProgress.replaceChildren();
    }

    // THE MINI PLAYER: what is playing, where, and whether the lens is waiting on a decision.
    railTitle.textContent = showingName;
    railSub.textContent = where;
    railFlag.hidden = !decisions;
    railFlag.textContent = decisions ? '⚑ ' + decisions : '';
    railOpen.setAttribute('aria-label', 'Lagoon controls — ' + showingName + ', ' + where);

    // Bring the shelf (or the flows) someone aimed at into view, once.
    if (revealShelf) {
      var want = revealShelf;
      revealShelf = null;
      setTimeout(function () {
        var target = want === 'top' ? scroll.firstChild
          : want === 'flows' ? flowsSect.box
          : want === 'shelves' ? shelves
          : shelves.querySelector('.shelf[data-tag="' + want + '"]');
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 60);
    }
    syncBottomReserve();

    // ── the rig ──────────────────────────────────────────────────────────────────────────────
    var pills = [];
    // ASK THE PAGE WHICH VIEWS IT HAS. Two were hard-coded here because two were all there were; a
    // region may now also declare a `page` — the application's own page module — and most do not.
    // Falling back to the pair keeps a lagoon published before this dock existed working unchanged.
    var VIEW_LABELS = { region: 'Region', mountpoints: 'Mountpoints', page: 'Page' };
    var available = (ctl.views && ctl.views()) || ['region', 'mountpoints'];
    available.forEach(function (v) {
      var b = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        title: v === 'page' ? "the application's own page, not the region" : '',
        'aria-current': now.view === v ? 'true' : 'false',
      }, [VIEW_LABELS[v] || v]);
      b.addEventListener('click', drive(function (c) { c.setView(v); }));
      pills.push(b);
    });
    // RECORDING IS AN ACT, so it sits with the other controls rather than in a tab. It is the one
    // thing here that changes the lagoon instead of reporting on it, and stopping is what writes the
    // fixtures out — so the label says which of those pressing it will do.
    // NO SEAM LENS PILL. The layer is a means, not a thing to manage: everything that needs it opens
    // it — the crosshair to aim with, Coupling to draw on — and the crosshair now puts it away again
    // when it has picked. A switch for a layer that turns itself on and off is one more pressed-looking
    // control saying nothing about the region, in a rig whose other chips all change what you see.
    //
    // Everything the lens used to SAY lives in the tabs above; only the outlines and wires over the
    // running page are still its own, and those arrive with whatever asked for them.

    // The coupling graph, beside the layer it draws on. Two islands sharing a region key is the one
    // thing on this page that no list shows as well as a line does, so it stays a page-layer switch
    // rather than becoming a tab.
    if (ctl.toggleCoupling) {
      var cplPill = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        'aria-pressed': ctl.couplingOn && ctl.couplingOn() ? 'true' : 'false',
        title: 'Draw a wire between islands that share a region key',
      }, ['\u2325 Coupling']);
      cplPill.addEventListener('click', drive(function (c) { c.toggleCoupling(); paint(); }));
      pills.push(cplPill);
    }

    var rec = ctl.recordingState ? ctl.recordingState() : null;
    if (rec) {
      var recPill = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        'aria-pressed': rec.recording ? 'true' : 'false',
        title: rec.recording
          ? 'Stop capturing and write fixtures.recorded.ts'
          : 'Capture the calls and host-fed writes this region makes',
      }, [rec.recording ? '\u25a0 Stop & export' : '\u25cf Record']);
      recPill.addEventListener('click', function () {
        var live = control();
        if (!live) return; // the artifact reloaded under us; the next paint rebinds
        var next = live.toggleRecording();
        // Say what came out. A capture that produced nothing is the case worth reporting loudest —
        // it looks identical to success from the button alone.
        if (next && next.status) recStatus.textContent = next.status;
        else recStatus.textContent = '';
        paint();
      });
      pills.push(recPill);
    }

    (ctl.chips ? ctl.chips() : []).forEach(function (c) {
      if (!c.label) return;
      var b = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        title: c.title || '', 'aria-pressed': c.pressed ? 'true' : 'false',
      }, [c.label]);
      b.addEventListener('click', drive(function (live) { live.pressChip(c.index); }));
      pills.push(b);
    });
    rigPills.replaceChildren.apply(rigPills, pills);

    // ── seams ────────────────────────────────────────────────────────────────────────────────
    // COUNTS, AND THE FINDINGS THEMSELVES. No headline over them: a sentence summarising a region
    // cannot be contradicted by the region, and a verdict that cannot be wrong cannot be trusted.
    if (panel.dataset.tab === 'seams') {
      // THE REGION SHEET FIRST, because it is what the lens opens on: one row per declared key, who
      // owns it, who reads it, what it holds, and whether anything has moved it. The findings under
      // it are conclusions; this is the declaration proved by the region that is running, and it is
      // the thing to read before the archipelago.
      var sheet = ctl.sheet ? ctl.sheet() : null;
      var sheetNodes = [];
      if (sheet && sheet.rows.length) {
        sheetNodes.push(el('div', { class: 'sect__head' }, [
          el('span', { class: 'motu-cap' }, ['Region']),
          el('span', { class: 'count' }, [sheet.total + ' key' + (sheet.total === 1 ? '' : 's') +
            ' \u00b7 ' + sheet.owned + ' island-owned, ' + (sheet.total - sheet.owned) + ' host-fed']),
        ]));
        var table = el('div', { class: 'sheet' });
        // A KEY THE REGION'S WHAT-IF FORGED: an island scenario set it, and another island owns it — the
        // value on this row is the scenario's, not one the region reached.
        var forgedHere = {};
        if (sheet.region && ctl.states) {
          (ctl.states().active || []).forEach(function (a) {
            if (a.region === sheet.region) (a.forged || []).forEach(function (fk) { forgedHere[fk.key] = a; });
          });
        }
        sheet.rows.forEach(function (r) {
          if (forgedHere[r.key]) {
            r = Object.assign({}, r, {
              flag: 'forged',
              flagTitle: 'forged by the what-if "' + forgedHere[r.key].name + '" (' + forgedHere[r.key].island + ') — ' + r.owner + ' owns this key, and did not write this value',
            });
          }
          var row = el('div', {
            class: 'sheet__row',
            title: r.key + ' \u2014 ' + (r.islandOwned ? 'written by ' + r.owner : 'fed by the host') +
              '; read by ' + (r.readers.join(', ') || 'nobody') + '\n' + r.value,
          }, [
            el('span', { class: 'sheet__k' }, [r.key]),
            el('span', { class: 'sheet__own', 'data-kind': r.islandOwned ? 'island' : 'host' }, [r.owner]),
            el('span', { class: 'sheet__rd' }, [r.readers.length ? r.readers.join(', ') : '\u2205 nobody']),
            el('span', { class: 'sheet__val' }, [r.value]),
            el('span', { class: 'sheet__moved', 'data-moved': r.moved ? 'true' : 'false' }, [r.moved || 'seed']),
          ]);
          if (r.flag) {
            var flag = el('span', { class: 'sheet__flag', title: r.flagTitle },
              [r.flag === 'laundering' ? '\u26a0' : r.flag === 'forged' ? '\u25c7' : '\u25cb']);
            row.appendChild(flag);
          }
          table.appendChild(row);
        });
        sheetNodes.push(table);
      }

      // ── what feeds it, what it asked for, what it pushed back ────────────────────────────────
      var seamData = ctl.seams ? ctl.seams() : null;
      if (seamData) {
        var listSection = function (cap, count, rows, emptyText) {
          // NAMED, so something outside can aim at it. A call card opens this panel AT the Network
          // list; without a handle it could only open the tab and leave the reader to scroll for the
          // row, which is most of the work the card exists to save.
          var head = el('div', { class: 'sect__head', 'data-sect': cap.toLowerCase().replace(/ /g, '-') }, [
            el('span', { class: 'motu-cap' }, [cap]),
            el('span', { class: 'count' }, [String(count)]),
          ]);
          var body = rows.length ? rows : [el('p', { class: 'motu-empty' }, [emptyText])];
          sheetNodes.push(head);
          body.forEach(function (n) { sheetNodes.push(n); });
        };

        // NEVER-FIRED IS THE LOUD ONE: a channel installed and never used looks exactly like a
        // working one in any list that is not sorted by it.
        var dead = seamData.channels.filter(function (c) { return c.tone === 'broken'; }).length;
        if (dead) {
          sheetNodes.push(el('p', { class: 'seam-notice' },
            ['\u26a0 ' + dead + ' channel' + (dead > 1 ? 's' : '') + ' never fired']));
        }
        listSection('Feeds', seamData.channels.length, seamData.channels.map(function (c) {
          return el('div', { class: 'seam-row', 'data-tone': c.tone, title: c.label + '\n' + c.detail }, [
            el('i', { class: 'seam-row__dot' }),
            el('span', { class: 'seam-row__l' }, [c.label]),
            // The last payload belongs beside the count: "fired 6 times" and "the last one carried
            // error=null" are the same question asked twice, and the second is the one that says
            // whether the wire is carrying anything worth reading.
            el('span', { class: 'seam-row__d' }, [c.detail + (c.payload ? ' \u00b7 ' + c.payload : '')]),
            el('span', { class: 'seam-row__r' }, [c.readers.length ? '\u2192 ' + c.readers.join(', ') : '\u2192 no island reads this']),
          ]);
        }), 'No channels installed.');

        // Read by the "Asked for" section below, which hands the wire door over to it.
        var wire = seamData.wire || [];

        // ALL THREE DOORS IN ONE BLOCK. `asked` is the merged ledger — a contract call, a traced host
        // module, a wire reach — each row carrying which door it left by and WHO asked. `calls`/`traced`
        // is the two-door fallback for an overlay built before the ledger existed.
        var asked = seamData.asked ||
          (seamData.calls || []).concat(seamData.traced || []).map(function (c) {
            return { via: 'host-module', label: c.label, detail: c.detail, owner: c.island, tone: 'ok' };
          });
        // THE WIRE DOOR MOVED OUT. Network shows the same calls with their payload, their order, their
        // status and the gesture that caused them — strictly more, in a form you can open. Listing
        // them here as well was pure duplication, and on a project where everything goes through the
        // wire it made this section a worse copy of the one below it.
        //
        // KEPT for the other two doors, which Network cannot see: a CONTRACT call goes through the
        // transport and a HOST-MODULE call through a stub, and neither is a fetch. On an ocean host,
        // or a project still using module stubs, this section is the only signal there is — and it
        // hides itself when it has nothing, rather than explaining an emptiness that is now normal.
        var askedOffWire = asked.filter(function (c) { return c.via !== 'wire'; });
        if (askedOffWire.length || !wire.length) listSection('Asked for', askedOffWire.length, askedOffWire.map(function (c) {
          return el('div', {
            class: 'seam-row',
            'data-tone': c.tone || 'ok',
            title: c.via + ' \u00b7 ' + c.label + (c.detail ? '(' + c.detail + ')' : '') + '\n' + c.owner,
          }, [
            el('i', { class: 'seam-row__dot' }),
            // WHICH DOOR, on the row. The three are answered by different things — a contract call by
            // the transport, a wire reach by fixtures, a host call by a stub — so "what was asked for"
            // is only half an answer without "and who would have to answer it".
            el('span', { class: 'seam-row__l' }, [el('span', { class: 'seam-door' }, [c.via]), c.label]),
            el('span', { class: 'seam-row__d' }, [c.detail || '']),
            el('span', { class: 'seam-row__r' }, [c.owner]),
          ]);
        }),
        // WHY it is empty matters, and this sentence used to guess. It said everything came from the
        // seed on a region whose source had fired forty-four times a second earlier — the calls were
        // there, the panel had filtered out everything a source asked for. It now names the doors it
        // actually looked at rather than explaining an emptiness it did not verify.
        'Nothing was asked for through the contract or a traced host module. If the region shows data '
          + 'anyway, it came from the seed, from a feed above, or over the wire — which is the Network '
          + 'section below.');

        // ── NETWORK: the calls themselves ────────────────────────────────────────────────────────
        //
        // The section above answers "what does this region reach for", which is a question about
        // DECLARATIONS. This one answers "what did it just send", which is the question a person has
        // when a screen appears to do nothing — and it is the one no other tool can answer here,
        // because the fake fetch replies without touching the network and the browser's own Network
        // panel is therefore empty.
        //
        // IT PROVES THE CLIENT HALF ONLY. A request leaving with the right payload does not mean the
        // refetch happened, the response was merged, or anything re-rendered. That is why this is a
        // log and not a check: it tells you the save fired and the read came back unchanged, which is
        // the difference between "the page is not wired" and "the stand-in did not record it".
        // GROUPED BY WHAT CAUSED THEM. The rows are newest first, so a run of calls sharing a gesture
        // gets one heading above it — "Enregistrer · 9 calls" — which is the answer to "what did my
        // click just do". Calls with no gesture (a load, a poll) simply have no heading.
        // KEYED ON THE PRESS, not on the label: two saves in a row are two runs even though both
        // buttons say Enregistrer, which is exactly the case that made this necessary.
        var lastId = null;
        var withHeads = [];
        wire.forEach(function (c, i) {
          if (c.gesture && c.gestureId !== lastId) {
            var run = 0;
            for (var j = i; j < wire.length && wire[j].gestureId === c.gestureId; j++) run++;
            withHeads.push({ head: c.gesture, count: run });
          }
          lastId = c.gestureId != null ? c.gestureId : null;
          withHeads.push(c);
        });
        var otherDoors = (seamData.asked || []).filter(function (a) { return a.via !== 'wire'; }).length;
        listSection('Network', wire.length, withHeads.map(function (c) {
          if (c.head) {
            return el('div', { class: 'wire-head' }, [
              el('span', { class: 'wire-head__t' }, ['\u21b3 ' + c.head]),
              el('span', { class: 'wire-head__n' }, [c.count + (c.count === 1 ? ' call' : ' calls')]),
            ]);
          }
          return (function (c) {
          // AN ACCORDION, because a title attribute was the wrong instrument: it cannot be selected,
          // cannot be copied, does not wrap, and never appears at all on a touch device. The payload
          // is the reason to look — a nested `p_sessions` is unreadable as one line and perfectly
          // clear pretty-printed — so it gets a surface rather than a tooltip.
          var id = 'wire-' + c.seq;
          var body = el('pre', { class: 'wire-detail', id: id, hidden: 'hidden' }, [
            c.method + ' ' + (c.url || c.target) + '  \u2192  ' + c.status + (c.response ? '  ' + c.response : ''),
            c.url ? '\n' + c.target : '',
            '\n' + (c.by || 'unattributed') + (c.at ? '  \u00b7  ' + new Date(c.at).toLocaleTimeString() : ''),
            '\n\n' + (c.detail || '(no payload)'),
          ]);
          var row = el('button', {
            class: 'seam-row seam-row--btn',
            type: 'button',
            'data-tone': c.tone,
            'aria-expanded': 'false',
            'aria-controls': id,
          }, [
            el('i', { class: 'seam-row__dot' }),
            el('span', { class: 'seam-row__l' }, [
              el('span', { class: 'seam-door' }, [String(c.status)]),
              c.target,
            ]),
            el('span', { class: 'seam-row__d' }, [c.request || '']),
            el('span', { class: 'seam-row__r' }, [c.response || '']),
          ]);
          row.addEventListener('click', function () {
            var open = row.getAttribute('aria-expanded') === 'true';
            row.setAttribute('aria-expanded', open ? 'false' : 'true');
            // `hidden` as the toggle, not a style: the attribute is what the accessibility tree reads,
            // and a payload hidden only by CSS is still announced.
            if (open) body.setAttribute('hidden', 'hidden');
            else body.removeAttribute('hidden');
          });
          return el('div', { class: 'wire-call' }, [row, body]);
          })(c);
        }),
        // The empty state is a real answer here, and a different one from "asked for" being empty:
        // no request AT ALL means the screen is rendering entirely from the seed.
        //
        // ONLY WHEN EVERY DOOR WAS SILENT. This list is the WIRE's, and it printed "everything on this
        // screen came from the seed" on a region whose islands talk exclusively through the contract —
        // directly under an ASKED FOR row saying one call had gone out, and beside a card saying it had
        // come back 500. An empty list is survivable; an empty list with a confident wrong explanation
        // is what teaches people to stop reading the surface built to answer this.
        otherDoors
          ? 'Nothing was intercepted at the WIRE. ' + otherDoors + ' ask' + (otherDoors === 1 ? '' : 's')
            + ' left by another door — see ASKED FOR above.'
          : 'No backend call was intercepted. Everything on this screen came from the seed — which is what '
            + 'a lagoon does, and worth a second look if you just pressed save.');

        listSection('Pushed back', seamData.intents.length, seamData.intents.map(function (i) {
          return el('div', { class: 'seam-row', 'data-tone': 'ok', title: i.label }, [
            el('i', { class: 'seam-row__dot' }),
            el('span', { class: 'seam-row__l' }, [i.label]),
            el('span', { class: 'seam-row__d' }, ['']),
            el('span', { class: 'seam-row__r' }, [i.from]),
          ]);
        }), 'No intents pushed.');
      }

      // ── coupling ─────────────────────────────────────────────────────────────────────────────
      var coupling = ctl.coupling ? ctl.coupling() : null;
      if (coupling && coupling.length) {
        sheetNodes.push(el('div', { class: 'sect__head' }, [
          el('span', { class: 'motu-cap' }, ['Coupling']),
          el('span', { class: 'count' }, [String(coupling.length)]),
        ]));
        coupling.forEach(function (c) {
          sheetNodes.push(el('div', {
            class: 'seam-row',
            'data-tone': c.tag === 'coupled' ? 'broken' : c.tag ? 'warn' : 'ok',
            title: c.key + ' \u2014 ' + c.reads + ' reader(s), ' + c.writes + ' writer(s)',
          }, [
            el('i', { class: 'seam-row__dot' }),
            el('span', { class: 'seam-row__l' }, [c.key]),
            el('span', { class: 'seam-row__d' }, [c.reads + 'r/' + c.writes + 'w']),
            // NAMING THE ISLANDS is the point: "1r/1w" is the same string whether one island reads a
            // key nobody else touches or one island writes what another one reads.
            el('span', { class: 'seam-row__r' }, [
              (c.from.length ? c.from.join(',') + ' \u2192 ' : '') +
              (c.readers.length ? c.readers.join(',') : '\u2205') +
              (c.tag ? '  [' + c.tag + ']' : ''),
            ]),
          ]));
        });
      }

      var report = ctl.findings ? ctl.findings() : null;
      if (!report) {
        seams.replaceChildren.apply(seams, sheetNodes.concat([
          el('p', { class: 'motu-empty' }, ['This lagoon ships no seam lens, so there is nothing to report.']),
        ]));
      } else {
        var t = report.tally;
        var tally = el('div', { class: 'seam-tally' }, [
          el('span', { class: 'seam-count', 'data-tone': 'broken' }, [el('i'), t.broken + ' broken']),
          el('span', { class: 'seam-count', 'data-tone': 'warn' }, [el('i'), t.warn + ' warning' + (t.warn === 1 ? '' : 's')]),
          el('span', { class: 'seam-count', 'data-tone': 'ok' }, [el('i'), report.islands + ' mounted']),
        ]);
        // TWO LISTS, NOT ONE, and the split is `decision` rather than tone.
        //
        // One list sorted by loudness put "4 keys could be props" — an optimisation — at the top of a
        // region that was not wired at all, because both are warnings. Worse, it made the section
        // header read "Findings 1" for a region whose one finding nobody had to act on, which is the
        // same as saying nothing. What a person needs first is the things that are theirs to answer;
        // everything else is worth keeping and worth keeping quiet.
        var card = function (f) {
          return el('div', { class: 'seam-find', 'data-tone': f.tone }, [
            el('span', { class: 'seam-find__t' }, [el('i'), f.title]),
            el('span', { class: 'seam-find__d' }, [f.detail]),
          ]);
        };
        var decisions = report.findings.filter(function (f) { return f.decision; });
        var noted = report.findings.filter(function (f) { return !f.decision; });
        var blocks = [];
        if (decisions.length) {
          blocks.push(el('div', { class: 'sect__head' }, [
            el('span', { class: 'motu-cap' }, ['Needs a decision']),
            el('span', { class: 'count' }, [String(decisions.length)]),
          ]));
          blocks = blocks.concat(decisions.map(card));
        }
        if (noted.length) {
          blocks.push(el('div', { class: 'sect__head' }, [
            el('span', { class: 'motu-cap' }, [decisions.length ? 'Also noted' : 'Noted']),
            el('span', { class: 'count' }, [String(noted.length)]),
          ]));
          blocks = blocks.concat(noted.map(card));
        }
        if (!blocks.length) {
          blocks = [
            el('div', { class: 'sect__head' }, [el('span', { class: 'motu-cap' }, ['Findings'])]),
            el('p', { class: 'motu-empty' }, ['Nothing to report about this region.']),
          ];
        }
        seams.replaceChildren.apply(seams, sheetNodes.concat([tally]).concat(blocks));
      }
    }

    // ── islands ──────────────────────────────────────────────────────────────────────────────
    if (panel.dataset.tab === 'islands') {
      var mounted = ctl.islands ? ctl.islands() : null;
      if (!mounted) {
        islandsPane.replaceChildren(el('p', { class: 'motu-empty' },
          ['This lagoon ships no seam lens, so there is nothing to inspect.']));
      } else if (!mounted.length) {
        islandsPane.replaceChildren(el('p', { class: 'motu-empty' }, ['No island is mounted.']));
      } else {
        islandsPane.replaceChildren.apply(islandsPane, mounted.map(function (isl) {
          // THE HEAD IS A BUTTON, because inspecting an island and OPENING one were split across two
          // halves of the panel that could not reach each other: this pane could say what a region had
          // mounted, and the states list shows an island's scenarios only on an island target — which
          // nothing here could reach. `?target=island:<tag>` typed by hand was the only way in.
          var head = el('button', {
            class: 'isl__head', type: 'button',
            title: 'Open ' + isl.tag + ' on its own — its scenarios appear under States',
          }, [
            el('i', { class: 'isl__dot', 'data-tone': isl.verdict }),
            el('span', { class: 'isl__slot' }, [isl.slot]),
            el('span', { class: 'isl__tag' }, [isl.tag]),
            el('span', { class: 'isl__meta' }, [isl.isolation]),
            // HOW MUCH IS BEHIND SCOPING THIS, before you spend a click finding out. Without it every
            // island looks equally worth opening, and most have nothing but their default mount.
            scenarioCount(isl.tag)
              ? el('span', { class: 'isl__scn', title: scenarioCount(isl.tag) + ' declared scenario(s)' }, [String(scenarioCount(isl.tag))])
              : el('span', { class: 'isl__scn isl__scn--none', title: 'no declared scenarios' }, ['—']),
          ]);
          head.addEventListener('click', drive(function (c) { if (c.openIsland) c.openIsland(isl.tag); }));
          var body = el('div', { class: 'isl__body' });
          if (isl.risk) body.appendChild(el('p', { class: 'seam-notice' }, ['\u26a0 ' + isl.risk]));
          if (!isl.props.length) {
            body.appendChild(el('p', { class: 'motu-empty' }, ['No declared props.']));
          } else {
            isl.props.forEach(function (pr) {
              body.appendChild(el('div', { class: 'isl__prop', title: pr.name + ' = ' + pr.value }, [
                el('span', { class: 'isl__pn' }, [pr.name]),
                el('span', { class: 'isl__ps', 'data-state': pr.state }, [pr.state]),
                el('span', { class: 'isl__pv' }, [pr.storeKey ? pr.storeKey + ' = ' + pr.value : pr.value]),
              ]));
            });
          }
          // The counts, because "what did this island actually do" is the other half of "what was it
          // given", and it is one line rather than another table.
          var did = [];
          if (isl.writes.length) did.push('writes ' + isl.writes.join(', '));
          if (isl.emits.length) did.push('emits ' + isl.emits.join(', '));
          if (isl.calls) did.push(isl.calls + ' call' + (isl.calls === 1 ? '' : 's'));
          if (isl.intents) did.push(isl.intents + ' intent' + (isl.intents === 1 ? '' : 's'));
          body.appendChild(el('p', { class: 'isl__did' }, [did.length ? did.join(' \u00b7 ') : 'reads only']));
          return el('div', { class: 'isl' }, [head, body]);
        }));
      }
    }

    // ── coverage ─────────────────────────────────────────────────────────────────────────────
    if (panel.dataset.tab === 'coverage') {
      var cov = ctl.coverage ? ctl.coverage() : null;
      if (!cov) {
        coveragePane.replaceChildren(el('p', { class: 'motu-empty' },
          ['No corpus for this region \u2014 nothing has reported what production does with it.']));
      } else {
        var nodes = [el('div', { class: 'sect__head' }, [
          el('span', { class: 'motu-cap' }, ['On screen now']),
          el('span', { class: 'count' }, [cov.states + ' recorded state' + (cov.states === 1 ? '' : 's') +
            ' \u00b7 ' + cov.occurrences + ' occurrence' + (cov.occurrences === 1 ? '' : 's')]),
        ])];
        if (cov.drift) {
          // SAID, not silently worked around: a fingerprint over one key set cannot be placed in a
          // corpus recorded over another, so every verdict here would be confidently wrong.
          nodes.push(el('p', { class: 'seam-notice' }, [
            '\u26a0 the corpus was recorded against a different declaration \u2014 ' +
            cov.drift.gone.length + ' key(s) gone (' + (cov.drift.gone.join(', ') || '\u2014') + '), ' +
            cov.drift.added.length + ' added (' + (cov.drift.added.join(', ') || '\u2014') + '). ' +
            'Re-record before trusting this.',
          ]));
        }
        var verdictText = cov.verdict === 'not-comparable' ? 'not comparable'
          : cov.verdict === 'reached' ? 'production reaches this \u00b7 ' + cov.reached.count + '\u00d7 \u00b7 ' + cov.reached.share
          : 'never recorded';
        nodes.push(el('div', { class: 'cov-verdict', 'data-verdict': cov.verdict }, [verdictText]));
        // The fingerprint on its own line, because it IS the content: in a row it truncates at the
        // column edge, which hides the very keys a reader came to check.
        nodes.push(el('div', { class: 'cov-fp' }, [cov.fingerprint]));
        if (cov.verdict === 'never-recorded') {
          nodes.push(el('p', { class: 'motu-empty' },
            ['No beacon has reported this combination \u2014 either it cannot happen, or nobody has reached it yet.']));
        }
        if (cov.ranked.length) {
          nodes.push(el('div', { class: 'sect__head' }, [
            // THE HEADING CARRIES THE SEMANTICS. Each row shows only what DIFFERS, so a bare
            // "64% busy:true" would read as "64% of production has busy:true" — a different and much
            // stronger claim than the true one.
            el('span', { class: 'motu-cap' }, ['How recorded states differ from this one']),
            el('span', { class: 'count' }, [String(cov.ranked.length)]),
          ]));
          cov.ranked.forEach(function (r) {
            nodes.push(el('div', { class: 'cov-row' }, [
              el('span', { class: 'cov-row__s' }, [r.share]),
              el('span', { class: 'cov-row__d' }, [r.diff]),
            ]));
          });
        }
        coveragePane.replaceChildren.apply(coveragePane, nodes);
      }
    }

    // A lagoon with no lens has nothing to point with, so the picker is absent rather than inert.
    pick.hidden = !ctl.togglePicking;
    if (ctl.pickingOn) pick.setAttribute('aria-pressed', ctl.pickingOn() ? 'true' : 'false');

    // SAY WHEN THE VIEW IS SCOPED. The bay read the region name whatever was mounted, so an island
    // opened alone looked like the whole region with a suspiciously empty page — "it is hard to see
    // that the lagoon is scoped to an island" was exactly right. The island's own name, and the way
    // out spelled out, both in the panel and on the collapsed rail.
    if (scopedTag) {
      bayTitle.textContent = scopedTag;
      baySub.textContent = 'island only · ' + nStates + (nStates === 1 ? ' scenario' : ' scenarios');
      railLabel.textContent = scopedTag;
      scopeChip.hidden = false;
      toasts.dataset.scoped = 'true';
      scopeName.textContent = scopedTag;
      // Rebound every paint: the tag it must let go of is whichever one is scoped now.
      scopeClose.onclick = drive(function (c) { c.openIsland(scopedTag); });
    } else {
      scopeChip.hidden = true;
      toasts.dataset.scoped = 'false';
      scopeClose.onclick = null;
      // A screen is named by its label — its id is `screen:<id>`, an address rather than a name.
      bayTitle.textContent = onScreen ? onScreen.label : now.region || '—';
      var nRegions = info ? (info.regions || []).length : 1;
      baySub.textContent = (onScreen ? 'screen · ' : '') + nStates + (nStates === 1 ? ' state' : ' states') + (nRegions > 1 ? ' across ' + nRegions + ' regions' : '');
      railLabel.textContent = onScreen ? onScreen.label : now.region || 'lagoon';
    }
  };

  // ── THE CALL TOASTER ─────────────────────────────────────────────────────────────────────────
  //
  // EVERY OTHER SURFACE HERE IS SOMETHING YOU OPEN. The Network list under Seams answers "what did
  // this screen send" perfectly, and answers it only to somebody who already suspected there was
  // something to ask -- which, in a lagoon, is the hard half: the fake fetch answers without touching
  // the network, so a screen that fired nine requests and one that fired none look identical in every
  // instrument a browser has. This says it unprompted, the moment a call lands, and then gets out of
  // the way.
  //
  // WHAT IT SHOWS is the address and the status, because those are the two facts that decide what to
  // do next: a 404 on a path nobody expected is a missing fixture, a 200 on a URL carrying the wrong
  // filter is the bug you were hunting, and the declaration's own spelling (`table:shots(select)`)
  // can tell you neither. Pressing a card opens the panel on Seams at the Network list, where the
  // same call is waiting with its payload -- the card is the notice, not the report.
  //
  // HOST-MODULE CALLS ARE ABSENT by construction: a stubbed export has no URL and no status, and a
  // card whose status column said "--" would be reporting an absence in the shape of a result.
  var toasts = el('div', {
    id: 'tide-calls',
    'data-motu-chrome': '',
    // POLITE, and the whole point of saying so: a call landing is not an interruption, and a live
    // region that spoke over whatever the person was reading would make the toaster the loudest
    // thing on a screen it is only annotating.
    role: 'log', 'aria-live': 'polite', 'aria-label': 'Calls that have landed',
  });
  toasts.dataset.edge = tide.dataset.edge || 'right';
  mountEl.appendChild(toasts);

  /**
   * NOT WHILE THE CHECKS ARE DRIVING.
   *
   * `dockInset=off` is the harness saying it is measuring the APPLICATION -- responsive measures it
   * at each declared viewport and the snapshots picture it -- and a card sliding in over the corner
   * of that is a baseline that changes with the timing of a fetch. The same flag already takes the
   * dock's strip back for exactly this reason; this is the other thing the dock does to the page.
   *
   * BOTH DOCUMENTS, because the dock is mounted in the lagoon's own document by `lagoon serve` and in
   * the host's when a published artifact is framed. The flag rides on the lagoon's URL either way.
   */
  var harness = function () {
    var off = function (w) {
      try { return new URLSearchParams(w.location.search).get('dockInset') === 'off'; } catch (e) { return false; }
    };
    if (off(window)) return true;
    try { return off(lagoonWindow()); } catch (e) { return false; }
  };

  // MUTED IS REMEMBERED, for the reason the pin is: somebody who does not want cards over their
  // application does not want them again after the reload that is part of using this.
  var MUTE_KEY = 'motu:dock:calls-muted';
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }
  var setMuted = function (on) {
    muted = on;
    try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (e) { /* a page that cannot remember still obeys */ }
    if (on) toasts.replaceChildren();
  };

  /** How long a card stays. A failure lingers: it is the one you were not watching for. */
  var CALL_TTL_OK = 4200;
  var CALL_TTL_BAD = 9000;
  /** Four at once. The fifth pushes the first off before it can be read, which is a wall, not a feed. */
  var MAX_CARDS = 4;

  var toneOf = function (c) {
    if (c.ok) return 'ok';
    // 0 IS NOT A STATUS, it is the absence of one -- a throw, an abort, a transport that never
    // answered. Amber rather than red: something went wrong, and "the server said no" is a different
    // fact from "nothing came back", which the card must not merge.
    return c.status >= 400 ? 'broken' : 'warn';
  };

  /**
   * Open the panel on the Network list, where this call is waiting with its payload.
   *
   * SCROLLED TO, not just shown. Seams opens on the region sheet and the Network list is several
   * sections down it, so a card that only opened the tab would hand somebody the right panel and
   * leave them to find the row -- which is most of the work it was meant to save.
   */
  var showSeamsFor = function (c) {
    open(true);
    showTab('seams');
    // THE DOOR DECIDES WHICH SECTION. Network is the WIRE's list -- a contract call is not in it, and
    // landing somebody on "No backend call was intercepted" under a card that just said one came back
    // 500 is the panel contradicting the notice that sent them there.
    var sect = c.via === 'wire' ? 'network' : 'asked-for';
    var head = seams.querySelector('[data-sect="' + sect + '"]');
    if (head && head.scrollIntoView) head.scrollIntoView({ block: 'start' });
  };

  var card = function (c) {
    var status = c.status ? String(c.status) : '\u2014';
    // THE ADDRESS IF THERE IS ONE, and the declaration's name for the call when there is not: a
    // contract call answered by a mock has no URL, and `POST shots.list` would dress a service method
    // up as an endpoint. No address, no verb -- the card says what it knows.
    var addr = c.url || c.label;
    var meta = [c.ms + 'ms', c.owner, c.url ? c.label : ''].filter(Boolean).join(' \u00b7 ');
    var n = el('span', { class: 'call__n', hidden: '' }, ['']);
    var b = el('button', {
      class: 'call', type: 'button', 'data-tone': toneOf(c),
      title: (c.url ? c.method + ' ' : '') + addr + ' \u2192 ' + status
        + (c.error ? '\n' + c.error : '') + '\nOpen the Network list under Seams',
    }, [
      el('i', { class: 'call__tone' }),
      el('span', { class: 'call__url' }, c.url ? [el('span', { class: 'call__verb' }, [c.method]), addr] : [addr]),
      el('span', { class: 'call__status' }, [status]),
      // THE FAILURE IN WORDS when there is one, because a bare 404 does not say WHICH fixture is
      // missing and the answer is usually in the message the fake wrote.
      el('span', { class: 'call__meta' }, [c.error ? String(c.error).slice(0, 120) : meta]),
      n,
    ]);
    b.addEventListener('click', function () { showSeamsFor(c); });
    return { node: b, count: n, key: c.method + ' ' + (c.url || c.label) + ' ' + c.status, times: 1, timer: 0 };
  };

  var live = [];
  var dropCard = function (entry) {
    var at = live.indexOf(entry);
    if (at >= 0) live.splice(at, 1);
    clearTimeout(entry.timer);
    entry.node.remove();
  };
  var keepFor = function (entry, ms) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(function () { dropCard(entry); }, ms);
  };

  var onCallLanded = function (c) {
    if (muted || harness() || !c) return;
    var ttl = c.ok ? CALL_TTL_OK : CALL_TTL_BAD;
    // ONE CARD PER REPEAT, counted. A save is a write plus every refetch it fans out into -- 22 of
    // them on a real region -- and a stack that grew per request would be unreadable for exactly the
    // press a person most wants to read.
    var key = c.method + ' ' + (c.url || c.label) + ' ' + c.status;
    for (var i = 0; i < live.length; i++) {
      if (live[i].key !== key) continue;
      live[i].times++;
      live[i].count.textContent = '×' + live[i].times;
      live[i].count.removeAttribute('hidden');
      keepFor(live[i], ttl);
      return;
    }
    var entry = card(c);
    live.push(entry);
    // Newest nearest the bottom edge: the stack grows upward from there, so appending puts this card
    // where the eye already is and rides the older ones up out of the way.
    toasts.appendChild(entry.node);
    keepFor(entry, ttl);
    while (live.length > MAX_CARDS) dropCard(live[0]);
  };

  paint();

  // FOLLOW A MOUNT NOBODY HERE CAUSED. The lagoon can change region from its own URL, its own panel,
  // or a check driving it, and chrome that only updated on its own clicks would go stale and say the
  // wrong region with total confidence.
  var stop = null;
  // WHICH control object `stop` belongs to. Identity, not a boolean: the lagoon can be REPLACED under
  // this dock — it is a separate document when the host frames it — and the old control goes with it.
  var bound = null;
  var stopCalls = null;
  var attach = function () {
    var ctl = control();
    if (!ctl || ctl === bound) return;
    // A DIFFERENT OBJECT means a new lagoon document. Subscribing once and stopping (which is what
    // this did) left the dock holding a subscription to a page that no longer exists: the frame
    // navigated, the lagoon was correctly on its new state, and the dock went on drawing the old one
    // with total confidence. Invisible until something made the frame navigate — opening an island
    // from the islands pane is the first control that does.
    if (stop) { try { stop(); } catch (e) { /* the page it belonged to is gone; nothing to release */ } }
    if (stopCalls) { try { stopCalls(); } catch (e) { /* likewise: its document is gone */ } }
    bound = ctl;
    stop = ctl.subscribe(paint);
    // THE CALL FEED, subscribed whatever tab is showing and whether or not the panel is open -- the
    // toaster's whole value is being told something you were not looking for. `onCall` is absent on a
    // lagoon built before the feed existed, which degrades to no cards rather than to a throw.
    stopCalls = ctl.onCall ? ctl.onCall(onCallLanded) : null;
    // THE ONES THAT LANDED WHILE THIS WAS ATTACHING. The dock polls for a lagoon that boots on its
    // own clock, so the region's FIRST fetches — the ones that decide whether the page has any data
    // at all — are usually already back before there is anything subscribed to hear them. A moment's
    // worth, not the whole ring: a card for something that happened a minute ago is a card about a
    // screen you have already stopped looking at.
    if (ctl.calls) {
      var justNow = Date.now() - 2000;
      ctl.calls().forEach(function (c) { if (c && c.at >= justNow) onCallLanded(c); });
    }
    paint();
  };
  attach();
  // FOREVER, not until the first success. The lagoon boots asynchronously (the original reason for
  // this poll) and can also be replaced at any later moment, which the old `tries` cap could not see.
  //
  // KEPT, because the unmount below clears it. Dropping the handle when this stopped being a
  // self-clearing poll left `clearInterval(poll)` referring to nothing — so unmounting THREW, and a
  // host that swaps lagoons (`driveTheLagoon` unmounts before it mounts the next) never got past it:
  // the dock stayed bound to the lagoon you arrived on and described it with total confidence while
  // the frame showed another. An interval that outlives its dock also keeps painting one that is gone.
  var poll = setInterval(attach, 400);

  // ── the command palette ──────────────────────────────────────────────────────────────────────
  //
  // BUILT FROM THE CONTROL SURFACE, so it lists whatever this lagoon can actually do rather than a
  // registry kept in step by hand — regions, the states of the one on screen, the view, and every
  // chip the artifact has mounted, including ones added by a package this file has never heard of.
  var pInput = el('input', { type: 'text', placeholder: 'Switch region, state, view\u2026', 'aria-label': 'Lagoon command palette' });
  var pList = el('ul', { role: 'listbox' });
  var palette = el('div', { class: 'dock-palette', hidden: '', 'data-motu-chrome': '' }, [el('div', { class: 'box' }, [pInput, pList])]);
  mountEl.appendChild(palette);
  var shown = [];
  var cursor = 0;

  var commands = function () {
    var ctl = control();
    var cat = catalogue();
    if (!ctl || !cat) return [];
    var now = ctl.current();
    var out = screenEntries(ctl).map(function (r) {
      return { label: r.label, kind: 'screen', run: drive(function (c) { c.show(r.id); }) };
    }).concat((cat.archipelagos || []).map(function (r) {
      return { label: r.label, kind: 'region', run: drive(function (c) { c.show(r.id); }) };
    }));
    var onScreenNow = now.region && now.region.indexOf('screen:') === 0;
    if (ctl.states && !now.island) {
      // EVERY STATE IN THIS VIEW, named with the region it is played on — the same list as the panel.
      var info = ctl.states();
      (info.regions || []).forEach(function (reg) {
        var own = !onScreenNow && reg.region === now.region;
        (reg.flows || []).forEach(function (name) {
          out.push({ label: reg.region + ' · ' + name, kind: 'state', run: drive(function (c) {
            if (own) c.runFlow(name); else c.playState({ region: reg.region, kind: 'flow', name: name });
          }) });
        });
        (reg.islands || []).forEach(function (isl) {
          (isl.scenarios || []).forEach(function (name) {
            out.push({ label: (isl.slot || isl.tag) + ' · ' + name, kind: 'what-if', run: drive(function (c) {
              c.playState({ region: reg.region, kind: 'scenario', island: isl.tag, name: name });
            }) });
          });
        });
      });
    } else {
      ((cat.flows && cat.flows[now.region]) || []).forEach(function (f) {
        out.push({ label: f.name, kind: 'state', run: drive(function (c) { c.runFlow(f.name); }) });
      });
    }
    out.push({ label: 'As seeded', kind: 'state', run: drive(function (c) { c.runFlow(null); }) });
    // THE WAY OUT OF THE CARDS, in the one place every other dock control is reachable from. A
    // toaster with no off switch is a decision made for somebody about their own screen; putting it
    // here rather than on each card keeps the cards themselves down to what they are for.
    out.push({
      label: muted ? 'Show call cards' : 'Mute call cards',
      kind: 'chrome',
      run: function () { setMuted(!muted); },
    });
    out.push({ label: 'Region', kind: 'view', run: drive(function (c) { c.setView('region'); }) });
    out.push({ label: 'Mountpoints', kind: 'view', run: drive(function (c) { c.setView('mountpoints'); }) });
    // Same rule as the pills: offered only where the current region declares a page.
    if (((ctl.views && ctl.views()) || []).indexOf('page') !== -1) {
      out.push({ label: 'Page', kind: 'view', run: drive(function (c) { c.setView('page'); }) });
    }
    (ctl.chips ? ctl.chips() : []).forEach(function (c) {
      if (c.label) out.push({ label: c.label + ' \u2014 ' + (c.title || 'toggle'), kind: 'toggle', run: drive(function (live) { live.pressChip(c.index); }) });
    });
    return out;
  };

  var renderPalette = function () {
    var q = pInput.value.trim().toLowerCase();
    shown = commands().filter(function (c) { return !q || c.label.toLowerCase().indexOf(q) >= 0; });
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    pList.replaceChildren.apply(pList, shown.length
      ? shown.map(function (c, i) {
          var li = el('li', { role: 'option', 'aria-selected': String(i === cursor) },
            [el('span', {}, [c.label]), el('span', { class: 'kind' }, [c.kind])]);
          li.addEventListener('mouseenter', function () { cursor = i; renderPalette(); });
          li.addEventListener('click', function () { c.run(); closePalette(); });
          return li;
        })
      : [el('li', { class: 'motu-empty' }, ['Nothing matches.'])]);
  };
  var openPalette = function () { palette.hidden = false; pInput.value = ''; cursor = 0; renderPalette(); pInput.focus(); };
  var closePalette = function () { palette.hidden = true; };
  kbd.addEventListener('click', openPalette);
  pInput.addEventListener('input', renderPalette);
  palette.addEventListener('pointerdown', function (e) { if (e.target === palette) closePalette(); });
  pInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return closePalette();
    if (e.key === 'Enter') { if (shown[cursor]) { shown[cursor].run(); closePalette(); } return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!shown.length) return;
    cursor = (cursor + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
    renderPalette();
  });
  addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      palette.hidden ? openPalette() : closePalette();
    }
  });

  return function () {
    clearInterval(poll);
    if (unwatch) unwatch();
    if (stop) stop();
    if (stopCalls) stopCalls();
    live.forEach(function (entry) { clearTimeout(entry.timer); });
    toasts.remove();
    palette.remove();
    tide.remove();
  };
}

/**
 * The dock as source, for a page that cannot import a module.
 *
 * Aliased to a stable name for the same reason `PRIMARY_DETECT_JS` is: the host app is minified in
 * production, so `motuMountDock.toString()` arrives under a mangled name while the caller — a
 * template literal minification never touches — still says `motuMountDock`. That combination shipped
 * a live ReferenceError once already.
 */
export function motuDockJs() {
  var src = motuMountDock.toString();
  return motuMountDock.name === 'motuMountDock' ? src : src + '\nvar motuMountDock = ' + motuMountDock.name + ';';
}
