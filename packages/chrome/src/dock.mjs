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

/* ── the two tabs, and the seams pane ─────────────────────────────────────────────────────── */
#tide .find--filter { padding-top: 2px; }
#tide .tabs { flex: 1 1 auto; }
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

/* THE TALLY IS COUNTS AND NOTHING ELSE. There is no headline above it: a sentence summarising the
 * region could not be contradicted by the region, and a verdict that cannot be wrong cannot be
 * trusted either. The counts and the findings under them each name something checkable. */
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
    padding: 9px 14px calc(9px + env(safe-area-inset-bottom, 0px));
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
    padding-bottom: env(safe-area-inset-bottom, 0px);
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
  var rig = el('div', { class: 'rig' }, [
    el('div', { class: 'rig__head' }, [el('span', { class: 'motu-cap' }, ['Rig'])]),
    rigPills,
  ]);
  var panel = el('div', { class: 'panel', role: 'group', 'aria-label': 'Lagoon controls' }, [
    masthead,
    el('div', { class: 'find' }, [filter]),
    scroll,
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

  return function () {
    clearInterval(poll);
    if (stop) stop();
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
