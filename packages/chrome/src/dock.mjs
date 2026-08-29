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
html[data-motu-dock="right"] { padding-right: var(--motu-dock-rail, 46px); }
html[data-motu-dock="left"] { padding-left: var(--motu-dock-rail, 46px); }
html[data-motu-dock="bottom"] { padding-bottom: var(--motu-dock-handle, 44px); }
/* An application's own fixed furniture is positioned against the VIEWPORT, which no padding here can
 * move. Nothing inside a page can reach that — resizing the viewport is the host's job, and it does
 * it whenever the artifact is framed. Called out because it is the one case this does not cover. */

/* ── the rail, which is the dock when it is closed ────────────────────────────────────────── */
#tide .rail-dock {
  position: relative;
  width: var(--rail-w);
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border: 0;
  cursor: pointer;
  color: var(--motu-on-primary, #fff);
  background: linear-gradient(180deg, var(--w-deep), var(--w-mid) 46%, var(--w-shallow));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--w-deep) 22%, transparent),
    0 10px 30px color-mix(in srgb, var(--w-deep) 26%, transparent);
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,.9,.3,1);
}
#tide .rail-dock:hover { filter: brightness(1.06); }
#tide .rail-dock:focus-visible { outline: 2px solid var(--motu-on-primary, #fff); outline-offset: -4px; }
#tide .rail-dock .mark { width: 20px; height: 20px; flex: 0 0 auto; }
#tide .rail-dock .lamp {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--motu-on-primary, #fff);
  opacity: .85;
  flex: 0 0 auto;
}
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
#tide[data-edge="left"] .panel { transform: translateX(-100%); }
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
#tide .seam-row__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
#tide .seam-row[data-tone="broken"] .seam-row__dot { background: var(--motu-danger, #b91c1c); }
#tide .seam-row[data-tone="warn"] .seam-row__dot { background: var(--motu-caution, #b45309); }
#tide .seam-row[data-tone="ok"] .seam-row__dot { background: var(--tide-accent); }
#tide .seam-row__l { font-weight: 700; color: var(--ink); }
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
@media (max-width: 760px) {
  #tide {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    display: block;
    --dock-w: auto;
  }
  #tide .rail-dock {
    /* FULL WIDTH, because a handle is something a thumb aims at. Left as auto it shrank to its
     * content and sat in the bottom-left corner, which reads as a stray chip rather than the edge of
     * a sheet you can pull. */
    width: 100%;
    flex-direction: row;
    justify-content: center;
    gap: 10px;
    /* A DETERMINISTIC BAR, AND NO SAFE-AREA INSET AT ALL.
     *
     * On Firefox for Android this arrived about twice as tall as anywhere else, because its height
     * was whatever content plus padding came to and the safe-area inset was folded into the same
     * shorthand.
     *
     * peps hit exactly this and fixed it by DELETING every env(safe-area-inset-bottom) rather than
     * working around it (peps_ta_boite e0eeea7, "fix: firefox mobile bottom bar padding", which also
     * dropped viewportFit: 'cover'). Nothing motu serves sets viewport-fit=cover, so these insets are
     * specified to be zero here and buy nothing — while an engine that reports one anyway silently
     * doubles a bar whose height was never stated. So: state the height, and do not ask.
     */
    min-height: 44px;
    padding: 0 14px;
    border-radius: 14px 14px 0 0;
    background: linear-gradient(90deg, var(--w-deep), var(--w-mid) 52%, var(--w-shallow));
  }
  #tide .rail-dock .stand {
    writing-mode: horizontal-tb;
    flex: 0 1 auto;
    rotate: none;
  }
  #tide[data-edge="left"] .rail-dock .stand { rotate: none; }
  #tide .rail-dock .chev { rotate: 90deg; }
  #tide .panel {
    position: fixed;
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
#tide[data-shell-sheet="open"] { opacity: 0; pointer-events: none; }

@keyframes tide-swim {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  #tide *, #tide *::before { animation: none !important; transition: none !important; }
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

  var tide = el('div', { id: 'tide', 'data-open': 'false' });
  var railLabel = el('span', { class: 'stand' }, ['lagoon']);
  var rail = el('button', { class: 'rail-dock', type: 'button', 'aria-label': 'Lagoon controls', 'aria-expanded': 'false' }, [
    el('span', { class: 'lamp' }),
    railLabel,
    el('span', { class: 'chev' }, ['‹']),
  ]);

  var bayTitle = el('b', {}, ['—']);
  var baySub = el('small', {}, ['']);
  var fold = el('button', { class: 'fold', type: 'button', 'aria-label': 'Close lagoon controls' }, ['›']);
  // INSIDE the bay, not above it. The handle is white, so on the panel's pale surface it was
  // invisible and the sheet read as having none; on the water it reads exactly as the switcher's does.
  var grab = el('span', { class: 'grab' }, [el('i')]);
  var masthead = el('div', { class: 'motu-bay', 'data-shape': 'masthead' }, [
    grab,
    el('div', { class: 'bay-row' }, [el('span', { class: 'bay-txt' }, [bayTitle, baySub]), fold]),
  ]);

  var filter = el('input', { class: 'motu-search', type: 'search', placeholder: 'Filter regions and states…', 'aria-label': 'Filter regions and states' });
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
  var seamsTab = el('button', { type: 'button', role: 'tab', 'aria-current': 'false' }, ['Seams']);
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
  var kbd = el('button', { class: 'motu-kbd', type: 'button', title: 'Command palette' },
    [/Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent) ? '\u2318K' : 'Ctrl K']);

  var panel = el('div', { class: 'panel', role: 'group', 'aria-label': 'Lagoon controls' }, [
    masthead,
    el('div', { class: 'find' }, [tabs, kbd]),
    el('div', { class: 'find find--filter' }, [filter]),
    scroll,
    seams,
    islandsPane,
    coveragePane,
    rig,
  ]);
  var scrim = el('div', { class: 'scrim' });
  tide.append(scrim, rail, panel);
  mountEl.appendChild(tide);
  tide.dataset.edge = 'right';

  var open = function (on) {
    tide.dataset.open = on ? 'true' : 'false';
    rail.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  rail.addEventListener('click', function () { open(true); });
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
  var catalogue = function () { try { return lagoonWindow().__motuLagoonStates || null; } catch (e) { return null; } };
  var control = function () { try { return lagoonWindow().__motuLagoonControl || null; } catch (e) { return null; } };

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
    tabThumb.style.left = on.offsetLeft + 'px';
    tabThumb.style.width = on.offsetWidth + 'px';
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

  var section = function (cap) {
    var count = el('span', { class: 'count' }, ['0']);
    var list = el('div', { class: 'list', role: 'listbox', 'aria-label': cap });
    var box = el('div', { class: 'sect' }, [
      el('div', { class: 'sect__head' }, [el('span', { class: 'motu-dot' }), el('span', { class: 'motu-cap' }, [cap]), count]),
      list,
    ]);
    scroll.appendChild(box);
    return { list: list, count: count, box: box };
  };
  var regions = section('Regions');
  var states = section('States');

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

  var paint = function () {
    var cat = catalogue();
    var ctl = control();
    if (!cat || !ctl) {
      // The lagoon has not booted yet, or this build predates the control surface. Say so rather than
      // drawing an empty panel that looks like a region with nothing in it.
      regions.box.hidden = true;
      states.box.hidden = true;
      bayTitle.textContent = 'waiting for the lagoon…';
      baySub.textContent = '';
      return;
    }
    regions.box.hidden = false;
    states.box.hidden = false;
    var now = ctl.current();
    var q = filter.value.trim().toLowerCase();
    var hit = function (s) { return !q || s.toLowerCase().indexOf(q) >= 0; };

    var list = (cat.archipelagos || []).filter(function (r) { return hit(r.label); });
    regions.count.textContent = String(list.length);
    regions.list.replaceChildren.apply(regions.list, list.map(function (r) {
      return row(r.label, r.id === now.region, function () { ctl.show(r.id); });
    }));

    var flows = (cat.flows && cat.flows[now.region]) || [];
    states.count.textContent = String(flows.length);
    // WHICH ONE IS SHOWING, from the lagoon rather than from a guess. This used to hardcode "As
    // seeded" as current and every flow as not — so pressing a state ran it and the list went on
    // showing the same row lit, which reads as the click having done nothing.
    var showing = now.flow || null;
    var rows = [row('As seeded', showing === null, function () { ctl.runFlow(null); })];
    flows.forEach(function (f) {
      if (!hit(f.name)) return;
      rows.push(row(f.name, showing === f.name, function () { ctl.runFlow(f.name); }));
    });
    states.list.replaceChildren.apply(states.list, rows);

    // ── the rig ──────────────────────────────────────────────────────────────────────────────
    var pills = [];
    ['region', 'mountpoints'].forEach(function (v) {
      var b = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        'aria-current': now.view === v ? 'true' : 'false',
      }, [v === 'region' ? 'Region' : 'Mountpoints']);
      b.addEventListener('click', function () { ctl.setView(v); });
      pills.push(b);
    });
    // RECORDING IS AN ACT, so it sits with the other controls rather than in a tab. It is the one
    // thing here that changes the lagoon instead of reporting on it, and stopping is what writes the
    // fixtures out — so the label says which of those pressing it will do.
    if (ctl.lensOpen) {
      // THE PAGE LAYER, which is all the lens still draws for itself: outlines and wires over the
      // running region. Everything it used to say in a panel is in the tabs above.
      var lensPill = el('button', {
        class: 'motu-btn', 'data-shape': 'pill', type: 'button',
        'aria-pressed': ctl.lensOpen() ? 'true' : 'false',
        title: 'Outline the islands on the page and wire them to what they read',
      }, ['\u2316 Seam lens']);
      lensPill.addEventListener('click', function () { ctl.toggleLens(); paint(); });
      pills.push(lensPill);
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
        var next = ctl.toggleRecording();
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
      b.addEventListener('click', function () { ctl.pressChip(c.index); });
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
        sheet.rows.forEach(function (r) {
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
              [r.flag === 'laundering' ? '\u26a0' : '\u25cb']);
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
          var head = el('div', { class: 'sect__head' }, [
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

        var asked = seamData.calls.concat(seamData.traced);
        listSection('Asked for', asked.length, asked.map(function (c) {
          return el('div', { class: 'seam-row', 'data-tone': 'ok', title: c.label + '(' + c.detail + ')' }, [
            el('i', { class: 'seam-row__dot' }),
            el('span', { class: 'seam-row__l' }, [c.label]),
            el('span', { class: 'seam-row__d' }, [c.detail]),
            el('span', { class: 'seam-row__r' }, [c.island]),
          ]);
        }),
        // WHY it is empty matters. A region whose islands reach host modules directly never touches
        // the transport, so this is empty by construction rather than because nothing happened.
        'Nothing was asked for \u2014 everything on screen came from the seed.');

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
        var head = el('div', { class: 'sect__head' }, [
          el('span', { class: 'motu-cap' }, ['Findings']),
          el('span', { class: 'count' }, [t.decisions ? report.findings.length + ' \u00b7 ' + t.decisions + ' needs a decision' : String(report.findings.length)]),
        ]);
        var cards = report.findings.map(function (f) {
          return el('div', { class: 'seam-find', 'data-tone': f.tone }, [
            el('span', { class: 'seam-find__t' }, [el('i'), f.title]),
            el('span', { class: 'seam-find__d' }, [f.detail]),
          ]);
        });
        if (!cards.length) cards = [el('p', { class: 'motu-empty' }, ['Nothing to report about this region.'])];
        seams.replaceChildren.apply(seams, sheetNodes.concat([tally, head]).concat(cards));
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
          var head = el('div', { class: 'isl__head' }, [
            el('i', { class: 'isl__dot', 'data-tone': isl.verdict }),
            el('span', { class: 'isl__slot' }, [isl.slot]),
            el('span', { class: 'isl__tag' }, [isl.tag]),
            el('span', { class: 'isl__meta' }, [isl.isolation]),
          ]);
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

    bayTitle.textContent = now.region || '—';
    baySub.textContent = flows.length + (flows.length === 1 ? ' state' : ' states');
    railLabel.textContent = now.region || 'lagoon';
  };

  filter.addEventListener('input', paint);
  paint();

  // FOLLOW A MOUNT NOBODY HERE CAUSED. The lagoon can change region from its own URL, its own panel,
  // or a check driving it, and chrome that only updated on its own clicks would go stale and say the
  // wrong region with total confidence.
  var stop = null;
  var attach = function () {
    var ctl = control();
    if (!ctl || stop) return;
    stop = ctl.subscribe(paint);
    paint();
  };
  attach();
  // The lagoon boots asynchronously, so keep looking until it is there.
  var tries = 0;
  var poll = setInterval(function () {
    if (stop || tries++ > 40) return clearInterval(poll);
    attach();
  }, 250);

  // ── the command palette ──────────────────────────────────────────────────────────────────────
  //
  // BUILT FROM THE CONTROL SURFACE, so it lists whatever this lagoon can actually do rather than a
  // registry kept in step by hand — regions, the states of the one on screen, the view, and every
  // chip the artifact has mounted, including ones added by a package this file has never heard of.
  var pInput = el('input', { type: 'text', placeholder: 'Switch region, state, view\u2026', 'aria-label': 'Lagoon command palette' });
  var pList = el('ul', { role: 'listbox' });
  var palette = el('div', { class: 'dock-palette', hidden: '' }, [el('div', { class: 'box' }, [pInput, pList])]);
  mountEl.appendChild(palette);
  var shown = [];
  var cursor = 0;

  var commands = function () {
    var ctl = control();
    var cat = catalogue();
    if (!ctl || !cat) return [];
    var now = ctl.current();
    var out = (cat.archipelagos || []).map(function (r) {
      return { label: r.label, kind: 'region', run: function () { ctl.show(r.id); } };
    });
    ((cat.flows && cat.flows[now.region]) || []).forEach(function (f) {
      out.push({ label: f.name, kind: 'state', run: function () { ctl.runFlow(f.name); } });
    });
    out.push({ label: 'As seeded', kind: 'state', run: function () { ctl.runFlow(null); } });
    out.push({ label: 'Region', kind: 'view', run: function () { ctl.setView('region'); } });
    out.push({ label: 'Mountpoints', kind: 'view', run: function () { ctl.setView('mountpoints'); } });
    (ctl.chips ? ctl.chips() : []).forEach(function (c) {
      if (c.label) out.push({ label: c.label + ' \u2014 ' + (c.title || 'toggle'), kind: 'toggle', run: function () { ctl.pressChip(c.index); } });
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
